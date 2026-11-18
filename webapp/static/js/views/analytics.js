import { api } from "../api.js";
import { donut, lineChart } from "../charts.js";
import { icon } from "../icons.js";
import { esc, fmtCurrency } from "../ui.js";

function insightCard({ label, value, sub, iconName }) {
  return `<article class="card insight">
    <span class="insight-icon">${icon(iconName, 17)}</span>
    <div>
      <span>${esc(label)}</span>
      <strong>${esc(value)}</strong>
      <small>${esc(sub)}</small>
    </div>
  </article>`;
}

function splitRows(items, max) {
  return `<div class="split-bars">
    ${items
      .map(
        (item) => `<div class="split-row">
          <span>${esc(item.label)}</span>
          <span class="split-track">
            <span class="split-fill" style="width:${(
              (item.count / max) *
              100
            ).toFixed(1)}%"></span>
          </span>
          <span>${item.count}</span>
        </div>`
      )
      .join("")}
  </div>`;
}

export async function analyticsView(root) {
  const [analytics, revenue] = await Promise.all([
    api("/api/analytics"),
    api("/api/revenue"),
  ]);

  const weekly = analytics.weekly;
  const statusTotal =
    Object.values(analytics.status).reduce((sum, count) => sum + count, 0) || 0;

  const statusItems = [
    { label: "Scheduled", value: analytics.status.scheduled || 0, color: "#60a5fa" },
    { label: "Completed", value: analytics.status.completed || 0, color: "#10b981" },
    { label: "Cancelled", value: analytics.status.cancelled || 0, color: "#94a3b8" },
  ];

  const statusLegend = statusItems
    .map(
      (item) => `<div class="legend-row">
        <span class="legend-dot" style="background:${item.color}"></span>
        <span class="legend-name">${item.label}</span>
        <span class="legend-value">${item.value} · ${
        statusTotal ? Math.round((item.value / statusTotal) * 100) : 0
      }%</span>
      </div>`
    )
    .join("");

  const departments = revenue.departments.filter(
    (department) => department.total_billed > 0
  );
  const maxBilled = Math.max(
    1,
    ...departments.map((department) => department.total_billed)
  );

  const ageMax = Math.max(1, ...analytics.age.map((bucket) => bucket.count));
  const genderRows = [
    { label: "Female", count: analytics.gender.F || 0 },
    { label: "Male", count: analytics.gender.M || 0 },
    { label: "Other", count: analytics.gender.O || 0 },
  ].filter((row) => row.count > 0);
  const genderMax = Math.max(1, ...genderRows.map((row) => row.count));

  const totalBilled = analytics.totals.billed || 0;
  const collections = analytics.totals.collected || 0;
  const rate = analytics.totals.collection_rate || 0;

  root.innerHTML = `
    <section class="insight-grid" aria-label="Key insights">
      ${insightCard({
        label: "Collection rate",
        value: `${rate}%`,
        sub: `${fmtCurrency(collections)} of ${fmtCurrency(totalBilled)}`,
        iconName: "wallet",
      })}
      ${insightCard({
        label: "Average invoice",
        value: fmtCurrency(analytics.totals.avg_bill),
        sub: `${analytics.totals.bills} invoices raised`,
        iconName: "billing",
      })}
      ${insightCard({
        label: "Busiest department",
        value: analytics.top_department ? analytics.top_department.dept_name : "—",
        sub: analytics.top_department
          ? `${fmtCurrency(analytics.top_department.total_billed)} billed`
          : "No billing yet",
        iconName: "analytics",
      })}
      ${insightCard({
        label: "Busiest doctor",
        value:
          analytics.top_doctor && analytics.top_doctor.visits > 0
            ? analytics.top_doctor.name
            : "—",
        sub:
          analytics.top_doctor && analytics.top_doctor.visits > 0
            ? `${analytics.top_doctor.visits} appointments`
            : "No visits yet",
        iconName: "doctors",
      })}
    </section>

    <div class="grid-2">
      <article class="card chart-card">
        <div class="card-head">
          <div>
            <h2>Appointments per week</h2>
            <p class="card-sub">Last 8 weeks of visit volume</p>
          </div>
          <span class="hint">${weekly.appointments.reduce(
            (sum, value) => sum + value,
            0
          )} visits</span>
        </div>
        ${lineChart({
          labels: weekly.labels,
          series: [
            {
              name: "Appointments",
              values: weekly.appointments,
              color: "#60a5fa",
              area: true,
            },
          ],
          height: 250,
          formatY: (value) => String(Math.round(value)),
        })}
      </article>

      <article class="card">
        <div class="card-head">
          <div>
            <h2>Appointment status</h2>
            <p class="card-sub">Across every recorded visit</p>
          </div>
        </div>
        <div class="donut-body">
          ${donut({
            items: statusItems,
            size: 168,
            stroke: 21,
            centerValue: String(statusTotal),
            centerLabel: "appointments",
          })}
          <div class="legend">${statusLegend}</div>
        </div>
      </article>
    </div>

    <div class="grid-2">
      <article class="card">
        <div class="card-head">
          <div>
            <h2>Revenue by department</h2>
            <p class="card-sub">Billed amount and collection progress</p>
          </div>
          <a class="link-btn" href="#/billing">Open billing ${icon("chevronRight", 13)}</a>
        </div>
        ${
          departments.length
            ? `<div class="bar-list">${departments
                .map((department) => {
                  const collectionRate = department.total_billed
                    ? Math.round(
                        (department.total_collected / department.total_billed) * 100
                      )
                    : 0;
                  return `<div class="bar-row">
                    <div class="bar-info">
                      <strong>${esc(department.dept_name)}</strong>
                      <span>${fmtCurrency(
                        department.total_billed
                      )} · ${collectionRate}% collected</span>
                    </div>
                    <div class="progress">
                      <div class="progress-fill" style="width:${(
                        (department.total_billed / maxBilled) *
                        100
                      ).toFixed(1)}%"></div>
                    </div>
                  </div>`;
                })
                .join("")}</div>`
            : `<p class="empty">No billing data available.</p>`
        }
        <div class="section-title" style="margin-bottom:0">
          <p class="muted" style="font-size:12px">Outstanding: <strong class="text-rose">${fmtCurrency(
            analytics.totals.outstanding
          )}</strong></p>
          <p class="muted" style="font-size:12px">Upcoming scheduled visits: <strong>${
            analytics.upcoming
          }</strong></p>
        </div>
      </article>

      <article class="card">
        <div class="card-head">
          <div>
            <h2>Patient demographics</h2>
            <p class="card-sub">Age distribution and gender split</p>
          </div>
        </div>

        <h4 class="hint" style="margin-bottom:10px">Age groups</h4>
        ${splitRows(analytics.age, ageMax)}

        <hr class="divider" style="margin:18px 0">

        <h4 class="hint" style="margin-bottom:10px">Gender</h4>
        ${
          genderRows.length
            ? splitRows(genderRows, genderMax)
            : `<p class="muted" style="font-size:12.5px">No patient records yet.</p>`
        }
      </article>
    </div>`;
}
