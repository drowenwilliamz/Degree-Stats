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
  searchFilter: document.querySelector("#searchFilter"),
  moduleSelect: document.querySelector("#moduleSelect"),
  bridgeMetric: document.querySelector("#bridgeMetric"),
  kpis: document.querySelector("#kpis"),
  trendChart: document.querySelector("#trendChart"),
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

function populateFilters() {
  const levels = ["All levels", ...unique(modules.map((m) => m.level))];
  const years = ["All years", ...unique(modules.map((m) => m.year))];
  els.levelFilter.innerHTML = levels.map((level) => `<option>${level}</option>`).join("");
  els.yearFilter.innerHTML = years.map((year) => `<option>${year}</option>`).join("");
  els.sourceSummary.textContent = `${modules.length} module-year records from ${raw.sourceFiles.join(", ")}`;
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
  const students = records.reduce((sum, m) => sum + m.stats.n, 0);
  const kpis = [
    ["Records", records.length],
    ["Module marks", students],
    ["Weighted mean", fmt(weightedMean(records, "mean"))],
    ["Weighted pass rate", fmt(weightedMean(records, "passRate"), "%")],
  ];
  els.kpis.innerHTML = kpis
    .map(([label, value]) => `<div class="kpi"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
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
  const selected = els.moduleSelect.value;
  const metric = els.metricFilter.value;
  const series = modules
    .filter((m) => (m.code || m.module) === selected)
    .sort((a, b) => a.yearCode.localeCompare(b.yearCode));
  if (!series.length) {
    els.trendChart.innerHTML = `<div class="empty">No module selected</div>`;
    return;
  }
  const width = 720;
  const height = 280;
  const pad = { top: 24, right: 24, bottom: 44, left: 48 };
  const values = series.map((m) => m.stats[metric] || 0);
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
    ${yTicks.map((t) => {
      const y = pad.top + innerH - (t / max) * innerH;
      return `<line class="tick" x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}"></line><text class="label" x="8" y="${y + 4}">${fmt(t)}</text>`;
    }).join("")}
    <polyline points="${line}" fill="none" stroke="${colours[0]}" stroke-width="3"></polyline>
    ${points.map((p, i) => `
      <circle cx="${p.x}" cy="${p.y}" r="5" fill="${colours[i % colours.length]}"></circle>
      <text class="value-label" x="${p.x}" y="${p.y - 10}" text-anchor="middle">${fmt(p.m.stats[metric])}</text>
      <text class="label" x="${p.x}" y="${height - 14}" text-anchor="middle">${p.m.year.replace("20", "").replace("/20", "/")}</text>
    `).join("")}
    <text class="label" x="${pad.left}" y="16">${metricLabels[metric]}</text>
  `
  );
}

function renderBands() {
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
  const selected = els.moduleSelect.value;
  const records = modules.filter((m) => (m.code || m.module) === selected).sort((a, b) => a.yearCode.localeCompare(b.yearCode));
  const latest = records.at(-1);
  if (!latest) {
    els.moduleDetail.innerHTML = "";
    return;
  }
  els.selectedMeta.textContent = `${latest.module}${latest.code ? ` (${latest.code})` : ""} · ${latest.level} · ${fmt(latest.credits)} credits`;
  const statRows = [
    ["Latest N", latest.stats.n],
    ["Latest mean", fmt(latest.stats.mean)],
    ["Latest median", fmt(latest.stats.median)],
    ["Latest pass", fmt(latest.stats.passRate, "%")],
    ["Latest 70+", fmt(latest.stats.firstRate, "%")],
    ["Latest spread", fmt(latest.stats.stdev)],
  ];
  const rows = records
    .map((m) => `<tr><td>${m.year}</td><td>${m.stats.n}</td><td>${fmt(m.stats.mean)}</td><td>${fmt(m.stats.passRate, "%")}</td><td>${fmt(m.stats.firstRate, "%")}</td></tr>`)
    .join("");
  els.moduleDetail.innerHTML = `
    <div class="stat-list">${statRows.map(([k, v]) => `<div class="stat"><span>${k}</span><strong>${v}</strong></div>`).join("")}</div>
    <div class="table-wrap"><table><thead><tr><th>Year</th><th>N</th><th>Mean</th><th>Pass</th><th>70+</th></tr></thead><tbody>${rows}</tbody></table></div>
  `;
}

function renderTable(records) {
  els.moduleTable.innerHTML = records
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
  renderTrend(records);
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

[els.levelFilter, els.yearFilter, els.metricFilter, els.searchFilter, els.moduleSelect, els.bridgeMetric].forEach((el) => {
  el.addEventListener("input", render);
});
els.exportCsv.addEventListener("click", exportCsv);
