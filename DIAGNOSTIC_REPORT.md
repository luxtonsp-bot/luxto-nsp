# Diagnóstico luxto-nsp - 2026-10-23T10:48:48.898Z

## 1. ESTRUCTURA DEL REPO

### Activos
- .eslintrc.js
- .gitignore
- .npmrc
- .stylelintrc.json
- CNAME
- COMPLETION_SUMMARY.md
- PLAN_MIGRACION_LUXTO_NSP.md
- README.md
- REGLAS_RTDB_CORRECCION_FINAL.md
- RTDB_ACCESS_INVENTORY.md
- TEST_PLAN.md
- assets/
- check_migration.py
- clean_admins.mjs
- dashboard_asistencia_fix.patch
- dashboard_head.html
- database.rules.json
- docs/
- eslint.config.js
- export_excel_to_csv.py
- favicon.ico
- firebase.json
- firestore.rules
- generate_registro.mjs
- html-validate.json
- index.html
- jest.config.js
- jest.setup.js
- list_excel_sheets.py
- luxto-nsp-architecture (1).png
- luxto-nsp-architecture.png
- luxto-nsp-firebase-adminsdk-fbsvc-4adb8e2695.json
- luxto_test_report.json
- migrate-ranking-global.mjs
- migration/
- new_script.js
- package-lock.json
- package.json
- pages/
- process_photos.py
- remove_watermark.py
- revert_luana_email.mjs
- scripts/
- test_css.js
- test_css.mjs
- test_firebase.py
- test_firebase_info.py
- test_storage.py
- test_uid_extraction.py
- tools/

### Legacy / Backups
- .firebase/
- .git/
- .github/
- .impeccable/
- legacy/
- node_modules/
- tests/
- after.html
- archive/
- backup_before_reorg_20260911_130926/
- before.html

### Scripts de migración (15)
- diagnose_firebase.mjs
- diagnose_members.mjs
- fix_luana_email.mjs
- fix_luana_registro.mjs
- fix_luana_y_registro.mjs
- fix_rol_coordinador.mjs
- migrate_all_members.mjs
- migrate_legacy_paths.mjs
- migrate_memberId_uidmap.mjs
- migrate_member_doc.mjs
- query_firestore.mjs
- reconcile.html
- sync_all.mjs
- verify_henry.mjs
- verify_henry_complete.mjs

### Migraciones recientes (git log)
- c2b8731 fix: migrate member doc + auth-permissions imports + resolveMemberId + dropdown fix
- b53ae8a feat: migrate dashboard.html to Firestore mechanism (Fix getElementById errors, remove Apps Script refs, improve audit validation)

## 2. FIRESTORE REAL

### members (63 docs)
**Campos y tipos:**
- `id`: string
- `email`: string
- `name`: string
- `rol`: string
- `estadoAnioActual`: string
- `birthDate`: string
- `uid`: string
- `fechaIngresoGrupo`: string, object
- `nombre`: string
- `fotoDriveId`: string
- `fechaNacimientoMMdd`: string
- `fechaNacimiento`: string, object
- `asistenciasTotales`: number
- `ultimaAsistencia`: string, object
- `fotoThumb`: string
- `memberId`: string
- `memberIdAntiguo`: string
- `fechaActualizacionRol`: object
- `fechaPrimeraAsamblea`: string
- `fechaCreacion`: object
- `legacyId`: string

**Ejemplo (anonimizado):**
```json
{
  "id": "06e26f2c-8d62-4e95-a6c5-fe5c739d640b",
  "email": "j***@gmail.com",
  "name": "Jacky Persona B",
  "rol": "miembro",
  "estadoAnioActual": "activo",
  "birthDate": "2003-01-19T00:00:00",
  "uid": "auth-uid-***",
  "fechaIngresoGrupo": "2026-01-10",
  "nombre": "Jacky Persona B",
  "fotoDriveId": "1WzjB7xxcpAx5KGet26Mp3NZiDE1WQON7",
  "fechaNacimientoMMdd": "01-19",
  "fechaNacimiento": "2003-01-19",
  "asistenciasTotales": 22,
  "ultimaAsistencia": "2026-08-22",
  "fotoThumb": "data:image/jpeg;base64,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",
  "memberId": "uuid-***",
  "memberIdAntiguo": "2Men0go4jVUiZibCWxEV6Zl5kgp2"
}
```

