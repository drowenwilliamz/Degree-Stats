const raw = window.DEGREE_RESULTS_DATA;
const modules = raw.modules.map((item) => ({
  ...item,
  key: `${item.level}|${item.code || item.module}`,
  searchable: `${item.year} ${item.level} ${item.code} ${item.module}`.toLowerCase(),
}));

const colours = ["#2d6cdf", "#16715f", "#b88217", "#c94444", "#6750a4", "#46636f"];
const metricLabels = {
  mean: "Mean",
  median: "Median",
  passRate: "Pass %",
  failRate: "Fail %",
  firstRate: "70+ %",
  upperSecondRate: "60+ %",
  stdev: "St dev",
};

const els = {
  sourceSummary: document.querySelector("#sourceSummary"),
  levelFilter: document.querySelector("#levelFilter"),
  yearFilter: document.querySelector("#yearFilter"),
  metricFilter: document.querySelector("#metricFilter"),
  shiftMetric: document.querySelector("#shiftMetric"),
  searchFilter: document.querySelector("#searchFilter"),
  moduleSelect: document.querySelector("#moduleSelect"),
  bridgeMetric: document.querySelector("#bridgeMetric"),
  kpis: document.querySelector("#kpis"),
  shiftChart: document.querySelector("#shiftChart"),
  outlierList: document.querySelector("#outlierList"),
  trendChart: document.querySelector("#trendChart"),
  thresholdChart: document.querySelector("#thresholdChart"),
  normalRefChart: document.querySelector("#normalRefChart"),
  densityChart: document.querySelector("#densityChart"),
  qqChart: document.querySelector("#qqChart"),
  reportBullets: document.querySelector("#reportBullets"),
  histChart: document.querySelector("#histChart"),
  boxChart: document.querySelector("#boxChart"),
  ecdfChart: document.querySelector("#ecdfChart"),
  bandChart: document.querySelector("#bandChart"),
  selectedMeta: document.querySelector("#selectedMeta"),
  moduleDetail: document.querySelector("#moduleDetail"),
  moduleTable: document.querySelector("#moduleTable"),
  bridgeChart: document.querySelector("#bridgeChart"),
  exportCsv: document.querySelector("#exportCsv"),
};

function unique(values) {
  return [...new Set(values)].filter(Boolean);
}

