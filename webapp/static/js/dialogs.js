import { api } from "./api.js";
import {
  confirmDialog,
  todayIso,
  esc,
  fmtCurrency,
  fmtDate,
  openModal,
  toast,
  notifyChange,
} from "./ui.js";

export async function openBookingModal({
  patientId = null,
  doctorId = null,
  onDone = null,
} = {}) {
  let reference;
  let patients;
  try {
    [reference, patients] = await Promise.all([
      api("/api/reference"),
      api("/api/patients"),
    ]);
  } catch (err) {
    toast(err.message, "error");
    return;
  }

  const patientOptions = patients.patients
    .map(
      (patient) =>
        `<option value="${patient.patient_id}" ${
          Number(patientId) === patient.patient_id ? "selected" : ""
        }>${esc(patient.full_name)} · #${patient.patient_id}</option>`
    )
    .join("");

  const doctorOptions = reference.doctors
    .map(
      (doctor) =>
        `<option value="${doctor.doctor_id}" ${
          Number(doctorId) === doctor.doctor_id ? "selected" : ""
        }>${esc(doctor.doctor_name)} — ${esc(doctor.specialization)} (${esc(
          doctor.dept_name
        )})</option>`
    )
    .join("");

  const modal = openModal({
    title: "Book appointment",
    subtitle: "Reserve a slot with one of our doctors.",
    body: `
      <form id="booking-form" class="form-grid">
        <div class="form-field full">
          <label for="booking-patient">Patient</label>
          <select id="booking-patient" name="patient_id" required ${patientOptions ? "" : "disabled"}>
            ${patientOptions || '<option value="">No patients registered</option>'}
          </select>
        </div>
        <div class="form-field full">
          <label for="booking-doctor">Doctor</label>
          <select id="booking-doctor" name="doctor_id" required>
            ${doctorOptions || '<option value="">No doctors available</option>'}
          </select>
        </div>
        <div class="form-field full">
          <label for="booking-date">Appointment date</label>
          <input id="booking-date" type="date" name="appt_date" value="${todayIso()}" required>
          <span class="field-hint">The visit is created with the status “Scheduled”.</span>
        </div>
      </form>`,
    footer: `
      <button class="btn btn-secondary" type="button" data-close>Cancel</button>
      <button class="btn btn-primary" type="submit" form="booking-form" ${
        patients.patients.length ? "" : "disabled"
      }>Confirm booking</button>`,
  });

  const form = modal.overlay.querySelector("#booking-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = modal.overlay.querySelector('[form="booking-form"]');
    button.disabled = true;
    try {
      const payload = Object.fromEntries(new FormData(form));
      await api("/api/appointments", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      modal.close();
      toast("Appointment booked successfully.");
      notifyChange();
      onDone?.();
    } catch (err) {
      toast(err.message, "error");
      button.disabled = false;
    }
  });
}

export async function openPatientModal({ onDone = null } = {}) {
  const modal = openModal({
    title: "Register patient",
    subtitle: "Create a new patient record in the hospital database.",
    body: `
      <form id="patient-form" class="form-grid">
        <div class="form-field full">
          <label for="patient-name">Full name</label>
          <input id="patient-name" name="full_name" required maxlength="80" placeholder="e.g. Ananya Iyer" autocomplete="off">
        </div>
        <div class="form-field">
          <label for="patient-dob">Date of birth</label>
          <input id="patient-dob" type="date" name="dob" required>
        </div>
        <div class="form-field">
          <label for="patient-gender">Gender</label>
          <select id="patient-gender" name="gender" required>
            <option value="">Select</option>
            <option value="F">Female</option>
            <option value="M">Male</option>
            <option value="O">Other</option>
          </select>
        </div>
        <div class="form-field">
          <label for="patient-phone">Phone</label>
          <input id="patient-phone" name="phone" maxlength="20" placeholder="+91 98765 43210">
        </div>
        <div class="form-field">
          <label for="patient-email">Email</label>
          <input id="patient-email" type="email" name="email" maxlength="120" placeholder="name@example.com">
        </div>
      </form>`,
    footer: `
      <button class="btn btn-secondary" type="button" data-close>Cancel</button>
      <button class="btn btn-primary" type="submit" form="patient-form">Save patient</button>`,
  });

  const form = modal.overlay.querySelector("#patient-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = modal.overlay.querySelector('[form="patient-form"]');
    button.disabled = true;
    try {
      const payload = Object.fromEntries(new FormData(form));
      await api("/api/patients", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      modal.close();
      toast("Patient registered successfully.");
      notifyChange();
      onDone?.();
    } catch (err) {
      toast(err.message, "error");
      button.disabled = false;
    }
  });
}

