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
  // Find sheetId from spreadsheet metadata
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const sheet = meta.data.sheets.find(s => s.properties.title === TAB_NAME);
  if (!sheet) {
    console.error('Sheet not found', TAB_NAME);
    process.exit(1);
  }
  const sheetId = sheet.properties.sheetId;

  // Read a large range from bottom to find last row; first read tail rows
  const tail = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${TAB_NAME}'!A2000:Q2500`,
  });
  const tailVals = tail.data.values || [];
  let last = 1999;
  for (let i = tailVals.length - 1; i >= 0; i--) {
    if (tailVals[i].some(cell => String(cell || '').trim() !== '')) {
      last = 2000 + i;
      break;
    }
  }
  console.log('last_row', last);

  if (last <= 2016) {
    console.log('nothing_to_delete', last);
    return;
  }

  const body = {
    requests: [
      {
        deleteDimension: {
          range: {
            sheetId: sheetId,
            dimension: 'ROWS',
            startIndex: 2016,
            endIndex: last + 1,
          },
        },
      },
    ],
  };

  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: body,
  });
  console.log('deleted_rows', 2016, 'to', last, 'sheetId', sheetId);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
