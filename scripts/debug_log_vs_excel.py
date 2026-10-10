#!/usr/bin/env python3
"""Debug: comparar attendance_log deduplicado vs attendance.csv resumen"""

import csv
import re

def parseExcelDate(cell):
    if not cell: return None
    s = str(cell).strip()
    if re.match(r'^\d{2}/\d{2}$', s):
        d, m = s.split('/')
        return f"2026-{m.zfill(2)}-{d.zfill(2)}"
    if re.match(r'^\d{4}-\d{2}-\d{2}', s):
        return s.split(' ')[0]
    return None

# 1. FECHAS HABILITADAS
enabled_dates = set()
with open('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/migration/sheets_export/config.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        fecha = (row.get('Fecha') or '').strip()
        hay = (row.get('Hay_Asamblea') or '0').strip()
        if hay in ('1.0', '1'): enabled_dates.add(fecha)

# 2. ATTENDANCE LOG DEDUPLICADO
log_asistencias = {}
with open('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/migration/sheets_export/attendance_log.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        ts = (row.get('Timestamp') or '').strip()
        nombre = (row.get('Nombre') or '').strip()
        if not ts or not nombre: continue
        fecha = ts.split(' ')[0]
        if fecha not in enabled_dates: continue
        if nombre not in log_asistencias: log_asistencias[nombre] = set()
        log_asistencias[nombre].add(fecha)

log_totals = {k: len(v) for k, v in log_asistencias.items()}

# 3. ATTENDANCE.CSV RESUMEN
attendance = []
with open('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/migration/sheets_export/attendance.csv', 'r') as f:
    reader = csv.DictReader(f)
    attendance = list(reader)

headers = list(attendance[0].keys())
fecha_cols = []
for i, h in enumerate(headers[1:-1], 1):
    f = parseExcelDate(h)
    if f and f in enabled_dates:
        fecha_cols.append((i, f))

excel_totals = {}
for row in attendance:
    nombre = (row.get('Nombre') or '').strip()
    if not nombre or nombre == 'Total de asistentes:': continue
    total = 0
    for col_idx, fecha in fecha_cols:
        header_name = headers[col_idx]
        try:
            valor = float(row.get(header_name, '0') or '0')
        except: valor = 0
        if valor >= 1: total += 1
    excel_totals[nombre] = total

# 4. COMPARAR LOG vs EXCEL RESUMEN
print(f"Nombres en log: {len(log_totals)}")
print(f"Nombres en excel: {len(excel_totals)}")

all_names = set(log_totals.keys()) | set(excel_totals.keys())

print(f"\n{'NOMBRE':<30} {'LOG':>6} {'EXCEL':>6} {'DIFF':>6}")
print("="*60)

diffs = 0
for nombre in sorted(all_names):
    log_t = log_totals.get(nombre, 0)
    excel_t = excel_totals.get(nombre, 0)
    if log_t != excel_t:
        diffs += 1
        print(f"{nombre:<30} {log_t:>6} {excel_t:>6} {excel_t - log_t:>6}")

print(f"\nTotal diferencias: {diffs}")

# Nombres en log que no en excel
print("\n📋 En log NO en excel:")
for n in sorted(log_totals.keys()):
    if n not in excel_totals:
        print(f"   - {n}: {log_totals[n]}")

# Nombres en excel que no en log
print("\n📋 En excel NO en log:")
for n in sorted(excel_totals.keys()):
    if n not in log_totals:
        print(f"   - {n}: {excel_totals[n]}")

# 5. Mostrar fechas por nombre para algunos casos
print("\n📅 Fechas de casos problemáticos:")
for nombre in ['Kayrel Suasnabar', 'kayrel suasnabar', 'Gabriel Revollar', 'Gabriel Revoller', 'Diego', 'Diego García', 'María Fé', 'María Fernanda Chávez']:
    if nombre in log_asistencias:
        print(f"   {nombre}: {sorted(log_asistencias[nombre])}")
    else:
        print(f"   {nombre}: NO EN LOG")