"""Prueba de la lógica con un Firestore en memoria y datos FICTICIOS (sin credenciales)."""
import unittest
from relink_member_ids import plan_relinks, apply_relink, delete_old_copied


class Snap:
    def __init__(self, id, data): self.id, self._d = id, data
    @property
    def exists(self): return self._d is not None
    def to_dict(self): return dict(self._d) if self._d is not None else None


class Doc:
    def __init__(self, db, path): self.db, self.path = db, path
    @property
    def id(self): return self.path[-1]
    def get(self): return Snap(self.id, self.db.store.get(self.path))
    def set(self, data): self.db.store[self.path] = dict(data)
    def delete(self): self.db.store.pop(self.path, None)
    def collection(self, name): return Coll(self.db, self.path + (name,))
    def collections(self):
        n = len(self.path)
        names = sorted({p[n] for p in self.db.store if len(p) >= n + 2 and p[:n] == self.path})
        return [Coll(self.db, self.path + (x,)) for x in names]


class Coll:
    def __init__(self, db, path): self.db, self.path = db, path
    def document(self, id): return Doc(self.db, self.path + (id,))
    def stream(self):
        n = len(self.path)
        return [Snap(p[-1], v) for p, v in self.db.store.items() if len(p) == n + 1 and p[:n] == self.path]


class FakeDB:
    def __init__(self): self.store = {}
    def collection(self, name): return Coll(self, (name,))


AUTH = {"UID_A": "a@x.com", "UID_B": "b@x.com"}          # uid -> correo
by_id = lambda i: i in AUTH
by_mail = lambda m: next((u for u, e in AUTH.items() if e == m), None)


def build():
    db = FakeDB()
    db.store[("members", "UID_A")] = {"nombre": "A", "email": "a@x.com", "rol": "miembro"}
    db.store[("members", "DRIVE_ID")] = {"nombre": "B", "email": "B@x.com ", "rol": "miembro"}   # id incorrecto
    db.store[("members", "PEND")] = {"nombre": "C", "email": ""}                                # sin cuenta
    db.store[("members", "DUP")] = {"nombre": "A2", "email": "a@x.com"}                         # choca con UID_A
    for f in ("2026-01-17", "2026-01-24"):
        db.store[("asistencia", "2026", f, "DRIVE_ID")] = {"presente": True, "uid": "DRIVE_ID", "fecha": f, "tardanzaMinutos": 5}
    db.store[("asistencia", "2026", "2026-01-17", "UID_A")] = {"presente": True, "uid": "UID_A", "fecha": "2026-01-17"}
    return db


class T(unittest.TestCase):
    def members(self, db): return {s.id: s.to_dict() for s in db.collection("members").stream()}

    def test_plan(self):
        p = plan_relinks(self.members(build()), by_id, by_mail)
        self.assertEqual(p["ok"], ["UID_A"])
        self.assertEqual([(r["old"], r["new"]) for r in p["relink"]], [("DRIVE_ID", "UID_B")])
        self.assertEqual([c["id"] for c in p["sin_cuenta"]], ["PEND"])
        self.assertEqual([c["id"] for c in p["conflicto"]], ["DUP"])       # nunca pisa members/UID_A

    def test_dry_run_no_escribe(self):
        db = build(); antes = dict(db.store)
        item = plan_relinks(self.members(db), by_id, by_mail)["relink"][0]
        apply_relink(db, item, db.store[("members", "DRIVE_ID")], ["2026"], {}, True)
        self.assertEqual(db.store, antes)

    def test_copia_sin_borrar(self):
        db = build()
        item = plan_relinks(self.members(db), by_id, by_mail)["relink"][0]
        r = apply_relink(db, item, db.store[("members", "DRIVE_ID")], ["2026"], {"b@x.com": "coordinador"}, False)
        self.assertEqual(r["asistencias_copiadas"], 2)
        n = db.store[("members", "UID_B")]
        self.assertEqual((n["uid"], n["legacyId"], n["rol"]), ("UID_B", "DRIVE_ID", "coordinador"))
        a = db.store[("asistencia", "2026", "2026-01-24", "UID_B")]
        self.assertEqual((a["uid"], a["tardanzaMinutos"], a["presente"]), ("UID_B", 5, True))
        self.assertIn(("members", "DRIVE_ID"), db.store)                    # viejo intacto
        self.assertIn(("asistencia", "2026", "2026-01-24", "DRIVE_ID"), db.store)

    def test_flujo_completo_copiar_verificar_borrar(self):
        db = build()
        item = plan_relinks(self.members(db), by_id, by_mail)["relink"][0]
        apply_relink(db, item, db.store[("members", "DRIVE_ID")], ["2026"], {}, False)          # 1ª corrida: --apply
        p = plan_relinks(self.members(db), by_id, by_mail)                                      # 2ª corrida (dry-run)
        self.assertEqual(p["relink"], [])
        self.assertEqual([c["old"] for c in p["copiado"]], ["DRIVE_ID"])                        # detecta "ya copiado"
        self.assertNotIn("DRIVE_ID", [c["id"] for c in p["conflicto"]])
        r = delete_old_copied(db, p["copiado"][0], ["2026"], False)                              # 2ª corrida: --delete-old
        self.assertIsNone(r["error"])
        self.assertFalse([k for k in db.store if k[-1] == "DRIVE_ID"])
        self.assertEqual(len([k for k in db.store if k[0] == "asistencia" and k[-1] == "UID_B"]), 2)
        p = plan_relinks(self.members(db), by_id, by_mail)                                      # 3ª corrida: nada pendiente
        self.assertEqual((p["relink"], p["copiado"]), ([], []))
        self.assertIn("UID_B", p["ok"])

    def test_no_borra_si_falta_una_copia(self):
        db = build()
        item = plan_relinks(self.members(db), by_id, by_mail)["relink"][0]
        apply_relink(db, item, db.store[("members", "DRIVE_ID")], ["2026"], {}, False)
        del db.store[("asistencia", "2026", "2026-01-24", "UID_B")]                             # se perdió una copia
        p = plan_relinks(self.members(db), by_id, by_mail)
        r = delete_old_copied(db, p["copiado"][0], ["2026"], False)
        self.assertIn("falta copia", r["error"])
        self.assertIn(("members", "DRIVE_ID"), db.store)                                        # el viejo sigue intacto
        self.assertIn(("asistencia", "2026", "2026-01-24", "DRIVE_ID"), db.store)

    def test_mapeo_manual_y_rol_por_uid(self):
        db = build()
        db.store[("members", "DRIVE_ID")]["email"] = "otro@x.com"              # el correo NO coincide con Auth
        m = self.members(db)
        p = plan_relinks(m, by_id, by_mail)
        self.assertIn("DRIVE_ID", [c["id"] for c in p["sin_cuenta"]])          # sin --map queda pendiente
        p = plan_relinks(m, by_id, by_mail, {"DRIVE_ID": "UID_B"})
        self.assertEqual([(r["old"], r["new"]) for r in p["relink"]], [("DRIVE_ID", "UID_B")])
        p2 = plan_relinks(m, by_id, by_mail, {"DRIVE_ID": "NO_EXISTE"})        # uid inexistente: no se enlaza
        self.assertEqual(p2["relink"], [])
        apply_relink(db, p["relink"][0], m["DRIVE_ID"], ["2026"], {"UID_B": "coordinador"}, False)
        self.assertEqual(db.store[("members", "UID_B")]["rol"], "coordinador")


if __name__ == "__main__":
    unittest.main()
