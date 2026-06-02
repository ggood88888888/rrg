#!/usr/bin/env node
/*
 * fetch_data.js — scarica i prezzi (adjusted close) da Yahoo Finance per tutti i
 * ticker elencati in universe.json e produce data/prices.json.
 *
 * Eseguito sia in locale (node scripts/fetch_data.js) sia dalla GitHub Action.
 * Nessuna dipendenza npm: usa fetch nativo (Node 18+). I dati giornalieri vengono
 * salvati grezzi; il resample settimanale e il calcolo RRG avvengono nel browser,
 * così i parametri (benchmark, smoothing, tail...) sono modificabili al volo.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const UNIVERSE = JSON.parse(fs.readFileSync(path.join(ROOT, 'universe.json'), 'utf-8'));
const OUT = path.join(ROOT, 'data', 'prices.json');
const RANGE = '5y';
const INTERVAL = '1d';

// Raccoglie l'elenco unico di ticker (gruppi + benchmark) con metadati.
function collectTickers() {
  const meta = {}; // symbol -> { name, groups:Set }
  for (const [sym, name] of Object.entries(UNIVERSE.benchmarks || {})) {
    meta[sym] = meta[sym] || { name, groups: [] };
    if (!meta[sym].isBenchmark) meta[sym].isBenchmark = true;
  }
  for (const [groupName, group] of Object.entries(UNIVERSE.groups || {})) {
    for (const [sym, name] of Object.entries(group.tickers || {})) {
      meta[sym] = meta[sym] || { name, groups: [] };
      meta[sym].name = name;
      meta[sym].groups.push(groupName);
    }
  }
  return meta;
}

async function fetchOne(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${RANGE}&interval=${INTERVAL}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (RRG-app data fetch)' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  const res = j.chart && j.chart.result && j.chart.result[0];
  if (!res || !res.timestamp) throw new Error('no data');
  const ts = res.timestamp;
  const adj = (res.indicators.adjclose && res.indicators.adjclose[0].adjclose) || res.indicators.quote[0].close;
  const out = {};
  for (let i = 0; i < ts.length; i++) {
    const v = adj[i];
    if (v == null) continue;
    const d = new Date(ts[i] * 1000).toISOString().slice(0, 10);
    out[d] = Math.round(v * 10000) / 10000;
  }
  return out;
}

async function main() {
  const meta = collectTickers();
  const symbols = Object.keys(meta);
  console.log(`Scarico ${symbols.length} ticker...`);

  const series = {}; // symbol -> {date: close}
  const dateSet = new Set();
  for (const sym of symbols) {
    try {
      const s = await fetchOne(sym);
      series[sym] = s;
      Object.keys(s).forEach((d) => dateSet.add(d));
      console.log(`  ok ${sym} (${Object.keys(s).length} punti)`);
    } catch (e) {
      console.warn(`  FALLITO ${sym}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 120)); // gentile con Yahoo
  }

  const dates = [...dateSet].sort();
  const tickers = {};
  for (const sym of symbols) {
    if (!series[sym]) continue;
    const s = series[sym];
    let last = null;
    const closes = dates.map((d) => {
      if (s[d] != null) last = s[d];
      return last; // forward-fill
    });
    // taglia i NaN iniziali (prima della prima quotazione del titolo)
    tickers[sym] = {
      name: meta[sym].name,
      groups: meta[sym].groups,
      isBenchmark: !!meta[sym].isBenchmark,
      close: closes,
    };
  }

  const payload = {
    generated: new Date().toISOString(),
    range: RANGE,
    interval: INTERVAL,
    benchmarks: UNIVERSE.benchmarks,
    groups: Object.fromEntries(
      Object.entries(UNIVERSE.groups).map(([g, v]) => [g, { defaultBenchmark: v.defaultBenchmark, tickers: Object.keys(v.tickers) }])
    ),
    dates,
    tickers,
  };
  fs.writeFileSync(OUT, JSON.stringify(payload));
  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`Scritto ${OUT} (${kb} KB, ${dates.length} date, ${Object.keys(tickers).length} ticker)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
