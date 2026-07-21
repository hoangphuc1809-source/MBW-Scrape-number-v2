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

const load = (path) => JSON.parse(readFileSync(path, 'utf8'));

const dateIdx = 0;
const timeIdx = 1;
const dealerIdx = 2;
const nameIdx = 3;
const origIdx = 4;
const saleIdx = 5;
const discountIdx = 6;
const soldIdx = 7;
const ratingIdx = 8;
const linkIdx = 9;
const cpuIdx = 10;
const ramIdx = 11;
const storageIdx = 12;
const screenIdx = 13;
const gpuIdx = 14;
const weightIdx = 15;
const scrapedAtIdx = 16;

const keyForRow = (r) => `${r[dealerIdx]}|||${r[nameIdx]}|||${r[linkIdx]}`;

const main = async () => {
  // Read all current rows
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: RANGE,
  });
  const values = res.data.values || [];
  if (!values.length) {
    console.log('Sheet is empty.');
    return;
  }

  const header = values[0];
  const rows = values.slice(1);

  // We only want to change rows where date is 2026-07-20 but scrapedAt/timestamp indicates today's scrape.
  // In our rebuild script, old rows already had 2026-07-20 as intended.
  // The appended rows from today also got 2026-07-20 in the previous write. Let's fix those to 2026-07-21.
  // Distinguish by time: appended runs are around 15:08-16:01 today. We'll treat rows with time starting with '15:' or '16:' and dealer in {MBW,CPS,FPT} as today's appended rows.
  const todayStr = '2026-07-21';
  const updated = rows.map(r => {
    const time = String(r[timeIdx] || '');
    const dealer = String(r[dealerIdx] || '');
    if (time.startsWith('15:') || time.startsWith('16:')) {
      if (['MBW', 'CPS', 'FPT'].includes(dealer)) {
        return { row: r, newDate: todayStr, newTime: time };
      }
    }
    return { row: r, newDate: r[dateIdx], newTime: r[timeIdx] };
  }).map(r => {
    const row = [...r.row];
    row[dateIdx] = r.newDate;
    // keep time unchanged
    return row;
  });

  // Verify counts
  const counts = {};
  for (const r of updated) {
    counts[r[dealerIdx]] = (counts[r[dealerIdx]] || 0) + 1;
  }
  console.log('Updated counts:', counts);

  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: RANGE,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: RANGE,
    valueInputOption: 'RAW',
    requestBody: { values: [header, ...updated] },
  });

  console.log(`Done. Total data rows: ${updated.length}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
