import { scrapeMBW } from './mbw.js';
import { scrapeCPS } from './cps.js';
import { scrapeFPT } from './fpt.js';

const SCRAPERS = {
  MBW: scrapeMBW,
  CPS: scrapeCPS,
  FPT: scrapeFPT,
};

export async function runScrape(dealer) {
  const fn = SCRAPERS[dealer];
  if (!fn) throw new Error(`Unsupported dealer: ${dealer}`);
  return fn();
}
