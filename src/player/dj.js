/* ══════════════════════════════════════════════════════════════════════════
   DJ RITMO — locutor virtual interactivo (Fase C: voz colombiana).

   Genera comentarios contextuales entre canciones, al estilo del DJ de
   Spotify, pero con un tono casual, cercano y "parce" colombiano.

   Funciona 100% en local: combina plantillas con los datos del catálogo. La
   voz es opcional y usa la Web Speech API; el usuario elige el tipo de voz
   (lista real del navegador) y activa/desactiva la locución con un botón.
   ══════════════════════════════════════════════════════════════════════════ */

import { trackById } from '../data/catalog.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function fill(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
}
function daypart(lang) {
  const h = new Date().getHours();
  const es = lang === 'es';
  if (h < 6) return es ? 'madrugada' : 'late night';
  if (h < 12) return es ? 'mañana' : 'morning';
  if (h < 20) return es ? 'tarde' : 'afternoon';
  return es ? 'noche' : 'night';
}

/* ── Plantillas en español colombiano (casual, cercano, "parce") ── */
const INTROS_ES = [
  'Parce, suena {title}, de {artist}. ¡Qué chimba!',
  'A ver, parce: {artist} con {title}.',
  'Te dejo con {title}, de {artist}. ¡Dale!',
  'Siguiente parada: {artist} y su {title}.',
  'Esto es {title}, cortesía de {artist}. ¡Qué nota!',
  'Bajamos el telón para dar paso a {artist}: {title}.',
  'Parce, ahora suena {title}, de {artist}. ¡Brutal!',
  'Ojo con esto: {artist} y su {title}.',
];

const INTROS_EN = [
  'Here comes {title}, by {artist}.',
  'Right now, {artist} with {title}.',
  'Next up: {artist} and their {title}.',
  'This is {title}, courtesy of {artist}.',
];

const TRANSITIONS_ES = [
  'Veníamos de {prev}, y ya tenemos el siguiente listo, parce.',
  'Después de {prev}, subimos el nivel. ¡Dale!',
  'Eso fue {prev}. Ahora, algo más chimba.',
  'Cambiamos de tercio tras {prev}, parce.',
  'Parce, después de {prev} sigue esto.',
];

const TRANSITIONS_EN = [
  'That was {prev}, and we are just getting started.',
  'After {prev}, let’s keep it going.',
  'That was {prev}. Time for something new.',
];

const GENRE_LINES_ES = {
  Pop: ['Pop del bueno, de los que se pegan, parce.', 'Puro pop para cantar a todo pulmón.'],
  Rock: ['Guitarras al frente, como debe ser, parce.', 'Rock que se siente en el pecho. ¡Qué nota!'],
  Latino: ['Esto tiene sabor, prepárate para mover el cuerpo, parce.', 'Ritmo latino directo a las caderas.'],
  Reggaetón: ['Perreo del bueno, parce. ¡Qué chimba de canción!'],
  Salsa: ['Salsa para los pies, parce. ¡A bailar!'],
  Bachata: ['Bachata para dedicar, parce.'],
  Cumbia: ['Cumbia que mueve el alma, parce.'],
  'Electrónica': ['Sintetizadores y beats para volar, parce.', 'Modo electrónico activado.'],
  'Hip-Hop': ['Flow, rimas y mucha actitud, parce.', 'Hip-hop para dominar la pista.'],
  Trap: ['Trap del pesado, parce.'],
  'R&B': ['R&B suave para el alma, parce.'],
  Indie: ['Indie para los que buscan algo diferente, parce.'],
  'K-Pop': ['K-Pop con toda la energía, parce.'],
  Jazz: ['Jazz para relajarse, parce.'],
  Blues: ['Blues con sentimiento, parce.'],
  Country: ['Country con alma, parce.'],
  Folk: ['Folk acústico para el alma, parce.'],
  Reggae: ['Reggae para la tranquilidad, parce.'],
  Metal: ['Metal pesado, parce. ¡Cabeza!'],
  Punk: ['Punk con actitud, parce.'],
  Clásica: ['Música clásica para el alma, parce.'],
  Gospel: ['Gospel con sentimiento, parce.'],
  Flamenco: ['Flamenco con duende, parce.'],
  Soul: ['Soul con feeling, parce.'],
  Funk: ['Funk para mover el cuerpo, parce.'],
  Disco: ['Disco para bailar toda la noche, parce.'],
  'Lo-Fi': ['Bajamos las revoluciones con un poco de lo-fi, parce.', 'Beats suaves para estudiar o desconectar.'],
};

const GENRE_LINES_EN = {
  Pop: ['Pure pop, made to be sung out loud.', 'Pop so catchy you’ll hum it all day.'],
  Rock: ['Guitars up front, the way it should be.', 'Rock you can feel in your chest.'],
  Latino: ['This one’s got flavor — get ready to move.', 'Latin rhythm straight to the hips.'],
};

