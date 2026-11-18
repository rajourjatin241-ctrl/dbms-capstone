let gradientId = 0;

function nextId(prefix) {
  gradientId += 1;
  return `${prefix}${gradientId}`;
}

function compact(value) {
  const amount = Number(value) || 0;
  if (Math.abs(amount) >= 100000) {
    return `₹${(amount / 100000).toFixed(1).replace(/\.0$/, "")}L`;
  }
  if (Math.abs(amount) >= 1000) {
    return `₹${(amount / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return `₹${Math.round(amount)}`;
}

function niceCeil(value) {
  if (value <= 10) return Math.max(Math.ceil(value), 1);
  const power = Math.pow(10, Math.floor(Math.log10(value)));
  const fraction = value / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

export function sparkline(values, { width = 104, height = 34, color = "#14b8a6" } = {}) {
  const numbers = (values?.length ? values : [0]).map(Number);
  const max = Math.max(...numbers, 1);
  const min = Math.min(...numbers, 0);
  const range = max - min || 1;
  const step = numbers.length > 1 ? width / (numbers.length - 1) : width;

  const points = numbers.map((value, index) => {
    const x = index * step;
    const y = height - 2 - ((value - min) / range) * (height - 7);
    return [x, y];
  });

  const line = points
    .map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const id = nextId("spark");
  const [lastX, lastY] = points[points.length - 1];

  return `<svg class="sparkline" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style="stop-color:${color};stop-opacity:.30"/>
        <stop offset="1" style="stop-color:${color};stop-opacity:0"/>
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#${id})"/>
    <path d="${line}" fill="none" style="stroke:${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="2.6" style="fill:${color}"/>
  </svg>`;
}

export function lineChart({
  labels = [],
  series = [],
  height = 260,
  formatY = compact,
}) {
  const width = 720;
  const padding = { left: 46, right: 14, top: 14, bottom: 30 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const allValues = series.flatMap((entry) => entry.values.map(Number));
  const maxValue = Math.max(...allValues, 1);
  let top = niceCeil(maxValue);
  const integerSeries = allValues.every((value) => Number.isInteger(value));
  let tickValues = [0, 0.25, 0.5, 0.75, 1].map((ratio) => top * ratio);
  if (integerSeries && top <= 8) {
    top = Math.max(2, top);
    tickValues = Array.from({ length: top + 1 }, (_, index) => index);
  }
  const step =
    labels.length > 1 ? innerWidth / (labels.length - 1) : innerWidth;

  const xAt = (index) => padding.left + index * step;
  const yAt = (value) => padding.top + innerHeight - (Number(value) / top) * innerHeight;

  const grid = tickValues
    .map((value) => {
      const y = yAt(value);
      return `<line x1="${padding.left}" y1="${y.toFixed(1)}" x2="${width - padding.right}" y2="${y.toFixed(1)}" style="stroke:var(--line)" ${value === 0 ? "" : 'stroke-dasharray="3 5"'}/>
        <text x="${padding.left - 10}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" style="fill:var(--muted);font-size:10.5px">${formatY(value)}</text>`;
    })
    .join("");

  const xLabels = labels
    .map(
      (label, index) =>
        `<text x="${xAt(index).toFixed(1)}" y="${height - 8}" text-anchor="middle" style="fill:var(--muted);font-size:10.5px">${label}</text>`
    )
    .join("");

  const paths = series
    .map((entry) => {
      const values = entry.values.map(Number);
      const points = values.map((value, index) => [
        xAt(index),
        yAt(value),
      ]);
      const line = points
        .map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`)
        .join(" ");

      const areaId = nextId("area");
      const area = entry.area
        ? `<defs>
             <linearGradient id="${areaId}" x1="0" y1="0" x2="0" y2="1">
               <stop offset="0" style="stop-color:${entry.color};stop-opacity:.24"/>
               <stop offset="1" style="stop-color:${entry.color};stop-opacity:0"/>
             </linearGradient>
           </defs>
           <path d="${line} L${xAt(values.length - 1).toFixed(1)},${(padding.top + innerHeight).toFixed(1)} L${padding.left},${(padding.top + innerHeight).toFixed(1)} Z" fill="url(#${areaId})"/>`
        : "";

      const dots = values
        .map(
          (value, index) =>
            `<circle cx="${xAt(index).toFixed(1)}" cy="${yAt(value).toFixed(1)}" r="3.4" style="fill:var(--surface);stroke:${entry.color};stroke-width:2">
               <title>${entry.name} · ${labels[index] || ""}: ${formatY(value)}</title>
             </circle>`
        )
        .join("");

      return `${area}
        <path d="${line}" fill="none" style="stroke:${entry.color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
        ${dots}`;
    })
    .join("");

  return `<div class="chart-wrap">
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Trend chart">
      ${grid}
      ${xLabels}
      ${paths}
    </svg>
  </div>`;
}

export function donut({
  items = [],
  size = 176,
  stroke = 22,
  centerValue = "",
  centerLabel = "",
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = items.reduce((sum, item) => sum + (Number(item.value) || 0), 0);

  let offset = 0;
  const segments = items
    .map((item) => {
      const value = Number(item.value) || 0;
      if (value <= 0) return "";
      const length = (value / total) * circumference;
      const segment = `<circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none"
        style="stroke:${item.color}" stroke-width="${stroke}"
        stroke-dasharray="${length.toFixed(2)} ${(circumference - length).toFixed(2)}"
        stroke-dashoffset="${(-offset).toFixed(2)}"
        transform="rotate(-90 ${size / 2} ${size / 2})">
        <title>${item.label}: ${value} (${Math.round((value / total) * 100)}%)</title>
      </circle>`;
      offset += length;
      return segment;
    })
    .join("");

  const center = size / 2;
  const label = (centerLabel || "").toUpperCase();

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${centerLabel || "Distribution"}">
    <circle cx="${center}" cy="${center}" r="${radius}" fill="none" style="stroke:var(--line)" stroke-width="${stroke}"/>
    ${segments}
    <text x="${center}" y="${center - 1}" text-anchor="middle" style="fill:var(--ink);font-size:19px;font-weight:700;letter-spacing:-0.5px">${centerValue}</text>
    <text x="${center}" y="${center + 17}" text-anchor="middle" style="fill:var(--muted);font-size:9px;font-weight:600;letter-spacing:1px">${label}</text>
  </svg>`;
}

export function gauge({ percent = 0, size = 120, stroke = 11, color = "#14b8a6" }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.max(0, Math.min(100, percent)) / 100 * circumference;

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${percent}%">
    <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" style="stroke:var(--line)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" style="stroke:${color}" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${filled.toFixed(2)} ${(circumference - filled).toFixed(2)}"
      transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="${size / 2}" y="${size / 2 + 6}" text-anchor="middle" style="fill:var(--ink);font-size:22px;font-weight:700">${Math.round(percent)}%</text>
  </svg>`;
}
