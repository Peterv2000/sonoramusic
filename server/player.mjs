/* ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ
   player.mjs ÔÇö extrae la pista de AUDIO de un v├¡deo de YouTube y la
   reenv├¡a al navegador por streaming.

   Se usa desde `GET /api/download?id=<videoId>` para que la PWA pueda
   guardar el audio real en la Cache API y reproducirlo sin conexi├│n.

   La extracci├│n usa la misma clave p├║blica de la web de YouTube que ya usa
   el buscador (`youtube.mjs`). No depende de APIs de pago.
   ÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉ */

const KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/* Cach├® en memoria de la URL de audio resuelta (evita re-resolver). */
const audioCache = new Map();
const TTL = 1000 * 60 * 30;

/**
 * Devuelve la mejor URL de stream de audio (m4a/webm) para un v├¡deo, o null.
 */
export async function resolveAudioUrl(videoId) {
  const hit = audioCache.get(videoId);
  if (hit && Date.now() - hit.t < TTL) return hit.url;

  const body = {
    context: {
      client: { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 30, hl: 'es', gl: 'US' },
    },
    videoId,
    contentCheckOk: true,
    racyCheckOk: true,
  };

  const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${KEY}&prettyPrint=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA, 'X-YouTube-Client-Name': '3', 'X-YouTube-Client-Version': '19.09.37' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const data = await res.json();

  const formats = data?.streamingData?.adaptiveFormats || data?.streamingData?.formats || [];
  // Preferimos audio de mayor bitrate que no sea cifrado (sig disponible).
  const audio = formats
    .filter((f) => /audio\//.test(f.mimeType || '') && f.url)
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  const best = audio[0];
  if (!best?.url) return null;

  audioCache.set(videoId, { t: Date.now(), url: best.url, mime: best.mimeType });
  if (audioCache.size > 200) audioCache.delete(audioCache.keys().next().value);
  return best.url;
}

/**
 * Hace streaming del audio del v├¡deo hacia la respuesta HTTP.
 * Soporta rangos (Range) para que el navegador pueda buscar dentro de la pista.
 * @returns {Promise<boolean>} true si pudo emitir el audio
 */
export async function streamAudio(videoId, req, res) {
  const url = await resolveAudioUrl(videoId);
  if (!url) return false;

  const headers = { 'User-Agent': UA };
  if (req.headers.range) headers.Range = req.headers.range;

  const up = await fetch(url, { headers });
  if (!up.ok && up.status !== 206) return false;

  res.writeHead(up.status === 206 ? 206 : 200, {
    'Content-Type': up.headers.get('content-type') || 'audio/mp4',
    'Content-Length': up.headers.get('content-length') || undefined,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=86400',
    'Access-Control-Allow-Origin': '*',
    ...(up.headers.get('content-range') ? { 'Content-Range': up.headers.get('content-range') } : {}),
  });

  const reader = up.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  } catch { /* cliente cort├│ la descarga */ }
  res.end();
  return true;
}