### uid_map (45 docs)
**Campos y tipos:**
- `id`: string
- `memberId`: string
- `email`: string
- `createdAt`: string

**Ejemplo (anonimizado):**
```json
{
  "id": "08IpZQOBOgN6IO2ZpArPJmrvpE62",
  "memberId": "uuid-***",
  "email": "b***@gmail.com",
  "createdAt": "2026-10-23T08:00:37.501Z"
}
```

### miembros_registro (64 docs)
**Campos y tipos:**
- `id`: string
- `nombre`: string
- `email`: string
- `tieneCuenta`: boolean
- `rol`: string
- `fotoThumb`: string
- `memberId`: string

**Ejemplo (anonimizado):**
```json
{
  "id": "08IpZQOBOgN6IO2ZpArPJmrvpE62",
  "nombre": "Bryan Persona B",
  "email": "b***@gmail.com",
  "tieneCuenta": true,
  "rol": "miembro",
  "fotoThumb": "https://drive.google.com/thumbnail?id=1s4Mpq_UbNPHGi36vglFxCOUgG0ggtRc_",
  "memberId": "uuid-***"
}
```

### asambleas (53 docs)
**Campos y tipos:**
- `id`: string
- `fecha`: string
- `observacion`: string
- `hayAsamblea`: boolean
- `horaInicio`: string
- `tema`: object
- `ponentes`: object
- `esquema`: string
- `creadoEn`: object
- `actualizadoEn`: object

**Ejemplo (anonimizado):**
```json
{
  "id": "2026-01-03",
  "fecha": "2026-01-03",
  "observacion": "Normal",
  "hayAsamblea": false,
  "horaInicio": "16:00"
}
```

### asistencia (ERROR docs)
**Campos y tipos:**

### fotos (37 docs)
**Campos y tipos:**
- `id`: string
- `data`: string
- `actualizado`: string

**Ejemplo (anonimizado):**
```json
{
  "id": "08IpZQOBOgN6IO2ZpArPJmrvpE62",
  "data": "data:image/jpeg;base64,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",
  "actualizado": "2026-09-20T15:02:45.003457"
}
```

### sugerencias (ERROR docs)
**Campos y tipos:**

### feedback (13 docs)
**Campos y tipos:**
- `id`: string
- `created_at`: string
- `nombre`: string
- `email`: string
- `asambleaFecha`: string
- `puntuacion`: number
- `comentario`: string
- `createdAt`: object

**Ejemplo (anonimizado):**
```json
{
  "id": "2XJsiEloEctSKlj1PkZD",
  "created_at": "2026-05-11 21:05:00",
  "nombre": "Danae Persona B",
  "email": "v***@gmail.com",
  "asambleaFecha": "2026-05-08",
  "puntuacion": 2,
  "comentario": "Me gusto pero no entendí mucho y no me gustaron mucho las dinámica porque no me va bien las dinámicas con muchas personas",
  "createdAt": {
    "_seconds": 1778551500,
    "_nanoseconds": 0
  }
}
```

### tablas_definiciones (5 docs)
**Campos y tipos:**
- `id`: string
- `nombre`: string
- `descripcion`: string
- `año`: number
- `columnas`: object
- `creadorUID`: string
- `fechaCreacion`: object
- `anio`: string
- `restringida`: boolean
- `origen`: string

**Ejemplo (anonimizado):**
```json
{
  "id": "3JlxxeQJsEwvqEn5IdFH",
  "nombre": "la Persona B",
  "descripcion": "xd",
  "año": 2026,
  "columnas": [],
  "creadorUID": "ovR2LJVjtqZrfGGHhAHD1Qdw6qS2",
  "fechaCreacion": {
    "_seconds": 1790362288,
    "_nanoseconds": 543000000
  }
}
```

### tablas_dinamicas (ERROR docs)
**Campos y tipos:**