function fmt(value, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${Number(value).toFixed(Number(value) % 1 ? 1 : 0)}${suffix}`;
}

function pct(value) {
  return fmt(value, "%");
}

function normalPdf(x, mean, sd) {
  if (!sd) return 0;
  const z = (x - mean) / sd;
  return Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
}

function normalQuantile(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425;
  const phigh = 1 - plow;
  if (p <= 0 || p >= 1) return 0;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > phigh) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

function kde(values, x) {
  if (!values.length) return 0;
  const sd = Math.max(1, values.length > 1 ? Math.sqrt(values.reduce((sum, value) => sum + (value - values.reduce((a, b) => a + b, 0) / values.length) ** 2, 0) / (values.length - 1)) : 8);
  const bandwidth = Math.max(4, 1.06 * sd * values.length ** -0.2);
  return values.reduce((sum, value) => sum + normalPdf(x, value, bandwidth), 0) / values.length;
}

function selectedModuleRecords() {
  const selected = els.moduleSelect.value;
  return modules
    .filter((m) => (m.code || m.module) === selected)
    .sort((a, b) => a.yearCode.localeCompare(b.yearCode));
}

function levelYearBaseline(record, metric = "mean") {
  return weightedMean(
    modules.filter((m) => m.level === record.level && m.year === record.year && m !== record),
    metric
  );
}

function moduleComparisons(records = modules, metric = "mean") {
  const groups = new Map();
  records.forEach((m) => {
    const key = m.code || m.module;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  });
  const comparisons = [];
  groups.forEach((items) => {
    items.sort((a, b) => a.yearCode.localeCompare(b.yearCode));
    for (let i = 1; i < items.length; i += 1) {
      const previous = items[i - 1];
      const current = items[i];
      const delta = (current.stats[metric] ?? 0) - (previous.stats[metric] ?? 0);
      comparisons.push({
        module: current.module,
        code: current.code,
        level: current.level,
        from: previous.year,
        to: current.year,
        delta,
        current,
        previous,
      });
    }
  });
  return comparisons.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

function recordWithContext(record) {
  const baseline = levelYearBaseline(record, "mean");
  return {
    ...record,
    meanDelta: null,
    baseline,
    residual: baseline === null ? null : record.stats.mean - baseline,
  };
}

function recordsWithDeltas(records) {
  const comparisons = moduleComparisons(modules, "mean");
  const deltas = new Map(comparisons.map((item) => [`${item.current.yearCode}|${item.current.code || item.current.module}`, item.delta]));
  return records.map((record) => ({
    ...recordWithContext(record),
    meanDelta: deltas.get(`${record.yearCode}|${record.code || record.module}`) ?? null,
  }));
}

function populateFilters() {
  const levels = ["All levels", ...unique(modules.map((m) => m.level))];
  const years = ["All years", ...unique(modules.map((m) => m.year))];
  els.levelFilter.innerHTML = levels.map((level) => `<option>${level}</option>`).join("");
  els.yearFilter.innerHTML = years.map((year) => `<option>${year}</option>`).join("");
  els.sourceSummary.textContent = `${modules.length} module-year records from ${raw.sourceFiles.join(", ")}${raw.yearSources?.["2526"] ? " · 2025/26 post-resit · earlier years pending validation" : ""}`;
}

function filteredModules() {
  const level = els.levelFilter.value;
  const year = els.yearFilter.value;
  const query = els.searchFilter.value.trim().toLowerCase();
  return modules.filter((m) => {
    return (
      (level === "All levels" || m.level === level) &&
      (year === "All years" || m.year === year) &&
      (!query || m.searchable.includes(query))
    );
  });
}

function weightedMean(records, metric) {
  let total = 0;
  let n = 0;
  records.forEach((record) => {
    const value = record.stats[metric];
    if (value !== null && value !== undefined) {
      total += value * record.stats.n;
      n += record.stats.n;
    }
  });
  return n ? total / n : null;
}

function renderKpis(records) {
  const shifts = moduleComparisons(records, "mean");
  const biggest = shifts[0];
  const students = records.reduce((sum, m) => sum + m.stats.n, 0);
  const kpis = [
    ["Records", records.length],
    ["Module marks", students],
    ["Weighted mean", fmt(weightedMean(records, "mean"))],
    ["Largest shift", biggest ? `${biggest.delta > 0 ? "+" : ""}${fmt(biggest.delta)}` : "-"],
  ];
  els.kpis.innerHTML = kpis
    .map(([label, value]) => `<div class="kpi"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function renderShiftChart(records) {
  const metric = els.shiftMetric.value;
  const shifts = moduleComparisons(records, metric).slice(0, 12).reverse();
  if (!shifts.length) {
    els.shiftChart.innerHTML = `<div class="empty">Choose all years, or a wider filter, to see year-to-year shifts.</div>`;
    return;
  }
  const width = 760;
  const height = 34 * shifts.length + 54;
  const left = 250;
  const right = 58;
  const mid = left + (width - left - right) / 2;
  const scale = Math.max(1, ...shifts.map((s) => Math.abs(s.delta)));
  const unit = (width - left - right) / 2 / scale;
  els.shiftChart.innerHTML = svg(
    width,
    height,
    `
      <line class="axis" x1="${mid}" y1="18" x2="${mid}" y2="${height - 24}"></line>
      ${shifts.map((s, i) => {
        const y = 30 + i * 34;
        const w = Math.abs(s.delta) * unit;
        const x = s.delta >= 0 ? mid : mid - w;
        const colour = s.delta >= 0 ? "#16715f" : "#c94444";
        return `
          <text class="label" x="6" y="${y + 5}">${s.module.slice(0, 36)} (${s.to.replace("20", "").replace("/20", "/")})</text>
          <rect x="${x}" y="${y - 9}" width="${Math.max(2, w)}" height="18" rx="4" fill="${colour}"></rect>
          <text class="value-label" x="${s.delta >= 0 ? x + w + 6 : x - 6}" y="${y + 5}" text-anchor="${s.delta >= 0 ? "start" : "end"}">${s.delta > 0 ? "+" : ""}${fmt(s.delta, metric.includes("Rate") ? " pts" : "")}</text>
        `;
      }).join("")}
    `
  );
}

function renderOutlierList(records) {
  const ranked = recordsWithDeltas(records)
    .filter((m) => m.residual !== null && m.stats.n >= 5)
    .sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual))
    .slice(0, 8);
  els.outlierList.innerHTML = ranked.map((m) => {
    const cls = m.residual > 4 ? "up" : m.residual < -4 ? "down" : "neutral";
    const label = `${m.residual > 0 ? "+" : ""}${fmt(m.residual)}`;
    return `
      <div class="watch-item">
        <div>
          <strong>${m.module}</strong>
          <div class="muted">${m.year} · ${m.level} · mean ${fmt(m.stats.mean)} vs level norm ${fmt(m.baseline)} · n=${m.stats.n}</div>
        </div>
        <span class="badge ${cls}">${label}</span>
      </div>
    `;
  }).join("");
}

function moduleOptions(records) {
  const grouped = new Map();
  records.forEach((m) => {
    const key = m.code || m.module;
    if (!grouped.has(key)) grouped.set(key, m);
  });
  const options = [...grouped.values()].sort((a, b) => a.module.localeCompare(b.module));
  const existing = els.moduleSelect.value;
  els.moduleSelect.innerHTML = options
    .map((m) => `<option value="${m.code || m.module}">${m.module}${m.code ? ` (${m.code})` : ""}</option>`)
    .join("");
  if (options.some((m) => (m.code || m.module) === existing)) {
    els.moduleSelect.value = existing;
  } else if (options.find((m) => /thermodynamics\s*&\s*combustion/i.test(m.module))) {
    const preferred = options.find((m) => /thermodynamics\s*&\s*combustion/i.test(m.module));
    els.moduleSelect.value = preferred.code || preferred.module;
  } else if (options.find((m) => /thermo/i.test(m.module))) {
    const preferred = options.find((m) => /thermo/i.test(m.module));
    els.moduleSelect.value = preferred.code || preferred.module;
  }
}

