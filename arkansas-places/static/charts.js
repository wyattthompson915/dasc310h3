/* Small hand-rolled SVG charts: a line chart and a county map. No libraries. */
const SVG = "http://www.w3.org/2000/svg";
const tip = () => document.getElementById("tooltip");

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

function showTip(html, evt) {
  const t = tip();
  t.innerHTML = html;
  t.hidden = false;
  const pad = 14, w = t.offsetWidth, h = t.offsetHeight;
  let x = evt.clientX + pad, y = evt.clientY + pad;
  if (x + w > innerWidth - 8) x = evt.clientX - w - pad;
  if (y + h > innerHeight - 8) y = evt.clientY - h - pad;
  t.style.left = x + "px";
  t.style.top = y + "px";
}
function hideTip() { tip().hidden = true; }

/* Round tick values covering [min, max]. */
function niceTicks(min, max, count = 4) {
  if (min === max) { min -= 1; max += 1; }
  const raw = (max - min) / count, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
  const ticks = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.999; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}

/* series: [{name, color, points: [{x, y}]}]   x is a year, y a number.
   opts: {format(y), zero: bool (force axis to include 0), refLine: number} */
function lineChart(container, series, opts = {}) {
  const fmt = opts.format || (v => v.toLocaleString());
  const W = 560, H = 240, m = { t: 12, r: 96, b: 26, l: 52 };
  container.classList.add("chart");
  container.innerHTML = "";
  series = series.filter(s => s.points.length);
  if (!series.length) { container.innerHTML = '<p class="empty">No data</p>'; return; }

  const xs = [...new Set(series.flatMap(s => s.points.map(p => p.x)))].sort((a, b) => a - b);
  const ys = series.flatMap(s => s.points.map(p => p.y));
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (opts.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  if (opts.refLine != null) { lo = Math.min(lo, opts.refLine); hi = Math.max(hi, opts.refLine); }
  const ticks = niceTicks(lo, hi);
  lo = ticks[0]; hi = ticks[ticks.length - 1];
  const x0 = xs[0], x1 = xs[xs.length - 1];
  const sx = x => m.l + (x1 === x0 ? 0.5 : (x - x0) / (x1 - x0)) * (W - m.l - m.r);
  const sy = y => H - m.b - (y - lo) / (hi - lo) * (H - m.t - m.b);

  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" }, container);
  for (const t of ticks) {
    el("line", { class: t === (opts.refLine ?? lo) ? "baseline" : "gridline", x1: m.l, x2: W - m.r, y1: sy(t), y2: sy(t) }, svg);
    el("text", { x: m.l - 8, y: sy(t) + 4, "text-anchor": "end" }, svg).textContent = fmt(t);
  }
  const every = Math.ceil(xs.length / 7);
  xs.forEach((x, i) => {
    if (i % every === 0 || i === xs.length - 1 && (xs.length - 1) % every >= every / 2)
      el("text", { x: sx(x), y: H - 6, "text-anchor": "middle" }, svg).textContent = x;
  });

  const cross = el("line", { class: "cross", y1: m.t, y2: H - m.b, visibility: "hidden" }, svg);
  const dots = [];
  const ends = [];
  for (const s of series) {
    const d = s.points.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join("");
    el("path", { d, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
    if (s.points.length <= 8) for (const p of s.points)
      el("circle", { cx: sx(p.x), cy: sy(p.y), r: 3.5, fill: s.color, stroke: "var(--surface)", "stroke-width": 2 }, svg);
    const last = s.points[s.points.length - 1];
    ends.push({ y: sy(last.y), text: series.length > 1 ? `${s.name} ${fmt(last.y)}` : fmt(last.y), x: sx(last.x) });
    dots.push(el("circle", { r: 5, fill: s.color, stroke: "var(--surface)", "stroke-width": 2, visibility: "hidden" }, svg));
  }
  // Direct labels at the line ends, nudged apart so they never overlap.
  ends.sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  for (const e of ends) el("text", { class: "endlabel", x: e.x + 8, y: e.y + 4 }, svg).textContent = e.text;

  // Hover: snap to the nearest year, show every series' value there.
  const hit = el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "transparent" }, svg);
  hit.addEventListener("mousemove", evt => {
    const box = svg.getBoundingClientRect();
    const px = (evt.clientX - box.left) / box.width * W;
    const x = xs.reduce((best, v) => Math.abs(sx(v) - px) < Math.abs(sx(best) - px) ? v : best, xs[0]);
    cross.setAttribute("x1", sx(x)); cross.setAttribute("x2", sx(x)); cross.setAttribute("visibility", "visible");
    let html = `<b>${x}</b>`;
    series.forEach((s, i) => {
      const p = s.points.find(q => q.x === x);
      dots[i].setAttribute("visibility", p ? "visible" : "hidden");
      if (!p) return;
      dots[i].setAttribute("cx", sx(p.x)); dots[i].setAttribute("cy", sy(p.y));
      html += `<div class="row"><span><i style="background:${s.color}"></i>${s.name}</span><span>${(opts.tipFormat || fmt)(p.y, p)}</span></div>`;
    });
    showTip(html, evt);
  });
  hit.addEventListener("mouseleave", () => {
    hideTip(); cross.setAttribute("visibility", "hidden");
    dots.forEach(d => d.setAttribute("visibility", "hidden"));
  });
}

/* ---- County map ---- */
const BLUES = ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab", "#0d366b"];
const MAP_METRICS = {
  population:     { label: "Population", fmt: v => v.toLocaleString(), scale: "quantile" },
  pop_change_pct: { label: "Population change", fmt: v => (v > 0 ? "+" : "") + v + "%",
                    bins: [-10, -5, 0, 5, 10],
                    colors: ["#b84a1e", "#eb6834", "#f6c3ad", "#b7d3f6", "#3987e5", "#184f95"],
                    binLabels: ["below −10%", "−10 to −5%", "−5 to 0%", "0 to +5%", "+5 to +10%", "above +10%"] },
  gop_margin:     { label: "Presidential margin", fmt: v => (v >= 0 ? "R+" : "D+") + Math.abs(v).toFixed(1),
                    bins: [-20, 0, 20, 40, 60],
                    colors: ["#1c5cab", "#86b6ef", "#f6c7c6", "#ec8f8e", "#e34948", "#a82a2a"],
                    binLabels: ["D+20 or more", "D+0 to 20", "R+0 to 20", "R+20 to 40", "R+40 to 60", "R+60 or more"] },
  density:        { label: "People per sq. mile", fmt: v => v.toLocaleString(), scale: "quantile" },
  median_age:     { label: "Median age", fmt: v => v.toFixed(1), scale: "quantile" },
  pct_65plus:     { label: "Age 65 and over", fmt: v => v + "%", scale: "quantile" },
  pct_black:      { label: "Black", fmt: v => v + "%", scale: "quantile" },
  pct_hispanic:   { label: "Hispanic", fmt: v => v + "%", scale: "quantile" },
  income:         { label: "Income per person (2019)", fmt: v => "$" + v.toLocaleString(), scale: "quantile" },
  poverty_rate:   { label: "Poverty rate (2019)", fmt: v => v + "%", scale: "quantile" },
  pct_bachelors:  { label: "Bachelor's degree or higher (2019)", fmt: v => v + "%", scale: "quantile" },
};

function drawMap(container, legendEl, geo, metricKey, onClick) {
  const metric = MAP_METRICS[metricKey];
  const values = geo.features.map(f => f.properties[metricKey]).filter(v => v != null).sort((a, b) => a - b);
  let bins = metric.bins, colors = metric.colors, labels = metric.binLabels;
  if (metric.scale === "quantile") {           // five equal-count groups
    bins = [1, 2, 3, 4].map(i => values[Math.floor(values.length * i / 5)]);
    colors = BLUES;
    const edges = [values[0], ...bins, values[values.length - 1]];
    labels = colors.map((_, i) => `${metric.fmt(edges[i])} – ${metric.fmt(edges[i + 1])}`);
  }
  const colorFor = v => v == null ? "var(--grid)" : colors[bins.filter(b => v >= b).length];

  // Flat projection, squeezed east-west by cos(latitude) so shapes look right.
  const k = Math.cos(34.8 * Math.PI / 180);
  const rings = g => g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  const pts = geo.features.flatMap(f => rings(f.geometry).flat(2));
  const minX = Math.min(...pts.map(p => p[0] * k)), maxX = Math.max(...pts.map(p => p[0] * k));
  const minY = Math.min(...pts.map(p => p[1])), maxY = Math.max(...pts.map(p => p[1]));
  const W = 400, s = W / (maxX - minX), H = (maxY - minY) * s;
  const proj = ([lon, lat]) => `${((lon * k - minX) * s).toFixed(1)},${((maxY - lat) * s).toFixed(1)}`;

  container.innerHTML = "";
  const svg = el("svg", { viewBox: `-2 -2 ${W + 4} ${H + 4}`, role: "img" }, container);
  for (const f of geo.features) {
    const d = rings(f.geometry).map(poly => poly.map(r => "M" + r.map(proj).join("L") + "Z").join("")).join("");
    const p = f.properties, v = p[metricKey];
    const path = el("path", { d, fill: colorFor(v), "data-id": f.id }, svg);
    path.addEventListener("mousemove", evt => showTip(
      `<b>${p.name}</b><div class="row"><span>${metric.label}</span><span>${v == null ? "n/a" : metric.fmt(v)}</span></div>`, evt));
    path.addEventListener("mouseleave", hideTip);
    path.addEventListener("click", () => { hideTip(); onClick(f.id); });
  }
  legendEl.innerHTML = colors.map((c, i) => `<span><i style="background:${c}"></i>${labels[i]}</span>`).join("");
}
