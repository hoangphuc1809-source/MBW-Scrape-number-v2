const fs=require('fs');
const h=fs.readFileSync('input.html','utf8');
const m=h.match(/<script[^>]*>([\s\S]*)<\/script>/);
try{ new Function(m[1]); console.log('input html parse OK'); }catch(e){ console.log('input html parse ERR', e.message); }
