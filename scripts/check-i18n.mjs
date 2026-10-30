import fs from 'node:fs';
import path from 'node:path';

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

const files = walk('src');
const keys = new Set();
const tplKeys = new Set();
for (const f of files.filter((f) => f.endsWith('.jsx') || f.endsWith('.js'))) {
  const src = fs.readFileSync(f, 'utf8');
  /* Solo llamadas reales a `t(...)`. Sin el límite de palabra, `format(`, `split(`
     o `set(` también encajaban y ensuciaban el informe con claves inventadas. */
  for (const m of src.matchAll(/(?<![\w$])t\(\s*'([^']+)'/g)) keys.add(m[1]);
  for (const m of src.matchAll(/(?<![\w$])t\(\s*"([^"]+)"/g)) keys.add(m[1]);
  for (const m of src.matchAll(/(?<![\w$])t\(\s*`([^`]+)`/g)) tplKeys.add(m[1]);
}

const i18n = fs.readFileSync('src/i18n.js', 'utf8');
const esStart = i18n.indexOf('  es: {');
const enStart = i18n.indexOf('  en: {');
const esBlock = i18n.slice(esStart, enStart);
const enBlock = i18n.slice(enStart);
const esKeys = new Set([...esBlock.matchAll(/^\s{4}([A-Za-z_][A-Za-z0-9_]*):/gm)].map((m) => m[1]));
const enKeys = new Set([...enBlock.matchAll(/^\s{4}([A-Za-z_][A-Za-z0-9_]*):/gm)].map((m) => m[1]));

const missingEs = [...keys].filter((k) => !esKeys.has(k));
const missingEn = [...keys].filter((k) => !enKeys.has(k));
const onlyEs = [...esKeys].filter((k) => !enKeys.has(k));
const onlyEn = [...enKeys].filter((k) => !esKeys.has(k));

console.log(`usadas: ${keys.size} | es: ${esKeys.size} en: ${enKeys.size}`);
console.log('faltan ES:', missingEs.join(', ') || 'ninguna');
console.log('faltan EN:', missingEn.join(', ') || 'ninguna');
console.log('solo en ES:', onlyEs.join(', ') || 'ninguna');
console.log('solo en EN:', onlyEn.join(', ') || 'ninguna');
console.log('plantillas dinámicas:', [...tplKeys].join(', ') || 'ninguna');
