import { google } from 'googleapis';
import { readFileSync, existsSync } from 'node:fs';

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

const main = async () => {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: RANGE,
  });
  const values = res.data.values || [];
  const header = values[0] || [];
  const dealerIdx = header.indexOf('dealer');
  const nameIdx = header.indexOf('name');
  const linkIdx = header.indexOf('link');
  const origIdx = header.indexOf('origPrice');
  const saleIdx = header.indexOf('salePrice');
  const weightIdx = header.indexOf('weight');

  console.log(`Total rows (incl header): ${values.length}`);
  console.log(`Header columns: ${header.join(' | ')}`);
  console.log(`Dealer col index: ${dealerIdx}, name: ${nameIdx}, link: ${linkIdx}, origPrice: ${origIdx}, salePrice: ${saleIdx}, weight: ${weightIdx}`);

  const counts = {};
  const missingPrice = [];
  const missingName = [];
  const missingLink = [];
  const samePrice = [];
  const negativePrice = [];
  const missingWeight = [];

  const dealers = new Set();

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const dealer = row[dealerIdx];
    const name = row[nameIdx];
    const link = row[linkIdx];
    const orig = row[origIdx];
    const sale = row[saleIdx];
    const weight = row[weightIdx];

    if (!dealer) continue;
    dealers.add(dealer);
    counts[dealer] = (counts[dealer] || 0) + 1;

    if (!name || String(name).trim() === '') missingName.push(i + 1);
    if (!link || String(link).trim() === '') missingLink.push(i + 1);

    const origNum = Number(String(orig).replace(/[^\d]/g, ''));
    const saleNum = Number(String(sale).replace(/[^\d]/g, ''));
    if (orig && !origNum) missingPrice.push({ row: i + 1, dealer, name, orig, sale });
    if (sale && !saleNum) missingPrice.push({ row: i + 1, dealer, name, orig, sale });
    if (origNum && saleNum && origNum === saleNum) samePrice.push({ row: i + 1, dealer, name, orig, sale });
    if ((origNum && origNum < 0) || (saleNum && saleNum < 0)) negativePrice.push({ row: i + 1, dealer, name, orig, sale });
    if (!weight || String(weight).trim() === '') missingWeight.push(i + 1);
  }

  console.log(`\nDistinct dealers found: ${Array.from(dealers).join(', ')}`);
  console.log('Counts by dealer:');
  for (const [d, c] of Object.entries(counts)) {
    console.log(`  ${d}: ${c}`);
  }

  console.log(`\nMissing name rows: ${missingName.length}`);
  console.log(`Missing link rows: ${missingLink.length}`);
  console.log(`Missing/unparseable price rows: ${missingPrice.length}`);
  console.log(`Same origPrice==salePrice rows: ${samePrice.length}`);
  console.log(`Negative price rows: ${negativePrice.length}`);
  console.log(`Missing weight rows: ${missingWeight.length}`);

  if (missingPrice.length > 0) {
    console.log('\nSample missing/unparseable price:');
    missingPrice.slice(0, 5).forEach(x => console.log(`  row ${x.row} ${x.dealer}: ${x.name} => orig=${x.orig} sale=${x.sale}`));
  }
  if (samePrice.length > 0) {
    console.log('\nSample same price:');
    samePrice.slice(0, 5).forEach(x => console.log(`  row ${x.row} ${x.dealer}: ${x.name} => ${x.orig}`));
  }
  if (missingWeight.length > 0) {
    console.log(`\nWeight missing total: ${missingWeight.length}`);
  }

  // verify totals against known JSON sizes
  const expected = { MBW: 463, FPT: 338, CPS: 1219 };
  console.log('\nExpected vs actual:');
  for (const [d, exp] of Object.entries(expected)) {
    const actual = counts[d] || 0;
    const ok = actual === exp ? 'OK' : `MISMATCH (expected ${exp})`;
    console.log(`  ${d}: actual=${actual} expected=${exp} => ${ok}`);
  }
};

main().catch((e) => {
  console.error('AUDIT ERROR:', e);
  process.exit(1);
});
