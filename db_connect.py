import sqlite3

DB_FILE = "students.db"


def connect():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def create_table(conn):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS students (
            id    INTEGER PRIMARY KEY AUTOINCREMENT,
            name  TEXT NOT NULL,
            age   INTEGER NOT NULL,
            email TEXT UNIQUE
        )
        """
    )
    conn.commit()


def add_student(conn, name, age, email):
    conn.execute(
        "INSERT INTO students (name, age, email) VALUES (?, ?, ?)",
        (name, age, email),
    )
    conn.commit()


def list_students(conn):
    return conn.execute("SELECT * FROM students").fetchall()


def find_student(conn, name):
    return conn.execute(
        "SELECT * FROM students WHERE name = ?", (name,)
    ).fetchall()


def update_age(conn, name, new_age):
    conn.execute(
        "UPDATE students SET age = ? WHERE name = ?", (new_age, name)
    )
    conn.commit()


def delete_student(conn, name):
    conn.execute("DELETE FROM students WHERE name = ?", (name,))
    conn.commit()


def main():
    with connect() as conn:
        create_table(conn)

        add_student(conn, "Aarav", 20, "aarav@example.com")
        add_student(conn, "Priya", 22, "priya@example.com")
        add_student(conn, "Rohan", 21, "rohan@example.com")

        print("All students:")
        for row in list_students(conn):
            print(f"  {row['id']}: {row['name']}, age {row['age']}, {row['email']}")

        print("\nSearch 'Priya':")
        for row in find_student(conn, "Priya"):
            print(f"  {row['id']}: {row['name']}, age {row['age']}")

        update_age(conn, "Aarav", 23)
        print("\nAfter updating Aarav's age:")
        for row in find_student(conn, "Aarav"):
            print(f"  {row['id']}: {row['name']}, age {row['age']}")


if __name__ == "__main__":
    main()
