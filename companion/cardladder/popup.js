const send = async (action, extra = {}) => {
  const result = await chrome.runtime.sendMessage({ channel: 'rafchu-companion', action, ...extra });
  if (!result.ok) throw new Error(result.error);
  return result.data;
};
const status = document.getElementById('status');
async function refresh() {
  try {
    const result = await send('status');
    status.textContent = result.status?.message || 'Ready. Open CardLadder and sign in before syncing.';
    document.getElementById('daily').checked = result.daily;
    document.getElementById('start').disabled = result.status?.state === 'running';
    document.getElementById('download').disabled = !result.runId;
  } catch (error) { status.textContent = error.message; }
}
for (const action of ['start', 'cancel']) document.getElementById(action).onclick = async () => { await send(action); await refresh(); };
document.getElementById('daily').onchange = async event => { await send('daily', { enabled: event.target.checked }); };
document.getElementById('download').onclick = async () => {
  const report = await send('report');
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `cardladder-inventory-${report.endDate}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
void refresh();
setInterval(refresh, 1500);
