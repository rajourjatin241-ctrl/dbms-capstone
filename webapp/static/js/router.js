import { errorState, skeletonPage } from "./ui.js";
import { dashboardView } from "./views/dashboard.js";
import { patientsView } from "./views/patients.js";
import { patientView } from "./views/patient.js";
import { doctorsView } from "./views/doctors.js";
import { appointmentsView } from "./views/appointments.js";
import { billingView } from "./views/billing.js";
import { analyticsView } from "./views/analytics.js";
import { databaseView } from "./views/database.js";

export const routes = [
  {
    path: /^\/dashboard$/,
    nav: "dashboard",
    title: "Dashboard",
    subtitle: "Hospital overview",
    documentTitle: "Dashboard",
    view: dashboardView,
  },
  {
    path: /^\/patients$/,
    nav: "patients",
    title: "Patients",
    subtitle: "Patient directory and latest conditions",
    documentTitle: "Patients",
    view: patientsView,
  },
  {
    path: /^\/patients\/(\d+)$/,
    nav: "patients",
    title: "Patient profile",
    subtitle: "Medical history, prescriptions and billing",
    documentTitle: "Patient profile",
    view: patientView,
  },
  {
    path: /^\/doctors$/,
    nav: "doctors",
    title: "Doctors",
    subtitle: "Care team, specialisations and workload",
    documentTitle: "Doctors",
    view: doctorsView,
  },
  {
    path: /^\/appointments$/,
    nav: "appointments",
    title: "Appointments",
    subtitle: "Scheduled visits across the hospital",
    documentTitle: "Appointments",
    view: appointmentsView,
  },
  {
    path: /^\/billing$/,
    nav: "billing",
    title: "Billing",
    subtitle: "Invoices, payments and outstanding dues",
    documentTitle: "Billing",
    view: billingView,
  },
  {
    path: /^\/analytics$/,
    nav: "analytics",
    title: "Analytics",
    subtitle: "Operational and financial insights",
    documentTitle: "Analytics",
    view: analyticsView,
  },
  {
    path: /^\/database$/,
    nav: "database",
    title: "Database",
    subtitle: "All 9 SQLite tables with live rows",
    documentTitle: "Database",
    view: databaseView,
  },
];

export function startRouter(root, { onRoute } = {}) {
  async function render() {
    let path = location.hash.replace(/^#/, "");

    if (!path || path === "/") {
      history.replaceState(null, "", "#/dashboard");
      path = "/dashboard";
    }

    const matched = routes
      .map((route) => ({ route, match: route.path.exec(path) }))
      .find((entry) => entry.match);

    if (!matched) {
      history.replaceState(null, "", "#/dashboard");
      return render();
    }

    const { route, match } = matched;
    onRoute?.(route);

    root.innerHTML = skeletonPage();
    root.classList.remove("view-enter");
    void root.offsetWidth;
    root.classList.add("view-enter");

    try {
      await route.view(root, ...match.slice(1));
    } catch (err) {
      console.error(err);
      root.innerHTML = errorState(err.message);
    }

    window.scrollTo({ top: 0, behavior: "auto" });
  }

  window.addEventListener("hashchange", render);
  render();
}
