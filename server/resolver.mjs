/* ══════════════════════════════════════════════════════════════════════════
   Resolución de una canción cuando YouTube rechaza el vídeo original
   (error 100/101/150: retirado, privado o sin permiso de inserción).

   Antes se consultaban Piped e Invidious en cadena, sin límite de tiempo:
   cuando ninguno respondía, el reproductor se quedaba ~32 s en silencio y
   después saltaba de canción. Ahora:

     1. Se busca en el MISMO buscador de Sonora (InnerTube), que responde en
        ~1 s, y se devuelven varias alternativas del mismo tema.
     2. El cliente las prueba en orden antes de rendirse.
     3. Piped/Invidious quedan solo como último recurso, con un presupuesto
        de tiempo corto y global.

   Resultado: el usuario sigue escuchando la misma canción y, si de verdad
   no existe ninguna fuente, el salto ocurre en segundos (no en minutos).
   ══════════════════════════════════════════════════════════════════════════ */

import { searchYouTube } from './youtube.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const PIPED = ['https://pipedapi.kavin.rocks', 'https://api.piped.yt', 'https://pipedapi-libre.kavin.rocks'];
const INVIDIOUS = ['https://yewtu.be', 'https://inv.tux.pizza', 'https://invidious.projectsegfau.lt', 'https://vid.puffyan.us'];

const VIDEO_RE = /^[A-Za-z0-9_-]{11}$/;

function norm(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(ft|feat|featuring|official|video|videoclip|lyric|lyrics|letra|audio|hd|hq|4k|8k|remaster|remastered|version|en vivo|live|visualizer)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(value) {
  return new Set(norm(value).split(' ').filter((w) => w.length > 1));
}

function similarity(a, b) {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const word of left) if (right.has(word)) common += 1;
  return (2 * common) / (left.size + right.size);
}

function asId(raw) {
  const value = String(raw?.yt || raw?.videoId || raw?.id || '').replace(/^yt-/, '');
  return VIDEO_RE.test(value) ? value : '';
}

/* Título «base»: sin «feat./ft.» ni paréntesis. Es la consulta que mejor
   encuentra el vídeo original: los re-subidos bloqueados usan el título
   completo con miles de variantes y se comen todos los puestos. */
