/*
 * charts.js — rendering Plotly: RRG (con assi simmetrici, tail sfumati, frecce di
 * direzione, animazione) e grafico trend base-100.
 */
const Charts = (() => {
  const CENTER = 100;

  // palette vivida ad alto contrasto (settori/azioni)
  const PALETTE = [
    '#f59e0b', '#3b82f6', '#22c55e', '#ef4444', '#a855f7', '#06b6d4',
    '#ec4899', '#84cc16', '#f97316', '#14b8a6', '#eab308', '#6366f1',
    '#10b981', '#f43f5e', '#8b5cf6', '#0ea5e9', '#d946ef', '#65a30d',
    '#fb7185', '#2dd4bf', '#fbbf24', '#818cf8',
  ];

  const QUAD = {
    Leading: { fill: 'rgba(34,197,94,0.10)', label: 'LEADING', pos: 'tr', color: '#22c55e' },
    Improving: { fill: 'rgba(59,130,246,0.10)', label: 'IMPROVING', pos: 'tl', color: '#3b82f6' },
    Lagging: { fill: 'rgba(239,68,68,0.10)', label: 'LAGGING', pos: 'bl', color: '#ef4444' },
    Weakening: { fill: 'rgba(234,179,8,0.10)', label: 'WEAKENING', pos: 'br', color: '#eab308' },
  };

  function colorFor(sym, allSyms) {
    const i = allSyms.indexOf(sym);
    return PALETTE[i % PALETTE.length];
  }

  function hexToRgba(hex, a) {
    const m = hex.replace('#', '');
    const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  const DARK_LAYOUT = {
    paper_bgcolor: '#0f1117',
    plot_bgcolor: '#0f1117',
    font: { color: '#e5e7eb', family: 'DM Sans, system-ui, sans-serif' },
  };

  // Disegna l'RRG. endPos = indice (in model.validIdx) su cui termina il trail (per animazione).
  // Se omesso usa l'ultimo. visible = Set di simboli da mostrare.
  function drawRRG(el, dataset, model, cfg, endPos, visible) {
    const { series, validIdx } = model;
    const syms = cfg.symbols.filter((s) => series[s] && (!visible || visible.has(s)));
    const allSyms = cfg.symbols;
    const tail = cfg.tail;

    const endIndex = endPos == null ? validIdx.length - 1 : endPos;
    const startIndex = Math.max(0, endIndex - tail + 1);
    const trail = validIdx.slice(startIndex, endIndex + 1);

    // range simmetrico attorno a 100 (quadranti bilanciati, aspetto quadrato)
    let maxAbs = 1.5;
    for (const s of syms) {
      for (const k of trail) {
        maxAbs = Math.max(maxAbs, Math.abs(series[s].rsRatio[k] - CENTER), Math.abs(series[s].rsMomentum[k] - CENTER));
      }
    }
    const pad = maxAbs * 1.18;
    const lo = CENTER - pad, hi = CENTER + pad;

    const traces = [];
    const annotations = [];

    syms.forEach((s) => {
      const color = colorFor(s, allSyms);
      const xs = trail.map((k) => series[s].rsRatio[k]);
      const ys = trail.map((k) => series[s].rsMomentum[k]);
      const dates = trail.map((k) => model.sampledDates[k]);
      const name = dataset.tickers[s].name;

      // marker sfumati: alpha e size crescenti verso il presente
      const sizes = trail.map((_, i) => 4 + (i / Math.max(1, trail.length - 1)) * 6);
      const colors = trail.map((_, i) => hexToRgba(color, 0.25 + 0.6 * (i / Math.max(1, trail.length - 1))));

      traces.push({
        x: xs, y: ys, mode: 'lines+markers', name: `${s} · ${name}`,
        legendgroup: s,
        line: { color: hexToRgba(color, 0.55), width: 2, shape: 'spline', smoothing: 0.6 },
        marker: { size: sizes, color: colors, line: { width: 0 } },
        text: dates,
        hovertemplate: `<b>${s} · ${name}</b><br>%{text}<br>RS-Ratio %{x:.2f}<br>RS-Mom %{y:.2f}<extra></extra>`,
      });

      // testa: pallino grande + etichetta ticker
      traces.push({
        x: [xs[xs.length - 1]], y: [ys[ys.length - 1]], mode: 'markers+text',
        text: [s], textposition: 'top center', textfont: { color: '#fff', size: 11 },
        legendgroup: s, showlegend: false,
        marker: { size: 15, color: color, line: { width: 1.5, color: '#0f1117' } },
        hovertemplate: `<b>${s} · ${name}</b><br>${dates[dates.length - 1]}<br>RS-Ratio %{x:.2f}<br>RS-Mom %{y:.2f}<extra></extra>`,
      });

      // freccia di direzione (dal penultimo al ultimo punto)
      if (xs.length >= 2) {
        annotations.push({
          x: xs[xs.length - 1], y: ys[ys.length - 1],
          ax: xs[xs.length - 2], ay: ys[ys.length - 2],
          xref: 'x', yref: 'y', axref: 'x', ayref: 'y',
          showarrow: true, arrowhead: 3, arrowsize: 1.6, arrowwidth: 2, arrowcolor: color, opacity: 0.9,
          text: '', standoff: 0,
        });
      }
    });

    // etichette quadranti
    const corner = { tr: [hi, hi], tl: [lo, hi], bl: [lo, lo], br: [hi, lo] };
    const align = { tr: ['right', 'top'], tl: ['left', 'top'], bl: ['left', 'bottom'], br: ['right', 'bottom'] };
    Object.values(QUAD).forEach((q) => {
      const [cx, cy] = corner[q.pos];
      const [xa, ya] = align[q.pos];
      annotations.push({
        x: cx, y: cy, xref: 'x', yref: 'y', text: q.label, showarrow: false,
        font: { size: 15, color: q.color }, opacity: 0.55,
        xanchor: xa, yanchor: ya, xshift: xa === 'right' ? -6 : 6, yshift: ya === 'top' ? -4 : 4,
      });
    });

    const shapes = [
      { type: 'rect', x0: CENTER, x1: hi, y0: CENTER, y1: hi, fillcolor: QUAD.Leading.fill, line: { width: 0 }, layer: 'below' },
      { type: 'rect', x0: lo, x1: CENTER, y0: CENTER, y1: hi, fillcolor: QUAD.Improving.fill, line: { width: 0 }, layer: 'below' },
      { type: 'rect', x0: lo, x1: CENTER, y0: lo, y1: CENTER, fillcolor: QUAD.Lagging.fill, line: { width: 0 }, layer: 'below' },
      { type: 'rect', x0: CENTER, x1: hi, y0: lo, y1: CENTER, fillcolor: QUAD.Weakening.fill, line: { width: 0 }, layer: 'below' },
      { type: 'line', x0: CENTER, x1: CENTER, y0: lo, y1: hi, line: { color: 'rgba(255,255,255,0.35)', width: 1, dash: 'dot' } },
      { type: 'line', x0: lo, x1: hi, y0: CENTER, y1: CENTER, line: { color: 'rgba(255,255,255,0.35)', width: 1, dash: 'dot' } },
    ];

    const layout = Object.assign({}, DARK_LAYOUT, {
      margin: { l: 55, r: 20, t: 20, b: 45 },
      xaxis: { title: { text: 'RS-Ratio →  forza relativa', font: { size: 12 } }, range: [lo, hi], zeroline: false, gridcolor: 'rgba(255,255,255,0.05)', constrain: 'domain' },
      yaxis: { title: { text: 'RS-Momentum →  slancio', font: { size: 12 } }, range: [lo, hi], zeroline: false, gridcolor: 'rgba(255,255,255,0.05)', scaleanchor: 'x', scaleratio: 1 },
      shapes, annotations,
      showlegend: true,
      legend: { bgcolor: 'rgba(0,0,0,0)', font: { size: 11 }, orientation: 'v', x: 1.02, y: 1 },
      hovermode: 'closest',
      dragmode: 'pan',
    });

    Plotly.react(el, traces, layout, { responsive: true, displayModeBar: false });
  }

  // Grafico trend base-100. mode 'sectors' usa cfg.symbols+benchmark.
  function drawTrends(el, dataset, model, cfg, lookbackDays) {
    const idxAll = model.idxAll;
    const dates = model.sampledDates;
    const lastDate = Date.parse(dates[dates.length - 1] + 'T00:00:00Z');
    const startMs = lastDate - lookbackDays * 86400000;
    const startK = dates.findIndex((d) => Date.parse(d + 'T00:00:00Z') >= startMs);
    const k0 = startK < 0 ? 0 : startK;

    const allSyms = cfg.symbols;
    const traces = [];
    const seriesSyms = cfg.symbols.concat([cfg.benchmark]);
    seriesSyms.forEach((s) => {
      const closeArr = idxAll.map((i) => dataset.tickers[s].close[i]);
      const base = closeArr[k0];
      if (base == null || base === 0) return;
      const isBench = s === cfg.benchmark;
      const xs = [], ys = [];
      for (let k = k0; k < dates.length; k++) {
        if (closeArr[k] == null) continue;
        xs.push(dates[k]); ys.push((closeArr[k] / base) * 100);
      }
      traces.push({
        x: xs, y: ys, mode: 'lines', name: isBench ? `${s} (benchmark)` : `${s} · ${dataset.tickers[s].name}`,
        line: isBench ? { color: '#e5e7eb', width: 3 } : { color: colorFor(s, allSyms), width: 1.8 },
        hovertemplate: `<b>${s}</b> %{x}<br>%{y:.1f}<extra></extra>`,
      });
    });

    const layout = Object.assign({}, DARK_LAYOUT, {
      margin: { l: 50, r: 20, t: 20, b: 40 },
      xaxis: { gridcolor: 'rgba(255,255,255,0.05)' },
      yaxis: { title: { text: 'Base 100', font: { size: 12 } }, gridcolor: 'rgba(255,255,255,0.06)' },
      shapes: [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: 100, y1: 100, line: { color: 'rgba(255,255,255,0.3)', width: 1, dash: 'dot' } }],
      legend: { font: { size: 11 } }, hovermode: 'x unified',
    });
    Plotly.react(el, traces, layout, { responsive: true, displayModeBar: false });
  }

  return { drawRRG, drawTrends, colorFor, PALETTE, QUAD, hexToRgba };
})();

window.Charts = Charts;
