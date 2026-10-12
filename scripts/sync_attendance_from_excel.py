#!/usr/bin/env python3
"""
Sincroniza asistencia desde el archivo Excel de Asistencia Parroquial a Firestore.

Regla de seguridad: no borra, no reescribe registros existentes, solo crea o completa
los documentos necesarios bajo:
  - asambleas/{fecha}
  - asistencia/{anio}/{fecha}/{uid}

Se usa como import seguro para actualizar los sábados recientes sin destruir el backend.
"""

from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path

import openpyxl
import firebase_admin
from firebase_admin import credentials, firestore

ROOT = Path(__file__).resolve().parents[1]
EXCEL_PATH = ROOT / "Asistencia_Parroquial_DataScience_2026.xlsx"
SERVICE_ACCOUNT_PATH = ROOT / "firebase-service-account.json"


def normalize_name(value):
    return " ".join(str(value or "").strip().split()).lower()


def parse_date_value(value):
    """Convert to ISO 'YYYY-MM-DD' when possible."""
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return ""
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
            try:
                return datetime.strptime(text[:10], fmt).strftime("%Y-%m-%d")
            except Exception:
                pass
        # Handle values like '03/01' used in the attendance matrix header.
        if "/" in text and len(text) <= 5:
            try:
                day, month = text.split("/")
                return f"2026-{int(month):02d}-{int(day):02d}"
            except Exception:
                pass
    return ""


def to_float(value):
    if value in (None, ""):
        return 0.0
    try:
        return float(value)
    except Exception:
        try:
            return float(str(value).replace(",", "."))
        except Exception:
            return 0.0


def map_member_uids(db):
    out = {}
    for doc in db.collection("members").stream():
        data = doc.to_dict() or {}
        name = data.get("nombre") or data.get("name") or ""
        if name:
            out[normalize_name(name)] = doc.id
    return out


def sync_asambleas(db, workbook):
    ws = workbook["Configuracion"]
    created = 0
    updated = 0

    for row in ws.iter_rows(min_row=2, values_only=True):
        fecha = row[0]
        if not fecha:
            continue
        fecha_str = parse_date_value(fecha)
        if not fecha_str:
            continue

        hay_asamblea = bool(to_float(row[1]) >= 1)
        hora_inicio = str(row[2]).strip() if row[2] not in (None, "") else "16:00"
        observacion = str(row[3]).strip() if row[3] not in (None, "") else ""

        data = {
            "fecha": fecha_str,
            "hayAsamblea": hay_asamblea,
            "horaInicio": hora_inicio,
            "observacion": observacion,
        }
        ref = db.collection("asambleas").document(fecha_str)
        existing = ref.get()
        if existing.exists:
            current = existing.to_dict() or {}
            if current.get("hayAsamblea") != hay_asamblea or current.get("horaInicio") != hora_inicio or current.get("observacion") != observacion:
                ref.set(data, merge=True)
                updated += 1
        else:
            ref.set(data, merge=True)
            created += 1

    return created, updated


def build_log_map(workbook):
    ws = workbook["Log_Asistencia"]
    result = {}

    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or len(row) < 6:
            continue
        ts = row[0]
        nombre = (row[1] or "").strip()
        if not ts or not nombre:
            continue

        if isinstance(ts, datetime):
            fecha = ts.strftime("%Y-%m-%d")
            dt = ts
        else:
            fecha = parse_date_value(ts)
            dt = None
            if not fecha:
                continue

        tardanza = int(to_float(row[5] or 0))
        key = (normalize_name(nombre), fecha)
        current = result.get(key)
        if current is None or (dt and current[0] and dt < current[0]):
            result[key] = (dt, tardanza)

    return result


def sync_asistencia(db, workbook, member_uids):
    ws = workbook["Asistencia"]
    log_map = build_log_map(workbook)

    header = next(ws.iter_rows(min_row=1, max_row=1, values_only=True), ())
    date_columns = []
    for idx, value in enumerate(header[1:], start=1):
        fecha = parse_date_value(value)
        if fecha:
            date_columns.append((idx, fecha))

    created = 0
    updated = 0
    skipped = 0

    for row in ws.iter_rows(min_row=3, values_only=True):
        if not row or not row[0]:
            continue

        nombre = str(row[0]).strip()
        uid = member_uids.get(normalize_name(nombre))
        if not uid:
            skipped += 1
            continue

        for col_idx, fecha in date_columns:
            if col_idx >= len(row):
                continue
            value = row[col_idx - 1]
            if value in (None, "", 0, 0.0):
                continue
            if to_float(value) < 1:
                continue

            ts_info = log_map.get((normalize_name(nombre), fecha), (None, 0))
            llegada = ts_info[0]
            tardanza = int(ts_info[1])

            doc = {
                "presente": True,
                "uid": uid,
                "fecha": fecha,
                "nombre": nombre,
                "tardanzaMinutos": tardanza,
                "esTardanza": bool(tardanza > 10),
            }
            if llegada:
                doc["horaLlegadaServidor"] = llegada

            ref = db.collection("asistencia").document("2026").collection(fecha).document(uid)
            existing = ref.get()
            if existing.exists:
                current = existing.to_dict() or {}
                needs_update = False
                for field, new_value in doc.items():
                    if current.get(field) != new_value:
                        needs_update = True
                        break
                if needs_update:
                    ref.set(doc, merge=True)
                    updated += 1
            else:
                ref.set(doc)
                created += 1

    return created, updated, skipped


def main():
    if not EXCEL_PATH.exists():
        raise FileNotFoundError(f"No existe el Excel: {EXCEL_PATH}")

    if not SERVICE_ACCOUNT_PATH.exists():
        raise FileNotFoundError(f"No existe el service account: {SERVICE_ACCOUNT_PATH}")

    if not firebase_admin._apps:
        cred = credentials.Certificate(str(SERVICE_ACCOUNT_PATH))
        firebase_admin.initialize_app(cred)

    db = firestore.client()
    workbook = openpyxl.load_workbook(EXCEL_PATH, read_only=True, data_only=True)

    member_uids = map_member_uids(db)
    asambleas_created, asambleas_updated = sync_asambleas(db, workbook)
    asistencia_created, asistencia_updated, asistencia_skipped = sync_asistencia(db, workbook, member_uids)

    print(f"\n=== Resumen de sincronización ===")
    print(f"asambleas creados: {asambleas_created}")
    print(f"asambleas actualizados: {asambleas_updated}")
    print(f"asistencia creados: {asistencia_created}")
    print(f"asistencia actualizados: {asistencia_updated}")
    print(f"asistencia omitidos por uid faltante: {asistencia_skipped}")
    print("\n✅ Importación segura completada.")
    print("No se borró ninguna asistencia existente; solo se crearon o completaron documentos faltantes.")


if __name__ == "__main__":
    main()
