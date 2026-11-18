import { api } from "../api.js";
import { emptyState, esc, toast } from "../ui.js";

const TABLE_HINTS = {
  departments: "Hospital departments with location and phone",
  doctors: "Doctors linked to a department",
  patients: "Registered patient demographics",
  appointments: "Booked visits and their status",
  medical_history: "Diagnosis recorded for a completed visit",
  prescriptions: "Prescription header issued for a visit",
  prescription_items: "Medicines inside each prescription",
  diagnostic_tests: "Tests and results per visit",
  bills: "Invoices with payment amounts",
};

function cell(value) {
  if (value === null || value === undefined || value === "") {
    return '<td class="muted">—</td>';
  }
  return `<td>${esc(String(value))}</td>`;
}

function tableMarkup(data) {
  if (!data.rows.length) {
    return emptyState({
      iconName: "database",
      title: `No rows in ${data.name}`,
      text: "Data added from the website or via SQL will appear here.",
    });
  }

  return `<div class="table-wrap">
    <table>
      <thead>
        <tr>${data.columns
          .map((column) => `<th>${esc(column)}</th>`)
          .join("")}</tr>
      </thead>
      <tbody>
        ${data.rows
          .map(
            (row) =>
              `<tr>${data.columns.map((column) => cell(row[column])).join("")}</tr>`
          )
          .join("")}
      </tbody>
    </table>
  </div>`;
}

export async function databaseView(root) {
  root.innerHTML = `
    <div class="card toolbar">
      <div class="toolbar-group">
        <div class="chips" id="db-chips"></div>
      </div>
      <div class="toolbar-actions">
        <span class="muted" style="font-size:12px">Read-only · live SQLite data</span>
      </div>
    </div>

    <div class="card table-card">
      <div class="card-head">
        <div>
          <h2 id="db-title">Loading…</h2>
          <p class="card-sub" id="db-sub"></p>
        </div>
        <span class="tag" id="db-rows"></span>
      </div>
      <div id="db-table"></div>
    </div>`;

  const chips = root.querySelector("#db-chips");
  const title = root.querySelector("#db-title");
  const subtitle = root.querySelector("#db-sub");
  const rowCount = root.querySelector("#db-rows");
  const tableHost = root.querySelector("#db-table");

  let active = "patients";

  async function loadTable(name) {
    active = name;
    chips.querySelectorAll(".chip").forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.table === active);
    });
    title.textContent = active;
    subtitle.textContent = `SELECT * FROM ${active} ORDER BY 1 — ${TABLE_HINTS[active] || ""}`;
    tableHost.innerHTML = '<p class="muted" style="padding:16px;font-size:13px">Loading…</p>';
    try {
      const data = await api(`/api/database/${active}`);
      rowCount.textContent = `${data.rows.length} ${data.rows.length === 1 ? "row" : "rows"}`;
      tableHost.innerHTML = tableMarkup(data);
    } catch (err) {
      rowCount.textContent = "0 rows";
      tableHost.innerHTML = emptyState({
        iconName: "alert",
        title: "Could not load table",
        text: err.message,
      });
    }
  }

  try {
    const data = await api("/api/database");
    chips.innerHTML = data.tables
      .map(
        (table) => `<button class="chip" type="button" data-table="${table.name}">
          ${table.name} <span class="chip-count">${table.rows}</span>
        </button>`
      )
      .join("");
  } catch (err) {
    toast(err.message, "error");
    return;
  }

  chips.addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip || chip.dataset.table === active) return;
    loadTable(chip.dataset.table);
  });

  await loadTable(active);
}
