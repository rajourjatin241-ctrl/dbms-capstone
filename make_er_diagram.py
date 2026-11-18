"""Generate the ER diagram (SVG) used in the project report."""

WIDTH, HEIGHT = 1150, 920
BODY_ROW = 21
HEADER = 28
FONT = "Helvetica, Arial, sans-serif"

entities = [
    {
        "name": "DEPARTMENTS", "x": 40, "y": 70, "w": 240,
        "attrs": [("PK", "dept_id"), ("", "dept_name"), ("", "location"), ("", "phone")],
    },
    {
        "name": "DOCTORS", "x": 40, "y": 250, "w": 240,
        "attrs": [("PK", "doctor_id"), ("", "doctor_name"), ("", "specialization"),
                  ("FK", "dept_id")],
    },
    {
        "name": "PATIENTS", "x": 40, "y": 600, "w": 240,
        "attrs": [("PK", "patient_id"), ("", "full_name"), ("", "dob"),
                  ("", "gender"), ("", "phone"), ("", "email")],
    },
    {
        "name": "APPOINTMENTS", "x": 430, "y": 380, "w": 270,
        "attrs": [("PK", "appt_id"), ("FK", "patient_id"), ("FK", "doctor_id"),
                  ("", "appt_date"), ("", "status")],
    },
    {
        "name": "MEDICAL_HISTORY", "x": 850, "y": 70, "w": 260,
        "attrs": [("PK", "history_id"), ("FK", "appt_id"), ("", "condition"),
                  ("", "diagnosed_on")],
    },
    {
        "name": "PRESCRIPTIONS", "x": 850, "y": 226, "w": 260,
        "attrs": [("PK", "presc_id"), ("FK", "appt_id"), ("", "issued_on")],
    },
    {
        "name": "PRESCRIPTION_ITEMS", "x": 850, "y": 366, "w": 260,
        "attrs": [("PK", "item_id"), ("FK", "presc_id"), ("", "medicine"),
                  ("", "dosage"), ("", "duration_days")],
    },
    {
        "name": "DIAGNOSTIC_TESTS", "x": 850, "y": 548, "w": 260,
        "attrs": [("PK", "test_id"), ("FK", "appt_id"), ("", "test_name"),
                  ("", "result"), ("", "tested_on")],
    },
    {
        "name": "BILLS", "x": 850, "y": 730, "w": 260,
        "attrs": [("PK", "bill_id"), ("FK", "appt_id"), ("", "amount"),
                  ("", "paid_amount"), ("", "bill_date")],
    },
]

boxes = {}
parts = [
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" '
    f'viewBox="0 0 {WIDTH} {HEIGHT}">',
    f'<rect width="{WIDTH}" height="{HEIGHT}" fill="#ffffff"/>',
    f'<text x="{WIDTH // 2}" y="38" text-anchor="middle" font-family="{FONT}" '
    'font-size="20" font-weight="bold" fill="#1f2d3d">'
    "Hospital &amp; Healthcare Information Management System - ER Model</text>",
]

for ent in entities:
    h = HEADER + BODY_ROW * len(ent["attrs"]) + 8
    boxes[ent["name"]] = {
        "x": ent["x"], "y": ent["y"], "w": ent["w"], "h": h,
        "cx": ent["x"] + ent["w"] / 2, "cy": ent["y"] + h / 2,
        "left": ent["x"], "right": ent["x"] + ent["w"],
        "top": ent["y"], "bottom": ent["y"] + h,
    }
    parts.append(
        f'<rect x="{ent["x"]}" y="{ent["y"]}" width="{ent["w"]}" height="{h}" rx="6" '
        'fill="#ffffff" stroke="#2f5d9e" stroke-width="1.6"/>'
    )
    parts.append(
        f'<path d="M {ent["x"]} {ent["y"] + HEADER} '
        f'L {ent["x"] + ent["w"]} {ent["y"] + HEADER}" '
        'stroke="#2f5d9e" stroke-width="1.2"/>'
    )
    parts.append(
        f'<rect x="{ent["x"]}" y="{ent["y"]}" width="{ent["w"]}" height="{HEADER}" rx="6" '
        'fill="#dbe7f5" stroke="#2f5d9e" stroke-width="1.6"/>'
    )
    parts.append(
        f'<rect x="{ent["x"]}" y="{ent["y"] + HEADER - 8}" width="{ent["w"]}" height="8" '
        'fill="#dbe7f5"/>'
    )
    parts.append(
        f'<text x="{ent["x"] + ent["w"] / 2}" y="{ent["y"] + 19}" text-anchor="middle" '
        f'font-family="{FONT}" font-size="13.5" font-weight="bold" fill="#12263f">'
        f'{ent["name"]}</text>'
    )
    for i, (key, attr) in enumerate(ent["attrs"]):
        ty = ent["y"] + HEADER + 15 + i * BODY_ROW
        if key:
            color = "#1d4ed8" if key == "PK" else "#b45309"
            parts.append(
                f'<text x="{ent["x"] + 10}" y="{ty}" font-family="{FONT}" font-size="10" '
                f'font-weight="bold" fill="{color}">{key}</text>'
            )
        weight = "bold" if key == "PK" else "normal"
        text_dec = ' text-decoration="underline"' if key == "PK" else ""
        parts.append(
            f'<text x="{ent["x"] + 38}" y="{ty}" font-family="Menlo, Consolas, monospace" '
            f'font-size="11.5" font-weight="{weight}" fill="#1f2d3d"{text_dec}>'
            f'{attr}</text>'
        )

