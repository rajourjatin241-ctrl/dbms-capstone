import { api } from "./api.js";
import { icon } from "./icons.js";
import { startRouter } from "./router.js";
import { $, $$, avatar, debounce, esc } from "./ui.js";

/* ---------- mobile navigation ---------- */

const sidebarBackdrop = $("#sidebar-backdrop");

function closeNavigation() {
  document.body.classList.remove("nav-open");
  sidebarBackdrop.hidden = true;
}

$("#menu-btn").addEventListener("click", () => {
  const open = document.body.classList.toggle("nav-open");
  sidebarBackdrop.hidden = !open;
});
sidebarBackdrop.addEventListener("click", closeNavigation);
$$(".nav-item").forEach((item) => item.addEventListener("click", closeNavigation));

/* ---------- appointments badge ---------- */

async function refreshAppointmentsBadge() {
  const badge = $("#nav-appointments-badge");
  if (!badge) return;
  try {
    const overview = await api("/api/overview");
    if (overview.scheduled > 0) {
      badge.hidden = false;
      badge.textContent = overview.scheduled;
    } else {
      badge.hidden = true;
    }
  } catch (err) {
    badge.hidden = true;
  }
}

window.addEventListener("data:changed", refreshAppointmentsBadge);
refreshAppointmentsBadge();

/* ---------- command palette ---------- */

const QUICK_PAGES = [
  {
    label: "Dashboard",
    sub: "Hospital overview and recent activity",
    href: "#/dashboard",
    icon: "dashboard",
    keywords: "home overview stats",
  },
  {
    label: "Patients",
    sub: "Browse the patient directory",
    href: "#/patients",
    icon: "patients",
    keywords: "phone directory people records",
  },
  {
    label: "Doctors",
    sub: "Care team and specialisations",
    href: "#/doctors",
    icon: "doctors",
    keywords: "staff specialists physicians",
  },
  {
    label: "Appointments",
    sub: "Scheduled and completed visits",
    href: "#/appointments",
    icon: "calendar",
    keywords: "visits booking schedule",
  },
  {
    label: "Billing",
    sub: "Invoices and outstanding payments",
    href: "#/billing",
    icon: "billing",
    keywords: "invoices payments revenue money",
  },
  {
    label: "Analytics",
    sub: "Operational and financial insights",
    href: "#/analytics",
    icon: "analytics",
    keywords: "charts reports trends",
  },
];

const palette = $("#palette");
const paletteInput = $("#palette-input");
const paletteResults = $("#palette-results");

let paletteItems = [];
let paletteActive = 0;
let searchToken = 0;

function paletteItemHtml(item, index) {
  const leading =
    item.kind === "page"
      ? `<span class="avatar" style="--avatar:#0f766e">${icon(item.icon, 15)}</span>`
      : avatar(item.label);

  return `<button type="button" class="palette-item ${
    index === paletteActive ? "selected" : ""
  }" data-index="${index}">
      ${leading}
      <span class="palette-item-main">
        <strong>${esc(item.label)}</strong>
        <span>${esc(item.sub)}</span>
      </span>
      ${icon("chevronRight", 14, "chev")}
    </button>`;
}

function renderPalette(groups, query) {
  let cursor = 0;
  const html = groups
    .filter((group) => group.items.length)
    .map((group) => {
      const rows = group.items
        .map((item) => {
          const row = paletteItemHtml(item, cursor);
          cursor += 1;
          return row;
        })
        .join("");
      return `<div class="palette-section">${group.title}</div>${rows}`;
    })
    .join("");

  paletteResults.innerHTML =
    html ||
    `<div class="palette-empty">No matches for “${esc(
      query
    )}”. Try a patient name or specialisation.</div>`;
}

function highlightPaletteItem() {
  $$(".palette-item", paletteResults).forEach((item) => {
    item.classList.toggle(
      "selected",
      Number(item.dataset.index) === paletteActive
    );
  });
  const current = paletteResults.querySelector(".palette-item.selected");
  if (current) current.scrollIntoView({ block: "nearest" });
}

async function refreshPalette() {
  const query = paletteInput.value.trim();
  const token = (searchToken += 1);

  const pages = QUICK_PAGES.filter((page) => {
    if (!query) return true;
    const haystack = `${page.label} ${page.sub} ${page.keywords}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  let patients = [];
  let doctors = [];

  if (query.length >= 2) {
    try {
      const data = await api(`/api/search?q=${encodeURIComponent(query)}`);
      if (token !== searchToken) return;
      patients = data.patients || [];
      doctors = data.doctors || [];
    } catch (err) {
      if (token !== searchToken) return;
    }
  }

  if (token !== searchToken) return;

  const groups = [
    {
      title: "Pages",
      items: pages.map((page) => ({ ...page, kind: "page" })),
    },
    {
      title: "Patients",
      items: patients.map((patient) => ({
        kind: "patient",
        label: patient.full_name,
        sub: `Patient #${patient.patient_id} · ${
          patient.latest_condition || "No diagnosis recorded"
        }`,
        href: `#/patients/${patient.patient_id}`,
      })),
    },
    {
      title: "Doctors",
      items: doctors.map((doctor) => ({
        kind: "doctor",
        label: doctor.doctor_name,
        sub: `${doctor.specialization} · ${doctor.dept_name}`,
        href: "#/doctors",
      })),
    },
  ];

  paletteItems = groups.flatMap((group) => group.items);
  paletteActive = 0;
  renderPalette(groups, query);
}

function openPalette() {
  palette.hidden = false;
  document.body.style.overflow = "hidden";
  paletteInput.value = "";
  paletteActive = 0;
  refreshPalette();
  setTimeout(() => paletteInput.focus(), 20);
}

function closePalette() {
  palette.hidden = true;
  paletteInput.blur();
  if (!document.querySelector(".modal-overlay")) {
    document.body.style.overflow = "";
  }
}

function openPaletteItem(item) {
  if (!item) return;
  closePalette();
  if (item.href) {
    const next = item.href.slice(1);
    if (location.hash !== item.href) {
      location.hash = next;
    }
  }
}

$("#search-trigger").addEventListener("click", openPalette);
palette.addEventListener("click", (event) => {
  if (event.target.closest("[data-close]")) closePalette();
});
paletteResults.addEventListener("click", (event) => {
  const button = event.target.closest(".palette-item");
  if (!button) return;
  openPaletteItem(paletteItems[Number(button.dataset.index)]);
});

paletteInput.addEventListener("input", debounce(refreshPalette, 170));

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (palette.hidden) openPalette();
    else closePalette();
    return;
  }

  if (event.key === "Escape") {
    if (!palette.hidden) closePalette();
    closeNavigation();
    return;
  }

  if (palette.hidden) return;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    paletteActive = Math.min(paletteActive + 1, paletteItems.length - 1);
    highlightPaletteItem();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    paletteActive = Math.max(paletteActive - 1, 0);
    highlightPaletteItem();
  } else if (event.key === "Enter") {
    event.preventDefault();
    openPaletteItem(paletteItems[paletteActive]);
  }
});

/* ---------- router ---------- */

const pageTitle = $("#page-title");
const pageSubtitle = $("#page-subtitle");

startRouter($("#view"), {
  onRoute(route) {
    $$(".nav-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.nav === route.nav);
    });
    pageTitle.textContent = route.title;
    pageSubtitle.textContent = route.subtitle;
    document.title = `${route.documentTitle} — MediCare`;
    closeNavigation();
  },
});
