import { icon } from "./icons.js";

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function fmtCurrency(value) {
  return currency.format(Number(value) || 0);
}

export function fmtCompact(value) {
  const amount = Number(value) || 0;
  if (Math.abs(amount) >= 100000) {
    return `₹${(amount / 100000).toFixed(1).replace(/\.0$/, "")}L`;
  }
  if (Math.abs(amount) >= 1000) {
    return `₹${(amount / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return `₹${Math.round(amount)}`;
}

export function fmtDate(iso) {
  if (!iso) return "—";
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function fmtDateShort(iso) {
  if (!iso) return "—";
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function weekdayShort(iso) {
  if (!iso) return "";
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-IN", { weekday: "short" });
}

export function ageFromDob(iso) {
  if (!iso) return null;
  const born = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(born.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - born.getFullYear();
  const beforeBirthday =
    today.getMonth() < born.getMonth() ||
    (today.getMonth() === born.getMonth() && today.getDate() < born.getDate());
  if (beforeBirthday) age -= 1;
  return Math.max(age, 0);
}

export function genderLabel(code) {
  if (code === "M") return "Male";
  if (code === "F") return "Female";
  if (code === "O") return "Other";
  return "—";
}

export function initials(name) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

const AVATAR_COLORS = [
  "#0f766e",
  "#2563eb",
  "#7c3aed",
  "#b45309",
  "#be123c",
  "#0e7490",
  "#4d7c0f",
];

export function avatar(name, extraClass = "") {
  const text = String(name || "?");
  let sum = 0;
  for (const ch of text) sum += ch.charCodeAt(0);
  const color = AVATAR_COLORS[sum % AVATAR_COLORS.length];
  return `<span class="avatar ${extraClass}" style="--avatar:${color}" aria-hidden="true">${esc(initials(text))}</span>`;
}

const STATUS_LABELS = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  paid: "Paid",
  partial: "Partial",
  unpaid: "Unpaid",
  pending: "Pending",
};

export function statusBadge(status) {
  const key = String(status || "").toLowerCase();
  const label = STATUS_LABELS[key] || status || "Unknown";
  return `<span class="badge badge-${esc(key)}">${esc(label)}</span>`;
}

/* ---------- toast ---------- */

export function toast(message, type = "success") {
  const root = $("#toast-root");
  if (!root) return;
  const el = document.createElement("div");
  el.className = `toast ${type === "error" ? "error" : type === "info" ? "info" : ""}`;
  const iconName = type === "error" ? "alert" : type === "info" ? "activity" : "check";
  el.innerHTML = `${icon(iconName, 17)}<span>${esc(message)}</span>`;
  root.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(8px)";
    el.style.transition = "all 0.25s ease";
    setTimeout(() => el.remove(), 260);
  }, 3400);
}

/* ---------- modal ---------- */

export function openModal({
  title,
  subtitle = "",
  body = "",
  footer = "",
  wide = false,
}) {
  const root = $("#modal-root");
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal${wide ? " modal-wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head">
        <div>
          <h2>${esc(title)}</h2>
          ${subtitle ? `<p>${esc(subtitle)}</p>` : ""}
        </div>
        <button class="icon-btn" type="button" data-close aria-label="Close dialog">${icon("close", 16)}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ""}
    </div>`;

  root.appendChild(overlay);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    if (!document.querySelector(".modal-overlay, .palette:not([hidden])")) {
      document.body.style.overflow = "";
    }
  };

  const onKey = (event) => {
    if (event.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || event.target.closest("[data-close]")) close();
  });

  const firstField = overlay.querySelector(
    "input, select, textarea, button:not([data-close])"
  );
  if (firstField) setTimeout(() => firstField.focus(), 40);

  return {
    overlay,
    modal: overlay.querySelector(".modal"),
    body: overlay.querySelector(".modal-body"),
    close,
  };
}

export function confirmDialog({
  title = "Are you sure?",
  message = "",
  confirmLabel = "Confirm",
  danger = false,
}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const modal = openModal({
      title,
      body: `<p style="font-size:13.5px;color:var(--ink-soft);line-height:1.6">${message}</p>`,
      footer: `
        <button class="btn btn-secondary" type="button" data-cancel>Cancel</button>
        <button class="btn ${danger ? "btn-danger" : "btn-primary"}" type="button" data-confirm>${esc(confirmLabel)}</button>`,
    });

    modal.overlay.querySelector("[data-confirm]").addEventListener("click", () => {
      finish(true);
      modal.close();
    });
    modal.overlay.addEventListener("click", (event) => {
      if (event.target === modal.overlay || event.target.closest("[data-close], [data-cancel]")) {
        finish(false);
        modal.close();
      }
    });
  });
}

/* ---------- states ---------- */

export function emptyState({ iconName = "search", title, text, action = "" }) {
  return `<div class="empty">
    <div class="empty-icon">${icon(iconName, 22)}</div>
    <strong>${esc(title)}</strong>
    <p>${esc(text)}</p>
    ${action}
  </div>`;
}

export function errorState(message) {
  return `<div class="card error-state">
    <h2>Something went wrong</h2>
    <p>${esc(message || "The page could not be loaded.")}</p>
    <button class="btn btn-primary" type="button" onclick="location.reload()">Try again</button>
  </div>`;
}

export function skeletonPage() {
  return `
    <div class="kpi-grid">
      ${'<div class="skeleton skeleton-card"></div>'.repeat(4)}
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="skeleton skeleton-line" style="width:32%;margin-bottom:16px"></div>
        <div class="skeleton" style="height:240px"></div>
      </div>
      <div class="card">
        <div class="skeleton skeleton-line" style="width:44%;margin-bottom:16px"></div>
        <div class="skeleton" style="height:240px"></div>
      </div>
    </div>`;
}

/* ---------- misc ---------- */

export function debounce(fn, delay = 220) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function notifyChange() {
  window.dispatchEvent(new Event("data:changed"));
}

export function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
