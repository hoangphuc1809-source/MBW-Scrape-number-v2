import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'output', 'MBW-20260712151108.json'), 'utf8'));

const total = data.length;
const withOrig = data.filter(d => d.origPrice).length;
const withSale = data.filter(d => d.salePrice).length;
const flash = data.filter(d => d.link && d.link.includes('utm_flashsale=1'));
const normal = data.filter(d => !d.link || !d.link.includes('utm_flashsale=1'));

console.log(`TOTAL=${total}`);
console.log(`ORIG=${withOrig} SALE=${withSale}`);
console.log(`FLASH=${flash.length} (orig=${flash.filter(d=>d.origPrice).length}, sale=${flash.filter(d=>d.salePrice).length})`);
console.log(`NORMAL=${normal.length} (orig=${normal.filter(d=>d.origPrice).length}, sale=${normal.filter(d=>d.salePrice).length})`);
