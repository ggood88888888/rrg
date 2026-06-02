// verifica che drawRRG / drawTrends costruiscano trace valide senza crashare
global.window = {};
let captured = null;
global.Plotly = { react: (el, traces, layout, cfg) => { captured = { traces, layout }; } };
require('../js/engine.js');
const RRG = global.window.RRG;
global.RRG = RRG;
require('../js/charts.js');
const Charts = global.window.Charts;
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(__dirname + '/../data/prices.json', 'utf-8'));
const sectors = data.groups['Settori S&P 500'].tickers;
const model = RRG.build(data, { symbols: sectors, benchmark: 'SPY', timeframe: 'weekly', tail: 12, params: { smoothRS: 10, momWin: 4, zWin: 26, k: 1 } });

function check(label, traces) {
  let bad = 0;
  traces.forEach((t, i) => {
    (t.x || []).forEach((v) => { if (v == null || Number.isNaN(v)) bad++; });
    (t.y || []).forEach((v) => { if (v == null || Number.isNaN(v)) bad++; });
  });
  console.log(`${label}: ${traces.length} traces, valori nulli/NaN in x|y = ${bad}`);
}

// RRG full
Charts.drawRRG({}, data, model, { symbols: sectors, benchmark: 'SPY', tail: 12 }, model.validIdx.length - 1, new Set(sectors));
check('RRG (end)', captured.traces);
console.log('  shapes:', captured.layout.shapes.length, 'annotations:', captured.layout.annotations.length, 'xrange:', captured.layout.xaxis.range.map(v=>v.toFixed(1)));

// RRG durante animazione (frame intermedio)
Charts.drawRRG({}, data, model, { symbols: sectors, benchmark: 'SPY', tail: 12 }, 30, new Set(['XLK', 'XLV']));
check('RRG (frame=30, 2 simboli)', captured.traces);

// Trends
Charts.drawTrends({}, data, model, { symbols: sectors, benchmark: 'SPY' }, 180);
check('Trends 6m', captured.traces);
console.log('OK');
