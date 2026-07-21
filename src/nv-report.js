import { google } from 'googleapis';
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SPREADSHEET_ID = '1uAi91aL4QROK9u-x0Po8mvtoceksXPMVO8Dvsz-FoFA';
const TAB_NAME = 'NV Report';

const clientSecretPath = path.join(__dirname, '../oauth-client.json');
const tokenPath = path.join(__dirname, '../token.json');

// Columns we MAY write to (1-indexed). Everything else is read-only/untouched.
const OEM_COLS = {
  Asus: 4,      // D
  Acer: 5,      // E
  Lenovo: 6,    // F
  MSI: 7,       // G
  HP: 8,        // H
  Giga: 9,      // I  (sheet header shows "Giga", so match this exact token)
  Dell: null,   // no mapping in sheet
};

// GPU columns AD..AP (1-indexed)
const GPU_COLS = {
  'RTX 2050': 30,    // AD
  'RTX 3050': 31,    // AE
  'RTX 4050': 32,    // AF
  'RTX 4060': 33,    // AG
  'RTX 4070': 34,    // AH
  'RTX 4080': 35,    // AI
  'RTX 4090': 36,    // AJ
  'RTX 5050': 37,    // AK
  'RTX 5060': 38,    // AL
  'RTX 5070': 39,    // AM
  'RTX 5070Ti': 40,  // AN
  'RTX 5080': 41,    // AO
  'RTX 5090': 42,    // AP
};

const TOTAL_MARKET_COL = 18; // R

function toISOWeek(date) {
  const tmp = new Date(date.valueOf());
  tmp.setHours(0, 0, 0, 0);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const week1 = new Date(tmp.getFullYear(), 0, 4);
  const d = Math.round(((tmp.valueOf() - week1.valueOf()) / 86400000 - 3 + ((tmp.getDay() + 6) % 7)) / 7);
  return `${tmp.getFullYear()}W${d + 1}`;
}

function isDiscreteGPU(gpu) {
  const s = String(gpu || '').toLowerCase();
  if (!s || s === 'nan') return false;
  if (/tích hợp|integrated|uhd|iris|radeon graphics|adreno|apple a\d|apple m\d/.test(s)) return false;
  return true;
}

function loadLatestData() {
  const outDir = path.join(__dirname, '../output');
  if (!existsSync(outDir)) return [];
  return readdirSync(outDir)
    .filter((f) => /\.json$/i.test(f) && !/run-summary\.json$/i.test(f))
    .sort()
    .reverse()
    .slice(0, 10)
    .flatMap((f) => {
      try {
        const data = JSON.parse(readFileSync(path.join(outDir, f), 'utf8'));
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    });
}

function normalizeBrand(raw) {
  const v = String(raw || '').trim();
  if (!v) return null;
  const u = v.toLowerCase();
  if (u.includes('asus')) return 'Asus';
  if (u.includes('acer')) return 'Acer';
  if (u.includes('msi')) return 'MSI';
  if (u.includes('dell')) return 'Dell';
  if (u.includes('lenovo') || u.includes('lnv')) return 'Lenovo';
  if (u.includes('hp')) return 'HP';
  if (u.includes('gigabyte') || u.includes('giga')) return 'Giga';
  return null;
}

function computeOEM(items) {
  const map = {};
  let total = 0;
  for (const r of items) {
    const brand = normalizeBrand(r.brand || r.name);
    if (!brand) continue;
    if (!(brand in OEM_COLS)) continue;
    map[brand] = (map[brand] || 0) + 1;
    total += 1;
  }
  return { counts: map, total };
}

function computeGPU(items) {
  const modelKeys = Object.keys(GPU_COLS);
  const counts = {};
  let total = 0;
  for (const r of items) {
    const raw = String(r.gpu || '').trim();
    if (!isDiscreteGPU(raw)) continue;
    total += 1;
    for (const m of modelKeys) {
      const needle = m.replace('RTX ', '').trim();
      if (raw.includes(needle)) {
        counts[m] = (counts[m] || 0) + 1;
        break;
      }
    }
  }
  return { counts, total };
}

let cachedSheetsClient = null;
async function getSheetsClient() {
  if (cachedSheetsClient) return cachedSheetsClient;
  if (!existsSync(clientSecretPath) || !existsSync(tokenPath)) {
    throw new Error('Missing oauth-client.json or token.json');
  }
  const keys = JSON.parse(readFileSync(clientSecretPath, 'utf8'));
  const tokens = JSON.parse(readFileSync(tokenPath, 'utf8'));
  const oAuth2Client = new google.auth.OAuth2(
    keys.installed.client_id,
    keys.installed.client_secret,
    keys.installed.redirect_uris[0]
  );
  oAuth2Client.setCredentials(tokens);
  cachedSheetsClient = google.sheets({ version: 'v4', auth: oAuth2Client });
  return cachedSheetsClient;
}

function writeOutputJson(data) {
  const outDir = path.join(__dirname, '../output');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'run-summary-nv.json'), JSON.stringify(data, null, 2), 'utf8');
}

