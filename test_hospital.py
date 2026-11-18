import os
import sqlite3
import tempfile
import unittest

import hospital


class HospitalDBTests(unittest.TestCase):
    def setUp(self):
        fd, self.db_path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        self.original_db = hospital.DB_FILE
        hospital.DB_FILE = self.db_path
        self.conn = hospital.connect()
        hospital.setup(self.conn)

    def tearDown(self):
        self.conn.close()
        hospital.DB_FILE = self.original_db
        os.unlink(self.db_path)

    def test_seed_counts(self):
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) FROM patients").fetchone()[0], 4
        )
        self.assertEqual(
            self.conn.execute("SELECT COUNT(*) FROM appointments").fetchone()[0], 11
        )

    def test_foreign_key_rejects_unknown_patient(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.conn.execute(
                """INSERT INTO appointments
                   (appt_id, patient_id, doctor_id, appt_date, status)
                   VALUES (99, 999, 1, '2026-01-01', 'scheduled')"""
            )

    def test_check_rejects_invalid_gender(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.conn.execute(
                """INSERT INTO patients
                   (patient_id, full_name, dob, gender)
                   VALUES (99, 'Test Patient', '2000-01-01', 'X')"""
            )

    def test_check_rejects_overpayment(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.conn.execute(
                """INSERT INTO bills
                   (bill_id, appt_id, amount, paid_amount, bill_date)
                   VALUES (99, 1, 100, 500, '2026-01-01')"""
            )

    def test_no_orphan_rows(self):
        self.assertEqual(self.conn.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_patient_history_join(self):
        rows = self.conn.execute(hospital.PATIENT_HISTORY_SQL, (1,)).fetchall()
        conditions = {r["condition"] for r in rows if r["condition"]}
        self.assertIn("Hypertension", conditions)
        self.assertIn("Vitamin D deficiency", conditions)

    def test_frequent_departments_subquery(self):
        names = [r["dept_name"] for r in self.conn.execute(hospital.FREQUENT_DEPTS_SQL)]
        self.assertEqual(names, ["Cardiology", "General Medicine"])

    def test_patient_records_view(self):
        count = self.conn.execute(
            "SELECT COUNT(*) FROM v_patient_records"
        ).fetchone()[0]
        self.assertEqual(count, 4)
        last_visit = self.conn.execute(
            "SELECT last_visit FROM v_patient_records WHERE patient_id = 2"
        ).fetchone()[0]
        self.assertEqual(last_visit, "2026-10-18")

    def test_revenue_view_totals(self):
        row = self.conn.execute(
            """SELECT SUM(total_billed), SUM(total_collected), SUM(outstanding)
               FROM v_revenue_analysis"""
        ).fetchone()
        self.assertEqual(row[0], 16200)
        self.assertEqual(row[1], 13900)
        self.assertEqual(row[2], 2300)

    def test_patient_lookup_uses_index(self):
        plan = " ".join(
            r["detail"]
            for r in self.conn.execute(
                "EXPLAIN QUERY PLAN SELECT * FROM appointments WHERE patient_id = 1"
            )
        )
        self.assertIn("idx_appt_patient", plan)


if __name__ == "__main__":
    unittest.main(verbosity=2)
