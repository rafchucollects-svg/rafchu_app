import { formatCardLadderMoney } from '../../src/utils/cardLadderCurrency.js';
import { companionRequest } from '../../src/utils/cardLadderCompanion.js';
import { summarizeSales, validateSalesReport } from '../../src/utils/cardLadderSales.js';
const $ = id => document.getElementById(id);
let reading = false;
let shown = null;
async function loadReport() {
  const report = await companionRequest('report');
  if (!report) throw new Error('There is no capture report yet.');
  const window = validateSalesReport(report);
  const rows = report.holdings.map(holding => ({ holding, summary: summarizeSales(holding, window) }));
  $('rows').replaceChildren(...rows.map(({ holding, summary }) => {
    const tr = document.createElement('tr');
    for (const value of [holding.name + ' #' + holding.number + '\n' + holding.set + ' ' + holding.variation, holding.gradingCompany + ' ' + holding.grade, holding.error || summary.status, summary.saleCount, summary.high ? formatCardLadderMoney(summary.high.price, summary.currency) : '—']) {
      const td = document.createElement('td'); td.textContent = String(value); tr.append(td);
    }
    if (summary.high) { const a = document.createElement('a'); a.href = summary.high.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = summary.high.soldDate; tr.lastChild.append(document.createElement('br'), a); }
    return tr;
  }));
  $('summary').textContent = `${report.startDate} through ${report.endDate} · ${report.currency || 'USD'} · ${rows.length} holdings · ${rows.filter(row => row.holding.complete).length} complete · ${rows.filter(row => row.summary.high).length} with eligible sales`;
  $('metadata').textContent = JSON.stringify({ runId: report.runId, capturedAt: report.capturedAt, currency: report.currency || 'USD', collectionComplete: report.collectionComplete, holdings: rows.map(({ holding: h, summary }) => ({ holdingId: h.holdingId, name: h.name, profileUrl: h.profileUrl, capturedSales: h.sales.length, eligibleSales: summary.saleCount, excludedSales: summary.excluded || 0, highSale: summary.high, imageUrl: h.imageUrl || null, cardLadderValue: h.cardLadderValue ?? null, cardLadderValueCurrency: h.cardLadderValueCurrency || null, statistics: summary.statistics, complete: h.complete, error: h.error })) }, null, 2);
  shown = report.runId;
}
async function refresh() {
  if (reading) return;
  reading = true;
  try {
    const state = await companionRequest('status');
    $('error').textContent = '';
    const progress = state.status?.total ? `${state.status.current}/${state.status.total} · ` : '';
    $('status').textContent = `${state.version} · ${progress}${state.status?.message || 'Companion connected and ready.'}`;
    $('start').disabled = state.status?.state === 'running'; $('stop').disabled = state.status?.state !== 'running'; $('report').disabled = !state.runId;
    if (state.runId && state.runId !== shown) await loadReport();
  } catch (error) { $('error').textContent = error.message; }
  finally { reading = false; }
}
for (const [id, action] of [['start','start'], ['stop','cancel']]) $(id).onclick = async () => { $('error').textContent = ''; try { await companionRequest(action); await refresh(); } catch(error) { $('error').textContent = error.message; } };
$('report').onclick = async () => { try { await loadReport(); } catch(error) { $('error').textContent = error.message; } };
void refresh(); setInterval(refresh, 2500);