### asistencia (detalle por fecha)
- **2026/2026-01-10**: 33 docs, 33 presentes, IDs: UUID=0, AuthUID=29, Legacy=4, Other=0
- **2026/2026-01-17**: 42 docs, 42 presentes, IDs: UUID=0, AuthUID=37, Legacy=5, Other=0
- **2026/2026-01-24**: 40 docs, 40 presentes, IDs: UUID=0, AuthUID=35, Legacy=5, Other=0
- **2026/2026-01-31**: 41 docs, 41 presentes, IDs: UUID=0, AuthUID=36, Legacy=5, Other=0
- **2026/2026-02-07**: 34 docs, 34 presentes, IDs: UUID=0, AuthUID=32, Legacy=2, Other=0
- **2026/2026-02-14**: 37 docs, 37 presentes, IDs: UUID=0, AuthUID=33, Legacy=4, Other=0
- **2026/2026-02-21**: 39 docs, 39 presentes, IDs: UUID=0, AuthUID=34, Legacy=5, Other=0
- **2026/2026-02-28**: 36 docs, 36 presentes, IDs: UUID=0, AuthUID=32, Legacy=4, Other=0
- **2026/2026-03-07**: 39 docs, 39 presentes, IDs: UUID=0, AuthUID=36, Legacy=3, Other=0
- **2026/2026-03-14**: 36 docs, 36 presentes, IDs: UUID=0, AuthUID=35, Legacy=1, Other=0
- **2026/2026-03-21**: 35 docs, 35 presentes, IDs: UUID=0, AuthUID=34, Legacy=1, Other=0
- **2026/2026-03-28**: 31 docs, 31 presentes, IDs: UUID=0, AuthUID=29, Legacy=2, Other=0
- **2026/2026-04-18**: 32 docs, 30 presentes, IDs: UUID=0, AuthUID=28, Legacy=4, Other=0
- **2026/2026-04-25**: 39 docs, 38 presentes, IDs: UUID=0, AuthUID=36, Legacy=3, Other=0
- **2026/2026-05-02**: 39 docs, 39 presentes, IDs: UUID=0, AuthUID=36, Legacy=3, Other=0
- **2026/2026-05-09**: 30 docs, 30 presentes, IDs: UUID=0, AuthUID=27, Legacy=3, Other=0
- **2026/2026-05-16**: 37 docs, 37 presentes, IDs: UUID=0, AuthUID=35, Legacy=2, Other=0
- **2026/2026-05-30**: 31 docs, 30 presentes, IDs: UUID=0, AuthUID=28, Legacy=3, Other=0
- **2026/2026-06-06**: 37 docs, 36 presentes, IDs: UUID=0, AuthUID=34, Legacy=3, Other=0
- **2026/2026-06-13**: 40 docs, 40 presentes, IDs: UUID=0, AuthUID=37, Legacy=3, Other=0
- **2026/2026-06-27**: 31 docs, 31 presentes, IDs: UUID=0, AuthUID=29, Legacy=2, Other=0
- **2026/2026-07-04**: 35 docs, 35 presentes, IDs: UUID=0, AuthUID=31, Legacy=4, Other=0
- **2026/2026-07-11**: 35 docs, 35 presentes, IDs: UUID=0, AuthUID=32, Legacy=3, Other=0
- **2026/2026-07-18**: 34 docs, 34 presentes, IDs: UUID=0, AuthUID=31, Legacy=3, Other=0
- **2026/2026-07-25**: 38 docs, 38 presentes, IDs: UUID=0, AuthUID=34, Legacy=4, Other=0
- **2026/2026-08-01**: 34 docs, 34 presentes, IDs: UUID=0, AuthUID=32, Legacy=2, Other=0
- **2026/2026-08-08**: 34 docs, 34 presentes, IDs: UUID=0, AuthUID=30, Legacy=4, Other=0
- **2026/2026-08-15**: 36 docs, 35 presentes, IDs: UUID=0, AuthUID=31, Legacy=5, Other=0
- **2026/2026-08-22**: 28 docs, 28 presentes, IDs: UUID=0, AuthUID=25, Legacy=3, Other=0
- **2026/2026-08-29**: 35 docs, 32 presentes, IDs: UUID=0, AuthUID=27, Legacy=8, Other=0
- **2026/2026-09-19**: 27 docs, 26 presentes, IDs: UUID=0, AuthUID=23, Legacy=4, Other=0
- **2026/2026-09-26**: 38 docs, 38 presentes, IDs: UUID=0, AuthUID=32, Legacy=6, Other=0
- **2026/2026-10-03**: 37 docs, 35 presentes, IDs: UUID=0, AuthUID=30, Legacy=7, Other=0
- **2026/2026-10-10**: 28 docs, 27 presentes, IDs: UUID=0, AuthUID=23, Legacy=5, Other=0

