#!/usr/bin/env node
import { runScrape } from './scrapers/index.js';
import { appendRows, overwriteBatch } from './utils/sheets.js';
import { logger } from './utils/logger.js';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

function parseDealerArg() {
  const args = process.argv.slice(2);
  const flagIdx = args.indexOf('--dealer');
  if (flagIdx !== -1 && args[flagIdx + 1]) return args[flagIdx + 1];
  const positional = args.find((a) => !a.startsWith('--'));
  return positional || process.env.SCRAPE_DEALERS || null;
}

function ensureOutputDir() {
  const target = './output';
  if (!existsSync(target)) mkdirSync(target, { recursive: true });
  return target;
}

function localFileName(dealer) {
  const d = new Date();
  const stamp = d.toISOString().replace(/[:T]/g, '-').replace(/\..+/, '').replace(/[-:]/g, '').slice(0, 15);
  return `./output/${dealer}-${stamp}.json`;
}

(async () => {
  const dealerArg = parseDealerArg();
  const dealers = dealerArg ? dealerArg.split(',').map((s) => s.trim()) : ['MBW', 'CPS', 'FPT'];
  const outputJson = String(process.env.OUTPUT_JSON || 'false').toLowerCase() === 'true';
  const fullRefresh = String(process.env.FULL_REFRESH || 'false').toLowerCase() === 'true';

  if (outputJson) ensureOutputDir();

  let exitCode = 0;
  const allRows = [];
  for (const d of dealers) {
    logger.info({ dealer: d }, 'Scrape dealer start');
    try {
      const rows = await runScrape(d);
      logger.info({ dealer: d, count: rows?.length ?? 0 }, 'Scrape dealer done');

      if (rows && rows.length > 0) {
        if (outputJson) {
          const path = localFileName(d);
          writeFileSync(path, JSON.stringify(rows, null, 2), 'utf8');
          logger.info({ dealer: d, path, count: rows.length }, 'JSON output written');
        }
        allRows.push(...rows);
      }
    } catch (err) {
      logger.error({ dealer: d, err }, 'Scrape dealer failed');
      exitCode = 1;
    }
  }

  if (allRows.length > 0) {
    try {
      if (fullRefresh) {
        await overwriteBatch(allRows);
        logger.info({ count: allRows.length, dealers: dealers.join(',') }, 'Batch full overwrite completed');
      } else {
        await appendRows(allRows);
        logger.info({ count: allRows.length, dealers: dealers.join(',') }, 'Batch rows appended');
      }
    } catch (err) {
      const msg = err?.message || '';
      if (msg.includes('GOOGLE_SERVICE_ACCOUNT_JSON')) {
        logger.warn({}, 'Skip Sheets write: GOOGLE_SERVICE_ACCOUNT_JSON not set');
      } else {
        throw err;
      }
    }
  }

  process.exitCode = exitCode;
})();
