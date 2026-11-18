import { api } from "../api.js";
import { icon } from "../icons.js";
import { openBookingModal } from "../dialogs.js";
import {
  avatar,
  confirmDialog,
  debounce,
  emptyState,
  esc,
  fmtDate,
  fmtDateShort,
  notifyChange,
  statusBadge,
  toast,
  weekdayShort,
} from "../ui.js";

const STATUS_FILTERS = [
  ["all", "All"],
  ["scheduled", "Scheduled"],
  ["completed", "Completed"],
  ["cancelled", "Cancelled"],
];

export async function appointmentsView(root) {
  const state = { query: "", status: "all" };
  let appointments = [];

  root.innerHTML = `
    <div class="card toolbar">
      <div class="toolbar-group">
        <div class="search-field">
          ${icon("search", 16)}
          <input id="appt-search" type="search" placeholder="Search patient, doctor or date…" aria-label="Search appointments">
        </div>
        <div class="chips" id="appt-chips">
          ${STATUS_FILTERS.map(
            ([value, label]) => `<button class="chip ${
              value === "all" ? "active" : ""
            }" type="button" data-status="${value}">
              ${label} <span class="chip-count" data-count="${value}">0</span>
            </button>`
          ).join("")}
        </div>
      </div>
      <div class="toolbar-actions">
        <span class="count-pill" id="appt-count">0</span>
        <button class="btn btn-primary" type="button" id="book-appointment">
          ${icon("plus", 16)} Book appointment
        </button>
      </div>
    </div>

    <div class="card table-card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Patient</th>
              <th>Doctor</th>
              <th>Department</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="appointments-body"></tbody>
        </table>
      </div>
    </div>`;

  const body = root.querySelector("#appointments-body");
  const count = root.querySelector("#appt-count");

  function filtered() {
    const query = state.query.trim().toLowerCase();
    return appointments.filter((appointment) => {
      const matchesStatus =
        state.status === "all" || appointment.status === state.status;
      const matchesQuery =
        !query ||
        String(appointment.patient).toLowerCase().includes(query) ||
        String(appointment.doctor).toLowerCase().includes(query) ||
        String(appointment.department).toLowerCase().includes(query) ||
        String(appointment.appt_date).includes(query);
      return matchesStatus && matchesQuery;
    });
  }

  function renderCounts() {
    STATUS_FILTERS.forEach(([value]) => {
      const badge = root.querySelector(`[data-count="${value}"]`);
      if (!badge) return;
      const total =
        value === "all"
          ? appointments.length
          : appointments.filter((entry) => entry.status === value).length;
      badge.textContent = String(total);
    });
  }

  function render() {
    const rows = filtered();
    renderCounts();

    count.textContent =
      rows.length === appointments.length
        ? String(appointments.length)
        : `${rows.length}/${appointments.length}`;

    if (!appointments.length) {
      body.innerHTML = `<tr><td colspan="6">${emptyState({
        iconName: "calendar",
        title: "No appointments yet",
        text: "Book the first appointment to get started.",
      })}</td></tr>`;
      return;
    }

    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="6">${emptyState({
        iconName: "search",
        title: "No matching appointments",
        text: "Adjust the search text or status filter.",
      })}</td></tr>`;
      return;
    }

    body.innerHTML = rows
      .map(
        (appointment) => `<tr>
          <td>
            <div class="date-cell">
              <strong>${esc(fmtDateShort(appointment.appt_date))}</strong>
              <span>${esc(weekdayShort(appointment.appt_date))} · ${esc(
          appointment.appt_date.slice(0, 4)
        )}</span>
            </div>
          </td>
          <td>
            <div class="table-person">
              ${avatar(appointment.patient)}
              <div><strong>${esc(appointment.patient)}</strong></div>
            </div>
          </td>
          <td>${esc(appointment.doctor)}</td>
          <td>${esc(appointment.department)}</td>
          <td>${statusBadge(appointment.status)}</td>
          <td class="text-right">
            <div class="table-actions">
              ${
                appointment.status === "scheduled"
                  ? `<button class="btn btn-secondary btn-sm" type="button" data-complete="${appointment.appt_id}">
                       ${icon("check", 14)} Complete
                     </button>
                     <button class="btn btn-danger btn-sm" type="button" data-cancel-appt="${appointment.appt_id}">
                       Cancel
                     </button>`
                  : ""
              }
            </div>
          </td>
        </tr>`
      )
      .join("");

    body.querySelectorAll("[data-complete]").forEach((button) => {
      button.addEventListener("click", () =>
        completeAppointment(Number(button.dataset.complete))
      );
    });

    body.querySelectorAll("[data-cancel-appt]").forEach((button) => {
      button.addEventListener("click", () =>
        cancelAppointment(Number(button.dataset.cancelAppt))
      );
    });
  }

  async function completeAppointment(apptId) {
    const appointment = appointments.find((entry) => entry.appt_id === apptId);
    if (!appointment) return;

    const confirmed = await confirmDialog({
      title: "Complete appointment",
      message: `Mark the appointment for <strong>${esc(
        appointment.patient
      )}</strong> with <strong>${esc(
        appointment.doctor
      )}</strong> on ${fmtDate(
        appointment.appt_date
      )} as completed?`,
      confirmLabel: "Mark completed",
    });
    if (!confirmed) return;

    try {
      await api(`/api/appointments/${apptId}/complete`, {
        method: "POST",
        body: "{}",
      });
      toast("Appointment marked as completed.");
      notifyChange();
      await refresh();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  async function cancelAppointment(apptId) {
    const confirmed = await confirmDialog({
      title: "Cancel appointment",
      message:
        "This scheduled appointment will be cancelled. This action cannot be undone.",
      confirmLabel: "Cancel appointment",
      danger: true,
    });
    if (!confirmed) return;

    try {
      await api(`/api/appointments/${apptId}/cancel`, {
        method: "POST",
        body: "{}",
      });
      toast("Appointment cancelled.");
      notifyChange();
      await refresh();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  async function refresh() {
    const data = await api("/api/appointments");
    appointments = data.appointments;
    render();
  }

  root.querySelector("#appt-search").addEventListener(
    "input",
    debounce((event) => {
      state.query = event.target.value;
      render();
    }, 120)
  );

  root.querySelector("#appt-chips").addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    state.status = chip.dataset.status;
    root.querySelectorAll("#appt-chips .chip").forEach((entry) => {
      entry.classList.toggle("active", entry === chip);
    });
    render();
  });

  root.querySelector("#book-appointment").addEventListener("click", () => {
    openBookingModal({ onDone: refresh });
  });

  await refresh();
}