## 3. TIPOS DE ID

### members
- Total: 63
- UUID (36 chars): 63
- Auth UID (28 chars): 0
- Legacy/Other: 0
- Campos: memberId en 63, memberIdAntiguo en 63, legacyId en 1, uid en 45

### uid_map
- Total: 45
- Apuntan a member existente: 45
- Apuntan a member NO existente: 0

## 4. CASO CONCRETO: Paolo Alfaro

- **Auth UID**: `ovR2LJVjtqZrfGGHhAHD1Qdw6qS2`
- **memberId (UUID)**: `f51a859e-7901-49ae-80d9-0a385ee46dcd`

### members/f51a859e-7901-49ae-80d9-0a385ee46dcd
- Campos: legacyId, birthDate, rol, fechaIngresoGrupo, estadoAnioActual, uid, email, name, nombre, fechaNacimiento, fotoDriveId, fechaNacimientoMMdd, fechaActualizacionRol, fotoThumb, asistenciasTotales, ultimaAsistencia, memberId, memberIdAntiguo
- rol: `coordinador`
- estadoAnioActual: `activo`
- fechaIngresoGrupo: `2026-01-10`
- asistenciasTotales: 34
- email: h***@unmsm.edu.pe
- nombre: Paolo Persona B
- uid: auth-uid-***
- memberId: f51a859e-7901-49ae-80d9-0a385ee46dcd
- memberIdAntiguo: ovR2LJVjtqZrfGGHhAHD1Qdw6qS2
- legacyId: 1oW-vg_HANFDrJD1Rz_emQDIs6kFuYMFu

### uid_map/ovR2LJVjtqZrfGGHhAHD1Qdw6qS2
```json
{
  "memberId": "f51a859e-7901-49ae-80d9-0a385ee46dcd",
  "email": "henry.alfaro1@unmsm.edu.pe",
  "createdAt": "2026-10-23T08:01:41.990Z"
}
```

### Asistencias encontradas
- **2026/2026-01-10** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-01-10** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-01-17** (ID: authUid): presente=true, tardanza=5, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-01-17** (ID: authUid): presente=true, tardanza=5, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-01-24** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-01-24** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-01-31** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-01-31** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-02-07** (ID: authUid): presente=true, tardanza=9, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-02-07** (ID: authUid): presente=true, tardanza=9, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-02-14** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-02-14** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-02-21** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-02-21** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-02-28** (ID: authUid): presente=true, tardanza=9, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-02-28** (ID: authUid): presente=true, tardanza=9, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-03-07** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-03-07** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-03-14** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-03-14** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-03-21** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-03-21** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-03-28** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-03-28** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-04-18** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-04-18** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-04-25** (ID: authUid): presente=true, tardanza=22, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-04-25** (ID: authUid): presente=true, tardanza=22, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-05-02** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-05-02** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-05-09** (ID: authUid): presente=true, tardanza=18, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-05-09** (ID: authUid): presente=true, tardanza=18, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-05-16** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-05-16** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-05-30** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-05-30** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-06-06** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-06-06** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-06-13** (ID: authUid): presente=true, tardanza=24, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-06-13** (ID: authUid): presente=true, tardanza=24, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-06-27** (ID: authUid): presente=true, tardanza=4, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-06-27** (ID: authUid): presente=true, tardanza=4, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-07-04** (ID: authUid): presente=true, tardanza=19, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-07-04** (ID: authUid): presente=true, tardanza=19, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-07-11** (ID: authUid): presente=true, tardanza=5, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-07-11** (ID: authUid): presente=true, tardanza=5, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-07-18** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-07-18** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-07-25** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-07-25** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-08-01** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-08-01** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-08-08** (ID: authUid): presente=true, tardanza=2, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-08-08** (ID: authUid): presente=true, tardanza=2, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-08-15** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-08-15** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-08-22** (ID: authUid): presente=true, tardanza=25, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-08-22** (ID: authUid): presente=true, tardanza=25, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-08-29** (ID: authUid): presente=true, tardanza=7, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-08-29** (ID: authUid): presente=true, tardanza=7, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-09-19** (ID: authUid): presente=true, tardanza=12, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-09-19** (ID: authUid): presente=true, tardanza=12, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-09-26** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-09-26** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-10-03** (ID: authUid): presente=true, tardanza=9, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-10-03** (ID: authUid): presente=true, tardanza=9, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-10-10** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***
- **2026/2026-10-10** (ID: authUid): presente=true, tardanza=0, esTardanza=false, uidEnDoc=auth-uid-***