export function openRecordModal({ apptId, label = "", onDone = null } = {}) {
  const medicineRow = () => `<div class="repeat-row medicine-row">
    <input name="medicine" placeholder="Medicine (e.g. Amlodipine 5mg)" maxlength="60" aria-label="Medicine">
    <input name="dosage" placeholder="Dosage (e.g. once daily)" maxlength="40" aria-label="Dosage">
    <input name="duration_days" type="number" min="1" step="1" value="5" aria-label="Duration in days">
    <button class="btn btn-ghost btn-sm" type="button" data-remove>Remove</button>
  </div>`;
  const testRow = () => `<div class="repeat-row test-row">
    <input name="test_name" placeholder="Test (e.g. CBC)" maxlength="60" aria-label="Test name">
    <input name="result" placeholder="Result (e.g. Normal)" maxlength="80" aria-label="Result">
    <button class="btn btn-ghost btn-sm" type="button" data-remove>Remove</button>
  </div>`;

  const modal = openModal({
    title: "Add medical record",
    subtitle: label
      ? `${label} — diagnosis, prescription and tests.`
      : "Diagnosis, prescription and tests for this visit.",
    body: `
      <form id="record-form" class="form-grid">
        <div class="form-field full">
          <label for="record-condition">Diagnosis / condition</label>
          <input id="record-condition" name="condition" required maxlength="120" placeholder="e.g. Hypertension" autocomplete="off">
        </div>
        <div class="form-field full">
          <label for="record-date">Diagnosed on</label>
          <input id="record-date" type="date" name="diagnosed_on" value="${todayIso()}" required>
        </div>
        <div class="form-field full">
          <label>Prescription</label>
          <div class="repeat-list" id="medicine-rows">${medicineRow()}</div>
          <button class="btn btn-secondary btn-sm" type="button" id="add-medicine">Add medicine</button>
          <span class="field-hint">Blank rows ignore ho jayengi.</span>
        </div>
        <div class="form-field full">
          <label>Diagnostic tests</label>
          <div class="repeat-list" id="test-rows">${testRow()}</div>
          <button class="btn btn-secondary btn-sm" type="button" id="add-test">Add test</button>
        </div>
      </form>`,
    footer: `
      <button class="btn btn-secondary" type="button" data-close>Cancel</button>
      <button class="btn btn-primary" type="submit" form="record-form">Save record</button>`,
  });

  const form = modal.overlay.querySelector("#record-form");
  const medicineList = modal.overlay.querySelector("#medicine-rows");
  const testList = modal.overlay.querySelector("#test-rows");

  modal.overlay.querySelector("#add-medicine").addEventListener("click", () => {
    medicineList.insertAdjacentHTML("beforeend", medicineRow());
  });
  modal.overlay.querySelector("#add-test").addEventListener("click", () => {
    testList.insertAdjacentHTML("beforeend", testRow());
  });
  form.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove]");
    if (!button) return;
    const row = button.closest(".repeat-row");
    const list = row.parentElement;
    row.remove();
    if (!list.children.length) {
      list.insertAdjacentHTML(
        "beforeend",
        list === medicineList ? medicineRow() : testRow()
      );
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = modal.overlay.querySelector('[form="record-form"]');
    submit.disabled = true;

    const medicines = [...medicineList.querySelectorAll(".medicine-row")]
      .map((row) => ({
        medicine: row.querySelector('[name="medicine"]').value.trim(),
        dosage: row.querySelector('[name="dosage"]').value.trim(),
        duration_days: row.querySelector('[name="duration_days"]').value.trim(),
      }))
      .filter((entry) => entry.medicine || entry.dosage);
    const tests = [...testList.querySelectorAll(".test-row")]
      .map((row) => ({
        test_name: row.querySelector('[name="test_name"]').value.trim(),
        result: row.querySelector('[name="result"]').value.trim(),
      }))
      .filter((entry) => entry.test_name || entry.result);

    try {
      const payload = Object.fromEntries(new FormData(form));
      await api("/api/records", {
        method: "POST",
        body: JSON.stringify({
          appt_id: apptId,
          condition: payload.condition,
          diagnosed_on: payload.diagnosed_on,
          medicines,
          tests,
        }),
      });
      modal.close();
      toast("Medical record saved.");
      notifyChange();
      onDone?.();
    } catch (err) {
      toast(err.message, "error");
      submit.disabled = false;
    }
  });
}

