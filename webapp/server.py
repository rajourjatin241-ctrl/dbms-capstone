import json
import os
import re
import sqlite3
import sys
from datetime import date, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
STATIC_DIR = os.path.join(BASE_DIR, "static")
PORT = int(os.environ.get("PORT", "8000"))

sys.path.insert(0, ROOT_DIR)
import hospital

hospital.DB_FILE = os.path.join(ROOT_DIR, "hospital.db")

MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
}

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
GENDERS = {"M", "F", "O"}
DB_TABLES = (
    "departments",
    "doctors",
    "patients",
    "appointments",
    "medical_history",
    "prescriptions",
    "prescription_items",
    "diagnostic_tests",
    "bills",
)


def init_db():
    conn = hospital.connect()
    try:
        hospital.setup(conn)
    finally:
        conn.close()


def rows(conn, sql, params=()):
    return [dict(row) for row in conn.execute(sql, params).fetchall()]


def overview():
    conn = hospital.connect()
    try:
        data = dict(
            conn.execute(
                """
                SELECT
                  (SELECT COUNT(*) FROM patients) AS patients,
                  (SELECT COUNT(*) FROM doctors) AS doctors,
                  (SELECT COUNT(*) FROM departments) AS departments,
                  (SELECT COUNT(*) FROM appointments) AS appointments,
                  (SELECT COUNT(*) FROM appointments
                    WHERE status = 'scheduled') AS scheduled,
                  (SELECT COALESCE(SUM(amount), 0) FROM bills) AS billed,
                  (SELECT COALESCE(SUM(paid_amount), 0) FROM bills) AS collected
                """
            ).fetchone()
        )
        data["outstanding"] = data["billed"] - data["collected"]
        return data
    finally:
        conn.close()


def patient_list():
    conn = hospital.connect()
    try:
        return {
            "patients": rows(
                conn,
                """
                SELECT patient_id, full_name, gender, dob,
                       COALESCE(phone, '-') AS phone,
                       total_appointments,
                       COALESCE(last_visit, '-') AS last_visit,
                       COALESCE(latest_condition, '-') AS latest_condition
                FROM v_patient_records
                ORDER BY patient_id
                """,
            )
        }
    finally:
        conn.close()


def patient_history(patient_id):
    conn = hospital.connect()
    try:
        patient = conn.execute(
            "SELECT patient_id, full_name, gender, dob, phone, email "
            "FROM patients WHERE patient_id = ?",
            (patient_id,),
        ).fetchone()
        if not patient:
            raise ValueError("Patient not found.")

        visits = {}
        for row in conn.execute(hospital.PATIENT_HISTORY_SQL, (patient_id,)):
            visit = visits.get(row["appt_id"])
            if visit is None:
                visit = visits[row["appt_id"]] = {
                    "appt_id": row["appt_id"],
                    "date": row["appt_date"],
                    "status": row["status"],
                    "doctor": row["doctor_name"],
                    "specialization": row["specialization"],
                    "department": row["dept_name"],
                    "condition": row["condition"] or "Not recorded",
                    "has_record": row["condition"] is not None,
                    "medicines": [],
                    "tests": [],
                }
            if row["item_id"] and all(
                m["item_id"] != row["item_id"] for m in visit["medicines"]
            ):
                visit["medicines"].append(
                    {
                        "item_id": row["item_id"],
                        "medicine": row["medicine"],
                        "dosage": row["dosage"],
                        "duration_days": row["duration_days"],
                    }
                )
            if row["test_id"] and all(
                t["test_id"] != row["test_id"] for t in visit["tests"]
            ):
                visit["tests"].append(
                    {
                        "test_id": row["test_id"],
                        "test_name": row["test_name"],
                        "result": row["result"] or "Pending",
                    }
                )
        return {"patient": dict(patient), "visits": list(visits.values())}
    finally:
        conn.close()


def appointment_list():
    conn = hospital.connect()
    try:
        return {
            "appointments": rows(
                conn,
                """
                SELECT a.appt_id, a.appt_date, a.status,
                       p.full_name AS patient,
                       d.doctor_name AS doctor,
                       dep.dept_name AS department
                FROM appointments a
                JOIN patients p     ON p.patient_id = a.patient_id
                JOIN doctors d      ON d.doctor_id = a.doctor_id
                JOIN departments dep ON dep.dept_id = d.dept_id
                ORDER BY a.appt_date DESC, a.appt_id DESC
                """,
            )
        }
    finally:
        conn.close()


