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
  // Read first 5 rows
  const head = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${TAB_NAME}'!A1:Q5`,
  });
  const headVals = head.data.values || [];
  console.log('HEAD_ROWS');
  for (const row of headVals) console.log(JSON.stringify(row));

  // Read middle rows
  const mid = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${TAB_NAME}'!A2010:Q2025`,
  });
  const midVals = mid.data.values || [];
  console.log('MIDDLE_ROWS');
  for (const row of midVals) console.log(JSON.stringify(row));

  // Read tail rows
  const tail = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${TAB_NAME}'!A4000:Q4200`,
  });
  const tailVals = tail.data.values || [];
  console.log('TAIL_ROWS');
  for (const row of tailVals) console.log(JSON.stringify(row));
}

main().catch(err => { console.error(err); process.exit(1); });
