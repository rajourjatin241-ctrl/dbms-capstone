import { api } from "../api.js";
import { icon } from "../icons.js";
import { donut, lineChart, sparkline } from "../charts.js";
import { openBookingModal, openPatientModal } from "../dialogs.js";
import {
  $,
  avatar,
  emptyState,
  esc,
  fmtCompact,
  fmtCurrency,
  fmtDate,
  greeting,
  statusBadge,
  weekdayShort,
} from "../ui.js";

function kpi({ label, value, foot, iconName, tone = "", spark = "" }) {
  return `<article class="card kpi">
    <div class="kpi-top">
      <span class="kpi-icon ${tone}">${icon(iconName, 18)}</span>
      <span class="kpi-label">${esc(label)}</span>
    </div>
    <div class="kpi-value">${esc(value)}</div>
    <div class="kpi-foot"><small>${esc(foot)}</small>${spark}</div>
  </article>`;
}

function statusLegend(status, total) {
  const rows = [
    ["scheduled", "Scheduled", "#60a5fa"],
    ["completed", "Completed", "#10b981"],
    ["cancelled", "Cancelled", "#94a3b8"],
  ];

  return rows
    .map(([key, label, color]) => {
      const count = status[key] || 0;
      const percent = total ? Math.round((count / total) * 100) : 0;
      return `<div class="legend-row">
        <span class="legend-dot" style="background:${color}"></span>
        <span class="legend-name">${label}</span>
        <span class="legend-value">${count} · ${percent}%</span>
      </div>`;
    })
    .join("");
}

