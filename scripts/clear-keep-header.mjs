import { readFileSync } from 'fs';
import { google } from 'googleapis';

const SHEET_ID = '1OFMHxyhwo1YwQwvVoBpYB1VdlRathhTKdmC00RA8ns8';
const TAB_NAME = 'RAW DATA';
const keys = JSON.parse(readFileSync('oauth-client.json', 'utf8'));
const tokens = JSON.parse(readFileSync('token.json', 'utf8'));
const oAuth2Client = new google.auth.OAuth2(
  keys.installed.client_id,
  keys.installed.client_secret,
  keys.installed.redirect_uris[0]
);
oAuth2Client.setCredentials(tokens);
const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });

async function main() {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheet = meta.data.sheets.find(s => s.properties.title === TAB_NAME);
  if (!sheet) { console.error('Sheet not found'); process.exit(1); }
  const sheetId = sheet.properties.sheetId;

  // Read last rows within grid limit to detect populated rows
  const tail = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${TAB_NAME}'!A1200:Q1251`,
  });
  const vals = tail.data.values || [];
  let last = 1200;
  for (let i = vals.length - 1; i >= 0; i--) {
    if (vals[i].some(cell => String(cell || '').trim() !== '')) {
      last = 1200 + i;
      break;
    }
  }

  console.log('last_row_with_data', last);
  if (last <= 1) {
    console.log('already_empty');
    return;
  }

  // Delete rows from 2 to last inclusive
  const body = {
    requests: [
      {
        deleteDimension: {
          range: {
            sheetId: sheetId,
            dimension: 'ROWS',
            startIndex: 1,
            endIndex: last + 1,
          },
        },
      },
    ],
  };

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: body,
  });
  console.log('cleared_rows_2_to', last);
}

main().catch(err => { console.error(err); process.exit(1); });
