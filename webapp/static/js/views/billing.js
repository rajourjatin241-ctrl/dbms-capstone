import { api } from "../api.js";
import { icon } from "../icons.js";
import { openBillModal, payBill } from "../dialogs.js";
import {
  avatar,
  debounce,
  emptyState,
  esc,
  fmtCurrency,
  fmtDate,
  statusBadge,
} from "../ui.js";

const FILTERS = [
  ["all", "All"],
  ["paid", "Paid"],
  ["partial", "Partial"],
  ["unpaid", "Unpaid"],
];

function summaryCard({ label, value, foot, iconName, tone = "" }) {
  return `<article class="card kpi">
    <div class="kpi-top">
      <span class="kpi-icon ${tone}">${icon(iconName, 18)}</span>
      <span class="kpi-label">${esc(label)}</span>
    </div>
    <div class="kpi-value">${esc(value)}</div>
    <div class="kpi-foot"><small>${esc(foot)}</small></div>
  </article>`;
}

export async function billingView(root) {
  const state = { query: "", status: "all" };
  let bills = [];
  let totals = {
    billed: 0,
    collected: 0,
    outstanding: 0,
    count: 0,
    avg_bill: 0,
  };

  root.innerHTML = `
    <section class="kpi-grid" id="billing-summary" aria-label="Billing summary"></section>

    <div class="card toolbar">
      <div class="toolbar-group">
        <div class="search-field">
          ${icon("search", 16)}
          <input id="bill-search" type="search" placeholder="Search patient, department or invoice…" aria-label="Search invoices">
        </div>
        <div class="chips" id="bill-chips">
          ${FILTERS.map(
            ([value, label]) => `<button class="chip ${
              value === "all" ? "active" : ""
            }" type="button" data-status="${value}">
              ${label} <span class="chip-count" data-count="${value}">0</span>
            </button>`
          ).join("")}
        </div>
      </div>
      <div class="toolbar-actions">
        <span class="count-pill" id="bill-count">0</span>
        <button class="btn btn-primary" id="new-invoice" type="button">
          ${icon("plus", 16)} New invoice
        </button>
      </div>
    </div>

    <div class="card table-card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Date</th>
              <th>Patient</th>
              <th>Department</th>
              <th>Amount</th>
              <th>Paid</th>
              <th>Balance</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="bills-body"></tbody>
        </table>
      </div>
    </div>`;

  const body = root.querySelector("#bills-body");
  const count = root.querySelector("#bill-count");
  const summary = root.querySelector("#billing-summary");

  function renderSummary() {
    const rate = totals.billed
      ? Math.round((totals.collected / totals.billed) * 100)
      : 0;

    summary.innerHTML = [
      summaryCard({
        label: "Total billed",
        value: fmtCurrency(totals.billed),
        foot: `${totals.count} invoices raised`,
        iconName: "billing",
      }),
      summaryCard({
        label: "Collected",
        value: fmtCurrency(totals.collected),
        foot: `${rate}% collection rate`,
        iconName: "wallet",
      }),
      summaryCard({
        label: "Outstanding",
        value: fmtCurrency(totals.outstanding),
        foot: "pending payments",
        iconName: "alert",
        tone: "tone-amber",
      }),
      summaryCard({
        label: "Average invoice",
        value: fmtCurrency(totals.avg_bill),
        foot: "per appointment bill",
        iconName: "activity",
        tone: "tone-violet",
      }),
    ].join("");
  }

  function renderCounts() {
    FILTERS.forEach(([value]) => {
      const badge = root.querySelector(`[data-count="${value}"]`);
      if (!badge) return;
      badge.textContent =
        value === "all"
          ? String(bills.length)
          : String(bills.filter((bill) => bill.status === value).length);
    });
  }

  function render() {
    renderCounts();

    const query = state.query.trim().toLowerCase();
    const rows = bills.filter((bill) => {
      const matchesStatus =
        state.status === "all" || bill.status === state.status;
      const matchesQuery =
        !query ||
        String(bill.patient).toLowerCase().includes(query) ||
        String(bill.department).toLowerCase().includes(query) ||
        String(bill.bill_id).includes(query) ||
        String(bill.bill_date).includes(query);
      return matchesStatus && matchesQuery;
    });

    count.textContent =
      rows.length === bills.length
        ? String(bills.length)
        : `${rows.length}/${bills.length}`;

    if (!bills.length) {
      body.innerHTML = `<tr><td colspan="9">${emptyState({
        iconName: "billing",
        title: "No invoices yet",
        text: "Bills raised for completed visits will appear here.",
      })}</td></tr>`;
      return;
    }

    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="9">${emptyState({
        iconName: "search",
        title: "No matching invoices",
        text: "Try another search term or payment status.",
      })}</td></tr>`;
      return;
    }

    body.innerHTML = rows
      .map(
        (bill) => `<tr>
          <td class="num muted">#${bill.bill_id}</td>
          <td>${esc(fmtDate(bill.bill_date))}</td>
          <td>
            <div class="table-person">
              ${avatar(bill.patient)}
              <div><strong>${esc(bill.patient)}</strong><span>${esc(
          bill.doctor
        )}</span></div>
            </div>
          </td>
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
                ? `<button class="btn btn-primary btn-sm pay-bill" type="button" data-bill="${bill.bill_id}">
                     Pay now
                   </button>`
                : ""
            }
          </td>
        </tr>`
      )
      .join("");

    body.querySelectorAll(".pay-bill").forEach((button) => {
      const bill = bills.find(
        (entry) => entry.bill_id === Number(button.dataset.bill)
      );
      button.addEventListener("click", () => payBill(bill, refresh));
    });
  }

  async function refresh() {
    const data = await api("/api/bills");
    bills = data.bills;
    totals = data.totals;
    renderSummary();
    render();
  }

  root.querySelector("#bill-search").addEventListener(
    "input",
    debounce((event) => {
      state.query = event.target.value;
      render();
    }, 120)
  );

  root.querySelector("#new-invoice").addEventListener("click", () => {
    openBillModal({ onDone: refresh });
  });

  root.querySelector("#bill-chips").addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    state.status = chip.dataset.status;
    root.querySelectorAll("#bill-chips .chip").forEach((entry) => {
      entry.classList.toggle("active", entry === chip);
    });
    render();
  });

  await refresh();
}