export async function dashboardView(root) {
  async function load() {
    const [overview, analytics, appointmentsData, revenue, doctorsData] =
      await Promise.all([
        api("/api/overview"),
        api("/api/analytics"),
        api("/api/appointments"),
        api("/api/revenue"),
        api("/api/doctors"),
      ]);

    const appointments = appointmentsData.appointments;
    const scheduled = appointments
      .filter((appointment) => appointment.status === "scheduled")
      .sort((a, b) => a.appt_date.localeCompare(b.appt_date));
    const upcoming = scheduled.slice(0, 4);

    const weekly = analytics.weekly;
    const outstandingSeries = weekly.billed.map(
      (value, index) => value - weekly.collected[index]
    );
    const statusTotal =
      Object.values(analytics.status).reduce((sum, count) => sum + count, 0) || 0;

    const percentCollected = overview.billed
      ? Math.round((overview.collected / overview.billed) * 100)
      : 0;

    const now = new Date();
    const donutItems = [
      { label: "Scheduled", value: analytics.status.scheduled || 0, color: "#60a5fa" },
      { label: "Completed", value: analytics.status.completed || 0, color: "#10b981" },
      { label: "Cancelled", value: analytics.status.cancelled || 0, color: "#94a3b8" },
    ];

    const topDoctors = [...doctorsData.doctors]
      .sort((a, b) => b.total_appointments - a.total_appointments)
      .slice(0, 4);

    const departments = revenue.departments.filter((dept) => dept.total_billed > 0);
    const maxDeptBilled = Math.max(
      1,
      ...departments.map((dept) => dept.total_billed)
    );

    root.innerHTML = `
      <section class="hero">
        <div class="hero-copy">
          <span class="eyebrow">${icon("sparkles", 13)} Hospital overview</span>
          <h2>${esc(greeting())}, Dr. Jatin</h2>
          <p>Here is what is happening across MediCare today — ${scheduled.length} scheduled
             visit${scheduled.length === 1 ? "" : "s"} awaiting your team.</p>
          <div class="hero-actions">
            <button class="btn btn-primary" type="button" data-action="book">
              ${icon("plus", 16)} New appointment
            </button>
            <button class="btn btn-secondary" type="button" data-action="register">
              ${icon("userPlus", 16)} Register patient
            </button>
          </div>
        </div>
        <div class="hero-date" aria-hidden="true">
          <strong>${now.getDate()}</strong>
          <span>${now.toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</span>
          <small>${now.toLocaleDateString("en-IN", { weekday: "long" })}</small>
        </div>
      </section>

      <section class="kpi-grid" aria-label="Key metrics">
        ${kpi({
          label: "Patients",
          value: overview.patients,
          foot: `${overview.doctors} doctors · ${overview.departments} departments`,
          iconName: "patients",
        })}
        ${kpi({
          label: "Appointments",
          value: overview.appointments,
          foot: `${overview.scheduled} scheduled`,
          iconName: "calendar",
          tone: "tone-blue",
          spark: sparkline(weekly.appointments, { color: "#60a5fa" }),
        })}
        ${kpi({
          label: "Collected",
          value: fmtCurrency(overview.collected),
          foot: `of ${fmtCurrency(overview.billed)} billed · ${percentCollected}%`,
          iconName: "wallet",
          spark: sparkline(weekly.collected, { color: "#14b8a6" }),
        })}
        ${kpi({
          label: "Outstanding",
          value: fmtCurrency(overview.outstanding),
          foot: "pending payments",
          iconName: "alert",
          tone: "tone-amber",
          spark: sparkline(outstandingSeries, { color: "#f59e0b" }),
        })}
      </section>

      <div class="grid-2">
        <article class="card chart-card">
          <div class="card-head">
            <div>
              <h2>Revenue &amp; collections</h2>
              <p class="card-sub">Weekly billing activity over the last 8 weeks</p>
            </div>
            <div class="chart-legend">
              <span><i style="background:#14b8a6"></i> Billed</span>
              <span><i style="background:#60a5fa"></i> Collected</span>
            </div>
          </div>
          ${lineChart({
            labels: weekly.labels,
            series: [
              { name: "Billed", values: weekly.billed, color: "#14b8a6", area: true },
              { name: "Collected", values: weekly.collected, color: "#60a5fa" },
            ],
            height: 250,
          })}
        </article>

        <article class="card">
          <div class="card-head">
            <div>
              <h2>Appointment status</h2>
              <p class="card-sub">Distribution across all visits</p>
            </div>
          </div>
          <div class="donut-body">
            ${donut({
              items: donutItems,
              size: 168,
              stroke: 21,
              centerValue: String(statusTotal),
              centerLabel: "appointments",
            })}
            <div class="legend">${statusLegend(analytics.status, statusTotal)}</div>
          </div>
        </article>
      </div>

      <div class="grid-2">
        <article class="card">
          <div class="card-head">
            <div>
              <h2>Upcoming appointments</h2>
              <p class="card-sub">Next scheduled visits for the care team</p>
            </div>
            <a class="link-btn" href="#/appointments">View all ${icon("chevronRight", 13)}</a>
          </div>
          ${
            upcoming.length
              ? `<div class="list">${upcoming
                  .map((appointment) => {
                    const day = appointment.appt_date.slice(8, 10);
                    const month = new Date(
                      `${appointment.appt_date}T00:00:00`
                    ).toLocaleDateString("en-IN", { month: "short" });
                    return `<div class="list-item">
                      <div class="date-pill"><strong>${esc(day)}</strong><span>${esc(month)}</span></div>
                      <div class="list-main">
                        <strong>${esc(appointment.patient)}</strong>
                        <span>${esc(weekdayShort(appointment.appt_date))} · ${esc(
                      appointment.doctor
                    )} · ${esc(appointment.department)}</span>
                      </div>
                      ${statusBadge(appointment.status)}
                    </div>`;
                  })
                  .join("")}</div>`
              : emptyState({
                  iconName: "calendar",
                  title: "No upcoming visits",
                  text: "Book an appointment to fill the schedule.",
                })
          }
        </article>

        <article class="card">
          <div class="card-head">
            <div>
              <h2>Top doctors</h2>
              <p class="card-sub">By total appointments handled</p>
            </div>
            <a class="link-btn" href="#/doctors">All doctors ${icon("chevronRight", 13)}</a>
          </div>
          <div class="list">
            ${topDoctors
              .map(
                (doctor, index) => `<div class="list-item">
                  <span class="rank ${index === 0 ? "top" : ""}">${index + 1}</span>
                  ${avatar(doctor.doctor_name)}
                  <div class="list-main">
                    <strong>${esc(doctor.doctor_name)}</strong>
                    <span>${esc(doctor.specialization)} · ${esc(doctor.dept_name)}</span>
                  </div>
                  <span class="muted num" style="font-size:12px">${doctor.total_appointments} visits</span>
                </div>`
              )
              .join("")}
          </div>
        </article>
      </div>

      <article class="card">
        <div class="card-head">
          <div>
            <h2>Department performance</h2>
            <p class="card-sub">Billed revenue by department</p>
          </div>
          <a class="link-btn" href="#/analytics">Open analytics ${icon("chevronRight", 13)}</a>
        </div>
        ${
          departments.length
            ? `<div class="bar-list">${departments
                .map(
                  (dept) => `<div class="bar-row">
                    <div class="bar-info">
                      <strong>${esc(dept.dept_name)}</strong>
                      <span>${fmtCurrency(dept.total_billed)} billed · ${fmtCurrency(
                    dept.total_collected
                  )} collected</span>
                    </div>
                    <div class="progress">
                      <div class="progress-fill" style="width:${(
                        (dept.total_billed / maxDeptBilled) *
                        100
                      ).toFixed(1)}%"></div>
                    </div>
                  </div>`
                )
                .join("")}</div>`
            : emptyState({
                iconName: "analytics",
                title: "No billing data",
                text: "Department revenue appears once invoices are raised.",
              })
        }
      </article>`;

    root.querySelector('[data-action="book"]').addEventListener("click", () => {
      openBookingModal({ onDone: load });
    });
    root
      .querySelector('[data-action="register"]')
      .addEventListener("click", () => {
        openPatientModal({ onDone: load });
      });
  }

  await load();
}
