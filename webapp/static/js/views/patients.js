import { api } from "../api.js";
import { icon } from "../icons.js";
import { openPatientModal } from "../dialogs.js";
import {
  avatar,
  debounce,
  emptyState,
  esc,
  fmtDate,
  genderLabel,
} from "../ui.js";

export async function patientsView(root) {
  const data = await api("/api/patients");
  const patients = data.patients;

  const state = {
    query: "",
    gender: "all",
    sort: "name",
  };

  root.innerHTML = `
    <div class="card toolbar">
      <div class="toolbar-group">
        <div class="search-field">
          ${icon("search", 16)}
          <input id="patient-search" type="search" placeholder="Search name or condition…" aria-label="Search patients">
        </div>
        <select class="select" id="patient-gender" aria-label="Filter by gender">
          <option value="all">All genders</option>
          <option value="F">Female</option>
          <option value="M">Male</option>
          <option value="O">Other</option>
        </select>
        <select class="select" id="patient-sort" aria-label="Sort patients">
          <option value="name">Sort by name</option>
          <option value="visits">Sort by visits</option>
          <option value="recent">Sort by last visit</option>
        </select>
      </div>
      <div class="toolbar-actions">
        <span class="count-pill" id="patients-count">${patients.length}</span>
        <button class="btn btn-primary" type="button" id="add-patient">
          ${icon("userPlus", 16)} Register patient
        </button>
      </div>
    </div>

    <div class="card table-card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Patient</th>
              <th>Gender</th>
              <th>Visits</th>
              <th>Last visit</th>
              <th>Latest condition</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="patients-body"></tbody>
        </table>
      </div>
    </div>`;

  const body = root.querySelector("#patients-body");
  const count = root.querySelector("#patients-count");

  function render() {
    const query = state.query.trim().toLowerCase();
    let rows = patients.filter((patient) => {
      const matchesGender =
        state.gender === "all" || patient.gender === state.gender;
      const matchesQuery =
        !query ||
        String(patient.full_name).toLowerCase().includes(query) ||
        String(patient.latest_condition).toLowerCase().includes(query);
      return matchesGender && matchesQuery;
    });

    rows = [...rows].sort((a, b) => {
      if (state.sort === "visits") {
        return b.total_appointments - a.total_appointments;
      }
      if (state.sort === "recent") {
        return String(b.last_visit).localeCompare(String(a.last_visit));
      }
      return String(a.full_name).localeCompare(String(b.full_name));
    });

    count.textContent =
      rows.length === patients.length
        ? String(patients.length)
        : `${rows.length}/${patients.length}`;

    if (!patients.length) {
      body.innerHTML = `<tr><td colspan="7">${emptyState({
        iconName: "patients",
        title: "No patients yet",
        text: "Register the first patient to start building the directory.",
      })}</td></tr>`;
      return;
    }

    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="7">${emptyState({
        iconName: "search",
        title: "No matching patients",
        text: "Try a different name, condition or gender filter.",
      })}</td></tr>`;
      return;
    }

    body.innerHTML = rows
      .map(
        (patient) => `<tr class="row-link" data-id="${patient.patient_id}">
          <td class="num muted">#${patient.patient_id}</td>
          <td>
            <div class="table-person">
              ${avatar(patient.full_name)}
              <div>
                <strong>${esc(patient.full_name)}</strong>
                <span>${esc(patient.phone || "No phone on file")}</span>
              </div>
            </div>
          </td>
          <td><span class="tag">${esc(genderLabel(patient.gender))}</span></td>
          <td class="num">${patient.total_appointments}</td>
          <td>${esc(fmtDate(patient.last_visit))}</td>
          <td>${esc(patient.latest_condition)}</td>
          <td class="text-right">
            <a class="btn btn-secondary btn-sm" href="#/patients/${patient.patient_id}">
              View ${icon("chevronRight", 14)}
            </a>
          </td>
        </tr>`
      )
      .join("");
  }

  root
    .querySelector("#patient-search")
    .addEventListener(
      "input",
      debounce((event) => {
        state.query = event.target.value;
        render();
      }, 120)
    );

  root.querySelector("#patient-gender").addEventListener("change", (event) => {
    state.gender = event.target.value;
    render();
  });

  root.querySelector("#patient-sort").addEventListener("change", (event) => {
    state.sort = event.target.value;
    render();
  });

  root.querySelector("#add-patient").addEventListener("click", () => {
    openPatientModal({ onDone: () => patientsView(root) });
  });

  body.addEventListener("click", (event) => {
    if (event.target.closest("a")) return;
    const row = event.target.closest("tr[data-id]");
    if (row) location.hash = `/patients/${row.dataset.id}`;
  });

  render();
}
