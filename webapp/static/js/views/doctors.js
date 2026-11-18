import { api } from "../api.js";
import { icon } from "../icons.js";
import { openBookingModal } from "../dialogs.js";
import {
  avatar,
  debounce,
  emptyState,
  esc,
} from "../ui.js";

function doctorCard(doctor) {
  const rate = doctor.total_appointments
    ? Math.round((doctor.completed / doctor.total_appointments) * 100)
    : 0;

  return `<article class="card doctor-card">
    <div class="doctor-head">
      ${avatar(doctor.doctor_name)}
      <div>
        <h3>${esc(doctor.doctor_name)}</h3>
        <p>${esc(doctor.specialization)}</p>
      </div>
      <span class="tag doctor-dept">${esc(doctor.dept_name)}</span>
    </div>

    <div class="doctor-stats">
      <div><strong>${doctor.total_appointments}</strong><span>visits</span></div>
      <div><strong>${doctor.completed}</strong><span>completed</span></div>
      <div><strong>${doctor.patients}</strong><span>patients</span></div>
    </div>

    <div class="doctor-util">
      <div class="util-head">
        <span>Completion rate</span>
        <span>${rate}%</span>
      </div>
      <div class="progress">
        <div class="progress-fill" style="width:${rate}%"></div>
      </div>
    </div>

    <div class="doctor-foot">
      <button class="btn btn-secondary btn-sm" type="button" data-book="${doctor.doctor_id}">
        ${icon("calendar", 14)} Book appointment
      </button>
    </div>
  </article>`;
}

export async function doctorsView(root) {
  const state = { query: "", dept: "all" };
  let doctors = [];
  let departments = [];

  root.innerHTML = `
    <div class="card toolbar">
      <div class="toolbar-group">
        <div class="search-field">
          ${icon("search", 16)}
          <input id="doctor-search" type="search" placeholder="Search doctor or specialisation…" aria-label="Search doctors">
        </div>
        <select class="select" id="doctor-dept" aria-label="Filter by department">
          <option value="all">All departments</option>
        </select>
      </div>
      <div class="toolbar-actions">
        <span class="count-pill" id="doctors-count">0</span>
        <button class="btn btn-primary" type="button" id="book-doctor">
          ${icon("plus", 16)} Book appointment
        </button>
      </div>
    </div>

    <div id="doctor-grid" class="doctor-grid"></div>`;

  const grid = root.querySelector("#doctor-grid");
  const count = root.querySelector("#doctors-count");
  const deptSelect = root.querySelector("#doctor-dept");

  function render() {
    const query = state.query.trim().toLowerCase();
    const rows = doctors.filter((doctor) => {
      const matchesDept =
        state.dept === "all" || String(doctor.dept_id) === state.dept;
      const matchesQuery =
        !query ||
        String(doctor.doctor_name).toLowerCase().includes(query) ||
        String(doctor.specialization).toLowerCase().includes(query) ||
        String(doctor.dept_name).toLowerCase().includes(query);
      return matchesDept && matchesQuery;
    });

    count.textContent =
      rows.length === doctors.length
        ? String(doctors.length)
        : `${rows.length}/${doctors.length}`;

    if (!rows.length) {
      grid.innerHTML = emptyState({
        iconName: "doctors",
        title: "No doctors found",
        text: "Try a different name, specialisation or department.",
      });
      return;
    }

    grid.innerHTML = rows.map(doctorCard).join("");

    grid.querySelectorAll("[data-book]").forEach((button) => {
      button.addEventListener("click", () => {
        openBookingModal({
          doctorId: Number(button.dataset.book),
          onDone: refresh,
        });
      });
    });
  }

  async function refresh() {
    const [doctorsData, departmentData] = await Promise.all([
      api("/api/doctors"),
      api("/api/departments"),
    ]);
    doctors = doctorsData.doctors;
    departments = departmentData.departments;
    render();
  }

  root
    .querySelector("#doctor-search")
    .addEventListener(
      "input",
      debounce((event) => {
        state.query = event.target.value;
        render();
      }, 120)
    );

  deptSelect.addEventListener("change", (event) => {
    state.dept = event.target.value;
    render();
  });

  root.querySelector("#book-doctor").addEventListener("click", () => {
    openBookingModal({ onDone: refresh });
  });

  await refresh();

  departments
    .slice()
    .sort((a, b) => a.dept_name.localeCompare(b.dept_name))
    .forEach((department) => {
      const option = document.createElement("option");
      option.value = String(department.dept_id);
      option.textContent = department.dept_name;
      deptSelect.appendChild(option);
    });
}
