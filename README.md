# RRG · Relative Rotation Graph

App web interattiva per visualizzare la **rotazione settoriale** (e di azioni/asset) tramite Relative Rotation Graph: forza relativa (RS-Ratio) vs slancio (RS-Momentum) rispetto a un benchmark. Evoluzione del notebook Colab "Relative Rotation Graph".

🔗 Live: https://igorbonfanti.github.io/rrg/

## A cosa serve
Capire **a colpo d'occhio** quali settori hanno probabile *upside in prospettiva* (quadrante **Improving**, o **Lagging** che gira su) e quali sono *"già ai massimi"* (quadrante **Leading** con momentum che rolla giù → **Weakening**). Il pannello **Insight** li ordina automaticamente per probabilità di upside.

## Funzioni
- **RRG interattivo** con quadranti, assi **simmetrici** centrati a 100, **coda sfumata** (marker crescenti verso il presente) e **freccia di direzione**.
- **Animazione temporale**: ▶ Anima fa "girare" gli strumenti settimana per settimana.
- **Maschera personalizzabile**: universo (settori S&P / MAG7 / asset & regioni), benchmark, timeframe (settimanale/giornaliero), lunghezza coda, e parametri avanzati (smoothing RS, finestra momentum, finestra z-score).
- **Pannello Insight**: classificazione (Forza emergente / Leadership / Verso i massimi / In raffreddamento / Debole) + direzione di rotazione.
- **Grafico trend base-100** come vista secondaria.

## Architettura
- **Frontend statico** (Vanilla JS + Plotly.js via CDN) su GitHub Pages — nessun build step.
- **Dati**: `scripts/fetch_data.js` (Node, nessuna dipendenza) scarica gli *adjusted close* da Yahoo Finance per i ticker in `universe.json` e produce `data/prices.json`.
- **Aggiornamento automatico**: GitHub Action (`.github/workflows/update-data.yml`) gira ogni giorno feriale dopo la chiusura USA, rigenera `data/prices.json` e committa.
- Il **calcolo RRG avviene nel browser** (`js/engine.js`): cambiando benchmark, timeframe o parametri si ricalcola al volo senza riscaricare nulla.

## Personalizzare l'universo
Modifica `universe.json` (gruppi, ticker, benchmark di default) e lancia:
```bash
node scripts/fetch_data.js
```
La GitHub Action userà automaticamente il file aggiornato alla prossima esecuzione (o lanciala a mano da Actions → *Run workflow*).

## Metodologia
Per ogni strumento, rispetto al benchmark:
```
rs         = prezzo / benchmark
rsRatio    = 100 + zscore( SMA(rs, smoothRS), zWin )
momRaw     = rsRatio(t) − rsRatio(t − momWin)
rsMomentum = 100 + zscore( momRaw, zWin )
```
Normalizzazione z-score sulla storia di ciascuno strumento (approssimazione JdK, centrata a 100). È uno strumento di **lettura visiva**, non un segnale operativo.

## Sviluppo locale
```bash
node scripts/fetch_data.js          # genera data/prices.json
# poi servi la cartella con un qualsiasi static server, es:
npx serve .
```
Test rapidi del motore: `node scripts/_test_engine.js` e `node scripts/_test_charts.js`.
