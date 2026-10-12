/**
 * Test extendido para cubrir TODAS las rutas RTDB del inventario
 * Tests 24-41: rutas que no estaban en el test de regresión original
 */
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';

const PROJECT_ID = 'luxto-nsp-test-extended';

async function runExtendedTests() {
  console.log('=== Test extendido RTDB (rutas inventario 24-41) ===\n');

  const databaseRules = readFileSync('database.rules.json', 'utf8');

  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: {
      rules: databaseRules,
      host: '127.0.0.1',
      port: 9000,
    },
  });

  // Usuarios
  const memberAuth = testEnv.authenticatedContext('member-uid-123', { email: 'miembro@test.com' });
  const staffAuth = testEnv.authenticatedContext('staff-uid-456', { email: 'servidor@test.com' });
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

  // ===== SETUP GLOBAL (sin reglas) =====
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.database();
    const now = Date.now();
    await adminDb.ref('/admins/staff-uid-456').set({ rol: 'servidor', ts: now });
    await adminDb.ref('/admins/coord-uid-789').set({ rol: 'coordinador', ts: now });
    await adminDb.ref('/asamblea/estado').set('activa');
    await adminDb.ref('/asamblea/sesion/fase').set('pregunta');
    await adminDb.ref('/asamblea/preguntaActual').set({
      id: 'test-qid',
      texto: 'Pregunta de prueba',
      opciones: ['A', 'B', 'C', 'D'],
      duracion: 30,
      abreEn: now - 1000,
      cierraEn: now + 30000
    });
    await adminDb.ref('/asamblea/sesion/puntos/member-uid-123').set(10);
    await adminDb.ref('/asamblea/sesion/resumen').set([]);
    await adminDb.ref('/asamblea/sesion/acumulada').set(false);
    await adminDb.ref('/asamblea/sesion/sesionId').set('sesion-test');
    await adminDb.ref('/asamblea/sesion/meta').set({ sessionId: 'kahoot-1', titulo: 'Test' });
    await adminDb.ref('/asamblea/borradores').set({ 'key1': { texto: 'borrador' } });
    await adminDb.ref('/kahoot/sesionActiva').set('kahoot-1');
  });

  console.log('✅ Setup global completado\n');

  // ===== TESTS 24-41 =====

  // 24. Staff escribe puntos (transaction)
  try {
    await assertSucceeds(staffDb.ref('/asamblea/sesion/puntos/member-uid-123').set(25));
    recordTest('24. STAFF: Servidor escribe asamblea/sesion/puntos/{uid}', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('24. STAFF: Servidor escribe puntos', false, `DENIEGA (BUG): ${e.message}`);
  }

  // 25. Miembro lee sus propios puntos
  try {
    await assertSucceeds(memberDb.ref('/asamblea/sesion/puntos/member-uid-123').get());
    recordTest('25. LEGÍTIMO: Miembro lee sus propios puntos', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('25. LEGÍTIMO: Miembro lee sus puntos', false, `DENIEGA (BUG): ${e.message}`);
  }

  // 26. Staff escribe resumen
  try {
    await assertSucceeds(staffDb.ref('/asamblea/sesion/resumen').set([{ uid: 'u1', pts: 10, nombre: 'Test' }]));
    recordTest('26. STAFF: Servidor escribe asamblea/sesion/resumen', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('26. STAFF: Servidor escribe resumen', false, `DENIEGA (BUG): ${e.message}`);
  }

  // 27. Staff escribe acumulada
  try {
    await assertSucceeds(staffDb.ref('/asamblea/sesion/acumulada').set(true));
    recordTest('27. STAFF: Servidor escribe asamblea/sesion/acumulada', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('27. STAFF: Servidor escribe acumulada', false, `DENIEGA (BUG): ${e.message}`);
  }

  // 28. Staff escribe sesionId
  try {
    await assertSucceeds(staffDb.ref('/asamblea/sesion/sesionId').set('nueva-sesion'));
    recordTest('28. STAFF: Servidor escribe asamblea/sesion/sesionId', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('28. STAFF: Servidor escribe sesionId', false, `DENIEGA (BUG): ${e.message}`);
  }

  // 29. Staff escribe cerradas
  try {
    await assertSucceeds(staffDb.ref('/asamblea/sesion/cerradas/sesion-test/test-qid').set({ correcta: 0 }));
    recordTest('29. STAFF: Servidor escribe asamblea/sesion/cerradas/{sid}/{qid}', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('29. STAFF: Servidor escribe cerradas', false, `DENIEGA (BUG): ${e.message}`);
  }

  // 30. Staff escribe meta
  try {
    await assertSucceeds(staffDb.ref('/asamblea/sesion/meta').set({ sessionId: 'kahoot-2', titulo: 'Test 2' }));
    recordTest('30. STAFF: Servidor escribe asamblea/sesion/meta', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('30. STAFF: Servidor escribe meta', false, `DENIEGA (BUG): ${e.message}`);
  }

  // 31. Staff escribe borradores
  try {
    await assertSucceeds(staffDb.ref('/asamblea/borradores').push({ texto: 'Nueva pregunta', opciones: ['A','B'] }));
    recordTest('31. STAFF: Servidor escribe asamblea/borradores (push)', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('31. STAFF: Servidor escribe borradores', false, `DENIEGA (BUG): ${e.message}`);
  }

  // 32. Staff elimina borrador
  try {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.database();
      await adminDb.ref('/asamblea/borradores/key-to-delete').set({ texto: 'borrar' });
    });
    await assertSucceeds(staffDb.ref('/asamblea/borradores/key-to-delete').remove());
    recordTest('32. STAFF: Servidor elimina asamblea/borradores/{key}', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('32. STAFF: Servidor elimina borrador', false, `DENIEGA (BUG): ${e.message}`);
  }

  // 33. Staff escribe estado
  try {
    await assertSucceeds(staffDb.ref('/asamblea/estado').set('finalizada'));
    recordTest('33. STAFF: Servidor escribe asamblea/estado', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('33. STAFF: Servidor escribe estado', false, `DENIEGA (BUG): ${e.message}`);
  }

  // 34. Staff escribe preguntaNum
  try {
    await assertSucceeds(staffDb.ref('/asamblea/preguntaNum').set(5));
    recordTest('34. STAFF: Servidor escribe asamblea/preguntaNum', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('34. STAFF: Servidor escribe preguntaNum', false, `DENIEGA (BUG): ${e.message}`);
  }

  // 35. Staff escribe preguntaActual/estado (legacy)
  try {
    await assertSucceeds(staffDb.ref('/asamblea/preguntaActual/estado').set('cerrada'));
    recordTest('35. STAFF: Servidor escribe asamblea/preguntaActual/estado (legacy)', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('35. STAFF: Servidor escribe preguntaActual/estado', false, `DENIEGA (BUG): ${e.message}`);
  }

  // 36. Coordinador escribe rankingGlobal (raíz)
  try {
    await assertSucceeds(coordDb.ref('/rankingGlobal').set({ 'u1': { pts: 100, nombre: 'Test' } }));
    recordTest('36. COORD: Coordinador escribe rankingGlobal (raíz)', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('36. COORD: Coordinador escribe rankingGlobal raíz', false, `DENIEGA (BUG): ${e.message}`);
  }

  // 37. Coordinador escribe kahoot/sesionActiva
  try {
    await assertSucceeds(coordDb.ref('/kahoot/sesionActiva').set('kahoot-nueva'));
    recordTest('37. COORD: Coordinador escribe kahoot/sesionActiva', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('37. COORD: Coordinador escribe kahoot/sesionActiva', false, `DENIEGA (BUG): ${e.message}`);
  }

  // 38. Coordinador elimina kahoot/sesionActiva
  try {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.database();
      await adminDb.ref('/kahoot/sesionActiva').set('kahoot-a-borrar');
    });
    await assertSucceeds(coordDb.ref('/kahoot/sesionActiva').remove());
    recordTest('38. COORD: Coordinador elimina kahoot/sesionActiva', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('38. COORD: Coordinador elimina kahoot/sesionActiva', false, `DENIEGA (BUG): ${e.message}`);
  }

  // 39. Miembro elimina su conectados (onDisconnect)
  try {
    await assertSucceeds(memberDb.ref('/asamblea/conectados/member-uid-123').remove());
    recordTest('39. LEGÍTIMO: Miembro elimina su conectados (onDisconnect)', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('39. LEGÍTIMO: Miembro elimina conectados', false, `DENIEGA (BUG): ${e.message}`);
  }

  // 40. Staff elimina respuestas
  try {
    await assertSucceeds(staffDb.ref('/asamblea/respuestas').remove());
    recordTest('40. STAFF: Servidor elimina asamblea/respuestas', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('40. STAFF: Servidor elimina respuestas', false, `DENIEGA (BUG): ${e.message}`);
  }

  // 41. Staff escribe claves
  try {
    await assertSucceeds(staffDb.ref('/asamblea/sesion/claves/new-qid').set({ correcta: 1 }));
    recordTest('41. STAFF: Servidor escribe asamblea/sesion/claves/{qid}', true, 'PERMITE (correcto)');
  } catch (e) {
    recordTest('41. STAFF: Servidor escribe claves', false, `DENIEGA (BUG): ${e.message}`);
  }

  // ===== TESTS DE ATAQUE ADICIONALES =====

  // 42. Miembro NO puede escribir puntos ajenos
  try {
    await assertFails(memberDb.ref('/asamblea/sesion/puntos/other-uid').set(999));
    recordTest('42. ATAQUE: Miembro escribe puntos ajeno', true, 'DENIEGA (correcto)');
  } catch (e) {
    recordTest('42. ATAQUE: Miembro escribe puntos ajeno', false, `PERMITE (VULN): ${e.message}`);
  }

  // 43. Miembro NO puede escribir resumen
  try {
    await assertFails(memberDb.ref('/asamblea/sesion/resumen').set([]));
    recordTest('43. ATAQUE: Miembro escribe resumen', true, 'DENIEGA (correcto)');
  } catch (e) {
    recordTest('43. ATAQUE: Miembro escribe resumen', false, `PERMITE (VULN): ${e.message}`);
  }

  // 44. Miembro NO puede escribir acumulada
  try {
    await assertFails(memberDb.ref('/asamblea/sesion/acumulada').set(true));
    recordTest('44. ATAQUE: Miembro escribe acumulada', true, 'DENIEGA (correcto)');
  } catch (e) {
    recordTest('44. ATAQUE: Miembro escribe acumulada', false, `PERMITE (VULN): ${e.message}`);
  }

  // 45. Miembro NO puede escribir claves
  try {
    await assertFails(memberDb.ref('/asamblea/sesion/claves/test-qid').set({ correcta: 0 }));
    recordTest('45. ATAQUE: Miembro escribe claves', true, 'DENIEGA (correcto)');
  } catch (e) {
    recordTest('45. ATAQUE: Miembro escribe claves', false, `PERMITE (VULN): ${e.message}`);
  }

  // 46. Miembro NO puede escribir kahoot/sesionActiva
  try {
    await assertFails(memberDb.ref('/kahoot/sesionActiva').set('hack'));
    recordTest('46. ATAQUE: Miembro escribe kahoot/sesionActiva', true, 'DENIEGA (correcto)');
  } catch (e) {
    recordTest('46. ATAQUE: Miembro escribe kahoot/sesionActiva', false, `PERMITE (VULN): ${e.message}`);
  }

  // 47. Servidor NO puede escribir admins
  try {
    await assertFails(staffDb.ref('/admins/new-uid').set({ rol: 'servidor', ts: Date.now() }));
    recordTest('47. ATAQUE: Servidor escribe /admins', true, 'DENIEGA (correcto)');
  } catch (e) {
    recordTest('47. ATAQUE: Servidor escribe /admins', false, `PERMITE (VULN): ${e.message}`);
  }

  // 48. Servidor NO puede escribir rankingGlobal
  try {
    await assertFails(staffDb.ref('/rankingGlobal/test').set({ pts: 10, nombre: 'Test' }));
    recordTest('48. ATAQUE: Servidor escribe rankingGlobal', true, 'DENIEGA (correcto)');
  } catch (e) {
    recordTest('48. ATAQUE: Servidor escribe rankingGlobal', false, `PERMITE (VULN): ${e.message}`);
  }

  await testEnv.cleanup();

  // Resumen
  console.log('\n=== RESUMEN TESTS EXTENDIDOS ===');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}\n`);

  if (failed > 0) {
    console.log('❌ TESTS FALLADOS:');
    results.filter(r => !r.passed).forEach(r => console.log(`  - ${r.test}: ${r.output}`));
  } else {
    console.log('✅ TODOS LOS TESTS EXTENDIDOS PASARON');
  }

  return results;
}

runExtendedTests().catch(console.error);