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

const rowsForDealer = (file, dealer) => {
  const now = new Date();
  return load(file).map(item => [
    formatDate(now),
    formatTime(now),
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
    item.scrapedAt || now.toISOString(),
  ]);
};

const main = async () => {
  const mbwRows = rowsForDealer('output/MBW-20260720123647.json', 'MBW');
  const fptRows = rowsForDealer('output/FPT-20260720120915.json', 'FPT');
  const cpsRows = rowsForDealer('output/CPS-20260720132942.json', 'CPS');

  const payload = [HEADER, ...mbwRows, ...fptRows, ...cpsRows];

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

  console.log(`Done. MBW=${mbwRows.length}, FPT=${fptRows.length}, CPS=${cpsRows.length}, total=${payload.length - 1}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
