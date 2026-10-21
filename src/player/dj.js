/* ══════════════════════════════════════════════════════════════════════════
   DJ RITMO — locutor virtual interactivo.

   Genera comentarios contextuales entre canciones, al estilo del DJ de
   Spotify: presenta el tema, cuenta algo del artista, marca las transiciones
   y pone ambiente según la hora, el género y el ánimo.

   Funciona 100% en local (sin red): combina plantillas con los datos del
   catálogo para que cada intervención suene natural y variada. La voz es
   opcional y usa la Web Speech API del navegador.
   ══════════════════════════════════════════════════════════════════════════ */

import { GENRES } from '../data/catalog.js';

/* Elige un elemento al azar de una lista. */
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* Rellena una plantilla: "Suena {title}, de {artist}" */
function fill(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
}

/* Franja horaria → saludo. */
function daypart(lang) {
  const h = new Date().getHours();
  const es = lang === 'es';
  if (h < 6) return es ? 'madrugada' : 'late night';
  if (h < 12) return es ? 'mañana' : 'morning';
  if (h < 20) return es ? 'tarde' : 'afternoon';
  return es ? 'noche' : 'night';
}

const INTROS_ES = [
  'Suena {title}, de {artist}.',
  'Ahora mismo, {artist} con {title}.',
  'Te dejo con {title}, de {artist}.',
  'Siguiente parada: {artist} y su {title}.',
  'Esto es {title}, cortesía de {artist}.',
  'Bajamos el telón para dar paso a {artist}: {title}.',
];

const INTROS_EN = [
  'Here comes {title}, by {artist}.',
  'Right now, {artist} with {title}.',
  'Next up: {artist} and their {title}.',
  'This is {title}, courtesy of {artist}.',
];

const TRANSITIONS_ES = [
  'Venimos de {prev}, y ya tenemos el siguiente listo.',
  'Después de {prev}, subimos el nivel.',
  'Eso fue {prev}. Ahora, algo más.',
  'Cambiamos de tercio tras {prev}.',
];

const TRANSITIONS_EN = [
  'That was {prev}, and we are just getting started.',
  'After {prev}, let’s keep it going.',
  'That was {prev}. Time for something new.',
];

const GENRE_LINES_ES = {
  Pop: ['Puro pop para cantar a todo pulmón.', 'Pop del bueno, de los que se pegan.'],
  Rock: ['Guitarras al frente, como debe ser.', 'Rock que se siente en el pecho.'],
  Latino: ['Esto tiene sabor, prepárate para mover el cuerpo.', 'Ritmo latino directo a las caderas.'],
  'Electrónica': ['Sintetizadores y beats para volar.', 'Modo electrónico activado.'],
  'Hip-Hop': ['Flow, rimas y mucha actitud.', 'Hip-hop para dominar la pista.'],
  'Lo-Fi': ['Bajamos las revoluciones con un poco de lo-fi.', 'Beats suaves para estudiar o desconectar.'],
};

const GENRE_LINES_EN = {
  Pop: ['Pure pop, made to be sung out loud.', 'Pop so catchy you’ll hum it all day.'],
  Rock: ['Guitars up front, the way it should be.', 'Rock you can feel in your chest.'],
  Latino: ['This one’s got flavor — get ready to move.', 'Latin rhythm straight to the hips.'],
  'Electrónica': ['Synths and beats ready for takeoff.', 'Electro mode: engaged.'],
  'Hip-Hop': ['Flow, rhymes and pure attitude.', 'Hip-hop to own the floor.'],
  'Lo-Fi': ['Let’s slow it down with some lo-fi.', 'Soft beats to study or unwind.'],
};