## 5. REGLAS Y AUTH

### Firestore Rules
- Local: `firestore.rules` en repo
- Desplegadas: NO VERIFICADO (no hay API admin para leer reglas desplegadas)

### RTDB Rules
- Local: `database.rules.json` en repo
- Desplegadas: NO VERIFICADO

### Auth
- Usuarios totales: 49
- Proveedores: password
- Sin uid_map: 4 de 49

### Roles en members.rol
- `miembro`: 55
- `apoyo`: 4
- `servidor`: 3
- `coordinador`: 1

## 6. REALTIME DATABASE

### admins
- Tipo: object
- Claves (muestra): 1f1bfc4e-4200-4435-b74f-4fe94b32ef83, 2b5103db-828d-4d60-add4-8e0ef93297ba, 2e923da6-7afc-4ef8-9a9c-e11d5787f09b, 7kypOvMd5pOUc3F0flX6gsB010C2, 8b69e0a3-f49e-4726-aaae-d39721f0859b, NCEckmKkeFSpPM2FWXlLX9AWegD2, YKTi6GOS8xVgr8WWi5Q21JmSOfu1, a55e5b13-70bf-40bc-9bad-bf1896d16e40, cbfaa3ec-3e58-4a28-b980-ad8c95102214, f51a859e-7901-49ae-80d9-0a385ee46dcd, ifgEHq0CCkfMBtrIbZzAdmx94AX2, lIDVX8hTZchFZZCnvkbqzgiuITI3, ovR2LJVjtqZrfGGHhAHD1Qdw6qS2, x8YZM7KdlLO0zut3FzV9ZkLKsZS2

### asamblea
- Tipo: object
- Claves (muestra): activa, estado, preguntaNum, sesion

### borradores
- Tipo: object
- Claves (muestra): -OuSgkzhObPGRCsE90WS, -OuSh8FnNS5uRsi2tM7e, -OuShcymh3D0PD9El2Nq, -OuSkUH1dMnnDgBBt4Kg, -OuSkkpKRePigFjnvxRH

### rankingGlobal
- Tipo: object
- Claves (muestra): ajesfri@gmail_com, aliciacozvillalobos@gmail_com, ariagnasosa411@gmail_com, bryanballon1515@gmail_com, fernandavaldivia0604@gmail_com, francoalesirio@gmail_com, gianfracamones@gmail_com, jackyas922@gmail_com, jorgediego_123_2002@gmail_com, kevincamones64@gmail_com, ksuasnabarh@gmail_com, maferchavez@gmail_com, majeroncal@gmail_com, matinaychinchay@gmail_com, oswaldobohorquez507@gmail_com, paolasolanoh2008@gmail_com, pieromar1919@gmail_com, rauraucoloniat@gmail_com, sandia12xd@gmail_com, sebatias12345@gmail_com

## 7. FRONTEND

### admin.html
- Colecciones: ninguna detectada
- Usa Auth UID directamente: NO
- Usa memberId: NO
- Usa resolveMemberId: NO

### asamblea.html
- Colecciones: ninguna detectada
- Usa Auth UID directamente: NO
- Usa memberId: NO
- Usa resolveMemberId: NO

### dashboard.html
- Colecciones: ninguna detectada
- Usa Auth UID directamente: SÍ
- Usa memberId: SÍ
- Usa resolveMemberId: NO

### gestion-grupo.html
- Colecciones: members, miembros_registro, historico
- Usa Auth UID directamente: NO
- Usa memberId: SÍ
- Usa resolveMemberId: NO