def reference_data():
    conn = hospital.connect()
    try:
        return {
            "departments": rows(
                conn,
                "SELECT dept_id, dept_name, location, phone "
                "FROM departments ORDER BY dept_name",
            ),
            "doctors": rows(
                conn,
                """
                SELECT d.doctor_id, d.doctor_name, d.specialization,
                       d.dept_id, dep.dept_name
                FROM doctors d
                JOIN departments dep ON dep.dept_id = d.dept_id
                ORDER BY d.doctor_name
                """,
            ),
        }
    finally:
        conn.close()


def frequent():
    conn = hospital.connect()
    try:
        return {
            "departments": rows(conn, hospital.FREQUENT_DEPTS_SQL),
            "doctors": rows(conn, hospital.FREQUENT_DOCTORS_SQL),
        }
    finally:
        conn.close()


def revenue():
    conn = hospital.connect()
    try:
        departments = rows(
            conn,
            "SELECT dept_name, bill_count, total_billed, total_collected, "
            "outstanding FROM v_revenue_analysis ORDER BY total_billed DESC",
        )
        totals = dict(
            conn.execute(
                "SELECT COALESCE(SUM(amount), 0) AS billed, "
                "COALESCE(SUM(paid_amount), 0) AS collected, "
                "COALESCE(SUM(amount - paid_amount), 0) AS outstanding "
                "FROM bills"
            ).fetchone()
        )
        return {"departments": departments, "totals": totals}
    finally:
        conn.close()


def doctor_list():
    conn = hospital.connect()
    try:
        return {
            "doctors": rows(
                conn,
                """
                SELECT d.doctor_id, d.doctor_name, d.specialization,
                       d.dept_id, dep.dept_name,
                       COUNT(a.appt_id) AS total_appointments,
                       COALESCE(SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END), 0)
                           AS completed,
                       COALESCE(SUM(CASE WHEN a.status = 'scheduled' THEN 1 ELSE 0 END), 0)
                           AS scheduled,
                       COUNT(DISTINCT a.patient_id) AS patients
                FROM doctors d
                JOIN departments dep ON dep.dept_id = d.dept_id
                LEFT JOIN appointments a ON a.doctor_id = d.doctor_id
                GROUP BY d.doctor_id
                ORDER BY total_appointments DESC, d.doctor_name
                """,
            )
        }
    finally:
        conn.close()


def department_list():
    conn = hospital.connect()
    try:
        return {
            "departments": rows(
                conn,
                """
                SELECT dep.dept_id, dep.dept_name, dep.location, dep.phone,
                       COUNT(DISTINCT d.doctor_id) AS doctors,
                       COUNT(DISTINCT a.appt_id) AS appointments,
                       COALESCE(SUM(b.amount), 0) AS billed,
                       COALESCE(SUM(b.paid_amount), 0) AS collected
                FROM departments dep
                LEFT JOIN doctors d ON d.dept_id = dep.dept_id
                LEFT JOIN appointments a ON a.doctor_id = d.doctor_id
                LEFT JOIN bills b ON b.appt_id = a.appt_id
                GROUP BY dep.dept_id
                ORDER BY appointments DESC, dep.dept_name
                """,
            )
        }
    finally:
        conn.close()


def bill_list():
    conn = hospital.connect()
    try:
        bills = rows(
            conn,
            """
            SELECT b.bill_id, b.appt_id, b.bill_date, b.amount, b.paid_amount,
                   (b.amount - b.paid_amount) AS outstanding,
                   CASE WHEN b.paid_amount >= b.amount THEN 'paid'
                        WHEN b.paid_amount > 0 THEN 'partial'
                        ELSE 'unpaid' END AS status,
                   p.patient_id, p.full_name AS patient,
                   d.doctor_name AS doctor, dep.dept_name AS department,
                   a.appt_date
            FROM bills b
            JOIN appointments a ON a.appt_id = b.appt_id
            JOIN patients p ON p.patient_id = a.patient_id
            JOIN doctors d ON d.doctor_id = a.doctor_id
            JOIN departments dep ON dep.dept_id = d.dept_id
            ORDER BY b.bill_date DESC, b.bill_id DESC
            """,
        )
        totals = dict(
            conn.execute(
                "SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS billed, "
                "COALESCE(SUM(paid_amount), 0) AS collected, "
                "COALESCE(SUM(amount - paid_amount), 0) AS outstanding, "
                "COALESCE(ROUND(AVG(amount), 2), 0) AS avg_bill FROM bills"
            ).fetchone()
        )
        return {"bills": bills, "totals": totals}
    finally:
        conn.close()


