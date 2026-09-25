#!/usr/bin/env python3
"""Despliega firestore.rules al proyecto Firebase (luxto-nsp).

Usa el API directo de Firebase Rules vía REST — sin CLI de firebase-tools
(que exige Service Usage, que la service account no tiene permiso de consultar):
  1. Crea un ruleset con el contenido de firestore.rules
  2. Lo publica (release) como reglas de la base (default)

Requisitos:
  - migration/firebase-service-account.json con permiso firebase.rulesets.create
    (por ejemplo rol Editor o Firebase Rules Admin en el proyecto).
  - pip install google-auth requests

Uso:
  python3 migration/deploy_rules.py
"""
import json
import sys
from pathlib import Path

import google.auth.transport.requests
import requests
from google.oauth2 import service_account

ROOT = Path(__file__).resolve().parent.parent
SA_FILE = ROOT / 'migration' / 'firebase-service-account.json'
RULES_FILE = ROOT / 'firestore.rules'

if not SA_FILE.exists():
    sys.exit(f'ERROR: no existe {SA_FILE} (no se commitea, ver .gitignore)')
if not RULES_FILE.exists():
    sys.exit(f'ERROR: no existe {RULES_FILE}')

PROJECT = json.loads(SA_FILE.read_text())['project_id']
API = f'https://firebaserules.googleapis.com/v1/projects/{PROJECT}'
# El release de Firestore siempre se llama cloud.firestore (el de Storage sería firebase.storage)
RELEASE = f'{API}/releases/cloud.firestore'

creds = service_account.Credentials.from_service_account_file(
    str(SA_FILE),
    scopes=['https://www.googleapis.com/auth/firebase',
            'https://www.googleapis.com/auth/cloud-platform'])
creds.refresh(google.auth.transport.requests.Request())
headers = {'Authorization': f'Bearer {creds.token}',
           'Content-Type': 'application/json'}

# 1) Crear el ruleset con las reglas del repo
payload = {'source': {'files': [{
    'name': 'firestore.rules',
    'content': RULES_FILE.read_text(),
}]}}
r = requests.post(f'{API}/rulesets', headers=headers, json=payload, timeout=60)
if r.status_code != 200:
    sys.exit(f'ERROR creando ruleset: HTTP {r.status_code}\n{r.text}\n\n'
             'Si es 403, la service account no tiene permiso de desplegar reglas:\n'
             'habrá que publicarlas manualmente en Firebase Console → Firestore → Reglas.')
ruleset_name = r.json()['name']  # projects/<proj>/rulesets/<id>
print(f'Ruleset creado: {ruleset_name}')

# 2) Publicar el ruleset apuntando el release cloud.firestore al nuevo ruleset
#    Body correcto (según discovery): { "release": {...}, "updateMask": "ruleset_name" }
r2 = requests.patch(RELEASE, headers=headers,
                    json={
                        'release': {'name': RELEASE, 'rulesetName': ruleset_name},
                        'updateMask': 'ruleset_name',
                    },
                    timeout=60)
if r2.status_code == 404:
    # El release aún no existe — crearlo
    r2 = requests.post(f'{API}/releases', headers=headers,
                       json={'name': RELEASE, 'rulesetName': ruleset_name},
                       timeout=60)
if r2.status_code != 200:
    sys.exit(f'ERROR publicando release: HTTP {r2.status_code}\n{r2.text}')

# 3) Verificar: releer el release y mostrar el ruleset activo
r3 = requests.get(RELEASE, headers=headers, timeout=60)
if r3.status_code == 200:
    activo = r3.json().get('rulesetName', '(ninguno)')
    print(f'Reglas publicadas. ruleset activo: {activo}')
else:
    print(f'Reglas publicadas (no se pudo verificar: HTTP {r3.status_code})')
