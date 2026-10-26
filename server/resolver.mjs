const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const PIPED = ['https://pipedapi.kavin.rocks', 'https://api.piped.yt', 'https://pipedapi-libre.kavin.rocks'];
const INVIDIOUS = ['https://yewtu.be', 'https://inv.tux.pizza', 'https://invidious.projectsegfau.lt', 'https://vid.puffyan.us'];

export async function resolveTrack(title, artist) {
  const q = `${artist ? artist + ' ' : ''}${title}`.replace(/\s+/g, ' ').trim();
  if (!q) return { ok: false };

  // Try Piped for audio
  for (const base of PIPED) {
    try {
      const sr = await fetch(`${base}/search?q=${encodeURIComponent(q)}&filter=music_songs`, { headers: { 'User-Agent': UA } });
      if (!sr.ok) continue;
      const sj = await sr.json();
      const items = Array.isArray(sj) ? sj : (sj.items || []);
      for (const it of items.slice(0, 10)) {
        const vid = it?.id || (it?.url || '').match(/v=([^&]+)/)?.[1];
        if (!vid) continue;
        try {
          const tr = await fetch(`${base}/streams/${vid}`, { headers: { 'User-Agent': UA } });
          if (!tr.ok) continue;
          const td = await tr.json();
          const audios = Array.isArray(td?.audioStreams) ? td.audioStreams : [];
          const best = audios.find(a => a?.url && (a.mimeType?.includes('audio/mp4') || a.format === 'M4A')) || audios[0];
          if (best?.url) {
            return { ok: true, type: 'audio', audioUrl: best.url, source: base, videoId: vid };
          }
        } catch {}
      }
    } catch {}
  }

  // Try Invidious
  for (const base of INVIDIOUS) {
    try {
      const sr = await fetch(`${base}/api/v1/search?q=${encodeURIComponent(q)}&type=video`, { headers: { 'User-Agent': UA } });
      if (!sr.ok) continue;
      const sl = await sr.json();
      if (!Array.isArray(sl)) continue;
      for (const v of sl.slice(0, 8)) {
        if (!v?.videoId) continue;
        try {
          const vr = await fetch(`${base}/api/v1/videos/${v.videoId}`, { headers: { 'User-Agent': UA } });
          if (!vr.ok) continue;
          const vd = await vr.json();
          const fmts = Array.isArray(vd?.adaptiveFormats) ? vd.adaptiveFormats : [];
          const audio = fmts.find(f => f?.type?.startsWith('audio') && f?.url);
          if (audio?.url) {
            return { ok: true, type: 'audio', audioUrl: audio.url, source: base, videoId: v.videoId };
          }
        } catch {}
      }
    } catch {}
  }

  // Fallback to videoId
  for (const base of PIPED) {
    try {
      const sr = await fetch(`${base}/search?q=${encodeURIComponent(q)}&filter=videos`, { headers: { 'User-Agent': UA } });
      if (!sr.ok) continue;
      const sj = await sr.json();
      const items = Array.isArray(sj) ? sj : (sj.items || []);
      const v = items.find(x => x?.id) || items[0];
      if (v?.id) {
        return { ok: true, type: 'video', videoId: v.id, source: base };
      }
    } catch {}
  }

  return { ok: false };
}
