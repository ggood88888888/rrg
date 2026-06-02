/*
 * engine.js — motore di calcolo RRG (lato browser).
 *
 * I prezzi grezzi (adjusted close giornalieri) arrivano da data/prices.json.
 * Qui facciamo: resample settimanale, calcolo RS / RS-Ratio / RS-Momentum,
 * classificazione dei quadranti e degli "insight" (forza emergente vs massimi).
 *
 * Metodo (JdK-like, ma ripulito rispetto al notebook Colab):
 *   rs        = prezzo / benchmark
 *   rsRatio   = 100 + k * zscore( SMA(rs, smoothRS), zWin )
 *   momRaw    = rsRatio(t) - rsRatio(t - momWin)        (rate of change del ratio)
 *   rsMomentum= 100 + k * zscore( momRaw, zWin )
 *
 * Differenze chiave rispetto al notebook: assi simmetrici nel chart (centro reale a 100),
 * k=1 di default (lo spread lo gestisce l'autoscale simmetrico), tail con marker sfumati
 * e freccia di direzione, animazione temporale.
 */

const RRG = (() => {
  const CENTER = 100;

  // ---------- helper statistici ----------
  function sma(arr, w) {
    const out = new Array(arr.length).fill(null);
    let sum = 0, count = 0;
    const q = [];
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      q.push(v);
      if (v != null) { sum += v; count++; }
      if (q.length > w) {
        const old = q.shift();
        if (old != null) { sum -= old; count--; }
      }
      out[i] = q.length === w && count === w ? sum / w : null;
    }
    return out;
  }

  // z-score rolling: (x - mean_w) / std_w, calcolato sullo stesso array x
  function rollingZ(arr, w) {
    const out = new Array(arr.length).fill(null);
    for (let i = 0; i < arr.length; i++) {
      if (i < w - 1) continue;
      let sum = 0, n = 0;
      for (let j = i - w + 1; j <= i; j++) {
        if (arr[j] == null) { n = -1; break; }
        sum += arr[j]; n++;
      }
      if (n !== w) continue;
      const mean = sum / w;
      let varr = 0;
      for (let j = i - w + 1; j <= i; j++) varr += (arr[j] - mean) ** 2;
      const std = Math.sqrt(varr / w);
      out[i] = std === 0 ? 0 : (arr[i] - mean) / std;
    }
    return out;
  }

  // ---------- resample ----------
  // indici (sull'array date condiviso) da usare per il campionamento settimanale:
  // ultimo giorno di trading di ogni settimana (bucket allineato al venerdì).
  function weeklyIndices(dates) {
    const buckets = new Map();
    for (let i = 0; i < dates.length; i++) {
      const t = Date.parse(dates[i] + 'T00:00:00Z');
      const b = Math.floor((t / 86400000 + 4) / 7); // +4 => break del giovedì/venerdì
      buckets.set(b, i); // mantiene l'ultimo indice del bucket
    }
    return [...buckets.values()].sort((a, b) => a - b);
  }

  function sampleIndices(dates, timeframe) {
    if (timeframe === 'weekly') return weeklyIndices(dates);
    return dates.map((_, i) => i); // daily: tutti
  }

  // ---------- calcolo RRG per un simbolo ----------
  // closeSym / closeBench: array campionati allineati. params: {smoothRS, momWin, zWin, k}
  function computeSymbol(closeSym, closeBench, params) {
    const { smoothRS, momWin, zWin, k } = params;
    const n = closeSym.length;
    const rs = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      if (closeSym[i] != null && closeBench[i] != null && closeBench[i] !== 0) {
        rs[i] = closeSym[i] / closeBench[i];
      }
    }
    const rsSmooth = sma(rs, smoothRS);
    const zRatio = rollingZ(rsSmooth, zWin);
    const rsRatio = zRatio.map((z) => (z == null ? null : CENTER + k * z));

    const momRaw = new Array(n).fill(null);
    for (let i = momWin; i < n; i++) {
      if (rsRatio[i] != null && rsRatio[i - momWin] != null) momRaw[i] = rsRatio[i] - rsRatio[i - momWin];
    }
    const zMom = rollingZ(momRaw, zWin);
    const rsMomentum = zMom.map((z) => (z == null ? null : CENTER + k * z));

    return { rs, rsRatio, rsMomentum };
  }

  function quadrant(ratio, mom) {
    if (ratio >= CENTER && mom >= CENTER) return 'Leading';
    if (ratio < CENTER && mom >= CENTER) return 'Improving';
    if (ratio < CENTER && mom < CENTER) return 'Lagging';
    return 'Weakening';
  }

  // Classificazione orientata all'obiettivo: chi ha probabile upside vs chi è "ai massimi".
  // Restituisce { tag, score, headingDeg } dove score alto = più appetibile in prospettiva.
  function classify(series, idxs) {
    const last = idxs[idxs.length - 1];
    const ratio = series.rsRatio[last];
    const mom = series.rsMomentum[last];
    if (ratio == null || mom == null) return null;
    const quad = quadrant(ratio, mom);

    // pendenza del momentum sulle ultime ~3 osservazioni del trail
    const prevN = Math.max(0, idxs.length - 4);
    const refIdx = idxs[prevN];
    const momSlope = series.rsMomentum[refIdx] != null ? mom - series.rsMomentum[refIdx] : 0;
    const ratioSlope = series.rsRatio[refIdx] != null ? ratio - series.rsRatio[refIdx] : 0;

    // direzione (angolo del vettore di spostamento testa-coda recente), in gradi
    let headingDeg = null;
    if (series.rsRatio[refIdx] != null && series.rsMomentum[refIdx] != null) {
      const dx = ratio - series.rsRatio[refIdx];
      const dy = mom - series.rsMomentum[refIdx];
      if (dx !== 0 || dy !== 0) headingDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    }

    let tag, kind, score;
    const rising = momSlope > 0;
    if (quad === 'Improving' || (quad === 'Lagging' && rising && momSlope > 0.3)) {
      tag = 'Forza emergente'; kind = 'upside';
      score = 70 + (mom - CENTER) + momSlope * 4 + (rising ? 8 : 0);
    } else if (quad === 'Leading' && rising) {
      tag = 'Leadership in corsa'; kind = 'strong';
      score = 55 + (mom - CENTER) * 0.5 + momSlope * 3;
    } else if (quad === 'Leading' && !rising) {
      tag = 'Verso i massimi (rallenta)'; kind = 'topping';
      score = 30 + momSlope * 3; // momSlope negativo abbassa
    } else if (quad === 'Weakening') {
      tag = 'In raffreddamento'; kind = 'cooling';
      score = 25 + momSlope * 3;
    } else {
      tag = 'Debole'; kind = 'weak';
      score = 10 + momSlope * 3 + ratioSlope * 2;
    }

    return { quad, tag, kind, score, ratio, mom, momSlope, ratioSlope, headingDeg };
  }

  // ---------- orchestrazione ----------
  // dataset = prices.json; config = { symbols:[], benchmark, timeframe, tail, params }
  // -> { dates:[sampled], series:{sym:{rsRatio,rsMomentum,rs}}, trailIdx:[], classes:{sym:..} }
  function build(dataset, config) {
    const { symbols, benchmark, timeframe, tail, params } = config;
    const idxAll = sampleIndices(dataset.dates, timeframe);
    const sampledDates = idxAll.map((i) => dataset.dates[i]);

    const benchClose = idxAll.map((i) => dataset.tickers[benchmark].close[i]);

    const series = {};
    for (const sym of symbols) {
      if (!dataset.tickers[sym]) continue;
      const symClose = idxAll.map((i) => dataset.tickers[sym].close[i]);
      series[sym] = computeSymbol(symClose, benchClose, params);
    }

    // indici del trail: ultime `tail` osservazioni con dati validi su TUTTI i simboli
    const validMask = sampledDates.map((_, k) =>
      symbols.every((s) => series[s] && series[s].rsRatio[k] != null && series[s].rsMomentum[k] != null)
    );
    const validIdx = [];
    for (let k = 0; k < validMask.length; k++) if (validMask[k]) validIdx.push(k);
    const trailIdx = validIdx.slice(-tail);

    const classes = {};
    for (const sym of symbols) {
      if (series[sym]) classes[sym] = classify(series[sym], trailIdx);
    }

    return { sampledDates, series, trailIdx, validIdx, classes, benchClose, idxAll };
  }

  return { build, computeSymbol, classify, quadrant, sampleIndices, CENTER };
})();

window.RRG = RRG;