def patient_profile(patient_id):
    history = patient_history(patient_id)
    conn = hospital.connect()
    try:
        bills = rows(
            conn,
            """
            SELECT b.bill_id, b.appt_id, b.bill_date, b.amount, b.paid_amount,
                   (b.amount - b.paid_amount) AS outstanding,
                   CASE WHEN b.paid_amount >= b.amount THEN 'paid'
                        WHEN b.paid_amount > 0 THEN 'partial'
                        ELSE 'unpaid' END AS status,
                   d.doctor_name AS doctor, dep.dept_name AS department
            FROM bills b
            JOIN appointments a ON a.appt_id = b.appt_id
            JOIN doctors d ON d.doctor_id = a.doctor_id
            JOIN departments dep ON dep.dept_id = d.dept_id
            WHERE a.patient_id = ?
            ORDER BY b.bill_date DESC, b.bill_id DESC
            """,
            (patient_id,),
        )
    finally:
        conn.close()

    visits = history["visits"]
    bills_by_appt = {}
    for bill in bills:
        bills_by_appt.setdefault(bill["appt_id"], []).append(bill)
    for visit in visits:
        visit["bills"] = bills_by_appt.get(visit["appt_id"], [])

    completed = [v["date"] for v in visits if v["status"] == "completed"]
    scheduled = [v["date"] for v in visits if v["status"] == "scheduled"]
    summary = {
        "visits": len(visits),
        "last_visit": max(completed) if completed else None,
        "next_visit": min(scheduled) if scheduled else None,
        "billed": round(sum(b["amount"] for b in bills), 2),
        "paid": round(sum(b["paid_amount"] for b in bills), 2),
        "outstanding": round(sum(b["outstanding"] for b in bills), 2),
    }
    return {
        "patient": history["patient"],
        "visits": visits,
        "bills": bills,
        "summary": summary,
    }


