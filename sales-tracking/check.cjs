const fs=require('fs');
const h=fs.readFileSync('output.html','utf8');
const m=h.match(/<script[^>]*>([\s\S]*)<\/script>/);
try{ new Function(m[1]); console.log('output html parse OK'); }catch(e){ console.log('output html parse ERR', e.message); }
