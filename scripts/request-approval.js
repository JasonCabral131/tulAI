// Asks the owner for permission in the Tulai Desktop app: node scripts/request-approval.js <action> "<title>" "<why>" [port]
const [action, title, why, port = '39393'] = process.argv.slice(2);
if (!action) { console.error('usage: request-approval.js <action> "<title>" "<why>" [port]'); process.exit(1); }
fetch(`http://localhost:${port}/api/approvals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request: { action, title, why, requestedBy: 'Claude Code' } }) }).then((r) => r.json()).then((d) => console.log(d.error ? 'refused: ' + d.error.message : 'Asked. The card is in the Tulai Desktop app: ' + d.item.id)).catch((e) => { console.error(e.message); process.exit(1); });
