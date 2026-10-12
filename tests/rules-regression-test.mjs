/**
 * Test de regresión para reglas RTDB corregidas
 * - Ataques deben fallar (assertFails)
 * - Operaciones legítimas deben pasar (assertSucceeds) con datos VÁLIDOS
 */
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';

const PROJECT_ID = 'luxto-nsp-test';

async function runRegressionTests() {
  console.log('=== Test de regresión RTDB reglas corregidas ===\n');

  const databaseRules = readFileSync('database.rules.json', 'utf8');

  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: {
      rules: databaseRules,
      host: '127.0.0.1',
      port: 9000,
    },
  });

  // Usuario "miembro" (sin rol en /admins)
  const memberAuth = testEnv.authenticatedContext('member-uid-123', { email: 'miembro@test.com' });

  // Usuario "servidor" (staff)
  const staffAuth = testEnv.authenticatedContext('staff-uid-456', { email: 'servidor@test.com' });

  // Usuario "coordinador"
  const coordAuth = testEnv.authenticatedContext('coord-uid-789', { email: 'coord@test.com' });

  const memberDb = memberAuth.database();
  const staffDb = staffAuth.database();
  const coordDb = coordAuth.database();

  const results = [];

  function recordTest(name, passed, output) {
    results.push({ test: name, passed, output });
    const icon = passed ? '✅' : '❌';
    console.log(`${icon} ${name}`);
    console.log(`   ${output}\n`);
  }

  // ===== SETUP GLOBAL =====
  // /admins con withSecurityRulesDisabled (miembro no puede escribir)
  // Estado/fase/preguntaActual con coordinador (tiene permisos)
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.database();
    const now = Date.now();
    await adminDb.ref('/admins/staff-uid-456').set({ rol: 'servidor', ts: now });
    await adminDb.ref('/admins/coord-uid-789').set({ rol: 'coordinador', ts: now });
  });

  // Setup estado asamblea con coordinador (reglas habilitadas)
  const now = Date.now();
  await assertSucceeds(coordDb.ref('/asamblea/estado').set('activa'));
  await assertSucceeds(coordDb.ref('/asamblea/sesion/fase').set('pregunta'));
  await assertSucceeds(coordDb.ref('/asamblea/preguntaActual').set({
    id: 'test-qid',
    texto: 'Pregunta de prueba',
    opciones: ['A', 'B', 'C', 'D'],
    duracion: 30,
    abreEn: now - 1000,
    cierraEn: now + 30000
  }));

  console.log('✅ Setup global completado\n');

  // ===== ATAQUES: miembro NO debe poder =====

  // 1. Miembro escribe /admins/<uid> = coordinador
  try {
    await assertFails(memberDb.ref('/admins/member-uid-123').set({ rol: 'coordinador' }));
    recordTest('ATAQUE: Miembro auto-asigna rol coordinador en /admins', true, 'DENIEGA (correcto)');
  } catch (e) {
    recordTest('ATAQUE: Miembro auto-asigna rol coordinador en /admins', false, `PERMITE (VULN): ${e.message}`);
  }

  // 2. Miembro cambia fase
  try {
    await assertFails(memberDb.ref('/asamblea/sesion/fase').set('pregunta'));
    recordTest('ATAQUE: Miembro cambia asamblea/sesion/fase', true, 'DENIEGA (correcto)');
  } catch (e) {
    recordTest('ATAQUE: Miembro cambia asamblea/sesion/fase', false, `PERMITE (VULN): ${e.message}`);
  }

  // 3. Miembro reclama hostUid
  try {
    await assertFails(memberDb.ref('/asamblea/sesion/hostUid').set('member-uid-123'));
    recordTest('ATAQUE: Miembro reclama asamblea/sesion/hostUid', true, 'DENIEGA (correcto)');
  } catch (e) {
    recordTest('ATAQUE: Miembro reclama asamblea/sesion/hostUid', false, `PERMITE (VULN): ${e.message}`);
  }

  // 4. Miembro escribe preguntaActual
  try {
    await assertFails(memberDb.ref('/asamblea/preguntaActual').set({ id: 'x', texto: 'x', opciones: ['a','b'], duracion: 10, abreEn: 0, cierraEn: 9999999999 }));
    recordTest('ATAQUE: Miembro escribe asamblea/preguntaActual', true, 'DENIEGA (correcto)');
  } catch (e) {
    recordTest('ATAQUE: Miembro escribe asamblea/preguntaActual', false, `PERMITE (VULN): ${e.message}`);
  }

  // 5. Miembro lee claves (solo staff)
  try {
    await assertFails(memberDb.ref('/asamblea/sesion/claves/test-qid').get());
    recordTest('ATAQUE: Miembro lee asamblea/sesion/claves', true, 'DENIEGA (correcto)');
  } catch (e) {
    recordTest('ATAQUE: Miembro lee asamblea/sesion/claves', false, `PERMITE (VULN): ${e.message}`);
  }

  // 6. Miembro escribe en sesion/cola, indice, etc.
  try {
    await assertFails(memberDb.ref('/asamblea/sesion/cola').set(['q1']));
    recordTest('ATAQUE: Miembro escribe asamblea/sesion/cola', true, 'DENIEGA (correcto)');
  } catch (e) {
    recordTest('ATAQUE: Miembro escribe asamblea/sesion/cola', false, `PERMITE (VULN): ${e.message}`);
  }

  // ===== OPERACIONES LEGÍTIMAS: miembro SÍ debe poder =====

  // 7. Miembro responde pregunta (datos válidos) — usa timestamp numérico (emulador no resuelve sentinel)
  try {
    const now = Date.now();
    await assertSucceeds(memberDb.ref('/asamblea/respuestas/test-qid/member-uid-123').set({
      idx: 0,
      ts: now,
      nombre: 'Miembro Test'
    }));
    recordTest('LEGÍTIMO: Miembro responde pregunta (idx, ts, nombre válidos)', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('LEGÍTIMO: Miembro responde pregunta', false, `DENIEGA (BUG): ${e.message}`);
  }

  // 8. Miembro registra presencia en conectados
  try {
    await assertSucceeds(memberDb.ref('/asamblea/conectados/member-uid-123').set({
      nombre: 'Miembro Test',
      ts: Date.now()
    }));
    recordTest('LEGÍTIMO: Miembro registra presencia en conectados', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('LEGÍTIMO: Miembro registra presencia en conectados', false, `DENIEGA (BUG): ${e.message}`);
  }

  // 9. Miembro lee preguntaActual
  try {
    await assertSucceeds(memberDb.ref('/asamblea/preguntaActual').get());
    recordTest('LEGÍTIMO: Miembro lee asamblea/preguntaActual', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('LEGÍTIMO: Miembro lee asamblea/preguntaActual', false, `DENIEGA (BUG): ${e.message}`);
  }

  // 10. Miembro lee su propia respuesta
  try {
    await assertSucceeds(memberDb.ref('/asamblea/respuestas/test-qid/member-uid-123').get());
    recordTest('LEGÍTIMO: Miembro lee su propia respuesta', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('LEGÍTIMO: Miembro lee su propia respuesta', false, `DENIEGA (BUG): ${e.message}`);
  }

  // ===== OPERACIONES STAFF: servidor/apoyo/coordinador SÍ debe poder =====

  // 11. Staff cambia fase
  try {
    await assertSucceeds(staffDb.ref('/asamblea/sesion/fase').set('ranking'));
    recordTest('STAFF: Servidor cambia asamblea/sesion/fase', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('STAFF: Servidor cambia asamblea/sesion/fase', false, `DENIEGA (BUG): ${e.message}`);
  }

  // 12. Staff escribe hostUid
  try {
    await assertSucceeds(staffDb.ref('/asamblea/sesion/hostUid').set('staff-uid-456'));
    recordTest('STAFF: Servidor escribe asamblea/sesion/hostUid', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('STAFF: Servidor escribe asamblea/sesion/hostUid', false, `DENIEGA (BUG): ${e.message}`);
  }

  // 13. Staff escribe preguntaActual
  try {
    const now = Date.now();
    await assertSucceeds(staffDb.ref('/asamblea/preguntaActual').set({
      id: 'q2', texto: 'Nueva', opciones: ['A','B'], duracion: 20, abreEn: now, cierraEn: now+20000
    }));
    recordTest('STAFF: Servidor escribe asamblea/preguntaActual', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('STAFF: Servidor escribe asamblea/preguntaActual', false, `DENIEGA (BUG): ${e.message}`);
  }

  // 14. Staff lee claves
  try {
    await assertSucceeds(staffDb.ref('/asamblea/sesion/claves/test-qid').get());
    recordTest('STAFF: Servidor lee asamblea/sesion/claves', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('STAFF: Servidor lee asamblea/sesion/claves', false, `DENIEGA (BUG): ${e.message}`);
  }

  // 15. Staff escribe sesion/cola, indice, etc.
  try {
    await assertSucceeds(staffDb.ref('/asamblea/sesion/cola').set(['q1', 'q2']));
    recordTest('STAFF: Servidor escribe asamblea/sesion/cola', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('STAFF: Servidor escribe asamblea/sesion/cola', false, `DENIEGA (BUG): ${e.message}`);
  }

  // ===== OPERACIONES COORDINADOR =====

  // 16. Coordinador escribe /admins/<uid>
  try {
    await assertSucceeds(coordDb.ref('/admins/new-staff-uid').set({ rol: 'servidor', ts: Date.now() }));
    recordTest('COORD: Coordinador escribe /admins/<uid> (crea staff)', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('COORD: Coordinador escribe /admins/<uid>', false, `DENIEGA (BUG): ${e.message}`);
  }

  // 17. Coordinador elimina /admins/<uid>
  try {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.database();
      await adminDb.ref('/admins/temp-uid').set({ rol: 'servidor', ts: Date.now() });
    });
    await assertSucceeds(coordDb.ref('/admins/temp-uid').remove());
    recordTest('COORD: Coordinador elimina /admins/<uid>', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('COORD: Coordinador elimina /admins/<uid>', false, `DENIEGA (BUG): ${e.message}`);
  }

  // 18. Coordinador escribe rankingGlobal
  try {
    await assertSucceeds(coordDb.ref('/rankingGlobal/member-uid-123').set({ pts: 100, nombre: 'Test' }));
    recordTest('COORD: Coordinador escribe rankingGlobal', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('COORD: Coordinador escribe rankingGlobal', false, `DENIEGA (BUG): ${e.message}`);
  }

  // ===== VALIDACIONES DE ESTRUCTURA =====

  // 19. Miembro respuesta con idx inválido (>3)
  try {
    await assertFails(memberDb.ref('/asamblea/respuestas/test-qid/member-uid-123').set({
      idx: 5, ts: Date.now(), nombre: 'Test'
    }));
    recordTest('VALIDACIÓN: Miembro respuesta idx=5 (inválido)', true, 'DENIEGA (correcto)');
  } catch (e) {
    recordTest('VALIDACIÓN: Miembro respuesta idx=5', false, `PERMITE (BUG): ${e.message}`);
  }

  // 20. Miembro respuesta sin nombre
  try {
    await assertFails(memberDb.ref('/asamblea/respuestas/test-qid/member-uid-123').set({
      idx: 0, ts: Date.now()
    }));
    recordTest('VALIDACIÓN: Miembro respuesta sin nombre', true, 'DENIEGA (correcto)');
  } catch (e) {
    recordTest('VALIDACIÓN: Miembro respuesta sin nombre', false, `PERMITE (BUG): ${e.message}`);
  }

  // 21. Staff preguntaActual con opciones inválidas (1 sola)
  try {
    await assertFails(staffDb.ref('/asamblea/preguntaActual').set({
      id: 'q3', texto: 'Test', opciones: ['A'], duracion: 10, abreEn: Date.now(), cierraEn: Date.now()+10000
    }));
    recordTest('VALIDACIÓN: Staff preguntaActual 1 opción (inválido)', true, 'DENIEGA (correcto)');
  } catch (e) {
    recordTest('VALIDACIÓN: Staff preguntaActual 1 opción', false, `PERMITE (BUG): ${e.message}`);
  }

  // 22. Conectados sin nombre
  try {
    await assertFails(memberDb.ref('/asamblea/conectados/member-uid-123').set({ ts: Date.now() }));
    recordTest('VALIDACIÓN: Conectados sin nombre', true, 'DENIEGA (correcto)');
  } catch (e) {
    recordTest('VALIDACIÓN: Conectados sin nombre', false, `PERMITE (BUG): ${e.message}`);
  }

  // 23. Admins con rol inválido
  try {
    await assertFails(coordDb.ref('/admins/test-uid').set({ rol: 'hacker' }));
    recordTest('VALIDACIÓN: Admins rol=hacker (inválido)', true, 'DENIEGA (correcto)');
  } catch (e) {
    recordTest('VALIDACIÓN: Admins rol=hacker', false, `PERMITE (BUG): ${e.message}`);
  }

  await testEnv.cleanup();

  // Resumen
  console.log('\n=== RESUMEN REGRESIÓN ===');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}\n`);

  if (failed > 0) {
    console.log('❌ TESTS FALLADOS:');
    results.filter(r => !r.passed).forEach(r => console.log(`  - ${r.test}: ${r.output}`));
  } else {
    console.log('✅ TODOS LOS TESTS PASARON');
  }

  return results;
}

runRegressionTests().catch(console.error);