def analytics():
    today = date.today()
    first_week = today - timedelta(days=today.weekday()) - timedelta(weeks=7)
    labels, appointments, billed, collected = [], [], [], []

    conn = hospital.connect()
    try:
        for index in range(8):
            week_start = first_week + timedelta(weeks=index)
            week_end = week_start + timedelta(days=6)
            labels.append(week_start.strftime("%d %b"))
            appt_row = conn.execute(
                "SELECT COUNT(*) AS total FROM appointments "
                "WHERE appt_date BETWEEN ? AND ?",
                (week_start.isoformat(), week_end.isoformat()),
            ).fetchone()
            bill_row = conn.execute(
                "SELECT COALESCE(SUM(amount), 0) AS billed, "
                "COALESCE(SUM(paid_amount), 0) AS collected FROM bills "
                "WHERE bill_date BETWEEN ? AND ?",
                (week_start.isoformat(), week_end.isoformat()),
            ).fetchone()
            appointments.append(appt_row["total"])
            billed.append(bill_row["billed"])
            collected.append(bill_row["collected"])

        status_counts = {
            row["status"]: row["total"]
            for row in conn.execute(
                "SELECT status, COUNT(*) AS total FROM appointments GROUP BY status"
            )
        }
        gender_counts = {
            row["gender"]: row["total"]
            for row in conn.execute(
                "SELECT gender, COUNT(*) AS total FROM patients GROUP BY gender"
            )
        }

        age_buckets = [("0-17", 0), ("18-35", 0), ("36-59", 0), ("60+", 0)]
        for row in conn.execute("SELECT dob FROM patients"):
            try:
                born = date.fromisoformat(row["dob"])
            except ValueError:
                continue
            age = today.year - born.year - (
                (today.month, today.day) < (born.month, born.day)
            )
            if age < 18:
                age_buckets[0] = (age_buckets[0][0], age_buckets[0][1] + 1)
            elif age < 36:
                age_buckets[1] = (age_buckets[1][0], age_buckets[1][1] + 1)
            elif age < 60:
                age_buckets[2] = (age_buckets[2][0], age_buckets[2][1] + 1)
            else:
                age_buckets[3] = (age_buckets[3][0], age_buckets[3][1] + 1)

        totals = dict(
            conn.execute(
                "SELECT COALESCE(SUM(amount), 0) AS billed, "
                "COALESCE(SUM(paid_amount), 0) AS collected, "
                "COALESCE(SUM(amount - paid_amount), 0) AS outstanding, "
                "COUNT(*) AS bills, COALESCE(ROUND(AVG(amount), 0), 0) AS avg_bill "
                "FROM bills"
            ).fetchone()
        )
        totals["collection_rate"] = (
            round(totals["collected"] / totals["billed"] * 100)
            if totals["billed"]
            else 0
        )
        upcoming = conn.execute(
            "SELECT COUNT(*) AS total FROM appointments "
            "WHERE status = 'scheduled' AND appt_date >= ?",
            (today.isoformat(),),
        ).fetchone()["total"]

        top_department = conn.execute(
            "SELECT dept_name, total_billed FROM v_revenue_analysis "
            "ORDER BY total_billed DESC LIMIT 1"
        ).fetchone()
        top_doctor = conn.execute(
            """
            SELECT d.doctor_name AS name, COUNT(a.appt_id) AS visits
            FROM doctors d
            LEFT JOIN appointments a ON a.doctor_id = d.doctor_id
            GROUP BY d.doctor_id
            ORDER BY visits DESC, d.doctor_name
            LIMIT 1
            """
        ).fetchone()
    finally:
        conn.close()

    return {
        "weekly": {
            "labels": labels,
            "appointments": appointments,
            "billed": billed,
            "collected": collected,
        },
        "status": status_counts,
        "gender": gender_counts,
        "age": [{"label": label, "count": count} for label, count in age_buckets],
        "totals": totals,
        "upcoming": upcoming,
        "top_department": dict(top_department) if top_department else None,
        "top_doctor": dict(top_doctor) if top_doctor else None,
    }


def search(query):
    term = (query or "").strip()
    if len(term) < 2:
        return {"patients": [], "doctors": []}
    like = f"%{term}%"

    conn = hospital.connect()
    try:
        patients = rows(
            conn,
            """
            SELECT patient_id, full_name, latest_condition
            FROM v_patient_records
            WHERE full_name LIKE ? OR COALESCE(latest_condition, '') LIKE ?
            ORDER BY full_name
            LIMIT 5
            """,
            (like, like),
        )
        doctors = rows(
            conn,
            """
            SELECT d.doctor_id, d.doctor_name, d.specialization, dep.dept_name
            FROM doctors d
            JOIN departments dep ON dep.dept_id = d.dept_id
            WHERE d.doctor_name LIKE ? OR d.specialization LIKE ? OR dep.dept_name LIKE ?
            ORDER BY d.doctor_name
            LIMIT 5
            """,
            (like, like, like),
        )
        return {"patients": patients, "doctors": doctors}
    finally:
        conn.close()


def pay_bill(bill_id):
    conn = hospital.connect()
    try:
        cur = conn.execute(
            "UPDATE bills SET paid_amount = amount WHERE bill_id = ?", (bill_id,)
        )
        conn.commit()
        if cur.rowcount == 0:
            raise ValueError("Bill not found.")
        return {"bill_id": bill_id, "message": "Payment recorded."}
    finally:
        conn.close()


