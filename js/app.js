/* app.js — UI, maschera personalizzabile, animazione, insight, trends. */
(() => {
  const $ = (id) => document.getElementById(id);
  const DEFAULTS = { smoothRS: 10, momWin: 4, zWin: 26, k: 1 };

  const state = {
    dataset: null,
    group: null,
    symbols: [],        // simboli del gruppo correnti
    visible: new Set(), // simboli accesi
    benchmark: 'SPY',
    timeframe: 'weekly',
    tail: 12,
    params: Object.assign({}, DEFAULTS),
    model: null,
    frame: null,        // posizione corrente (indice in validIdx) per il trail
    playing: false,
    timer: null,
    trendDays: 180,
  };

  // ---------- boot ----------
  fetch('data/prices.json')
    .then((r) => r.json())
    .then((data) => { state.dataset = data; init(); })
    .catch((e) => {
      $('rrg').innerHTML = `<div style="padding:40px;color:#fca5a5">Impossibile caricare i dati (${e.message}).<br>Esegui <code>node scripts/fetch_data.js</code>.</div>`;
    });

  function init() {
    const d = state.dataset;
    $('dataDate').textContent = 'dati al ' + (d.dates[d.dates.length - 1] || '—');
    $('footGen').textContent = 'generato ' + new Date(d.generated).toLocaleString('it-IT');

    // popola gruppi
    const groups = Object.keys(d.groups);
    $('groupSel').innerHTML = groups.map((g) => `<option>${g}</option>`).join('');
    state.group = groups[0];

    // popola benchmark
    $('benchSel').innerHTML = Object.entries(d.benchmarks).map(([s, n]) => `<option value="${s}">${s} · ${n}</option>`).join('');

    bindEvents();
    loadGroup(state.group);
  }

  function loadGroup(group) {
    state.group = group;
    const g = state.dataset.groups[group];
    state.symbols = g.tickers.filter((s) => state.dataset.tickers[s]);
    state.visible = new Set(state.symbols);
    state.benchmark = g.defaultBenchmark || state.benchmark;
    $('benchSel').value = state.benchmark;
    renderChips();
    recompute(true);
  }

  // ---------- maschera ----------
  function renderChips() {
    const host = $('symList');
    host.innerHTML = '';
    state.symbols.forEach((s) => {
      const on = state.visible.has(s);
      const color = Charts.colorFor(s, state.symbols);
      const el = document.createElement('div');
      el.className = 'chip' + (on ? ' on' : '');
      el.innerHTML = `<span class="swatch" style="background:${on ? color : '#444'}"></span>${s}`;
      el.title = state.dataset.tickers[s].name;
      el.onclick = () => {
        if (state.visible.has(s)) state.visible.delete(s); else state.visible.add(s);
        renderChips();
        render(); // basta ridisegnare, non ricalcolare
        renderInsight();
        renderTrends();
      };
      host.appendChild(el);
    });
    $('symCount').textContent = `(${state.visible.size}/${state.symbols.length})`;
  }

  function bindEvents() {
    $('groupSel').onchange = (e) => loadGroup(e.target.value);
    $('benchSel').onchange = (e) => { state.benchmark = e.target.value; recompute(true); };

    $('selAll').onclick = () => { state.visible = new Set(state.symbols); renderChips(); render(); renderInsight(); renderTrends(); };
    $('selNone').onclick = () => { state.visible = new Set(); renderChips(); render(); renderInsight(); renderTrends(); };

    document.querySelectorAll('#tfSeg button').forEach((b) => {
      b.onclick = () => {
        document.querySelectorAll('#tfSeg button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        state.timeframe = b.dataset.tf;
        $('tailUnit').textContent = state.timeframe === 'weekly' ? 'sett.' : 'giorni';
        recompute(true);
      };
    });

    $('tailRange').oninput = (e) => { state.tail = +e.target.value; $('tailVal').textContent = state.tail; recompute(true); };

    const adv = [['smoothRange', 'smoothRS', 'smoothVal'], ['momRange', 'momWin', 'momVal'], ['zRange', 'zWin', 'zVal']];
    adv.forEach(([rng, key, lab]) => {
      $(rng).oninput = (e) => { state.params[key] = +e.target.value; $(lab).textContent = e.target.value; recompute(true); };
    });
    $('resetParams').onclick = () => {
      state.params = Object.assign({}, DEFAULTS);
      $('smoothRange').value = DEFAULTS.smoothRS; $('smoothVal').textContent = DEFAULTS.smoothRS;
      $('momRange').value = DEFAULTS.momWin; $('momVal').textContent = DEFAULTS.momWin;
      $('zRange').value = DEFAULTS.zWin; $('zVal').textContent = DEFAULTS.zWin;
      recompute(true);
    };

    $('playBtn').onclick = togglePlay;
    $('frameRange').oninput = (e) => { stopPlay(); state.frame = +e.target.value; render(); };

    document.querySelectorAll('#trendSeg button').forEach((b) => {
      b.onclick = () => {
        document.querySelectorAll('#trendSeg button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        state.trendDays = +b.dataset.days;
        renderTrends();
      };
    });

    $('helpBtn').onclick = () => $('helpModal').classList.remove('hidden');
    $('helpClose').onclick = () => $('helpModal').classList.add('hidden');
    $('helpModal').onclick = (e) => { if (e.target.id === 'helpModal') $('helpModal').classList.add('hidden'); };
  }

  // ---------- calcolo + render ----------
  function recompute(resetFrame) {
    if (!state.symbols.length) return;
    state.model = RRG.build(state.dataset, {
      symbols: state.symbols, benchmark: state.benchmark,
      timeframe: state.timeframe, tail: state.tail, params: state.params,
    });
    const vlen = state.model.validIdx.length;
    const fr = $('frameRange');
    fr.min = Math.min(state.tail - 1, vlen - 1);
    fr.max = vlen - 1;
    if (resetFrame || state.frame == null || state.frame > vlen - 1) state.frame = vlen - 1;
    fr.value = state.frame;
    render();
    renderInsight();
    renderTrends();
  }

  function render() {
    if (!state.model) return;
    Charts.drawRRG($('rrg'), state.dataset, state.model, {
      symbols: state.symbols, benchmark: state.benchmark, tail: state.tail,
    }, state.frame, state.visible);
    const k = state.model.validIdx[state.frame];
    $('frameDate').textContent = state.model.sampledDates[k] || '—';
    $('frameRange').value = state.frame;
  }

  // ---------- animazione ----------
  function togglePlay() { state.playing ? stopPlay() : startPlay(); }
  function startPlay() {
    const vlen = state.model.validIdx.length;
    const minFrame = Math.min(state.tail - 1, vlen - 1);
    if (state.frame >= vlen - 1) state.frame = minFrame; // riparti dall'inizio
    state.playing = true;
    $('playBtn').classList.add('playing');
    $('playBtn').textContent = '❚❚ Pausa';
    state.timer = setInterval(() => {
      if (state.frame >= vlen - 1) { stopPlay(); return; }
      state.frame++;
      render();
    }, 320);
  }
  function stopPlay() {
    state.playing = false;
    clearInterval(state.timer);
    $('playBtn').classList.remove('playing');
    $('playBtn').textContent = '▶ Anima';
  }

  // ---------- insight ----------
  function renderInsight() {
    const host = $('insightList');
    if (!state.model) { host.innerHTML = ''; return; }
    const arrowFor = (deg) => {
      if (deg == null) return '·';
      const dirs = ['→', '↗', '↑', '↖', '←', '↙', '↓', '↘'];
      const i = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
      return dirs[i];
    };
    const items = state.symbols
      .filter((s) => state.visible.has(s) && state.model.classes[s])
      .map((s) => ({ s, c: state.model.classes[s] }))
      .sort((a, b) => b.c.score - a.c.score);

    if (!items.length) { host.innerHTML = '<p class="hint">Nessuno strumento selezionato.</p>'; return; }

    host.innerHTML = items.map(({ s, c }) => {
      const color = Charts.colorFor(s, state.symbols);
      const tagClass = 'tag-' + c.kind;
      return `<div class="ins-item">
        <span class="swatch" style="background:${color}"></span>
        <div class="ins-main">
          <div class="ins-sym">${s} <span class="ins-arrow" title="direzione">${arrowFor(c.headingDeg)}</span></div>
          <div class="ins-name">${state.dataset.tickers[s].name}</div>
        </div>
        <span class="ins-tag ${tagClass}">${c.tag}</span>
      </div>`;
    }).join('');
  }

  // ---------- trends ----------
  function renderTrends() {
    if (!state.model) return;
    Charts.drawTrends($('trends'), state.dataset, state.model, {
      symbols: state.symbols.filter((s) => state.visible.has(s)),
      benchmark: state.benchmark,
    }, state.trendDays);
  }
})();