(async () => {
  const sheets = await getSheetsClient();

  // Load headers first to make sure we're aligned with the actual sheet
  const meta = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${TAB_NAME}'!A2:AP3`,
  });
  const metaRows = meta.data.values || [];
  const headerNames = metaRows[1] || [];
  const cHeader = String(headerNames[2] || '').trim();
  console.log('Header C:', JSON.stringify(cHeader));
  console.log('Header sample:', JSON.stringify(headerNames.slice(0, 10)));

  // Read ALL rows to find target row + check duplicates
  const all = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${TAB_NAME}'!A:AP`,
  });
  const rows = all.data.values || [];
  console.log('Loaded rows total:', rows.length);

  const now = new Date();
  const currentWeek = toISOWeek(now);

  // CHECK: READ-ONLY duplicate scan in column C
  const hasDuplicate = rows.some((row) => {
    const c = String(row[2] || '').trim();
    return c === currentWeek || c === `~ ${currentWeek}`;
  });
  console.log('Current week:', currentWeek, '| duplicate:', hasDuplicate);

  if (hasDuplicate) {
    writeOutputJson({ ok: false, reason: 'duplicate_week', week: currentWeek, finishedAt: now.toISOString() });
    console.log('Duplicate week found in column C. Skip writing.');
    process.exit(0);
  }

  const items = loadLatestData();
  console.log('Loaded scrape items:', items.length);
  const oem = computeOEM(items);
  const gpu = computeGPU(items);
  console.log('OEM counts:', JSON.stringify(oem.counts), '| total:', oem.total);
  console.log('GPU counts:', JSON.stringify(gpu.counts), '| total:', gpu.total);

  // Find append row: first fully empty row below current data
  let targetRow = rows.length + 1;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].some((cell) => String(cell || '').trim() !== '')) {
      targetRow = i + 2; // next new row
      break;
    }
  }
  console.log('Target row (append):', targetRow);

  // Build row payload ONLY from D..AP. Never write A/B/C/J..Q/S..AB.
  // Because the write range is D:AP only, this array lines up with D onward.
  const rowParts = [];

  // D:I OEM shares
  for (const col of [4, 5, 6, 7, 8, 9]) {
    const brand = Object.entries(OEM_COLS).find(([, v]) => v === col)?.[0];
    if (!brand) { rowParts.push(''); continue; }
    const pct = oem.total ? ((oem.counts[brand] || 0) / oem.total) * 100 : 0;
    rowParts.push(`${pct.toFixed(1)}%`);
  }

  // J:Q untouched => 8 blanks
  for (let i = 0; i < 8; i++) rowParts.push('');

  // R = Total Market, MUST be number, not text
  rowParts.push(items.length);

  // S:AB untouched => 10 blanks
  for (let i = 0; i < 10; i++) rowParts.push('');

  // AC untouched => 1 blank
  rowParts.push('');

  // AD:AP GPU shares
  for (const col of [30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42]) {
    const model = Object.entries(GPU_COLS).find(([, v]) => v === col)?.[0];
    if (!model) { rowParts.push(''); continue; }
    const pct = gpu.total ? ((gpu.counts[model] || 0) / gpu.total) * 100 : 0;
    rowParts.push(`${pct.toFixed(1)}%`);
  }

  // Strict range: D:AP only. A/B/C/J..Q/S..AB are never touched.
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${TAB_NAME}'!D${targetRow}:AP${targetRow}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [rowParts] },
  });

  const finishedISO = now.toISOString();
  writeOutputJson({
    ok: true,
    week: currentWeek,
    writtenAt: finishedISO.slice(0, 10),
    finishedAt: finishedISO,
    row: targetRow,
    totalMarket: items.length,
    oemShares: Object.fromEntries(
      Object.entries(OEM_COLS)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => [k, rowParts[v - 1]])
    ),
    gpuShares: Object.fromEntries(Object.entries(GPU_COLS).map(([k, v]) => [k, rowParts[v - 1]])),
    range: `A${targetRow}:AP${targetRow}`
  });

  console.log('Done NV Report', currentWeek, '| row', targetRow);
  console.log('Summary:', JSON.stringify({
    week: currentWeek,
    row: targetRow,
    totalMarket: items.length,
    A_C: rowParts.slice(0, 3),
    D_I: rowParts.slice(3, 9),
    R: rowParts[17],
    AD_AP: rowParts.slice(29, 42),
  }, null, 2));
})();