const MOOD_LINES_ES = {
  Fiesta: 'Modo fiesta: que nadie se quede sentado.',
  Energía: 'Sube esa energía.',
  Romántico: 'Esto va dedicado, ya sabes a quién.',
  Relajado: 'Respira hondo y déjate llevar.',
  Triste: 'A veces una buena canción lo dice todo.',
  Noche: 'La noche apenas comienza.',
  Workout: 'Un empujón más, tú puedes.',
  Concentración: 'Enfoque total, sin distracciones.',
  Clásico: 'Un clásico que nunca falla.',
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
  'Seguimos con la música, sin pausas.',
  'Ritmo no para, y tú tampoco deberías.',
  'Aquí, en Ritmo, la buena música manda.',
  'Directo a tus oídos.',
  'Cierre los ojos y disfrute.',
];

const FILLERS_EN = [
  'We keep the music going, no breaks.',
  'Ritmo never stops — neither should you.',
  'Here on Ritmo, great music rules.',
  'Straight to your ears.',
  'Close your eyes and enjoy.',
];

/* ¿Primera vez que suena este género en la sesión? */
function isFirstOfGenre(genre, seenGenres) {
  return genre && !seenGenres.has(genre);
}

/**
 * Devuelve la intervención del DJ para un tema.
 * @param {object} opts
 * @param {object} opts.track        tema que va a sonar
 * @param {object} [opts.prevTrack]  tema anterior (para la transición)
 * @param {Set}    [opts.seenGenres] géneros ya presentados en la sesión
 * @param {string} [opts.lang]       'es' | 'en'
 * @param {string} [opts.kind]       'intro' | 'filler'
 * @returns {{ text: string, tag: string }}
 */
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

  /* Intervención de relleno (cuando no hay tema nuevo, p. ej. pausa larga) */
  if (kind === 'filler') {
    return { text: pick(es ? FILLERS_ES : FILLERS_EN), tag: 'djTagFiller' };
  }

  const parts = [];

  /* 1. Transición desde el tema anterior (a veces) */
  if (prevTrack && Math.random() < 0.5) {
    parts.push(fill(pick(es ? TRANSITIONS_ES : TRANSITIONS_EN), vars));
  } else {
    parts.push(fill(pick(es ? INTROS_ES : INTROS_EN), vars));
  }

  /* 2. Comentario de género si es nuevo en la sesión */
  if (isFirstOfGenre(track.genre, seenGenres || new Set())) {
    const g = (es ? GENRE_LINES_ES : GENRE_LINES_EN)[track.genre];
    if (g) parts.push(pick(g));
  } else if (track.moods?.length && Math.random() < 0.6) {
    const m = (es ? MOOD_LINES_ES : MOOD_LINES_EN)[track.moods[0]];
    if (m) parts.push(m);
  }

  /* 3. Dato temporal o de álbum, de vez en cuando */
  if (vars.year && Math.random() < 0.25) {
    parts.push(es
      ? `Un tema de ${vars.year} que sigue sonando igual de bien.`
      : `A track from ${vars.year} that still holds up.`);
  } else if (vars.album && Math.random() < 0.25) {
    parts.push(es
      ? `Del disco «${vars.album}».`
      : `From the album “${vars.album}”.`);
  }

  return { text: parts.join(' '), tag: 'djTagIntro' };
}

/** Saludo de apertura del DJ, según la hora del día. */
export function djGreeting(lang = 'es') {
  const es = lang === 'es';
  const part = daypart(lang);
  const map = {
    es: {
      madrugada: 'Buenas madrugadas. Soy DJ Ritmo y esto apenas comienza.',
      mañana: 'Buenos días. Soy DJ Ritmo, vamos a despertar esos oídos.',
      tarde: 'Buenas tardes. Soy DJ Ritmo y traigo la mejor música.',
      noche: 'Buenas noches. Soy DJ Ritmo; la noche es nuestra.',
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

/** Datos que el DJ puede usar para su "tarjeta" de presentación. */
export function djProfile() {
  return {
    name: 'DJ Ritmo',
    avatar: '🎧',
    genres: GENRES.map((g) => g.id),
  };
}
