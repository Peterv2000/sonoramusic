/* Verificación rápida del motor de cola inteligente.
   Uso: npm run check:queue

   No sustituye a una prueba en navegador: comprueba que la inferencia y el
   orden respetan género, BPM, energía y diversidad de artistas con ejemplos
   contrastados (balada, reggaetón y rock). */

import assert from 'node:assert/strict';
import { TRACKS } from '../src/data/catalog.js';
import { featuresFor } from '../src/player/audioFeatures.js';
import { isQueueCandidate } from '../src/player/queue.js';
import { buildSmartQueue, hasExcessiveArtistRun, scoreTracks } from '../src/player/smartQueue.js';

const byTitle = (title) => TRACKS.find((t) => t.title === title);

function queueFor(seed, limit = 12) {
  return buildSmartQueue(seed, TRACKS, {
    limit,
    recent: [seed],
    minScore: 0.45,
    minCount: 10,
  });
}

function summarize(seed) {
  const f = featuresFor(seed);
  const queue = queueFor(seed);
  const top = queue.slice(0, 6);
  return {
    seed: `${seed.title} · ${seed.artist}`,
    family: f.family,
    subgenre: f.subgenre,
    bpm: f.bpm,
    energy: f.energy,
    danceability: f.danceability,
    mood: f.mood,
    count: queue.length,
    top: top.map((t) => {
      const tf = featuresFor(t);
      return `${t.title} [${tf.family}/${tf.bpm}bpm/${tf.energy}]`;
    }),
    diverse: !hasExcessiveArtistRun(queue),
  };
}

const ballad = byTitle('Thinking Out Loud');
const reggaeton = byTitle('Gasolina');
const rock = byTitle('Bohemian Rhapsody');

assert.ok(ballad && reggaeton && rock, 'faltan canciones de referencia en el catálogo');

const balladF = featuresFor(ballad);
const reggaetonF = featuresFor(reggaeton);
const rockF = featuresFor(rock);

assert.equal(balladF.family, 'pop');
assert.ok(balladF.energy < 0.52, `balada debería ser suave (${balladF.energy})`);
assert.ok(balladF.bpm < 110, `balada debería ser lenta (${balladF.bpm} BPM)`);
assert.equal(balladF.subgenre, 'Balada');

assert.equal(reggaetonF.family, 'latin');
assert.ok(reggaetonF.energy > 0.72, `reggaetón debería ser energético (${reggaetonF.energy})`);
assert.ok(reggaetonF.danceability > 0.8, `reggaetón debería ser bailable (${reggaetonF.danceability})`);

assert.equal(rockF.family, 'rock');
assert.ok(rockF.energy > 0.7, `rock debería ser intenso (${rockF.energy})`);

const balladQueue = queueFor(ballad);
const reggaetonQueue = queueFor(reggaeton);
const rockQueue = queueFor(rock);

assert.ok(balladQueue.length >= 6, `cola de balada demasiado corta (${balladQueue.length})`);
/* El catálogo curado solo tiene tres temas latinos; la cola real se completa
   con la búsqueda en vivo. Aquí verificamos que el filtro no deje pasar nada
   que no sea latino en español. */
assert.ok(reggaetonQueue.length >= 2, `cola de reggaetón demasiado corta (${reggaetonQueue.length})`);
assert.ok(rockQueue.length >= 6, `cola de rock demasiado corta (${rockQueue.length})`);

for (const [name, queue] of [['balada', balladQueue], ['reggaetón', reggaetonQueue], ['rock', rockQueue]]) {
  assert.ok(!hasExcessiveArtistRun(queue), `${name}: hay 3+ canciones seguidas del mismo artista`);
  assert.ok(!queue.some((t) => t.id === (name === 'balada' ? ballad.id : name === 'reggaetón' ? reggaeton.id : rock.id)), `${name}: la semilla no debe repetirse`);
}

// La balada no debe saltar a un tema de fiesta alta energía.
const balladTop = balladQueue.slice(0, 5).map((t) => featuresFor(t));
assert.ok(balladTop.every((f) => f.energy < 0.75), 'la radio de balada saltó a un tema demasiado energético');

// El reggaetón debe empezar por la misma familia latina.
const reggaetonTop = reggaetonQueue.slice(0, 3).map((t) => featuresFor(t));
assert.ok(reggaetonTop.filter((f) => f.family === 'latin').length >= 2, 'la radio de reggaetón no prioriza música latina');

// El rock debe mantenerse en rock/pop-rock de intensidad similar.
const rockTop = rockQueue.slice(0, 5).map((t) => featuresFor(t));
assert.ok(rockTop.filter((f) => f.family === 'rock' || f.family === 'pop').length >= 4, 'la radio de rock perdió el estilo');
assert.ok(rockTop.every((f) => Math.abs(f.energy - rockF.energy) < 0.35), 'la radio de rock mezcló intensidades muy distintas');

