import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { urlCinema, leggiFilm, leggiCinema, testoCinema } from '../src/cinema.js';
import { alle } from '../src/quando.js';
import { chiamata } from '../src/messaggio.js';

// Risposta vera di Visit Salsomaggiore del 19 settembre 2026, ridotta ai campi che usiamo.
const ODEON = JSON.parse(readFileSync(new URL('./cinema-odeon.json', import.meta.url), 'utf8'));
// Venerdi' 18 settembre 2026, 10:00 in Italia.
const VENERDI = Date.parse('2026-09-18T08:00:00Z');

test("l'indirizzo dell'API chiede l'evento del cinema per slug", () => {
  const url = new URL(urlCinema());
  assert.equal(url.pathname, '/it/wp-json/wp/v2/event');
  assert.equal(url.searchParams.get('slug'), 'cinema-odeon-programmazione');
});

test("un istante italiano, d'estate e d'inverno", () => {
  assert.equal(alle(2026, 9, 20, 21, 15), Date.parse('2026-09-20T19:15:00Z'));
  assert.equal(alle(2026, 12, 20, 21, 15), Date.parse('2026-12-20T20:15:00Z'));
});

test('dal testo del sito ai film, con giorni, orari e note', () => {
  const film = leggiFilm(ODEON[0].content.rendered, VENERDI);
  assert.deepEqual(film.map((f) => f.titolo), ['AMORI & INCANTESIMI 2', 'PAW PATROL: Missione Dinosauri']);

  const [amori, paw] = film;
  assert.equal(amori.regia, 'Susanne Bier');
  assert.equal(amori.genere, 'Romantico/Fantastico');
  assert.equal(amori.durata, '135');
  assert.deepEqual(amori.giorni.map((g) => g.giorno), ['Venerdì 18/09', 'Sabato 19/09', 'Domenica 20/09', 'Martedì 22/09']);
  const domenica = amori.giorni[2];
  assert.deepEqual(domenica.orari.map((o) => o.testo), ['17:00', '21:15']);
  assert.equal(domenica.orari[1].quando, Date.parse('2026-09-20T19:15:00Z'));
  assert.deepEqual(amori.giorni[3].note, ['ingresso ridotto per tutti']);
  assert.match(amori.trama, /^Le sorelle Owens/);
  assert.equal(paw.durata, '90');
  assert.equal(paw.giorni.length, 2);
});

test('il programma diventa una sola novita, con il testo gia composto', () => {
  const [n] = leggiCinema(ODEON, VENERDI);
  assert.match(n.id, /^odeon-[0-9a-f]{12}$/);
  assert.equal(n.pubblicata, Date.parse('2026-09-16T09:10:09Z'));
  assert.match(n.testo, /^🎬 <b>Al cinema Odeon<\/b>/);
  assert.match(n.testo, /<b>AMORI &amp; INCANTESIMI 2<\/b>/);
  assert.match(n.testo, /▸ Domenica 20\/09 · 17:00, 21:15\n/);
  assert.match(n.testo, /▸ Martedì 22\/09 · 21:15 \(ingresso ridotto per tutti\)/);
  assert.ok(!n.testo.includes('Nicole Kidman'), 'il cast resta fuori');

  const { metodo, parametri } = chiamata(n, '@canale');
  assert.equal(metodo, 'sendMessage');
  assert.equal(parametri.text, n.testo);
});

test('i giorni passati spariscono dal messaggio ma non cambiano la novita', () => {
  const venerdi = leggiCinema(ODEON, VENERDI)[0];
  const lunedi = leggiCinema(ODEON, Date.parse('2026-09-21T08:00:00Z'))[0];
  assert.equal(lunedi.id, venerdi.id, 'altrimenti il programma uscirebbe di nuovo ogni giorno');
  assert.ok(!lunedi.testo.includes('Venerdì 18/09'));
  assert.ok(!lunedi.testo.includes('PAW PATROL'), 'i suoi spettacoli erano sabato e domenica');
});

test('un programma tutto passato non si pubblica', () => {
  assert.deepEqual(leggiCinema(ODEON, Date.parse('2026-09-23T08:00:00Z')), []);
});

test('un programma nuovo e una trama ritoccata', () => {
  const id = leggiCinema(ODEON, VENERDI)[0].id;
  const trama = structuredClone(ODEON);
  trama[0].content.rendered = trama[0].content.rendered.replace('Le sorelle Owens', 'Le due sorelle Owens');
  assert.equal(leggiCinema(trama, VENERDI)[0].id, id);
  const orario = structuredClone(ODEON);
  orario[0].content.rendered = orario[0].content.rendered.replace('22/09 ore 21.15', '22/09 ore 21.30');
  assert.notEqual(leggiCinema(orario, VENERDI)[0].id, id);
});

test('risposta vuota o evento non pubblicato: niente', () => {
  assert.deepEqual(leggiCinema([], VENERDI), []);
  assert.deepEqual(leggiCinema([{ ...ODEON[0], status: 'draft' }], VENERDI), []);
  assert.deepEqual(leggiCinema({ code: 'rest_no_route' }, VENERDI), []);
});

test('un programma troppo lungo perde prima le trame', () => {
  const film = leggiFilm(ODEON[0].content.rendered, VENERDI);
  const testo = testoCinema(film, 'https://example.org', 800);
  assert.ok(testo.length <= 800);
  assert.ok(!testo.includes('Le sorelle Owens'));
  assert.match(testo, /PAW PATROL/);
});