function svg(width, height, body) {
  return `<svg viewBox="0 0 ${width} ${height}" role="img">${body}</svg>`;
}

function renderTrend(records) {
  const metric = els.metricFilter.value;
  const series = selectedModuleRecords();
  if (!series.length) {
    els.trendChart.innerHTML = `<div class="empty">No module selected</div>`;
    return;
  }
  const width = 720;
  const height = 280;
  const pad = { top: 24, right: 24, bottom: 44, left: 48 };
  const values = series.flatMap((m) => [m.stats[metric] || 0, metric === "mean" ? (m.stats.mean || 0) + (m.stats.ci95 || 0) : 0]);
  const max = Math.max(75, Math.ceil(Math.max(...values) / 10) * 10);
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const step = innerW / Math.max(series.length - 1, 1);
  const points = series.map((m, i) => {
    const x = pad.left + i * step;
    const y = pad.top + innerH - ((m.stats[metric] || 0) / max) * innerH;
    return { x, y, m };
  });
  const line = points.map((p) => `${p.x},${p.y}`).join(" ");
  const yTicks = [0, max / 2, max];
  els.trendChart.innerHTML = svg(
    width,
    height,
    `
    <text class="label" x="${width / 2}" y="${height - 2}" text-anchor="middle">Academic year</text>
    <text class="label" x="14" y="${pad.top + innerH / 2}" transform="rotate(-90 14 ${pad.top + innerH / 2})">${metricLabels[metric]}</text>
    ${yTicks.map((t) => {
      const y = pad.top + innerH - (t / max) * innerH;
      return `<line class="tick" x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}"></line><text class="label" x="8" y="${y + 4}">${fmt(t)}</text>`;
    }).join("")}
    <polyline points="${line}" fill="none" stroke="${colours[0]}" stroke-width="3"></polyline>
    ${points.map((p, i) => `
      ${metric === "mean" ? `<line x1="${p.x}" x2="${p.x}" y1="${pad.top + innerH - (((p.m.stats.mean || 0) + (p.m.stats.ci95 || 0)) / max) * innerH}" y2="${pad.top + innerH - (((p.m.stats.mean || 0) - (p.m.stats.ci95 || 0)) / max) * innerH}" stroke="#667085" stroke-width="2"></line>` : ""}
      <circle cx="${p.x}" cy="${p.y}" r="5" fill="${colours[i % colours.length]}"></circle>
      <text class="value-label" x="${p.x}" y="${p.y - 10}" text-anchor="middle">${fmt(p.m.stats[metric])}</text>
      <text class="label" x="${p.x}" y="${height - 14}" text-anchor="middle">${p.m.year.replace("20", "").replace("/20", "/")}</text>
    `).join("")}
    <text class="label" x="${pad.left}" y="16">${metricLabels[metric]} by year</text>
  `
  );
}

function renderBands() {
  const records = selectedModuleRecords();
  const width = 560;
  const height = 260;
  const labels = ["Fail", "40s", "50s", "60s", "70+"];
  const fills = ["#c94444", "#b88217", "#46636f", "#16715f", "#2d6cdf"];
  const barW = 70;
  const gap = 52;
  const base = 212;
  els.bandChart.innerHTML = svg(
    width,
    height,
    `
      <text class="label" x="8" y="16">Grade-band proportions (% of cohort)</text>
      <text class="label" x="18" y="126" transform="rotate(-90 18 126)">Percentage of cohort</text>
      <text class="label" x="210" y="${height - 2}" text-anchor="middle">Academic year</text>
      ${records.map((record, i) => {
        const total = Math.max(1, record.stats.n);
        let y = base;
        const x = 70 + i * (barW + gap);
        const parts = record.stats.bandCounts.map((count, j) => {
          const h = (count / total) * 160;
          y -= h;
          return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${fills[j]}"></rect>`;
        }).join("");
        return `${parts}<text class="label" x="${x + barW / 2}" y="${base + 22}" text-anchor="middle">${record.year.replace("20", "").replace("/20", "/")}</text>`;
      }).join("")}
      ${labels.map((label, i) => `<rect x="${392}" y="${40 + i * 24}" width="12" height="12" fill="${fills[i]}"></rect><text class="label" x="412" y="${51 + i * 24}">${label}</text>`).join("")}
    `
  );
}

function renderThresholdChart() {
  const records = selectedModuleRecords();
  const thresholds = [
    ["Pass (>=40)", (r) => r.stats.passRate, "#16715f"],
    ["50+ band", (r) => (r.marks.filter((v) => v >= 50).length / r.marks.length) * 100, "#46636f"],
    ["60+ band", (r) => r.stats.upperSecondRate, "#b88217"],
    ["First (>=70)", (r) => r.stats.firstRate, "#2d6cdf"],
  ];
  const width = 620;
  const height = 270;
  const pad = { top: 48, right: 26, bottom: 42, left: 42 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const step = innerW / Math.max(records.length - 1, 1);
  function y(value) {
    return pad.top + innerH - (value / 100) * innerH;
  }
  els.thresholdChart.innerHTML = svg(width, height, `
    <text class="label" x="8" y="16">Threshold attainment: % of cohort at or above each mark</text>
    <text class="label" x="${width / 2}" y="${height - 2}" text-anchor="middle">Academic year</text>
    <text class="label" x="14" y="${pad.top + innerH / 2}" transform="rotate(-90 14 ${pad.top + innerH / 2})">Percentage of cohort</text>
    ${thresholds.map(([label, getValue, colour], j) => {
      const x0 = 10 + (j % 2) * 150;
      const y0 = 31 + Math.floor(j / 2) * 16;
      return `<line x1="${x0}" y1="${y0}" x2="${x0 + 22}" y2="${y0}" stroke="${colour}" stroke-width="3"></line><text class="label" x="${x0 + 28}" y="${y0 + 4}">${label}</text>`;
    }).join("")}
    ${[0, 50, 100].map((t) => `<line class="tick" x1="${pad.left}" y1="${y(t)}" x2="${width - pad.right}" y2="${y(t)}"></line><text class="label" x="6" y="${y(t) + 4}">${t}%</text>`).join("")}
    ${thresholds.map(([label, getValue, colour], j) => {
      const pts = records.map((r, i) => `${pad.left + i * step},${y(getValue(r) || 0)}`).join(" ");
      return `<polyline points="${pts}" fill="none" stroke="${colour}" stroke-width="2.5"></polyline>${records.map((r, i) => `<circle cx="${pad.left + i * step}" cy="${y(getValue(r) || 0)}" r="3.5" fill="${colour}"></circle>`).join("")}`;
    }).join("")}
    ${records.map((r, i) => `<text class="label" x="${pad.left + i * step}" y="${height - 18}" text-anchor="middle">${r.year.replace("20", "").replace("/20", "/")}</text>`).join("")}
  `);
}

function renderNormalReference() {
  const records = selectedModuleRecords();
  const panelW = 280;
  const gap = 14;
  const width = 18 + records.length * panelW + Math.max(0, records.length - 1) * gap + 18;
  const height = 335;
  const pad = { top: 38, right: 18, bottom: 46, left: 42 };
  const binWidth = 10;
  const bins = Array.from({ length: 10 }, (_, i) => [i * 10, i * 10 + binWidth]);
  const panels = records.map((record, panelIndex) => {
    const x0 = 18 + panelIndex * (panelW + gap);
    const innerW = panelW - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const x = (mark) => x0 + pad.left + (mark / 100) * innerW;
    const counts = bins.map(([lo, hi]) => record.marks.filter((mark) => mark >= lo && mark < hi).length);
    const densities = counts.map((count) => count / (record.stats.n * binWidth));
    const normalValues = Array.from({ length: 101 }, (_, i) => normalPdf(i, record.stats.mean, record.stats.stdev));
    const yMax = Math.max(0.02, ...densities, ...normalValues) * 1.1;
    const y = (value) => pad.top + innerH - (value / yMax) * innerH;
    const curve = normalValues.map((value, i) => `${x(i)},${y(value)}`).join(" ");
    return `
      <g>
        <text class="value-label" x="${x0 + pad.left}" y="18">${record.year.replace("20", "")}: μ=${fmt(record.stats.mean)}, σ=${fmt(record.stats.stdev)}</text>
        <line class="tick" x1="${x0 + pad.left}" y1="${y(0)}" x2="${x0 + panelW - pad.right}" y2="${y(0)}"></line>
        ${[0, yMax / 2, yMax].map((tick) => `<line class="tick" x1="${x0 + pad.left}" y1="${y(tick)}" x2="${x0 + panelW - pad.right}" y2="${y(tick)}"></line><text class="label" x="${x0 + 4}" y="${y(tick) + 4}">${tick.toFixed(3).replace(/0$/, "")}</text>`).join("")}
        ${densities.map((density, i) => {
          const bx = x(bins[i][0]) + 2;
          const bw = innerW / bins.length - 4;
          return `<rect x="${bx}" y="${y(density)}" width="${bw}" height="${y(0) - y(density)}" fill="#76a9d6" stroke="#2f5f7c" stroke-width="1"></rect>`;
        }).join("")}
        <polyline points="${curve}" fill="none" stroke="#e85d04" stroke-width="3"></polyline>
        <line x1="${x(40)}" x2="${x(40)}" y1="${pad.top}" y2="${pad.top + innerH}" stroke="#667085" stroke-dasharray="4 4"></line>
        <text class="label" x="${x(42)}" y="${pad.top + 38}" transform="rotate(-90 ${x(42)} ${pad.top + 38})">Pass</text>
        <text class="label" x="${x0 + panelW / 2}" y="${height - 14}" text-anchor="middle">Mark (%)</text>
        <text class="label" x="${x0 + 12}" y="${pad.top + innerH / 2}" transform="rotate(-90 ${x0 + 12} ${pad.top + innerH / 2})">Probability density</text>
      </g>
    `;
  }).join("");
  els.normalRefChart.innerHTML = svg(width, height, panels);
}

function renderDensityReport() {
  const records = selectedModuleRecords();
  const width = 900;
  const height = 110 * records.length + 34;
  const pad = { top: 26, right: 24, bottom: 34, left: 92 };
  const innerW = width - pad.left - pad.right;
  const x = (mark) => pad.left + (mark / 100) * innerW;
  const xs = Array.from({ length: 101 }, (_, i) => i);
  const densities = records.map((record) => xs.map((mark) => kde(record.marks, mark)));
  const maxDensity = Math.max(0.01, ...densities.flat());
  const rows = records.map((record, i) => {
    const base = pad.top + 82 + i * 104;
    const pts = densities[i].map((density, j) => `${x(xs[j])},${base - (density / maxDensity) * 72}`).join(" ");
    const area = `${x(0)},${base} ${pts} ${x(100)},${base}`;
    return `
      <text class="label" x="10" y="${base - 28}">${record.year}</text>
      <path d="M ${area}" fill="${colours[i % colours.length]}" opacity="0.18"></path>
      <polyline points="${pts}" fill="none" stroke="${colours[i % colours.length]}" stroke-width="2.5"></polyline>
      <line x1="${x(record.stats.median)}" x2="${x(record.stats.median)}" y1="${base - 78}" y2="${base + 2}" stroke="#17202a" stroke-width="2"></line>
      <text class="value-label" x="${x(record.stats.median) + 5}" y="${base - 60}">median ${fmt(record.stats.median)}</text>
    `;
  }).join("");
  els.densityChart.innerHTML = svg(width, height, `
    <text class="label" x="${width / 2}" y="${height - 2}" text-anchor="middle">Mark (%)</text>
    <text class="label" x="14" y="${height / 2}" transform="rotate(-90 14 ${height / 2})">Academic year / relative density</text>
    ${[40, 60, 70].map((mark) => `<line class="tick" x1="${x(mark)}" y1="${pad.top}" x2="${x(mark)}" y2="${height - pad.bottom}"></line><text class="label" x="${x(mark)}" y="${height - 10}" text-anchor="middle">${mark}</text>`).join("")}
    ${rows}
  `);
}

function renderQqReport() {
  const records = selectedModuleRecords();
  const width = 900;
  const height = 300;
  const pad = { top: 28, right: 24, bottom: 38, left: 44 };
  const panelW = (width - 36) / Math.max(1, records.length);
  const panels = records.map((record, panelIndex) => {
    const sorted = [...record.marks].sort((a, b) => a - b);
    const theoretical = sorted.map((_, i) => record.stats.mean + record.stats.stdev * normalQuantile((i + 0.5) / sorted.length));
    const all = [...sorted, ...theoretical].filter(Number.isFinite);
    const min = Math.max(0, Math.min(...all) - 4);
    const max = Math.min(100, Math.max(...all) + 4);
    const x0 = 18 + panelIndex * panelW;
    const innerW = panelW - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const x = (value) => x0 + pad.left + ((value - min) / Math.max(1, max - min)) * innerW;
    const y = (value) => pad.top + innerH - ((value - min) / Math.max(1, max - min)) * innerH;
    return `
      <text class="value-label" x="${x0 + pad.left}" y="16">${record.year.replace("20", "")}</text>
      <line class="tick" x1="${x(min)}" y1="${y(min)}" x2="${x(max)}" y2="${y(max)}"></line>
      ${sorted.map((mark, i) => `<circle cx="${x(theoretical[i])}" cy="${y(mark)}" r="2.4" fill="${colours[panelIndex % colours.length]}" opacity="0.78"></circle>`).join("")}
      <text class="label" x="${x0 + panelW / 2}" y="${height - 10}" text-anchor="middle">Expected mark if normal (%)</text>
      <text class="label" x="${x0 + 12}" y="${pad.top + innerH / 2}" transform="rotate(-90 ${x0 + 12} ${pad.top + innerH / 2})">Observed mark (%)</text>
    `;
  }).join("");
  els.qqChart.innerHTML = svg(width, height, panels);
}

function renderReportBullets() {
  const records = selectedModuleRecords();
  const latest = records.at(-1);
  const previous = records.at(-2);
  const medians = records.map((r) => `${r.year.replace("20", "")} ${fmt(r.stats.median)} (${fmt(r.stats.iqr)})`).join("; ");
  const means = records.map((r) => `${r.year.replace("20", "")} ${fmt(r.stats.mean)} ± ${fmt(r.stats.stdev)}`).join("; ");
  const passRates = records.map((r) => `${r.year.replace("20", "")} ${pct(r.stats.passRate)}`).join("; ");
  const movement = latest && previous ? `${latest.year} mean is ${latest.stats.mean - previous.stats.mean >= 0 ? "up" : "down"} ${fmt(Math.abs(latest.stats.mean - previous.stats.mean))} marks versus ${previous.year}.` : "Only one year is available for this module.";
  els.reportBullets.innerHTML = [
    `Median (IQR): ${medians}.`,
    `Mean ± SD: ${means}.`,
    `Pass rate (≥40%): ${passRates}.`,
    movement,
  ].map((note) => `<div class="report-note">${note}</div>`).join("");
}

function renderHistogram() {
  const records = selectedModuleRecords();
  const bins = Array.from({ length: 10 }, (_, i) => [i * 10, i * 10 + 9]);
  const width = 640;
  const height = 285;
  const pad = { top: 28, right: 18, bottom: 40, left: 38 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const counts = records.map((r) => bins.map(([lo, hi]) => r.marks.filter((v) => v >= lo && v <= hi).length));
  const max = Math.max(1, ...counts.flat());
  const groupW = innerW / bins.length;
  const barW = groupW / Math.max(records.length, 1) - 2;
  els.histChart.innerHTML = svg(width, height, `
    <text class="label" x="8" y="16">Histogram by year (student counts)</text>
    <text class="label" x="${width / 2}" y="${height - 2}" text-anchor="middle">Mark bin lower edge (%)</text>
    <text class="label" x="14" y="${pad.top + innerH / 2}" transform="rotate(-90 14 ${pad.top + innerH / 2})">Number of students</text>
    ${[0, Math.ceil(max / 2), max].map((t) => {
      const yy = pad.top + innerH - (t / max) * innerH;
      return `<line class="tick" x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}"></line><text class="label" x="8" y="${yy + 4}">${t}</text>`;
    }).join("")}
    ${counts.map((row, yearIndex) => row.map((count, binIndex) => {
      const h = (count / max) * innerH;
      const x = pad.left + binIndex * groupW + yearIndex * (barW + 2);
      return `<rect x="${x}" y="${pad.top + innerH - h}" width="${Math.max(2, barW)}" height="${h}" fill="${colours[yearIndex % colours.length]}" opacity="0.82"></rect>`;
    }).join("")).join("")}
    ${bins.map(([lo], i) => `<text class="label" x="${pad.left + i * groupW + groupW / 2}" y="${height - 18}" text-anchor="middle">${lo}</text>`).join("")}
  `);
}

function renderBoxPlot() {
  const records = selectedModuleRecords();
  const width = 640;
  const height = 285;
  const pad = { top: 28, right: 24, bottom: 40, left: 44 };
  const innerH = height - pad.top - pad.bottom;
  const step = (width - pad.left - pad.right) / Math.max(records.length, 1);
  function y(value) {
    return pad.top + innerH - (value / 100) * innerH;
  }
  els.boxChart.innerHTML = svg(width, height, `
    <text class="label" x="8" y="16">Box and marks</text>
    <text class="label" x="${width / 2}" y="${height - 2}" text-anchor="middle">Academic year</text>
    <text class="label" x="14" y="${pad.top + innerH / 2}" transform="rotate(-90 14 ${pad.top + innerH / 2})">Mark (%)</text>
    ${[0, 40, 70, 100].map((t) => `<line class="tick" x1="${pad.left}" y1="${y(t)}" x2="${width - pad.right}" y2="${y(t)}"></line><text class="label" x="8" y="${y(t) + 4}">${t}</text>`).join("")}
    ${records.map((r, i) => {
      const x = pad.left + step * i + step / 2;
      const boxW = 44;
      const marks = r.marks.map((mark, j) => `<circle cx="${x - 23 + ((j * 17) % 46)}" cy="${y(mark)}" r="2.4" fill="${colours[i % colours.length]}" opacity="0.5"></circle>`).join("");
      return `
        ${marks}
        <line x1="${x}" x2="${x}" y1="${y(r.stats.min)}" y2="${y(r.stats.max)}" stroke="#344054"></line>
        <rect x="${x - boxW / 2}" y="${y(r.stats.q3)}" width="${boxW}" height="${Math.max(2, y(r.stats.q1) - y(r.stats.q3))}" fill="#ffffff" stroke="#344054" stroke-width="1.5"></rect>
        <line x1="${x - boxW / 2}" x2="${x + boxW / 2}" y1="${y(r.stats.median)}" y2="${y(r.stats.median)}" stroke="#c94444" stroke-width="2.5"></line>
        <text class="label" x="${x}" y="${height - 18}" text-anchor="middle">${r.year.replace("20", "").replace("/20", "/")}</text>
      `;
    }).join("")}
  `);
}

function renderEcdf() {
  const records = selectedModuleRecords();
  const width = 640;
  const height = 285;
  const pad = { top: 28, right: 24, bottom: 40, left: 44 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (value) => pad.left + (value / 100) * innerW;
  const y = (value) => pad.top + innerH - value * innerH;
  els.ecdfChart.innerHTML = svg(width, height, `
    <text class="label" x="8" y="16">ECDF: proportion at or below mark</text>
    <text class="label" x="${width / 2}" y="${height - 2}" text-anchor="middle">Mark threshold (%)</text>
    <text class="label" x="14" y="${pad.top + innerH / 2}" transform="rotate(-90 14 ${pad.top + innerH / 2})">Cumulative share of cohort</text>
    ${[0, 0.5, 1].map((t) => `<line class="tick" x1="${pad.left}" y1="${y(t)}" x2="${width - pad.right}" y2="${y(t)}"></line><text class="label" x="6" y="${y(t) + 4}">${Math.round(t * 100)}%</text>`).join("")}
    ${[40, 60, 70].map((t) => `<line class="tick" x1="${x(t)}" y1="${pad.top}" x2="${x(t)}" y2="${pad.top + innerH}"></line><text class="label" x="${x(t)}" y="${height - 18}" text-anchor="middle">${t}</text>`).join("")}
    ${records.map((r, i) => {
      const sorted = [...r.marks].sort((a, b) => a - b);
      const pts = sorted.map((mark, j) => `${x(mark)},${y((j + 1) / sorted.length)}`).join(" ");
      return `<polyline points="${pts}" fill="none" stroke="${colours[i % colours.length]}" stroke-width="2.5"></polyline><text class="label" x="${width - 92}" y="${30 + i * 18}" fill="${colours[i % colours.length]}">${r.year}</text>`;
    }).join("")}
  `);
}

function oldRenderBandsUnused() {
  const selected = els.moduleSelect.value;
  const records = modules.filter((m) => (m.code || m.module) === selected);
  const marks = records.flatMap((m) => m.marks);
  const bands = [
    ["0-39", marks.filter((v) => v < 40).length, "#c94444"],
    ["40-49", marks.filter((v) => v >= 40 && v < 50).length, "#b88217"],
    ["50-59", marks.filter((v) => v >= 50 && v < 60).length, "#46636f"],
    ["60-69", marks.filter((v) => v >= 60 && v < 70).length, "#16715f"],
    ["70+", marks.filter((v) => v >= 70).length, "#2d6cdf"],
  ];
  const width = 480;
  const height = 270;
  const max = Math.max(1, ...bands.map((b) => b[1]));
  const barW = 58;
  const gap = 32;
  const base = 226;
  els.bandChart.innerHTML = svg(
    width,
    height,
    bands.map(([label, count, colour], i) => {
      const x = 42 + i * (barW + gap);
      const h = (count / max) * 170;
      return `
        <rect x="${x}" y="${base - h}" width="${barW}" height="${h}" rx="5" fill="${colour}"></rect>
        <text class="value-label" x="${x + barW / 2}" y="${base - h - 8}" text-anchor="middle">${count}</text>
        <text class="label" x="${x + barW / 2}" y="${base + 22}" text-anchor="middle">${label}</text>
      `;
    }).join("")
  );
}

function renderDetail() {
  const records = selectedModuleRecords();
  const latest = records.at(-1);
  if (!latest) {
    els.moduleDetail.innerHTML = "";
    return;
  }
  els.selectedMeta.textContent = `${latest.module}${latest.code ? ` (${latest.code})` : ""} · ${latest.level} · ${fmt(latest.credits)} credits`;
  const statRows = [
    ["Latest N", latest.stats.n],
    ["Mean ± CI", `${fmt(latest.stats.mean)} ± ${fmt(latest.stats.ci95)}`],
    ["Median (IQR)", `${fmt(latest.stats.median)} (${fmt(latest.stats.iqr)})`],
    ["P10-P90", `${fmt(latest.stats.p10)}-${fmt(latest.stats.p90)}`],
    ["Pass", pct(latest.stats.passRate)],
    ["70+", pct(latest.stats.firstRate)],
  ];
  const rows = records
    .map((m, i) => {
      const previous = records[i - 1];
      const delta = previous ? m.stats.mean - previous.stats.mean : null;
      return `<tr><td>${m.year}</td><td>${m.stats.n}</td><td>${fmt(m.stats.mean)} ± ${fmt(m.stats.ci95)}</td><td>${fmt(m.stats.median)} (${fmt(m.stats.iqr)})</td><td>${pct(m.stats.passRate)}</td><td>${pct(m.stats.firstRate)}</td><td>${delta === null ? "-" : `${delta > 0 ? "+" : ""}${fmt(delta)}`}</td></tr>`;
    })
    .join("");
  els.moduleDetail.innerHTML = `
    <div class="stat-list">${statRows.map(([k, v]) => `<div class="stat"><span>${k}</span><strong>${v}</strong></div>`).join("")}</div>
    <div class="table-wrap"><table><thead><tr><th>Year</th><th>N</th><th>Mean ± CI</th><th>Median (IQR)</th><th>Pass</th><th>70+</th><th>YoY</th></tr></thead><tbody>${rows}</tbody></table></div>
  `;
}

function renderTable(records) {
  els.moduleTable.innerHTML = recordsWithDeltas(records)
    .slice()
    .sort((a, b) => a.level.localeCompare(b.level) || a.module.localeCompare(b.module) || a.yearCode.localeCompare(b.yearCode))
    .map((m) => `
      <tr>
        <td>${m.year}</td>
        <td>${m.level}</td>
        <td>${m.code || ""}</td>
        <td>${m.module}</td>
        <td>${m.stats.n}</td>
        <td>${fmt(m.stats.mean)}</td>
        <td>${fmt(m.stats.median)}</td>
        <td>${fmt(m.stats.passRate, "%")}</td>
        <td>${fmt(m.stats.firstRate, "%")}</td>
        <td>${m.meanDelta === null ? "-" : `${m.meanDelta > 0 ? "+" : ""}${fmt(m.meanDelta)}`}</td>
        <td>${m.residual === null ? "-" : `${m.residual > 0 ? "+" : ""}${fmt(m.residual)}`}</td>
        <td>${fmt(m.stats.stdev)}</td>
      </tr>
    `)
    .join("");
}

function bridgeGroup(moduleName) {
  const name = moduleName.toLowerCase();
  if (/math|analytical|statistics/.test(name)) return "Mathematics and analytics";
  if (/thermo|fluid|science|mechanics|dynamics/.test(name)) return "Engineering science, thermo and mechanics";
  if (/design|material|project|workshop|skill|lab/.test(name)) return "Design, projects and practical skills";
  if (/vehicle|auto|motorsport|motorcycle|electronic|control/.test(name)) return "Vehicle systems and technologies";
  return "Other";
}

function aggregate(records) {
  const marks = records.flatMap((m) => m.marks.map((mark) => ({ mark, weight: m.credits || 20 })));
  const values = marks.flatMap((item) => Array(Math.max(1, Math.round(item.weight / 10))).fill(item.mark));
  return {
    n: records.reduce((sum, m) => sum + m.stats.n, 0),
    mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
    passRate: values.length ? (values.filter((v) => v >= 40).length / values.length) * 100 : null,
    failRate: values.length ? (values.filter((v) => v < 40).length / values.length) * 100 : null,
    firstRate: values.length ? (values.filter((v) => v >= 70).length / values.length) * 100 : null,
  };
}

function renderBridge() {
  const metric = els.bridgeMetric.value;
  const l4 = modules.filter((m) => m.level === "Level 4");
  const years = unique(l4.map((m) => m.year));
  const groups = unique(l4.map((m) => bridgeGroup(m.module))).filter((group) => group !== "Other");
  els.bridgeChart.innerHTML = groups.map((group, index) => {
    const rows = years.map((year) => {
      const stats = aggregate(l4.filter((m) => m.year === year && bridgeGroup(m.module) === group));
      const value = stats[metric] || 0;
      const max = metric === "mean" ? 80 : 100;
      return `<div class="bar-row"><span class="muted">${year}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, (value / max) * 100)}%;background:${colours[index % colours.length]}"></div></div><strong>${fmt(value, metric === "mean" ? "" : "%")}</strong></div>`;
    }).join("");
    return `<div class="bridge-card"><h3>${group}</h3>${rows}</div>`;
  }).join("");
}

