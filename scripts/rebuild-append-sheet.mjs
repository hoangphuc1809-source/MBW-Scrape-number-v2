import { google } from 'googleapis';
import { readFileSync } from 'node:fs';

const SHEET_ID = '1OFMHxyhwo1YwQwvVoBpYB1VdlRathhTKdmC00RA8ns8';
const TAB_NAME = 'RAW DATA';
const RANGE = `'${TAB_NAME}'!A:Q`;

const clientSecretPath = new URL('../oauth-client.json', import.meta.url);
const tokenPath = new URL('../token.json', import.meta.url);

const keys = JSON.parse(readFileSync(clientSecretPath, 'utf8'));
const tokens = JSON.parse(readFileSync(tokenPath, 'utf8'));

const oAuth2Client = new google.auth.OAuth2(
  keys.installed.client_id,
  keys.installed.client_secret,
  keys.installed.redirect_uris[0]
);
oAuth2Client.setCredentials(tokens);

const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });

const HEADER = [
  'date', 'time', 'dealer', 'name',
  'origPrice', 'salePrice', 'discount',
  'sold', 'rating', 'link',
  'cpu', 'ram', 'storage', 'screen', 'gpu', 'weight',
  'scrapedAt'
];

const toNum = (val) => {
  if (val === null || val === undefined || val === '') return '';
  const n = String(val).replace(/[^\d]/g, '');
  return n ? Number(n) : '';
};

const formatDate = (d) => d.toISOString().slice(0, 10);
const formatTime = (d) => d.toTimeString().slice(0, 8);

const load = (path) => JSON.parse(readFileSync(path, 'utf8'));

const rowsForDealer = (file, dealer, when) => {
  const data = load(file);
  return data.map(item => [
    formatDate(when),
    formatTime(when),
    dealer,
    item.name || '',
    toNum(item.origPrice),
    toNum(item.salePrice),
    item.discount || '',
    item.sold || '',
    item.rating || '',
    item.link || '',
    item.cpu || '',
    item.ram || '',
    item.storage || '',
    item.screen || '',
    item.gpu || '',
    item.weight || '',
    item.scrapedAt || when.toISOString(),
  ]);
};

const keyForRow = (r) => `${r[2]}|||${r[3]}|||${r[9]}`; // dealer|||name|||link

const main = async () => {
  // Yesterday data (2026-07-20)
  const whenOld = new Date('2026-07-20T00:00:00+07:00');
  const mbwOld = rowsForDealer('output/MBW-20260720123647.json', 'MBW', whenOld);
  const fptOld = rowsForDealer('output/FPT-20260720120915.json', 'FPT', whenOld);
  const cpsOld = rowsForDealer('output/CPS-20260720132942.json', 'CPS', whenOld);

  // Today data (2026-07-21)
  const whenNew = new Date('2026-07-21T00:00:00+07:00');
  const mbwNew = rowsForDealer('output/MBW-20260721080811.json', 'MBW', whenNew);
  const fptNew = rowsForDealer('output/FPT-20260721090153.json', 'FPT', whenNew);
  const cpsNew = rowsForDealer('output/CPS-20260721085010.json', 'CPS', whenNew);

  // Build dataset: old rows + only NEW rows from today
  const oldRows = [...mbwOld, ...fptOld, ...cpsOld];
  const existingKeys = new Set(oldRows.map(keyForRow));

  const append = (rows) => rows.filter(r => !existingKeys.has(keyForRow(r)));
  const mbwAppend = append(mbwNew);
  const fptAppend = append(fptNew);
  const cpsAppend = append(cpsNew);

  const payload = [
    HEADER,
    ...oldRows,
    ...mbwAppend,
    ...fptAppend,
    ...cpsAppend,
  ];

  console.log(`Rebuilding sheet: old=${oldRows.length}, newMBW=${mbwAppend.length}, newFPT=${fptAppend.length}, newCPS=${cpsAppend.length}, total=${payload.length - 1}`);

  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: RANGE,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: RANGE,
    valueInputOption: 'RAW',
    requestBody: { values: payload },
  });

  console.log('Done.');
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
