import sqlite3
import sys

DB_FILE = "hospital.db"

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS departments (
    dept_id    INTEGER PRIMARY KEY,
    dept_name  TEXT NOT NULL UNIQUE,
    location   TEXT NOT NULL,
    phone      TEXT
);

CREATE TABLE IF NOT EXISTS doctors (
    doctor_id       INTEGER PRIMARY KEY,
    doctor_name     TEXT NOT NULL,
    specialization  TEXT NOT NULL,
    dept_id         INTEGER NOT NULL REFERENCES departments(dept_id)
);

CREATE TABLE IF NOT EXISTS patients (
    patient_id  INTEGER PRIMARY KEY,
    full_name   TEXT NOT NULL,
    dob         TEXT NOT NULL,
    gender      TEXT NOT NULL CHECK (gender IN ('M', 'F', 'O')),
    phone       TEXT,
    email       TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS appointments (
    appt_id      INTEGER PRIMARY KEY,
    patient_id   INTEGER NOT NULL REFERENCES patients(patient_id),
    doctor_id    INTEGER NOT NULL REFERENCES doctors(doctor_id),
    appt_date    TEXT NOT NULL,
    status       TEXT NOT NULL CHECK (status IN ('scheduled', 'completed', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS medical_history (
    history_id   INTEGER PRIMARY KEY,
    appt_id      INTEGER NOT NULL UNIQUE REFERENCES appointments(appt_id),
    condition    TEXT NOT NULL,
    diagnosed_on TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prescriptions (
    presc_id   INTEGER PRIMARY KEY,
    appt_id    INTEGER NOT NULL UNIQUE REFERENCES appointments(appt_id),
    issued_on  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prescription_items (
    item_id        INTEGER PRIMARY KEY,
    presc_id       INTEGER NOT NULL REFERENCES prescriptions(presc_id) ON DELETE CASCADE,
    medicine       TEXT NOT NULL,
    dosage         TEXT NOT NULL,
    duration_days  INTEGER NOT NULL CHECK (duration_days > 0)
);

CREATE TABLE IF NOT EXISTS diagnostic_tests (
    test_id    INTEGER PRIMARY KEY,
    appt_id    INTEGER NOT NULL REFERENCES appointments(appt_id),
    test_name  TEXT NOT NULL,
    result     TEXT,
    tested_on  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bills (
    bill_id      INTEGER PRIMARY KEY,
    appt_id      INTEGER NOT NULL REFERENCES appointments(appt_id),
    amount       REAL NOT NULL CHECK (amount >= 0),
    paid_amount  REAL NOT NULL DEFAULT 0
                 CHECK (paid_amount >= 0 AND paid_amount <= amount),
    bill_date    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_doctors_dept  ON doctors(dept_id);
CREATE INDEX IF NOT EXISTS idx_appt_patient  ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appt_doctor   ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appt_date     ON appointments(appt_date);
CREATE INDEX IF NOT EXISTS idx_items_presc   ON prescription_items(presc_id);
CREATE INDEX IF NOT EXISTS idx_tests_appt    ON diagnostic_tests(appt_id);
CREATE INDEX IF NOT EXISTS idx_bills_appt    ON bills(appt_id);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(full_name);

DROP VIEW IF EXISTS v_patient_records;
DROP VIEW IF EXISTS v_revenue_analysis;

CREATE VIEW v_patient_records AS
SELECT p.patient_id,
       p.full_name,
       p.gender,
       p.dob,
       p.phone,
       COUNT(a.appt_id) AS total_appointments,
       MAX(CASE WHEN a.status = 'completed' THEN a.appt_date END) AS last_visit,
       (SELECT m.condition
          FROM medical_history m
          JOIN appointments a2 ON a2.appt_id = m.appt_id
         WHERE a2.patient_id = p.patient_id
         ORDER BY m.diagnosed_on DESC
         LIMIT 1) AS latest_condition
FROM patients p
LEFT JOIN appointments a ON a.patient_id = p.patient_id
GROUP BY p.patient_id;

CREATE VIEW v_revenue_analysis AS
SELECT d.dept_id,
       d.dept_name,
       COUNT(b.bill_id)                 AS bill_count,
       SUM(b.amount)                    AS total_billed,
       SUM(b.paid_amount)               AS total_collected,
       SUM(b.amount - b.paid_amount)    AS outstanding
FROM departments d
JOIN doctors dr      ON dr.dept_id = d.dept_id
JOIN appointments a  ON a.doctor_id = dr.doctor_id
JOIN bills b         ON b.appt_id = a.appt_id
GROUP BY d.dept_id;
"""

PATIENT_HISTORY_SQL = """
SELECT a.appt_id, a.appt_date, a.status,
       d.doctor_name, d.specialization, dep.dept_name,
       m.condition,
       p.presc_id, pi.item_id, pi.medicine, pi.dosage, pi.duration_days,
       t.test_id, t.test_name, t.result
FROM appointments a
JOIN doctors d       ON d.doctor_id = a.doctor_id
JOIN departments dep ON dep.dept_id = d.dept_id
LEFT JOIN medical_history m       ON m.appt_id = a.appt_id
LEFT JOIN prescriptions p         ON p.appt_id = a.appt_id
LEFT JOIN prescription_items pi   ON pi.presc_id = p.presc_id
LEFT JOIN diagnostic_tests t      ON t.appt_id = a.appt_id
WHERE a.patient_id = ?
ORDER BY a.appt_date, a.appt_id;
"""

FREQUENT_DEPTS_SQL = """
SELECT dep.dept_name, COUNT(a.appt_id) AS visits
FROM departments dep
JOIN doctors d      ON d.dept_id = dep.dept_id
JOIN appointments a ON a.doctor_id = d.doctor_id
GROUP BY dep.dept_id
HAVING COUNT(a.appt_id) > (
    SELECT AVG(cnt) FROM (
        SELECT COUNT(a2.appt_id) AS cnt
        FROM departments dep2
        JOIN doctors d2      ON d2.dept_id = dep2.dept_id
        JOIN appointments a2 ON a2.doctor_id = d2.doctor_id
        GROUP BY dep2.dept_id
    )
)
ORDER BY visits DESC;
"""

FREQUENT_DOCTORS_SQL = """
SELECT d.doctor_name, dep.dept_name, COUNT(a.appt_id) AS visits
FROM doctors d
JOIN departments dep ON dep.dept_id = d.dept_id
JOIN appointments a  ON a.doctor_id = d.doctor_id
GROUP BY d.doctor_id
HAVING COUNT(a.appt_id) > (
    SELECT AVG(cnt) FROM (
        SELECT COUNT(a2.appt_id) AS cnt
        FROM doctors d2
        JOIN appointments a2 ON a2.doctor_id = d2.doctor_id
        GROUP BY d2.doctor_id
    )
)
ORDER BY visits DESC;
"""


def connect():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def setup(conn):
    conn.executescript(SCHEMA)
    if conn.execute("SELECT COUNT(*) FROM departments").fetchone()[0] == 0:
        seed(conn)


def seed(conn):
    conn.executemany(
        "INSERT INTO departments VALUES (?, ?, ?, ?)",
        [
            (1, "Cardiology", "Block A, Floor 2", "ext-2101"),
            (2, "Orthopedics", "Block B, Floor 1", "ext-3102"),
            (3, "General Medicine", "Block A, Floor 1", "ext-1101"),
            (4, "Pediatrics", "Block C, Floor 1", "ext-4103"),
        ],
    )
    conn.executemany(
        "INSERT INTO doctors VALUES (?, ?, ?, ?)",
        [
            (1, "Dr. Meera Sharma", "Cardiologist", 1),
            (2, "Dr. Arjun Rao", "Cardiologist", 1),
            (3, "Dr. Kavita Iyer", "Orthopedic Surgeon", 2),
            (4, "Dr. Suresh Patel", "General Physician", 3),
            (5, "Dr. Anita Desai", "Pediatrician", 4),
        ],
    )
    conn.executemany(
        "INSERT INTO patients VALUES (?, ?, ?, ?, ?, ?)",
        [
            (1, "Vikram Malhotra", "1985-02-14", "M", "98765-10001", "vikram.m@example.com"),
            (2, "Sneha Kulkarni", "1992-07-30", "F", "98765-10002", "sneha.k@example.com"),
            (3, "Rahul Verma", "1978-11-02", "M", "98765-10003", "rahul.v@example.com"),
            (4, "Isha Nair", "2015-03-21", "F", "98765-10004", "isha.n@example.com"),
        ],
    )
    conn.executemany(
        "INSERT INTO appointments VALUES (?, ?, ?, ?, ?)",
        [
            (1, 1, 1, "2026-10-01", "completed"),
            (2, 1, 4, "2026-10-20", "completed"),
            (3, 1, 1, "2026-11-05", "completed"),
            (4, 2, 2, "2026-10-08", "completed"),
            (5, 2, 3, "2026-10-18", "completed"),
            (6, 2, 2, "2026-11-10", "scheduled"),
            (7, 3, 4, "2026-09-25", "completed"),
            (8, 3, 4, "2026-10-30", "completed"),
            (9, 3, 1, "2026-11-12", "scheduled"),
            (10, 4, 5, "2026-10-12", "completed"),
            (11, 4, 5, "2026-11-08", "completed"),
        ],
    )
    conn.executemany(
        "INSERT INTO medical_history VALUES (?, ?, ?, ?)",
        [
            (1, 1, "Hypertension", "2026-10-01"),
            (2, 2, "Vitamin D deficiency", "2026-10-20"),
            (3, 3, "Hypertension follow-up", "2026-11-05"),
            (4, 4, "Suspected arrhythmia", "2026-10-08"),
            (5, 5, "Knee sprain", "2026-10-18"),
            (6, 7, "Type 2 diabetes", "2026-09-25"),
            (7, 8, "Diabetes follow-up", "2026-10-30"),
            (8, 10, "Viral fever", "2026-10-12"),
            (9, 11, "Recovery check", "2026-11-08"),
        ],
    )
    conn.executemany(
        "INSERT INTO prescriptions VALUES (?, ?, ?)",
        [
            (1, 1, "2026-10-01"),
            (2, 2, "2026-10-20"),
            (3, 3, "2026-11-05"),
            (4, 4, "2026-10-08"),
            (5, 5, "2026-10-18"),
            (6, 7, "2026-09-25"),
            (7, 8, "2026-10-30"),
            (8, 10, "2026-10-12"),
            (9, 11, "2026-11-08"),
        ],
    )
    conn.executemany(
        "INSERT INTO prescription_items VALUES (?, ?, ?, ?, ?)",
        [
            (1, 1, "Amlodipine 5 mg", "Once daily", 30),
            (2, 1, "Aspirin 75 mg", "Once daily", 30),
            (3, 2, "Vitamin D3 60000 IU", "Weekly", 56),
            (4, 3, "Amlodipine 10 mg", "Once daily", 30),
            (5, 4, "Metoprolol 25 mg", "Twice daily", 15),
            (6, 5, "Ibuprofen 400 mg", "Thrice daily", 5),
            (7, 6, "Metformin 500 mg", "Twice daily", 90),
            (8, 7, "Metformin 1000 mg", "Twice daily", 90),
            (9, 7, "Glimepiride 1 mg", "Once daily", 90),
            (10, 8, "Paracetamol syrup 250 mg/5 ml", "Thrice daily", 5),
            (11, 9, "Multivitamin syrup", "Once daily", 14),
        ],
    )
    conn.executemany(
        "INSERT INTO diagnostic_tests VALUES (?, ?, ?, ?, ?)",
        [
            (1, 1, "ECG", "Normal", "2026-10-01"),
            (2, 1, "Lipid profile", "Borderline", "2026-10-02"),
            (3, 3, "ECG", "Normal", "2026-11-05"),
            (4, 4, "Holter monitor", "Abnormal rhythm", "2026-10-09"),
            (5, 5, "X-ray knee", "Mild sprain", "2026-10-18"),
            (6, 7, "HbA1c", "7.8%", "2026-09-26"),
            (7, 8, "HbA1c", "7.1%", "2026-10-31"),
            (8, 10, "CBC", "Normal", "2026-10-12"),
        ],
    )
    conn.executemany(
        "INSERT INTO bills VALUES (?, ?, ?, ?, ?)",
        [
            (1, 1, 2500, 2500, "2026-10-01"),
            (2, 2, 800, 800, "2026-10-20"),
            (3, 3, 1800, 1800, "2026-11-05"),
            (4, 4, 4500, 3000, "2026-10-08"),
            (5, 5, 2200, 2200, "2026-10-18"),
            (6, 7, 1500, 1500, "2026-09-25"),
            (7, 8, 1200, 1200, "2026-10-30"),
            (8, 10, 900, 900, "2026-10-12"),
            (9, 11, 800, 0, "2026-11-08"),
        ],
    )
    conn.commit()


def banner(title):
    print("=" * 64)
    print(title)
    print("=" * 64)


def print_table(rows, headers):
    if not rows:
        print("  (no rows)")
        return
    widths = [len(h) for h in headers]
    for row in rows:
        for i, value in enumerate(row):
            widths[i] = max(widths[i], len(str(value)))
    print("  " + "  ".join(h.ljust(w) for h, w in zip(headers, widths)))
    print("  " + "  ".join("-" * w for w in widths))
    for row in rows:
        print("  " + "  ".join(str(v).ljust(w) for v, w in zip(row, widths)))


def show_patient_history(conn, patient_id):
    patient = conn.execute(
        "SELECT * FROM patients WHERE patient_id = ?", (patient_id,)
    ).fetchone()
    if not patient:
        print(f"No patient found with id {patient_id}.")
        return

    banner(f"MEDICAL HISTORY - {patient['full_name']} (id {patient_id})")
    rows = conn.execute(PATIENT_HISTORY_SQL, (patient_id,)).fetchall()
    if not rows:
        print("  No appointments recorded.")
        return

    current, seen = None, set()
    for row in rows:
        if row["appt_id"] != current:
            current, seen = row["appt_id"], set()
            print(f"\n[{row['appt_date']}] {row['doctor_name']} - "
                  f"{row['specialization']}, {row['dept_name']} ({row['status']})")
            print(f"  Diagnosis : {row['condition'] or '-'}")
        if row["item_id"] and ("med", row["item_id"]) not in seen:
            seen.add(("med", row["item_id"]))
            print(f"  Medicine  : {row['medicine']} - {row['dosage']} "
                  f"for {row['duration_days']} days")
        if row["test_id"] and ("test", row["test_id"]) not in seen:
            seen.add(("test", row["test_id"]))
            print(f"  Test      : {row['test_name']} -> {row['result']}")


def show_frequent(conn):
    banner("FREQUENTLY VISITED DEPARTMENTS (above average)")
    rows = conn.execute(FREQUENT_DEPTS_SQL).fetchall()
    print_table(
        [(r["dept_name"], r["visits"]) for r in rows],
        ["Department", "Visits"],
    )

    print("\nFREQUENTLY VISITED DOCTORS (above average)")
    rows = conn.execute(FREQUENT_DOCTORS_SQL).fetchall()
    print_table(
        [(r["doctor_name"], r["dept_name"], r["visits"]) for r in rows],
        ["Doctor", "Department", "Visits"],
    )


def show_patient_records(conn):
    banner("PATIENT RECORDS (view: v_patient_records)")
    rows = conn.execute(
        """SELECT patient_id, full_name, gender, dob, total_appointments,
                  last_visit, latest_condition
           FROM v_patient_records ORDER BY patient_id"""
    ).fetchall()
    print_table(
        [
            (r["patient_id"], r["full_name"], r["gender"], r["dob"],
             r["total_appointments"], r["last_visit"] or "-",
             r["latest_condition"] or "-")
            for r in rows
        ],
        ["ID", "Name", "Gender", "DOB", "Appts", "Last visit", "Latest condition"],
    )


def show_revenue(conn):
    banner("REVENUE ANALYSIS (view: v_revenue_analysis)")
    rows = conn.execute(
        "SELECT * FROM v_revenue_analysis ORDER BY total_billed DESC"
    ).fetchall()
    print_table(
        [
            (r["dept_name"], r["bill_count"], f"{r['total_billed']:,.2f}",
             f"{r['total_collected']:,.2f}", f"{r['outstanding']:,.2f}")
            for r in rows
        ],
        ["Department", "Bills", "Billed", "Collected", "Outstanding"],
    )
    totals = conn.execute(
        """SELECT SUM(amount), SUM(paid_amount),
                  SUM(amount - paid_amount) FROM bills"""
    ).fetchone()
    print(f"\n  TOTAL billed: {totals[0]:,.2f} | "
          f"collected: {totals[1]:,.2f} | "
          f"outstanding: {totals[2]:,.2f}")


def show_indexes(conn):
    banner("INDEXES AND QUERY PLANS")
    rows = conn.execute(
        """SELECT tbl_name, name FROM sqlite_master
           WHERE type = 'index' AND sql IS NOT NULL
           ORDER BY tbl_name, name"""
    ).fetchall()
    print_table([(r["tbl_name"], r["name"]) for r in rows], ["Table", "Index"])

    print("\nQuery plan: SELECT * FROM appointments WHERE patient_id = 1")
    for row in conn.execute(
        "EXPLAIN QUERY PLAN SELECT * FROM appointments WHERE patient_id = 1"
    ):
        print(f"  {row['detail']}")


def show_er_model():
    banner("ER MODEL AND DESIGN NOTES")
    print("""
  DEPARTMENTS 1 ---< N DOCTORS
  DOCTORS     1 ---< N APPOINTMENTS
  PATIENTS    1 ---< N APPOINTMENTS
  APPOINTMENTS 1 --- 1 MEDICAL_HISTORY
  APPOINTMENTS 1 --- 1 PRESCRIPTIONS 1 ---< N PRESCRIPTION_ITEMS
  APPOINTMENTS 1 ---< N DIAGNOSTIC_TESTS
  APPOINTMENTS 1 ---< N BILLS

  NORMALIZATION
    1NF : every column is atomic; prescription lines and diagnostic tests
          live in their own tables, so there are no repeating groups.
    2NF : each table uses a single-column surrogate primary key, so no
          non-key column depends on only part of a key.
    3NF : department details exist only in DEPARTMENTS (doctors reference
          dept_id); patients are not duplicated inside appointments.
    Integrity : FOREIGN KEY constraints, PRAGMA foreign_keys = ON, and
                CHECK constraints on status, gender and bill amounts.
""")


def menu(conn):
    while True:
        print("""
1) Patient medical history          (multi-table joins)
2) Frequently visited departments / doctors  (subqueries)
3) Patient records view
4) Revenue analysis view
5) ER model and normalization notes
6) List all patients
7) Indexes and query plans
0) Exit""")
        choice = input("Choose an option: ").strip()

        if choice == "0":
            return
        elif choice == "1":
            pid = input("Patient id: ").strip()
            if pid.isdigit():
                show_patient_history(conn, int(pid))
            else:
                print("Please enter a numeric patient id.")
        elif choice == "2":
            show_frequent(conn)
        elif choice == "3":
            show_patient_records(conn)
        elif choice == "4":
            show_revenue(conn)
        elif choice == "5":
            show_er_model()
        elif choice == "6":
            banner("ALL PATIENTS")
            rows = conn.execute(
                "SELECT patient_id, full_name, phone FROM patients ORDER BY patient_id"
            ).fetchall()
            print_table(
                [(r["patient_id"], r["full_name"], r["phone"]) for r in rows],
                ["ID", "Name", "Phone"],
            )
        elif choice == "7":
            show_indexes(conn)
        else:
            print("Invalid option.")


def run_demo(conn):
    print("\nHOSPITAL & HEALTHCARE INFORMATION MANAGEMENT SYSTEM")
    show_patient_history(conn, 1)
    print()
    show_frequent(conn)
    print()
    show_patient_records(conn)
    print()
    show_revenue(conn)
    print()
    show_indexes(conn)
    print()
    show_er_model()


def main():
    conn = connect()
    try:
        setup(conn)
        if "--demo" in sys.argv:
            run_demo(conn)
        else:
            try:
                menu(conn)
            except (KeyboardInterrupt, EOFError):
                print("\nGoodbye.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
