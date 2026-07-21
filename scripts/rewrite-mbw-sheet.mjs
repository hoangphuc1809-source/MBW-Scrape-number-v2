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

const data = JSON.parse(readFileSync('output/MBW-20260713081201.json', 'utf8'));

const HEADER = [
  'date', 'time', 'dealer', 'name',
  'origPrice', 'salePrice', 'discount',
  'sold', 'rating', 'link',
  'cpu', 'ram', 'storage', 'screen', 'gpu', 'weight',
  'scrapedAt'
];

const now = new Date();
const today = now.toISOString().slice(0, 10);
const timeStr = now.toTimeString().slice(0, 8);

const toNum = (val) => {
  if (val === null || val === undefined || val === '') return '';
  const n = String(val).replace(/[^\d]/g, '');
  return n ? Number(n) : '';
};

const rows = data.map(item => [
  today,
  timeStr,
  'MBW',
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
  item.scrapedAt || now.toISOString(),
]);

console.log(`Clearing sheet before writing ${rows.length} rows...`);
await sheets.spreadsheets.values.clear({
  spreadsheetId: SHEET_ID,
  range: RANGE,
});

console.log(`Writing ${rows.length} rows to sheet...`);
await sheets.spreadsheets.values.update({
  spreadsheetId: SHEET_ID,
  range: RANGE,
  valueInputOption: 'USER_ENTERED',
  requestBody: { values: [HEADER, ...rows] },
});

console.log(`Done. Wrote ${rows.length} data rows + 1 header.`);