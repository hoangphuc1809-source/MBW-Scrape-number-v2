import { readFileSync, writeFileSync } from 'fs';
import { google } from 'googleapis';

const SHEET_ID = '1OFMHxyhwo1YwQwvVoBpYB1VdlRathhTKdmC00RA8ns8';
const TAB_NAME = 'RAW DATA';
const RANGE = `'${TAB_NAME}'!A:Q`;

const clientSecretPath = `${process.cwd()}/oauth-client.json`;
const tokenPath = `${process.cwd()}/token.json`;
const keys = JSON.parse(readFileSync(clientSecretPath, 'utf8'));
const tokens = JSON.parse(readFileSync(tokenPath, 'utf8'));
const oAuth2Client = new google.auth.OAuth2(
  keys.installed.client_id,
  keys.installed.client_secret,
  keys.installed.redirect_uris[0]
);
oAuth2Client.setCredentials(tokens);
const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });

function formatDate(d) {
  const dd = new Date(d);
  const pad = n => String(n).padStart(2, '0');
  return `${dd.getFullYear()}-${pad(dd.getMonth()+1)}-${pad(dd.getDate())}`;
}
function formatTime(d) {
  const dd = new Date(d);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(dd.getHours())}:${pad(dd.getMinutes())}:${pad(dd.getSeconds())}`;
}
function parsePrice(s) {
  if (!s) return '';
  const n = String(s).replace(/[^\d]/g, '');
  return n ? Number(n) : '';
}

const files = [
  { dealer: 'MBW', path: 'output/MBW-20260714052059.json', finishedAt: '2026-07-14 12:20:59' },
  { dealer: 'CPS', path: 'output/CPS-20260714055847.json', finishedAt: '2026-07-14 12:58:47' },
  { dealer: 'FPT', path: 'output/FPT-20260714050106.json', finishedAt: '2026-07-14 12:01:06' },
];
const merged = [];
for (const f of files) {
  const data = JSON.parse(readFileSync(f.path, 'utf8'));
  merged.push(...data);
}

const rows = [['date','time','dealer','name','origPrice','salePrice','discount','sold','rating','link','cpu','ram','storage','screen','gpu','weight','scrapedAt']];
for (const r of merged) {
  const d = new Date(r.scrapedAt);
  rows.push([
    formatDate(d), formatTime(d), r.dealer, r.name,
    parsePrice(r.origPrice), parsePrice(r.salePrice), r.discount || '', r.sold || '', r.rating || '', r.link || '',
    r.cpu || '', r.ram || '', r.storage || '', r.screen || '', r.gpu || '', r.weight || '', r.scrapedAt
  ]);
}

await sheets.spreadsheets.values.update({
  spreadsheetId: SHEET_ID,
  range: RANGE,
  valueInputOption: 'RAW',
  requestBody: { values: rows },
});
console.log(`Sheet written: ${rows.length - 1} products, ${files.length} dealers`);

const summary = files.map(f => ({ dealer: f.dealer, finishedAt: f.finishedAt }));
writeFileSync('output/run-summary.json', JSON.stringify({ runAt: new Date().toISOString(), dealers: summary }, null, 2));
console.log('Summary written: output/run-summary.json');
for (const row of summary) console.log(`  ${row.dealer}: ${row.finishedAt}`);