def complete_appointment(appt_id):
    conn = hospital.connect()
    try:
        cur = conn.execute(
            "UPDATE appointments SET status = 'completed' "
            "WHERE appt_id = ? AND status = 'scheduled'",
            (appt_id,),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise ValueError("Only scheduled appointments can be completed.")
        return {"appt_id": appt_id, "message": "Appointment completed."}
    finally:
        conn.close()


def create_bill(data):
    try:
        appt_id = int(data.get("appt_id"))
        amount = float(data.get("amount"))
    except (TypeError, ValueError):
        raise ValueError("Appointment and total amount are required.")
    try:
        paid_amount = float(data.get("paid_amount") or 0)
    except (TypeError, ValueError):
        raise ValueError("Paid amount must be a number.")
    bill_date = (data.get("bill_date") or "").strip() or date.today().isoformat()

    if amount < 0:
        raise ValueError("Total amount cannot be negative.")
    if paid_amount < 0:
        raise ValueError("Paid amount cannot be negative.")
    if paid_amount > amount:
        raise ValueError("Paid amount cannot exceed the total amount.")
    if not DATE_RE.match(bill_date):
        raise ValueError("Bill date must be in YYYY-MM-DD format.")

    conn = hospital.connect()
    try:
        appointment = conn.execute(
            "SELECT status FROM appointments WHERE appt_id = ?", (appt_id,)
        ).fetchone()
        if not appointment:
            raise ValueError("Selected appointment does not exist.")
        if appointment["status"] != "completed":
            raise ValueError("Complete the appointment before creating an invoice.")
        if conn.execute(
            "SELECT 1 FROM bills WHERE appt_id = ?", (appt_id,)
        ).fetchone():
            raise ValueError("This appointment already has an invoice.")

        cur = conn.execute(
            "INSERT INTO bills (appt_id, amount, paid_amount, bill_date) "
            "VALUES (?, ?, ?, ?)",
            (appt_id, amount, paid_amount, bill_date),
        )
        conn.commit()
        return {"bill_id": cur.lastrowid, "message": "Invoice created."}
    finally:
        conn.close()


def create_patient(data):
    name = (data.get("full_name") or "").strip()
    dob = (data.get("dob") or "").strip()
    gender = (data.get("gender") or "").strip().upper()
    phone = (data.get("phone") or "").strip() or None
    email = (data.get("email") or "").strip() or None

    if not name:
        raise ValueError("Full name is required.")
    if not DATE_RE.match(dob):
        raise ValueError("Date of birth must be in YYYY-MM-DD format.")
    if gender not in GENDERS:
        raise ValueError("Gender must be M, F or O.")

    conn = hospital.connect()
    try:
        cur = conn.execute(
            "INSERT INTO patients (full_name, dob, gender, phone, email) "
            "VALUES (?, ?, ?, ?, ?)",
            (name, dob, gender, phone, email),
        )
        conn.commit()
        return {"patient_id": cur.lastrowid, "message": "Patient registered."}
    except sqlite3.IntegrityError:
        raise ValueError("Could not save patient - the email may already be registered.")
    finally:
        conn.close()


def create_appointment(data):
    try:
        patient_id = int(data.get("patient_id"))
        doctor_id = int(data.get("doctor_id"))
    except (TypeError, ValueError):
        raise ValueError("Patient and doctor are required.")
    appt_date = (data.get("appt_date") or "").strip()
    if not DATE_RE.match(appt_date):
        raise ValueError("Appointment date must be in YYYY-MM-DD format.")

    conn = hospital.connect()
    try:
        if not conn.execute(
            "SELECT 1 FROM patients WHERE patient_id = ?", (patient_id,)
        ).fetchone():
            raise ValueError("Selected patient does not exist.")
        if not conn.execute(
            "SELECT 1 FROM doctors WHERE doctor_id = ?", (doctor_id,)
        ).fetchone():
            raise ValueError("Selected doctor does not exist.")

        cur = conn.execute(
            "INSERT INTO appointments (patient_id, doctor_id, appt_date, status) "
            "VALUES (?, ?, ?, 'scheduled')",
            (patient_id, doctor_id, appt_date),
        )
        conn.commit()
        return {"appt_id": cur.lastrowid, "message": "Appointment booked."}
    finally:
        conn.close()


def cancel_appointment(appt_id):
    conn = hospital.connect()
    try:
        cur = conn.execute(
            "UPDATE appointments SET status = 'cancelled' "
            "WHERE appt_id = ? AND status = 'scheduled'",
            (appt_id,),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise ValueError("Only scheduled appointments can be cancelled.")
        return {"message": "Appointment cancelled."}
    finally:
        conn.close()


def add_visit_record(data):
    try:
        appt_id = int(data.get("appt_id"))
    except (TypeError, ValueError):
        raise ValueError("Appointment is required.")

    condition = (data.get("condition") or "").strip()
    if not condition:
        raise ValueError("Diagnosis / condition is required.")
    diagnosed_on = (data.get("diagnosed_on") or "").strip() or date.today().isoformat()
    if not DATE_RE.match(diagnosed_on):
        raise ValueError("Diagnosis date must be in YYYY-MM-DD format.")

    medicines = data.get("medicines") or []
    tests = data.get("tests") or []
    if not isinstance(medicines, list) or not isinstance(tests, list):
        raise ValueError("Medicines and tests must be lists.")

    clean_medicines = []
    for entry in medicines:
        if not isinstance(entry, dict):
            raise ValueError("Each medicine must be an object.")
        name = (entry.get("medicine") or "").strip()
        dosage = (entry.get("dosage") or "").strip()
        raw_days = entry.get("duration_days")
        if not name and not dosage and not raw_days:
            continue
        if not name or not dosage:
            raise ValueError("Each medicine needs a name and dosage.")
        try:
            days = int(raw_days)
        except (TypeError, ValueError):
            raise ValueError("Medicine duration must be a whole number of days.")
        if days <= 0:
            raise ValueError("Medicine duration must be at least 1 day.")
        clean_medicines.append((name, dosage, days))

    clean_tests = []
    for entry in tests:
        if not isinstance(entry, dict):
            raise ValueError("Each diagnostic test must be an object.")
        test_name = (entry.get("test_name") or "").strip()
        result = (entry.get("result") or "").strip()
        if not test_name and not result:
            continue
        if not test_name:
            raise ValueError("Each diagnostic test needs a name.")
        tested_on = (entry.get("tested_on") or "").strip() or diagnosed_on
        if not DATE_RE.match(tested_on):
            raise ValueError("Test date must be in YYYY-MM-DD format.")
        clean_tests.append((test_name, result or "Pending", tested_on))

    conn = hospital.connect()
    try:
        appointment = conn.execute(
            "SELECT status FROM appointments WHERE appt_id = ?", (appt_id,)
        ).fetchone()
        if not appointment:
            raise ValueError("Selected appointment does not exist.")
        if appointment["status"] != "completed":
            raise ValueError(
                "Complete the appointment before adding a medical record."
            )
        if conn.execute(
            "SELECT 1 FROM medical_history WHERE appt_id = ?", (appt_id,)
        ).fetchone():
            raise ValueError("This appointment already has a medical record.")

        conn.execute(
            "INSERT INTO medical_history (appt_id, condition, diagnosed_on) "
            "VALUES (?, ?, ?)",
            (appt_id, condition, diagnosed_on),
        )
        if clean_medicines:
            cur = conn.execute(
                "INSERT INTO prescriptions (appt_id, issued_on) VALUES (?, ?)",
                (appt_id, diagnosed_on),
            )
            conn.executemany(
                "INSERT INTO prescription_items "
                "(presc_id, medicine, dosage, duration_days) VALUES (?, ?, ?, ?)",
                [(cur.lastrowid, *medicine) for medicine in clean_medicines],
            )
        for test in clean_tests:
            conn.execute(
                "INSERT INTO diagnostic_tests "
                "(appt_id, test_name, result, tested_on) VALUES (?, ?, ?, ?)",
                (appt_id, *test),
            )
        conn.commit()
        return {"appt_id": appt_id, "message": "Medical record saved."}
    finally:
        conn.close()


def database_overview():
    conn = hospital.connect()
    try:
        tables = [
            {
                "name": name,
                "rows": conn.execute(
                    f"SELECT COUNT(*) AS total FROM {name}"
                ).fetchone()["total"],
            }
            for name in DB_TABLES
        ]
        return {"tables": tables}
    finally:
        conn.close()


def database_table(name):
    if name not in DB_TABLES:
        raise ValueError("Unknown table.")
    conn = hospital.connect()
    try:
        columns = [
            row["name"] for row in conn.execute(f"PRAGMA table_info({name})")
        ]
        data = rows(conn, f"SELECT * FROM {name} ORDER BY 1 LIMIT 200")
        return {"name": name, "columns": columns, "rows": data}
    finally:
        conn.close()


class Handler(BaseHTTPRequestHandler):
    server_version = "MediCare/1.0"

    def log_message(self, fmt, *args):
        if os.environ.get("WEBAPP_DEBUG"):
            super().log_message(fmt, *args)

    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        try:
            if path.startswith("/api/"):
                self.route_get(path)
            else:
                self.serve_static(path)
        except ValueError as exc:
            self.send_json({"error": str(exc)}, 400)
        except sqlite3.Error as exc:
            self.send_json({"error": f"Database error: {exc}"}, 500)
        except Exception as exc:
            self.send_json({"error": str(exc)}, 500)

    def route_get(self, path):
        parsed = urlparse(self.path)
        if path == "/api/overview":
            self.send_json(overview())
        elif path == "/api/patients":
            self.send_json(patient_list())
        elif path == "/api/appointments":
            self.send_json(appointment_list())
        elif path == "/api/reference":
            self.send_json(reference_data())
        elif path == "/api/frequent":
            self.send_json(frequent())
        elif path == "/api/revenue":
            self.send_json(revenue())
        elif path == "/api/doctors":
            self.send_json(doctor_list())
        elif path == "/api/departments":
            self.send_json(department_list())
        elif path == "/api/bills":
            self.send_json(bill_list())
        elif path == "/api/analytics":
            self.send_json(analytics())
        elif path == "/api/search":
            self.send_json(search(parse_qs(parsed.query).get("q", [""])[0]))
        elif path == "/api/database":
            self.send_json(database_overview())
        else:
            match = re.fullmatch(r"/api/database/([a-z_]+)", path)
            if match:
                self.send_json(database_table(match.group(1)))
                return
            match = re.fullmatch(r"/api/patients/(\d+)/profile", path)
            if match:
                self.send_json(patient_profile(int(match.group(1))))
                return
            match = re.fullmatch(r"/api/patients/(\d+)/history", path)
            if match:
                self.send_json(patient_history(int(match.group(1))))
            else:
                self.send_json({"error": "Not found."}, 404)

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length > 1_000_000:
                self.send_json({"error": "Request too large."}, 413)
                return
            raw = self.rfile.read(length) if length else b""
            try:
                data = json.loads(raw.decode("utf-8") or "{}")
            except (json.JSONDecodeError, UnicodeDecodeError):
                self.send_json({"error": "Invalid JSON body."}, 400)
                return
            if not isinstance(data, dict):
                self.send_json({"error": "JSON body must be an object."}, 400)
                return

            if path == "/api/patients":
                self.send_json(create_patient(data), 201)
            elif path == "/api/appointments":
                self.send_json(create_appointment(data), 201)
            elif path == "/api/bills":
                self.send_json(create_bill(data), 201)
            elif path == "/api/records":
                self.send_json(add_visit_record(data), 201)
            else:
                match = re.fullmatch(r"/api/appointments/(\d+)/cancel", path)
                if match:
                    self.send_json(cancel_appointment(int(match.group(1))))
                    return
                match = re.fullmatch(r"/api/appointments/(\d+)/complete", path)
                if match:
                    self.send_json(complete_appointment(int(match.group(1))))
                    return
                match = re.fullmatch(r"/api/bills/(\d+)/pay", path)
                if match:
                    self.send_json(pay_bill(int(match.group(1))))
                else:
                    self.send_json({"error": "Not found."}, 404)
        except ValueError as exc:
            self.send_json({"error": str(exc)}, 400)
        except sqlite3.Error as exc:
            self.send_json({"error": f"Database error: {exc}"}, 500)
        except Exception as exc:
            self.send_json({"error": str(exc)}, 500)

    def serve_static(self, path):
        rel = path.lstrip("/") or "index.html"
        full = os.path.normpath(os.path.join(STATIC_DIR, rel))
        if not full.startswith(STATIC_DIR + os.sep) or not os.path.isfile(full):
            self.send_error(404, "File not found")
            return
        ext = os.path.splitext(full)[1].lower()
        with open(full, "rb") as fh:
            body = fh.read()
        self.send_response(200)
        self.send_header("Content-Type", MIME_TYPES.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def main():
    init_db()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"MediCare web app running at http://127.0.0.1:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