### historia.html
- Colecciones: ninguna detectada
- Usa Auth UID directamente: NO
- Usa memberId: NO
- Usa resolveMemberId: NO

### historial.html
- Colecciones: historico, members, sugerencias, feedback, asistencia, tablas_dinamicas, asambleas_kahoot
- Usa Auth UID directamente: NO
- Usa memberId: NO
- Usa resolveMemberId: NO

### login.html
- Colecciones: ninguna detectada
- Usa Auth UID directamente: NO
- Usa memberId: NO
- Usa resolveMemberId: NO

### planificacion.html
- Colecciones: asambleas
- Usa Auth UID directamente: NO
- Usa memberId: NO
- Usa resolveMemberId: NO

### proyector.html
- Colecciones: ninguna detectada
- Usa Auth UID directamente: NO
- Usa memberId: NO
- Usa resolveMemberId: NO

### registro.html
- Colecciones: ninguna detectada
- Usa Auth UID directamente: SÍ
- Usa memberId: SÍ
- Usa resolveMemberId: NO

### tablas.html
- Colecciones: tablas_definiciones, tablas_dinamicas
- Usa Auth UID directamente: SÍ
- Usa memberId: NO
- Usa resolveMemberId: NO

### tomar-asistencia.html
- Colecciones: asambleas, members, asistencia
- Usa Auth UID directamente: NO
- Usa memberId: SÍ
- Usa resolveMemberId: NO

## 8. LISTA DE PROBLEMAS DETECTADOS

### CRÍTICO

#### 4 usuarios de Auth NO tienen entrada en uid_map
- **Evidencia**: Total Auth: 49, sin uid_map: 4
- **Afecta**: uid_map, members, dashboard (lecturas asistencia fallan)

### ALTO

