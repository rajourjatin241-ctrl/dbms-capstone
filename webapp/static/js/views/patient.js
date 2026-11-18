import { api } from "../api.js";
import { icon } from "../icons.js";
import { openBookingModal, openRecordModal, payBill } from "../dialogs.js";
import {
  avatar,
  emptyState,
  esc,
  fmtCurrency,
  fmtDate,
  genderLabel,
  ageFromDob,
  statusBadge,
} from "../ui.js";

function billTable(bills) {
  if (!bills.length) {
    return emptyState({
      iconName: "billing",
      title: "No invoices",
      text: "Bills raised for this patient will appear here.",
    });
  }

  return `<div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Invoice</th>
          <th>Date</th>
          <th>Department</th>
          <th>Amount</th>
          <th>Paid</th>
          <th>Balance</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${bills
          .map(
            (bill) => `<tr>
              <td class="num muted">#${bill.bill_id}</td>
              <td>${esc(fmtDate(bill.bill_date))}</td>
              <td>${esc(bill.department)}</td>
              <td class="num">${fmtCurrency(bill.amount)}</td>
              <td class="num">${fmtCurrency(bill.paid_amount)}</td>
              <td class="num ${bill.outstanding > 0 ? "due" : "due zero"}">${fmtCurrency(
              bill.outstanding
            )}</td>
              <td>${statusBadge(bill.status)}</td>
              <td class="text-right">
                ${
                  bill.outstanding > 0
                    ? `<button class="btn btn-primary btn-sm pay-bill" type="button" data-bill="${bill.bill_id}">Pay now</button>`
                    : ""
                }
              </td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>
  </div>`;
}

export async function patientView(root, patientIdParam) {
  const patientId = Number(patientIdParam);
  let activeTab = "visits";
  let profile = null;

  function visitsPanel() {
    const visits = [...profile.visits].sort((a, b) =>
      String(b.date).localeCompare(String(a.date))
    );

    if (!visits.length) {
      return emptyState({
        iconName: "calendar",
        title: "No visits recorded",
        text: "Medical history will appear here after the first appointment.",
      });
    }

    return `<div class="timeline">
      ${visits
        .map((visit) => {
          const due = visit.bills.reduce(
            (sum, bill) => sum + Number(bill.outstanding || 0),
            0
          );

          return `<div class="timeline-item ${visit.status}">
            <span class="timeline-dot"></span>
            <div class="timeline-card">
              <div class="timeline-head">
                <div>
                  <strong>${esc(fmtDate(visit.date))}</strong>
                  <div class="muted">${esc(visit.doctor)} · ${esc(
            visit.specialization
          )} · ${esc(visit.department)}</div>
                </div>
                <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                  ${statusBadge(visit.status)}
                  ${
                    due > 0
                      ? `<span class="tag text-rose">${fmtCurrency(due)} due</span>`
                      : ""
                  }
                  ${
                    visit.status === "completed" && !visit.has_record
                      ? `<button class="btn btn-secondary btn-sm add-record" type="button" data-appt="${visit.appt_id}">${icon(
                          "plus",
                          14
                        )} Add record</button>`
                      : ""
                  }
                </div>
              </div>

              <p class="diagnosis"><strong>Diagnosis</strong> · ${esc(visit.condition)}</p>

              ${
                visit.medicines.length
                  ? `<div class="visit-section">
                      <h4>Prescription</h4>
                      <div class="chip-list">
                        ${visit.medicines
                          .map(
                            (medicine) =>
                              `<span class="soft-chip">${esc(
                                medicine.medicine
                              )} · ${esc(medicine.dosage)} · ${
                                medicine.duration_days
                              }d</span>`
                          )
                          .join("")}
                      </div>
                    </div>`
                  : ""
              }

              ${
                visit.tests.length
                  ? `<div class="visit-section">
                      <h4>Diagnostic tests</h4>
                      <ul class="test-list">
                        ${visit.tests
                          .map(
                            (test) =>
                              `<li><span>${esc(test.test_name)}</span><strong>${esc(
                                test.result
                              )}</strong></li>`
                          )
                          .join("")}
                      </ul>
                    </div>`
                  : ""
              }
            </div>
          </div>`;
        })
        .join("")}
    </div>`;
  }

  function detailsPanel() {
    const patient = profile.patient;
    const age = ageFromDob(patient.dob);

    return `<div class="card">
      <div class="card-head">
        <div>
          <h2>Patient information</h2>
          <p class="card-sub">Demographic and contact details</p>
        </div>
      </div>
      <div class="detail-grid">
        <div class="detail"><span>Patient ID</span><strong>#${patient.patient_id}</strong></div>
        <div class="detail"><span>Date of birth</span><strong>${esc(
          fmtDate(patient.dob)
        )}</strong></div>
        <div class="detail"><span>Age</span><strong>${age !== null ? `${age} years` : "—"}</strong></div>
        <div class="detail"><span>Gender</span><strong>${esc(
          genderLabel(patient.gender)
        )}</strong></div>
        <div class="detail"><span>Phone</span><strong>${esc(patient.phone || "—")}</strong></div>
        <div class="detail"><span>Email</span><strong>${esc(patient.email || "—")}</strong></div>
        <div class="detail"><span>Next visit</span><strong>${esc(
          fmtDate(profile.summary.next_visit)
        )}</strong></div>
        <div class="detail"><span>Total visits</span><strong>${profile.summary.visits}</strong></div>
      </div>
    </div>`;
  }

  function renderPanel() {
    const panel = root.querySelector("#profile-panel");
    if (activeTab === "billing") {
      panel.innerHTML = `<div class="card table-card">${billTable(profile.bills)}</div>`;
      panel.querySelectorAll(".pay-bill").forEach((button) => {
        const bill = profile.bills.find(
          (entry) => entry.bill_id === Number(button.dataset.bill)
        );
        button.addEventListener("click", () => payBill(bill, load));
      });
      return;
    }
    if (activeTab === "details") {
      panel.innerHTML = detailsPanel();
      return;
    }
    panel.innerHTML = visitsPanel();
    panel.querySelectorAll(".add-record").forEach((button) => {
      button.addEventListener("click", () => {
        const visit = profile.visits.find(
          (entry) => entry.appt_id === Number(button.dataset.appt)
        );
        openRecordModal({
          apptId: visit.appt_id,
          label: `${fmtDate(visit.date)} · ${visit.doctor}`,
          onDone: load,
        });
      });
    });
  }

  function bindTabs() {
    root.querySelectorAll(".tab").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === activeTab);
      button.addEventListener("click", () => {
        activeTab = button.dataset.tab;
        root.querySelectorAll(".tab").forEach((tab) => {
          tab.classList.toggle("active", tab === button);
        });
        renderPanel();
      });
    });
  }

  function renderProfile() {
    const patient = profile.patient;
    const summary = profile.summary;
    const age = ageFromDob(patient.dob);

    root.innerHTML = `
      <a class="back-link" href="#/patients">${icon("arrowLeft", 15)} All patients</a>

      <section class="card profile-hero">
        <div class="profile-top">
          ${avatar(patient.full_name, "avatar-lg")}
          <div class="profile-identity">
            <h2>${esc(patient.full_name)}</h2>
            <div class="profile-tags">
              <span class="tag">Patient #${patient.patient_id}</span>
              <span class="tag">${esc(genderLabel(patient.gender))}</span>
              ${age !== null ? `<span class="tag">${age} years</span>` : ""}
              <span class="tag">Registered patient</span>
            </div>
            <div class="profile-contact">
              ${
                patient.phone
                  ? `<span>${icon("phone", 14)} ${esc(patient.phone)}</span>`
                  : ""
              }
              ${
                patient.email
                  ? `<span>${icon("mail", 14)} ${esc(patient.email)}</span>`
                  : ""
              }
            </div>
          </div>
          <div class="profile-actions">
            <button class="btn btn-primary" type="button" id="book-for-patient">
              ${icon("plus", 16)} Book appointment
            </button>
          </div>
        </div>

        <div class="profile-stats">
          <div class="profile-stat"><span>Total visits</span><strong>${summary.visits}</strong></div>
          <div class="profile-stat"><span>Last visit</span><strong>${esc(
            fmtDate(summary.last_visit)
          )}</strong></div>
          <div class="profile-stat"><span>Total billed</span><strong>${fmtCurrency(
            summary.billed
          )}</strong></div>
          <div class="profile-stat"><span>Outstanding</span><strong class="${
            summary.outstanding > 0 ? "text-rose" : ""
          }">${fmtCurrency(summary.outstanding)}</strong></div>
        </div>
      </section>

      <div class="profile-tabs">
        <div class="tabs" role="tablist">
          <button class="tab" type="button" data-tab="visits" role="tab">Visits (${
            profile.visits.length
          })</button>
          <button class="tab" type="button" data-tab="billing" role="tab">Billing (${
            profile.bills.length
          })</button>
          <button class="tab" type="button" data-tab="details" role="tab">Details</button>
        </div>
        <span class="muted" style="font-size:12px">SQLite · joined visit history</span>
      </div>

      <div id="profile-panel"></div>`;

    root.querySelector("#book-for-patient").addEventListener("click", () => {
      openBookingModal({ patientId, onDone: load });
    });

    bindTabs();
    renderPanel();
  }

  async function load() {
    profile = await api(`/api/patients/${patientId}/profile`);
    renderProfile();
  }

  await load();
}