const MOOD_LINES_ES = {
  Fiesta: 'Modo fiesta: que nadie se quede sentado, parce.',
  Energía: 'Sube esa energía, parce.',
  Romántico: 'Esto va dedicado, ya sabes a quién, parce.',
  Relajado: 'Respira hondo y déjate llevar, parce.',
  Triste: 'A veces una buena canción lo dice todo, parce.',
  Noche: 'La noche apenas comienza, parce.',
  Workout: 'Un empujón más, tú puedes, parce.',
  Concentración: 'Enfoque total, sin distracciones, parce.',
  Clásico: 'Un clásico que nunca falla, parce.',
  'Fiesta latina': 'Fiesta latina del bueno, parce.',
};

const MOOD_LINES_EN = {
  Fiesta: 'Party mode: nobody sits this one out.',
  Energía: 'Turn that energy up.',
  Romántico: 'This one’s dedicated — you know to whom.',
  Relajado: 'Take a breath and let it play.',
  Triste: 'Sometimes a song says it all.',
  Noche: 'The night is just getting started.',
  Workout: 'One more push — you’ve got this.',
  Concentración: 'Total focus, zero distractions.',
  Clásico: 'A classic that never misses.',
};

const FILLERS_ES = [
  'Seguimos con la música, sin pausas, parce.',
  'Ritmo no para, y tú tampoco deberías, parce.',
  'Aquí, en Ritmo, la buena música manda, parce.',
  'Directo a tus oídos, parce.',
  'Cierre los ojos y disfrute, parce.',
  'Parce, esto es Ritmo Music. ¡Qué chimba!',
];

const FILLERS_EN = [
  'We keep the music going, no breaks.',
  'Ritmo never stops — neither should you.',
  'Here on Ritmo, great music rules.',
  'Straight to your ears.',
  'Close your eyes and enjoy.',
];

function isFirstOfGenre(genre, seenGenres) {
  return genre && !seenGenres.has(genre);
}

export function djLine({ track, prevTrack, seenGenres, lang = 'es', kind = 'intro' } = {}) {
  const es = lang === 'es';
  if (!track) return { text: '', tag: '' };

  const vars = {
    title: track.title,
    artist: track.artist,
    album: track.album && track.album !== 'Ritmo' ? track.album : '',
    prev: prevTrack?.title || '',
    year: track.year,
  };

  if (kind === 'filler') {
    return { text: pick(es ? FILLERS_ES : FILLERS_EN), tag: 'djTagFiller' };
  }

  const parts = [];

  if (prevTrack && Math.random() < 0.5) {
    parts.push(fill(pick(es ? TRANSITIONS_ES : TRANSITIONS_EN), vars));
  } else {
    parts.push(fill(pick(es ? INTROS_ES : INTROS_EN), vars));
  }

  if (isFirstOfGenre(track.genre, seenGenres || new Set())) {
    const g = (es ? GENRE_LINES_ES : GENRE_LINES_EN)[track.genre];
    if (g) parts.push(pick(g));
  } else if (track.moods?.length && Math.random() < 0.6) {
    const m = (es ? MOOD_LINES_ES : MOOD_LINES_EN)[track.moods[0]];
    if (m) parts.push(m);
  }

  if (vars.year && Math.random() < 0.25) {
    parts.push(es
      ? `Un tema de ${vars.year} que sigue sonando igual de bien, parce.`
      : `A track from ${vars.year} that still holds up.`);
  } else if (vars.album && Math.random() < 0.25) {
    parts.push(es
      ? `Del disco «${vars.album}», parce.`
      : `From the album “${vars.album}”.`);
  }

  return { text: parts.join(' '), tag: 'djTagIntro' };
}

export function djGreeting(lang = 'es') {
  const es = lang === 'es';
  const part = daypart(lang);
  const map = {
    es: {
      madrugada: 'Buenas madrugadas, parce. Soy DJ Ritmo y esto apenas comienza.',
      mañana: 'Buenos días, parce. Soy DJ Ritmo, vamos a despertar esos oídos.',
      tarde: 'Buenas tardes, parce. Soy DJ Ritmo y traigo la mejor música.',
      noche: 'Buenas noches, parce. Soy DJ Ritmo; la noche es nuestra.',
    },
    en: {
      'late night': 'Good late night. I’m DJ Ritmo, and we’re just getting started.',
      morning: 'Good morning. I’m DJ Ritmo — let’s wake those ears up.',
      afternoon: 'Good afternoon. I’m DJ Ritmo, bringing the good stuff.',
      night: 'Good evening. I’m DJ Ritmo — the night is ours.',
    },
  };
  return (map[es ? 'es' : 'en'])[part];
}

export function djProfile() {
  return { name: 'DJ Ritmo', avatar: '🎧', genres: [] };
}
