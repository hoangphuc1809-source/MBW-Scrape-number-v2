import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'output', 'MBW-20260712151108.json'), 'utf8'));
const flash = data.filter(d => d.link && d.link.includes('utm_flashsale=1'));
console.log('flashsale count:', flash.length);
for (const item of flash) {
  console.log(JSON.stringify({ name: item.name, origPrice: item.origPrice, salePrice: item.salePrice, link: item.link }));
}