function coreTitle(title) {
  const base = String(title || '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\b(feat|ft|featuring)\b.*$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return base.length >= 3 ? base : String(title || '').trim();
}

/**
 * Puntúa una alternativa. Prefiere coincidencia de título/artista y una
 * duración de canción normal; penaliza mezclas y directos eternos.
 */
function authorityBoost(item) {
  const channel = norm(`${item?.artist || ''} ${item?.channel || ''}`);
  if (/\btopic\b|\bvevo\b/.test(channel)) return 4;
  if (/\bofficial\b|\brecords\b|\bentertainment\b|\bwarner\b|\bsony\b|\buniversal\b|\batlantic\b|\binterscope\b|\brepublic\b/.test(channel)) return 2.5;
  return 0;
}

function candidateScore(item, title, artist, expectedDuration = 0) {
  const duration = Number(item?.dur || item?.duration || 0);
  const raw = String(item?.rawTitle || '');
  /* El buscador limpia los títulos («Canción - Artista»), así que la pista
     puede quedar como solo el artista. Para puntuar se usa también el título
     original de YouTube. */
  const titleSim = Math.max(similarity(item?.title, title), similarity(raw, title));
  let score = titleSim * 5 + similarity(item?.artist, artist) * 3;
  if (norm(raw) === norm(title) || norm(item?.title) === norm(title)) score += 1.5;
  if (/\bofficial\s*(audio|video|music video)\b|\btopic\b/i.test(`${raw} ${item?.artist || ''}`)) score += 1.5;
  if (duration >= 60 && duration <= 540) score += 1;
  if (duration > 900) score -= 2;
  /* Misma canción, misma duración: descarta covers, versiones "drill" y
     mezclas que solo comparten el título. */
  if (expectedDuration >= 60 && duration >= 60) {
    score -= Math.min(3, Math.abs(duration - expectedDuration) / 45);
  }
  /* Los canales oficiales («Artista - Topic», VEVO, sellos) son los que casi
     siempre permiten la inserción; los re-subidos suelen dar error 150. */
  score += authorityBoost(item);
  if (/\bcover\b|\bremix\b|\bsped up\b|\bslowed\b|\breverb\b|\binstrumental\b|\bkaraoke\b|\b8d\b|\bdrill\b/i.test(`${item?.title || ''} ${raw} ${item?.artist || ''}`)) {
    score -= 1.5;
  }
  if (/\bmix\b|\bplaylist\b|\bcompilat|\bmedley\b|\b1 hour\b|\bhoras\b/i.test(`${item?.title || ''} ${raw}`)) score -= 1.5;
  return score;
}

function cleanCandidates(list, title, artist, exclude, expectedDuration = 0) {
  const skip = new Set([].concat(exclude || []).map((v) => String(v).replace(/^yt-/, '')));
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    const videoId = asId(item);
    if (!videoId || skip.has(videoId) || seen.has(videoId)) continue;
    seen.add(videoId);
    out.push({
      videoId,
      title: String(item?.title || ''),
      artist: String(item?.artist || item?.channel || ''),
      duration: Number(item?.dur || item?.duration || 0),
      score: candidateScore(item, title, artist, expectedDuration),
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

export async function resolveTrack(title, artist, opts = {}) {
  const q = `${artist ? artist + ' ' : ''}${title}`.replace(/\s+/g, ' ').trim();
  if (!q) return { ok: false };

  const exclude = Array.isArray(opts.exclude) ? opts.exclude : [opts.exclude].filter(Boolean);
  const limit = Math.max(1, Math.min(8, Number(opts.limit) || 5));
  const expectedDuration = Math.max(0, Number(opts.duration) || 0);

  /* 1) Buscador propio, con varias consultas en paralelo (~1 s):
        - artista + título (la del catálogo),
        - solo el título,
        - el título sin «feat./ft.» (encuentra el vídeo original),
        - «título base + official audio» (canales «Artista - Topic»/VEVO,
          que son los que casi siempre permiten la inserción).
     Todas responden a la vez y el resultado se fusiona y puntúa. */
  try {
    const titleOnly = String(title || '').trim();
    const core = coreTitle(titleOnly);
    const queries = [...new Set([
      q,
      titleOnly,
      core && norm(core) !== norm(titleOnly) ? core : '',
      core ? `${core} official audio` : '',
    ].filter(Boolean))];
    const settled = await Promise.allSettled(queries.map((query) =>
      searchYouTube(query, { limit: 18, music: true, timeout: 4500, retries: 0 })));
    const merged = [];
    const seenVideos = new Set();
    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      for (const item of result.value || []) {
        const videoId = asId(item);
        if (!videoId || seenVideos.has(videoId)) continue;
        seenVideos.add(videoId);
        merged.push(item);
      }
    }
    const candidates = cleanCandidates(merged, title, artist, exclude, expectedDuration);
    if (candidates.length) {
      const [best, ...rest] = candidates;
      return {
        ok: true,
        type: 'video',
        videoId: best.videoId,
        title: best.title,
        artist: best.artist,
        duration: best.duration,
        source: 'youtube-search',
        alternatives: rest.slice(0, 11).map((c) => c.videoId),
        candidates: [best, ...rest].slice(0, 12).map((c) => ({
          videoId: c.videoId, title: c.title, artist: c.artist, duration: c.duration, score: c.score,
        })),
      };
    }
  } catch { /* seguimos con los espejos */ }

  /* 2) Espejos con presupuesto corto: nunca más de ~7 s en total. */
  const deadline = Date.now() + 7000;
  const alive = () => Date.now() < deadline;

  for (const base of PIPED) {
    if (!alive()) break;
    try {
      const res = await fetch(`${base}/search?q=${encodeURIComponent(q)}&filter=music_songs`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(Math.max(1500, Math.min(3000, deadline - Date.now()))),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const items = Array.isArray(json) ? json : (json.items || []);
      for (const item of items.slice(0, 10)) {
        const videoId = asId(item);
        if (!videoId || exclude.includes(videoId)) continue;
        try {
          const tr = await fetch(`${base}/streams/${videoId}`, {
            headers: { 'User-Agent': UA },
            signal: AbortSignal.timeout(Math.max(1500, Math.min(3000, deadline - Date.now()))),
          });
          if (!tr.ok) continue;
          const data = await tr.json();
          const audios = Array.isArray(data?.audioStreams) ? data.audioStreams : [];
          const best = audios.find((a) => a?.url && (a.mimeType?.includes('audio/mp4') || a.format === 'M4A')) || audios[0];
          if (best?.url) {
            return {
              ok: true,
              type: 'audio',
              audioUrl: best.url,
              source: base,
              videoId,
              alternatives: [videoId],
            };
          }
        } catch { /* siguiente vídeo */ }
      }
    } catch { /* siguiente espejo */ }
  }

  for (const base of INVIDIOUS) {
    if (!alive()) break;
    try {
      const res = await fetch(`${base}/api/v1/search?q=${encodeURIComponent(q)}&type=video`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(Math.max(1500, Math.min(3000, deadline - Date.now()))),
      });
      if (!res.ok) continue;
      const list = await res.json();
      if (!Array.isArray(list)) continue;
      for (const item of list.slice(0, 8)) {
        const videoId = asId(item);
        if (!videoId || exclude.includes(videoId)) continue;
        try {
          const vr = await fetch(`${base}/api/v1/videos/${videoId}`, {
            headers: { 'User-Agent': UA },
            signal: AbortSignal.timeout(Math.max(1500, Math.min(3000, deadline - Date.now()))),
          });
          if (!vr.ok) continue;
          const data = await vr.json();
          const formats = Array.isArray(data?.adaptiveFormats) ? data.adaptiveFormats : [];
          const audio = formats.find((f) => f?.type?.startsWith('audio') && f?.url);
          if (audio?.url) {
            return {
              ok: true,
              type: 'audio',
              audioUrl: audio.url,
              source: base,
              videoId,
              alternatives: [videoId],
            };
          }
        } catch { /* siguiente vídeo */ }
      }
    } catch { /* siguiente espejo */ }
  }

  /* 3) Último recurso: devolver un vídeo alternativo aunque no haya audio
        directo; el iframe puede reproducirlo igualmente. */
  for (const base of PIPED) {
    if (!alive()) break;
    try {
      const res = await fetch(`${base}/search?q=${encodeURIComponent(q)}&filter=videos`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(Math.max(1500, Math.min(3000, deadline - Date.now()))),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const items = Array.isArray(json) ? json : (json.items || []);
      const hit = items.map((item) => asId(item)).find((id) => id && !exclude.includes(id));
      if (hit) return { ok: true, type: 'video', videoId: hit, source: base, alternatives: [hit] };
    } catch { /* siguiente espejo */ }
  }

  return { ok: false };
}
