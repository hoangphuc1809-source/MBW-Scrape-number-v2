import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { google } from 'googleapis';

const SHEET_ID = '1OFMHxyhwo1YwQwvVoBpYB1VdlRathhTKdmC00RA8ns8';
const TAB_NAME = 'RAW DATA';
const PROJECT = process.cwd();
const OUTPUT_DIR = `${PROJECT}/output`;
const HEADERS = [
  'date','time','dealer','name',
  'origPrice','salePrice','discount',
  'sold','rating','link',
  'cpu','ram','storage','screen','gpu','weight',
  'scrapedAt'
];

if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

function runDealer(dealer) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['src/cli.js', '--dealer', dealer], {
      cwd: PROJECT,
      env: { ...process.env, OUTPUT_JSON: 'true' },
      shell: true,
    });
    let last = '';
    child.stdout.on('data', (d) => { last += d.toString(); process.stdout.write(d); });
    child.stderr.on('data', (d) => process.stderr.write(`[${dealer}] ${d}`));
    child.on('close', (code) => {
      if (code === 0) {
        const m = last.match(/Scrape dealer done\s+dealer: "([^"]+)"\s+count: (\d+)/);
        const tm = last.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} \+0700)/);
        resolve({
          dealer,
          count: m ? parseInt(m[2]) : 0,
          finishedAt: tm ? tm[1] : new Date().toISOString(),
          last,
          jsonPath: getLatestJson(dealer)
        });
      } else {
        reject(new Error(`[runner] ${dealer} exit ${code}`));
      }
    });
  });
}

function getLatestJson(dealer) {
  if (!existsSync(OUTPUT_DIR)) return '';
  const prefix = dealer.toUpperCase();
  const files = readdirSync(OUTPUT_DIR)
    .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
    .sort()
    .reverse();
  return files[0] ? `${OUTPUT_DIR}/${files[0]}` : '';
}

function formatDate(d) {
  const dd = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dd.getFullYear()}-${pad(dd.getMonth()+1)}-${pad(dd.getDate())}`;
}
function formatTime(d) {
  const dd = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(dd.getHours())}:${pad(dd.getMinutes())}:${pad(dd.getSeconds())}`;
}

function parseRow(r) {
  const d = new Date(r.scrapedAt);
  return [
    formatDate(d),
    formatTime(d),
    r.dealer || '',
    r.name || '',
    r.origPrice ? String(r.origPrice).replace(/[^\d]/g, '') : '',
    r.salePrice ? String(r.salePrice).replace(/[^\d]/g, '') : '',
    r.discount || '',
    r.sold || '',
    r.rating || '',
    r.link || '',
    r.cpu || '',
    r.ram || '',
    r.storage || '',
    r.screen || '',
    r.gpu || '',
    r.weight || '',
    r.scrapedAt || ''
  ];
}

async function writeAllToSheet(rows) {
  const keys = JSON.parse(readFileSync('oauth-client.json', 'utf8'));
  const tokens = JSON.parse(readFileSync('token.json', 'utf8'));
  const auth = new google.auth.OAuth2(
    keys.installed.client_id,
    keys.installed.client_secret,
    keys.installed.redirect_uris[0]
  );
  auth.setCredentials(tokens);
  const sheets = google.sheets({ version: 'v4', auth });

  const RANGE = `'${TAB_NAME}'!A1:Q${rows.length}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: RANGE,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });
}

async function main() {
  const dealers = ['MBW', 'CPS', 'FPT'];
  console.log('[runner] clear sheet before all dealers');
  
  // Clear sheet once, keep header
  const keys = JSON.parse(readFileSync('oauth-client.json', 'utf8'));
  const tokens = JSON.parse(readFileSync('token.json', 'utf8'));
  const auth = new google.auth.OAuth2(
    keys.installed.client_id,
    keys.installed.client_secret,
    keys.installed.redirect_uris[0]
  );
  auth.setCredentials(tokens);
  const sheets = google.sheets({ version: 'v4', auth });
  
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `'${TAB_NAME}'!A2:Q2000`,
    valueInputOption: 'RAW',
    requestBody: { values: [] },
  });
  console.log('[runner] sheet cleared');

  console.log('[runner] start', dealers.join(', '));
  const results = await Promise.all(dealers.map(runDealer));
  console.log('[runner] all dealers completed');

  const merged = [];
  for (const r of results) {
    if (!existsSync(r.jsonPath)) continue;
    const data = JSON.parse(readFileSync(r.jsonPath, 'utf8'));
    merged.push(...data);
    console.log(`[runner] ${r.dealer}: ${data.length} products from ${r.jsonPath}`);
  }

  const rows = [HEADERS];
  for (const item of merged) rows.push(parseRow(item));

  await writeAllToSheet(rows);
  console.log(`[runner] sheet written: ${rows.length - 1} products`);

  const summary = results.map(r => ({
    dealer: r.dealer,
    count: r.count,
    finishedAt: r.finishedAt || new Date().toISOString()
  }));
  writeFileSync(`${OUTPUT_DIR}/run-summary.json`, JSON.stringify({ runAt: new Date().toISOString(), dealers: summary }, null, 2));
  console.log('[runner] summary=', `${OUTPUT_DIR}/run-summary.json`);
  for (const row of summary) console.log(`[runner] ${row.dealer}: count=${row.count} finishedAt=${row.finishedAt}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