function exportCsv() {
  const header = ["Year", "Level", "Code", "Module", "Credits", "N", "Mean", "Median", "PassRate", "FailRate", "FirstRate", "StDev"];
  const lines = filteredModules().map((m) => [
    m.year, m.level, m.code, m.module, m.credits, m.stats.n, m.stats.mean, m.stats.median, m.stats.passRate, m.stats.failRate, m.stats.firstRate, m.stats.stdev,
  ]);
  const csv = [header, ...lines].map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "degree-module-stats.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

function render() {
  const records = filteredModules();
  renderKpis(records);
  moduleOptions(records);
  renderShiftChart(records);
  renderOutlierList(records);
  renderTrend(records);
  renderThresholdChart();
  renderNormalReference();
  renderDensityReport();
  renderQqReport();
  renderReportBullets();
  renderHistogram();
  renderBoxPlot();
  renderEcdf();
  renderBands();
  renderDetail();
  renderTable(records);
  renderBridge();
}

populateFilters();
render();

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab, .view").forEach((el) => el.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`#${tab.dataset.view}View`).classList.add("active");
  });
});

[els.levelFilter, els.yearFilter, els.metricFilter, els.shiftMetric, els.searchFilter, els.moduleSelect, els.bridgeMetric].forEach((el) => {
  el.addEventListener("input", render);
});
els.exportCsv.addEventListener("click", exportCsv);