export async function payBill(bill, onDone = null) {
  const confirmed = await confirmDialog({
    title: "Record payment",
    message: `Mark invoice <strong>#${esc(bill.bill_id)}</strong> for <strong>${esc(
      bill.patient
    )}</strong> as fully paid?<br><br>Amount due: <strong>${fmtCurrency(
      bill.outstanding
    )}</strong>`,
    confirmLabel: "Mark as paid",
  });
  if (!confirmed) return;

  try {
    await api(`/api/bills/${bill.bill_id}/pay`, {
      method: "POST",
      body: "{}",
    });
    toast("Payment recorded.");
    notifyChange();
    onDone?.();
  } catch (err) {
    toast(err.message, "error");
  }
}

export async function openBillModal({ onDone = null } = {}) {
  let appointments;
  let billData;
  try {
    [appointments, billData] = await Promise.all([
      api("/api/appointments"),
      api("/api/bills"),
    ]);
  } catch (err) {
    toast(err.message, "error");
    return;
  }

  const billed = new Set(billData.bills.map((bill) => bill.appt_id));
  const available = appointments.appointments.filter(
    (appt) => appt.status === "completed" && !billed.has(appt.appt_id)
  );

  const options = available
    .map(
      (appt) =>
        `<option value="${appt.appt_id}">#${appt.appt_id} · ${esc(
          appt.patient
        )} · ${esc(appt.doctor)} · ${esc(fmtDate(appt.appt_date))}</option>`
    )
    .join("");

  const modal = openModal({
    title: "New invoice",
    subtitle: "Raise a bill for a completed appointment.",
    body: `
      <form id="bill-form" class="form-grid">
        <div class="form-field full">
          <label for="bill-appointment">Appointment</label>
          <select id="bill-appointment" name="appt_id" required ${
            available.length ? "" : "disabled"
          }>
            ${
              options ||
              '<option value="">No unbilled completed appointments</option>'
            }
          </select>
          <span class="field-hint">Only completed visits can be invoiced.</span>
        </div>
        <div class="form-field">
          <label for="bill-amount">Total amount (₹)</label>
          <input id="bill-amount" type="number" name="amount" min="0" step="0.01" required placeholder="2500">
        </div>
        <div class="form-field">
          <label for="bill-paid">Amount paid (₹)</label>
          <input id="bill-paid" type="number" name="paid_amount" min="0" step="0.01" value="0">
          <span class="field-hint">0 rakho to invoice Unpaid banega.</span>
        </div>
        <div class="form-field full">
          <label for="bill-date">Bill date</label>
          <input id="bill-date" type="date" name="bill_date" value="${todayIso()}" required>
        </div>
      </form>`,
    footer: `
      <button class="btn btn-secondary" type="button" data-close>Cancel</button>
      <button class="btn btn-primary" type="submit" form="bill-form" ${
        available.length ? "" : "disabled"
      }>Create invoice</button>`,
  });

  const form = modal.overlay.querySelector("#bill-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = modal.overlay.querySelector('[form="bill-form"]');
    button.disabled = true;
    try {
      const payload = Object.fromEntries(new FormData(form));
      await api("/api/bills", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      modal.close();
      toast("Invoice created.");
      notifyChange();
      onDone?.();
    } catch (err) {
      toast(err.message, "error");
      button.disabled = false;
    }
  });
}