// Diversidad de artistas con candidatas artificiales del mismo intérprete.
const same = { id: 'same', yt: 'same', title: 'Otra', artist: 'Artista Repetido', genre: 'Pop', moods: ['Fiesta', 'Energía'], year: 2020, dur: 200 };
const candidates = [
  ...Array.from({ length: 5 }, (_, i) => ({ ...same, id: `same-${i}`, yt: `same-${i}`, title: `Otra ${i}` })),
  { ...same, id: 'other-a', yt: 'other-a', title: 'Otra A', artist: 'Otro Artista' },
  { ...same, id: 'other-b', yt: 'other-b', title: 'Otra B', artist: 'Tercer Artista' },
];
const diverse = buildSmartQueue(ballad, candidates, { limit: 7, recent: [ballad] });
assert.ok(!hasExcessiveArtistRun(diverse), 'el orden permitió 3+ temas seguidos del mismo artista');

/* Caso «El Andariego»: una semilla de música Popular/Despecho en español no
   puede terminar en una canción en inglés ni en pop/rock/electrónica. */
const andariego = {
  id: 'el-andariego', yt: 'el-andariego', title: 'El Andariego', artist: 'Los Betos',
  genre: 'Popular', moods: ['Triste'], year: 1995, dur: 240,
};
const andariegoF = featuresFor(andariego);
assert.equal(andariegoF.family, 'latin', 'la música Popular debe pertenecer a la familia latina');
assert.equal(andariegoF.language, 'es', 'El Andariego debe detectarse como español');

const latinCandidates = [
  byTitle('Despacito'),
  byTitle('Waka Waka (Esto es África)'),
  { id: 'la-bachata', yt: 'la-bachata', title: 'La Bachata', artist: 'Manuel Turizo', genre: 'Latino', moods: ['Romántico'], dur: 200 },
  { id: 'english-latin', yt: 'english-latin', title: 'Bailando (English Version)', artist: 'Enrique Iglesias', genre: 'Latino', language: 'en', moods: ['Fiesta'], dur: 250 },
  { id: 'english-pop', yt: 'english-pop', title: 'Perfect', artist: 'Ed Sheeran', genre: 'Pop', moods: ['Romántico'], dur: 240 },
  { id: 'english-hip', yt: 'english-hip', title: 'Lose Yourself', artist: 'Eminem', genre: 'Hip-Hop', moods: ['Energía'], dur: 240 },
  { id: 'cumbia-instr', yt: 'cumbia-instr', title: 'Cumbia Instrumental', artist: 'Sonora Instrumental', genre: 'Cumbia', moods: ['Fiesta'], dur: 200 },
];
const latinQueue = buildSmartQueue(andariego, latinCandidates, {
  limit: 10, recent: [andariego], minCount: 1,
});
assert.ok(latinQueue.length >= 2, `cola latina demasiado corta (${latinQueue.length})`);
assert.ok(
  latinQueue.every((t) => featuresFor(t).language !== 'en'),
  'la radio latina saltó a una canción en inglés',
);
assert.ok(
  latinQueue.every((t) => ['latin', 'unknown'].includes(featuresFor(t).family)),
  'la radio latina saltó a un género no latino',
);
assert.ok(!latinQueue.some((t) => t.id === 'english-latin'), 'el filtro de idioma dejó pasar una versión en inglés');

// Los recopilatorios y mixes nunca deben entrar en «A continuación».
assert.equal(isQueueCandidate({ id: 'junk', title: 'Top 50 Global | Mejores Canciones', artist: 'TopLauMusic', dur: 573 }), false);
assert.equal(isQueueCandidate({ id: 'junk2', title: 'Baladas Romanticas Mix Vol. 3', artist: 'ZJ Music', dur: 2400 }), false);
assert.equal(isQueueCandidate({ id: 'ok', title: 'La Bachata', artist: 'Manuel Turizo', dur: 200 }), true);

// Puntuación coherente: misma vibra > tema opuesto.
const party = byTitle('Shape of You');
const chill = byTitle('Someone Like You');
assert.ok(scoreTracks(ballad, chill) > scoreTracks(ballad, party), 'la balada debería puntuar más cerca de otra balada que de un tema de fiesta');

console.log('✓ inferencia y diversidad OK\n');
for (const seed of [ballad, reggaeton, rock, andariego]) {
  const s = summarize(seed);
  console.log(`${s.seed}\n  ${s.family} / ${s.subgenre} · ${s.bpm} BPM · energía ${s.energy} · bailabilidad ${s.danceability} · ${s.mood}`);
  console.log(`  cola: ${s.count} temas · diversidad ${s.diverse ? 'OK' : 'FALLA'}`);
  s.top.forEach((line) => console.log(`   · ${line}`));
  console.log('');
}
