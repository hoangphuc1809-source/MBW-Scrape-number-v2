import { formatDate, formatTime, parsePrice } from './helpers.js';
import { logger } from './logger.js';
import { readFileSync, existsSync } from 'fs';
import { google } from 'googleapis';

const SHEET_ID = '1OFMHxyhwo1YwQwvVoBpYB1VdlRathhTKdmC00RA8ns8';
const TAB_NAME = 'RAW DATA';
const HEADER = [
  'date', 'time', 'dealer', 'name',
  'origPrice', 'salePrice', 'discount',
  'sold', 'rating', 'link',
  'cpu', 'ram', 'storage', 'screen', 'gpu', 'weight',
  'scrapedAt'
];
const RANGE = `'${TAB_NAME}'!A:Q`;
const RETENTION_DAYS = 15;

const clientSecretPath = new URL('../../oauth-client.json', import.meta.url);
const tokenPath = new URL('../../token.json', import.meta.url);

let cachedSheetsClient = null;

async function getSheetsClient() {
  if (cachedSheetsClient) return cachedSheetsClient;

  let auth;
  try {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (raw) {
      const creds = JSON.parse(raw);
      auth = new google.auth.GoogleAuth({
        credentials: creds,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    } else if (existsSync(clientSecretPath) && existsSync(tokenPath)) {
      const keys = JSON.parse(readFileSync(clientSecretPath, 'utf8'));
      const tokens = JSON.parse(readFileSync(tokenPath, 'utf8'));
      const oAuth2Client = new google.auth.OAuth2(
        keys.installed.client_id,
        keys.installed.client_secret,
        keys.installed.redirect_uris[0]
      );
      oAuth2Client.setCredentials(tokens);
      auth = oAuth2Client;
    } else {
      throw new Error('No Google credentials available');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err }, `Sheets auth unavailable: ${msg}`);
    return null;
  }

  cachedSheetsClient = google.sheets({ version: 'v4', auth });
  return cachedSheetsClient;
}

async function readAllRows(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: RANGE,
  });
  return res.data.values || [];
}

async function writeAllRows(sheets, rows, options = {}) {
  const { clear = false } = options;
  if (clear) {
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: RANGE,
    }).catch(() => {});
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: RANGE,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });
}

export async function writeRows(rows) {
  const sheets = await getSheetsClient();
  if (!sheets) {
    logger.warn({}, 'Sheets unavailable; skipping remote write');
    return;
  }
  const payload = rows.length ? { values: rows } : { values: [HEADER] };
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: RANGE,
    valueInputOption: 'RAW',
    requestBody: payload,
  });
}

export async function overwriteBatch(rows) {
  if (!rows || rows.length === 0) {
    await writeRows([]);
    return;
  }
  const sheets = await getSheetsClient();
  if (!sheets) {
    logger.warn({}, 'Sheets unavailable; skipping overwrite');
    return;
  }
  const formatted = rows.map((r) => {
    const d = new Date(r.scrapedAt);
    return [
      formatDate(d),
      formatTime(d),
      r.dealer,
      r.name,
      parsePrice(r.origPrice),
      parsePrice(r.salePrice),
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
      r.scrapedAt,
    ];
  });
  const payload = [HEADER, ...formatted];
  await writeAllRows(sheets, payload, { clear: true });
  logger.info({
    wrote: formatted.length,
    dealers: [...new Set(rows.map((r) => r.dealer))].join(','),
  }, 'Batch overwrite completed');
}

export async function appendRows(newRows) {
  if (!newRows || newRows.length === 0) return;
  const sheets = await getSheetsClient();
  if (!sheets) {
    logger.warn({ dealer: newRows[0]?.dealer }, 'Sheets unavailable; skipping remote append');
    return;
  }

  const today = formatDate(new Date());
  const existing = await readAllRows(sheets);
  const hasHeader = existing.length > 0 && existing[0][0] === 'date';
  const header = hasHeader ? [existing[0]] : [HEADER];
  const dataRows = hasHeader ? existing.slice(1) : existing;
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const todayKeys = new Set();
  for (const row of dataRows) {
    if (row[0] === today) {
      const key = `${row[2]}|||${row[3]}|||${row[9]}`;
      todayKeys.add(key);
    }
  }
  const retained = dataRows.filter((row) => {
    const rowDate = new Date(row[0]);
    return !isNaN(rowDate.getTime()) && rowDate >= cutoff;
  });
  const toAppend = [];
  for (const r of newRows) {
    const key = `${r.dealer}|||${r.name}|||${r.link}`;
    if (todayKeys.has(key)) continue;
    const d = new Date(r.scrapedAt);
    toAppend.push([
      formatDate(d),
      formatTime(d),
      r.dealer,
      r.name,
      parsePrice(r.origPrice),
      parsePrice(r.salePrice),
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
      r.scrapedAt,
    ]);
    todayKeys.add(key);
  }
  if (toAppend.length === 0) {
    logger.info({ dealer: newRows[0]?.dealer }, 'No new rows to append (all deduped)');
    return;
  }
  const allRows = [...header, ...retained, ...toAppend];
  await writeAllRows(sheets, allRows);
  logger.info(
    { dealer: newRows[0]?.dealer, appended: toAppend.length, retained: retained.length },
    'Sheets updated'
  );
}
