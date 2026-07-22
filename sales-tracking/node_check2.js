try {
  const fs = require('fs');
  const h = fs.readFileSync('output.html','utf8');
  const m = h.match(/<script[^>]*>([\s\S]*)<\/script>/);
  if(!m) { console.log('no script'); process.exit(1); }
  const js = m[1];
  new Function(js);
  console.log('PARSE_OK');
} catch(e) {
  console.log('ERR '+e.message);
}