#### Asistencia con IDs legacy/other (posibles huérfanos): ~125
- **Evidencia**: {"2026/2026-01-10":{"count":33,"presentes":33,"idTypes":{"uuid":0,"authUid":29,"legacy":4,"other":0}},"2026/2026-01-17":{"count":42,"presentes":42,"idTypes":{"uuid":0,"authUid":37,"legacy":5,"other":0}},"2026/2026-01-24":{"count":40,"presentes":40,"idTypes":{"uuid":0,"authUid":35,"legacy":5,"other":0}},"2026/2026-01-31":{"count":41,"presentes":41,"idTypes":{"uuid":0,"authUid":36,"legacy":5,"other":0}},"2026/2026-02-07":{"count":34,"presentes":34,"idTypes":{"uuid":0,"authUid":32,"legacy":2,"other":0}},"2026/2026-02-14":{"count":37,"presentes":37,"idTypes":{"uuid":0,"authUid":33,"legacy":4,"other":0}},"2026/2026-02-21":{"count":39,"presentes":39,"idTypes":{"uuid":0,"authUid":34,"legacy":5,"other":0}},"2026/2026-02-28":{"count":36,"presentes":36,"idTypes":{"uuid":0,"authUid":32,"legacy":4,"other":0}},"2026/2026-03-07":{"count":39,"presentes":39,"idTypes":{"uuid":0,"authUid":36,"legacy":3,"other":0}},"2026/2026-03-14":{"count":36,"presentes":36,"idTypes":{"uuid":0,"authUid":35,"legacy":1,"other":0}},"2026/2026-03-21":{"count":35,"presentes":35,"idTypes":{"uuid":0,"authUid":34,"legacy":1,"other":0}},"2026/2026-03-28":{"count":31,"presentes":31,"idTypes":{"uuid":0,"authUid":29,"legacy":2,"other":0}},"2026/2026-04-18":{"count":32,"presentes":30,"idTypes":{"uuid":0,"authUid":28,"legacy":4,"other":0}},"2026/2026-04-25":{"count":39,"presentes":38,"idTypes":{"uuid":0,"authUid":36,"legacy":3,"other":0}},"2026/2026-05-02":{"count":39,"presentes":39,"idTypes":{"uuid":0,"authUid":36,"legacy":3,"other":0}},"2026/2026-05-09":{"count":30,"presentes":30,"idTypes":{"uuid":0,"authUid":27,"legacy":3,"other":0}},"2026/2026-05-16":{"count":37,"presentes":37,"idTypes":{"uuid":0,"authUid":35,"legacy":2,"other":0}},"2026/2026-05-30":{"count":31,"presentes":30,"idTypes":{"uuid":0,"authUid":28,"legacy":3,"other":0}},"2026/2026-06-06":{"count":37,"presentes":36,"idTypes":{"uuid":0,"authUid":34,"legacy":3,"other":0}},"2026/2026-06-13":{"count":40,"presentes":40,"idTypes":{"uuid":0,"authUid":37,"legacy":3,"other":0}},"2026/2026-06-27":{"count":31,"presentes":31,"idTypes":{"uuid":0,"authUid":29,"legacy":2,"other":0}},"2026/2026-07-04":{"count":35,"presentes":35,"idTypes":{"uuid":0,"authUid":31,"legacy":4,"other":0}},"2026/2026-07-11":{"count":35,"presentes":35,"idTypes":{"uuid":0,"authUid":32,"legacy":3,"other":0}},"2026/2026-07-18":{"count":34,"presentes":34,"idTypes":{"uuid":0,"authUid":31,"legacy":3,"other":0}},"2026/2026-07-25":{"count":38,"presentes":38,"idTypes":{"uuid":0,"authUid":34,"legacy":4,"other":0}},"2026/2026-08-01":{"count":34,"presentes":34,"idTypes":{"uuid":0,"authUid":32,"legacy":2,"other":0}},"2026/2026-08-08":{"count":34,"presentes":34,"idTypes":{"uuid":0,"authUid":30,"legacy":4,"other":0}},"2026/2026-08-15":{"count":36,"presentes":35,"idTypes":{"uuid":0,"authUid":31,"legacy":5,"other":0}},"2026/2026-08-22":{"count":28,"presentes":28,"idTypes":{"uuid":0,"authUid":25,"legacy":3,"other":0}},"2026/2026-08-29":{"count":35,"presentes":32,"idTypes":{"uuid":0,"authUid":27,"legacy":8,"other":0}},"2026/2026-09-19":{"count":27,"presentes":26,"idTypes":{"uuid":0,"authUid":23,"legacy":4,"other":0}},"2026/2026-09-26":{"count":38,"presentes":38,"idTypes":{"uuid":0,"authUid":32,"legacy":6,"other":0}},"2026/2026-10-03":{"count":37,"presentes":35,"idTypes":{"uuid":0,"authUid":30,"legacy":7,"other":0}},"2026/2026-10-10":{"count":28,"presentes":27,"idTypes":{"uuid":0,"authUid":23,"legacy":5,"other":0}}}
- **Afecta**: asistencia/{anio}/{fecha}/{id}

### MEDIO

#### dashboard.html usa memberIdActual pero no usa resolveMemberId consistentemente
- **Evidencia**: dashboard.html: usa memberIdActual global
- **Afecta**: pages/dashboard.html

#### Páginas usan IDs diferentes para acceder a los mismos datos
- **Evidencia**: Auth UID: dashboard.html, registro.html, tablas.html | MemberId: dashboard.html, gestion-grupo.html, registro.html, tomar-asistencia.html
- **Afecta**: Frontend pages

#### Campos legacy aún presentes: memberIdAntiguo en 63 docs, legacyId en 1 docs
- **Evidencia**: {"memberId":63,"memberIdAntiguo":63,"legacyId":1,"uid":45}
- **Afecta**: members collection, migración incompleta

#### No se pudo verificar si firestore.rules local coincide con las desplegadas
- **Evidencia**: Firebase Admin SDK no expone API para leer reglas desplegadas
- **Afecta**: firestore.rules, seguridad

### BAJO

#### Mixed Content: favicon.ico servido por HTTP en dominio HTTPS
- **Evidencia**: Console error: http://luzdecristo.dpdns.org/favicon.ico bloqueado
- **Afecta**: pages/dashboard.html (y otras páginas)

### Cosas que no pude verificar
- Reglas Firestore desplegadas vs locales (no hay API admin)
- Reglas RTDB desplegadas vs locales (no hay API admin)
- Cross-check completo de IDs huérfanos en asistencia (requiere leer todos los members y comparar)
- Funcionamiento real de dashboard en producción (requiere navegador)
- Permisos reales de usuarios específicos (requiere login real)
