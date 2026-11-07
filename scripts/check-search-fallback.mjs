/* ══════════════════════════════════════════════════════════════════════════
   QA del buscador: nunca debe quedar vacío si el proveedor externo falla.

   Simula YouTube caído y comprueba que `/api/search` responde con el catálogo
   sincronizado. También verifica que las carátulas no consumen el límite de
   peticiones de la API (eran la causa de los 429 al buscar después de Inicio).
   ══════════════════════════════════════════════════════════════════════════ */

import { handleApi } from '../server/api.mjs';

globalThis.fetch = async () => {
  throw new Error('proveedor externo caído (simulado)');
};

let failures = 0;

function check(name, ok, detail = '') {
  const line = `${ok ? '✓' : '✗'} ${name}${detail ? ` · ${detail}` : ''}`;
  console.log(line);
  if (!ok) failures += 1;
}

function makeRes() {
  return {
    status: 0,
    headers: {},
    chunks: [],
    setHeader(key, value) { this.headers[key] = value; },
    writeHead(code, headers) {
      this.status = code;
      if (headers) Object.assign(this.headers, headers);
    },
    end(chunk) { if (chunk) this.chunks.push(String(chunk)); },
    get body() { return this.chunks.join(''); },
  };
}

async function request(path, ip = '127.0.0.1') {
  const res = makeRes();
  const req = {
    method: 'GET',
    headers: { 'user-agent': 'sonora-qa' },
    socket: { remoteAddress: ip },
    url: path,
  };
  await handleApi(req, res, new URL('http://localhost' + path));
  let json = null;
  try { json = JSON.parse(res.body); } catch { /* respuesta no JSON */ }
  return { status: res.status, json, body: res.body };
}

/* 1) Proveedor caído: el catálogo mantiene la búsqueda con resultados. */
const salsa = await request('/api/search?q=salsa&deep=0&limit=20');
check(
  'búsqueda con proveedor caído usa el catálogo',
  salsa.status === 200 && Number(salsa.json?.count) > 0,
  `HTTP ${salsa.status} · ${salsa.json?.count ?? 0} resultados`,
);
check(
  'el respaldo se marca como degradado',
  salsa.json?.degraded === true,
  String(salsa.json?.degraded),
);

/* 1b) Consultas reales multi-palabra: las palabras vacías («para», «en»…) no
   deben impedir que el catálogo encuentre la parte con contenido. */
const realQueries = [
  'cumbia para bailar',
  'rock en español',
  'música romántica',
  'lady gaga',
];
for (const term of realQueries) {
  const result = await request(`/api/search?q=${encodeURIComponent(term)}&deep=0&limit=20`);
  check(
    `«${term}» no se queda vacía con el proveedor caído`,
    result.status === 200 && Number(result.json?.count) > 0,
    `HTTP ${result.status} · ${result.json?.count ?? 0} resultados`,
  );
}

/* 2) Consulta sin coincidencias: nunca queda vacía; ofrece sugerencias
   claramente marcadas en vez de una lista inventada sin aviso. */
const missing = await request('/api/search?q=zzzzqqqxyz&deep=0');
check(
  'consulta sin coincidencias devuelve sugerencias en vez de vacío',
  missing.status === 200 && Number(missing.json?.count) > 0 && missing.json?.suggested === true,
  `HTTP ${missing.status} · ${missing.json?.count ?? 0} resultados`,
);
check(
  'las sugerencias se marcan para no confundirlas con coincidencias',
  Array.isArray(missing.json?.results) && missing.json.results.every((item) => item.suggested === true),
  `${missing.json?.results?.filter((item) => item.suggested).length ?? 0} marcadas`,
);

/* 2b) Consultas difíciles: frases, estados de ánimo, errores y artistas que no
   existen. Todas deben traer algo (coincidencia o sugerencia). */
const hardQueries = [
  'canciones para llorar',
  'música para estudiar',
  'rock de los 80',
  'algo movidito para la fiesta',
  'juanito perez desconocido',
  'asdfgh',
];
for (const term of hardQueries) {
  const result = await request(`/api/search?q=${encodeURIComponent(term)}&deep=0&limit=20`);
  check(
    `«${term}» nunca queda vacía`,
    result.status === 200 && Number(result.json?.count) > 0,
    `HTTP ${result.status} · ${result.json?.count ?? 0} resultados`,
  );
}

/* 3) 300 carátulas seguidas no deben agotar el cupo de la API. */
const cover = '/api/cover/' + Buffer.from('https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg').toString('base64url');
for (let i = 0; i < 300; i += 1) await request(cover, '10.0.0.9');
const afterCovers = await request('/api/search?q=cumbia&deep=0&limit=20', '10.0.0.9');
check(
  'las carátulas no bloquean la búsqueda',
  afterCovers.status === 200,
  `HTTP ${afterCovers.status} · ${afterCovers.json?.count ?? 0} resultados`,
);

if (failures) {
  console.error(`\n${failures} comprobación(es) fallaron.`);
  process.exit(1);
}
console.log('\n✓ buscador resiliente OK');
