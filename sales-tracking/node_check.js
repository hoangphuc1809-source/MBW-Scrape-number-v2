try {
  const fs = 'fs';
  const path = 'C:/Users/Tran Hoang Phuc/MBW-Scrape-number-v2/sales-tracking/output.html';
  const m = require('fs').readFileSync(path,'utf8').match(/<script[^>]*>([\s\S]*)<\/script>/);
  if(!m) { console.log('no script'); process.exit(1); }
  const js = m[1];
  new Function(js);
  console.log('JS parse OK');
} catch(e) {
  console.log('JS parse error:', e.message, 'line', e.lineNumber);
}
