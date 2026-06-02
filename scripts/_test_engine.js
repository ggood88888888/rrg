// test al volo del motore RRG sui dati reali
global.window = {};
require('../js/engine.js');
const RRG = global.window.RRG;
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(__dirname + '/../data/prices.json', 'utf-8'));

const sectors = data.groups['Settori S&P 500'].tickers;
const m = RRG.build(data, {
  symbols: sectors, benchmark: 'SPY', timeframe: 'weekly', tail: 12,
  params: { smoothRS: 10, momWin: 4, zWin: 26, k: 1 },
});
console.log('date campionate (weekly):', m.sampledDates.length, '→', m.sampledDates.slice(-2));
console.log('validIdx:', m.validIdx.length, 'trailIdx:', m.trailIdx.length);
console.log('\nClassificazione (ordinata per score):');
const rows = sectors.map((s) => ({ s, ...m.classes[s] })).sort((a, b) => b.score - a.score);
for (const r of rows) {
  console.log(`  ${r.s.padEnd(5)} ratio=${r.ratio.toFixed(2)} mom=${r.mom.toFixed(2)} ${r.quad.padEnd(10)} slope=${r.momSlope.toFixed(2)} head=${r.headingDeg==null?'-':r.headingDeg.toFixed(0)+'°'} → ${r.tag} (score ${r.score.toFixed(1)})`);
}
// sanity: i valori devono stare in un range ragionevole attorno a 100
const allr = sectors.flatMap((s) => m.trailIdx.map((k) => m.series[s].rsRatio[k]));
console.log('\nrange RS-Ratio trail:', Math.min(...allr).toFixed(1), '..', Math.max(...allr).toFixed(1));