line = 'stroke="#4b5563" stroke-width="1.5" fill="none"'
dot = 'fill="#4b5563"'


def label(x, y, text):
    parts.append(
        f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="12" '
        f'font-weight="bold" fill="#374151">{text}</text>'
    )


d, doc, pat = boxes["DEPARTMENTS"], boxes["DOCTORS"], boxes["PATIENTS"]
appt = boxes["APPOINTMENTS"]
mh, presc, items = boxes["MEDICAL_HISTORY"], boxes["PRESCRIPTIONS"], boxes["PRESCRIPTION_ITEMS"]
tests, bills = boxes["DIAGNOSTIC_TESTS"], boxes["BILLS"]

parts.append(f'<path d="M {d["cx"]} {d["bottom"]} L {d["cx"]} {doc["top"]}" {line}/>')
label(d["cx"] + 7, d["bottom"] + 15, "1")
label(d["cx"] + 7, doc["top"] - 6, "N")

parts.append(
    f'<path d="M {doc["right"]} {doc["cy"]} H 355 V {appt["cy"] - 18} H {appt["left"]}" {line}/>'
)
label(doc["right"] + 8, doc["cy"] - 8, "1")
label(appt["left"] - 16, appt["cy"] - 26, "N")

parts.append(
    f'<path d="M {pat["right"]} {pat["cy"]} H 355 V {appt["cy"] + 22} H {appt["left"]}" {line}/>'
)
label(pat["right"] + 8, pat["cy"] - 8, "1")
label(appt["left"] - 16, appt["cy"] + 36, "N")

bus_x = 780
parts.append(f'<path d="M {appt["right"]} {appt["cy"]} H {bus_x}" {line}/>')
parts.append(f'<path d="M {bus_x} {mh["cy"]} V {bills["cy"]}" {line}/>')
parts.append(f'<circle cx="{bus_x}" cy="{appt["cy"]}" r="3.2" {dot}/>')
label(appt["right"] + 6, appt["cy"] - 8, "1")

for target in (mh, presc, tests, bills):
    parts.append(f'<path d="M {bus_x} {target["cy"]} H {target["left"]}" {line}/>')
    parts.append(f'<circle cx="{bus_x}" cy="{target["cy"]}" r="3.2" {dot}/>')

label(mh["left"] - 16, mh["cy"] - 8, "1")
label(presc["left"] - 16, presc["cy"] - 8, "1")
label(tests["left"] - 18, tests["cy"] - 8, "N")
label(bills["left"] - 18, bills["cy"] - 8, "N")

parts.append(
    f'<path d="M {presc["cx"]} {presc["bottom"]} V {items["top"]}" {line}/>'
)
label(presc["cx"] + 7, presc["bottom"] + 14, "1")
label(presc["cx"] + 7, items["top"] - 6, "N")

legend_y = HEIGHT - 28
parts.append(
    f'<text x="40" y="{legend_y}" font-family="{FONT}" font-size="12" fill="#374151">'
    '<tspan font-weight="bold" fill="#1d4ed8">PK</tspan> primary key   '
    '<tspan font-weight="bold" fill="#b45309">FK</tspan> foreign key   '
    "1 : N  one-to-many   |   1 : 1  one-to-one</text>"
)
parts.append("</svg>")

with open("hospital_er.svg", "w", encoding="utf-8") as fh:
    fh.write("\n".join(parts))
print("wrote hospital_er.svg")
