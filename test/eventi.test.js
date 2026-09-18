import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SITO } from '../src/comune.js';
import { urlEventiComune, leggiEventiComune, urlEventiVisit, leggiEventiVisit } from '../src/eventi.js';
import { periodo, giorno, mezzanotte, parti } from '../src/quando.js';
import { agendaDovuta, finestraWeekend, eventiDelWeekend, testoAgenda } from '../src/agenda.js';
import { chiamata, testoMessaggio } from '../src/messaggio.js';

const leggi = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
// Risposte vere del 18 settembre 2026, ridotte ai campi che usiamo.
const COMUNE = leggi('./eventi-comune.json');
const VISIT = leggi('./eventi-visit.json');
// Venerdi' 18 settembre 2026, 9:30 in Italia.
const VENERDI = Date.parse('2026-09-18T07:30:00Z');

test("gli indirizzi delle API degli eventi", () => {
  const recenti = new URL(urlEventiComune());
  assert.equal(recenti.searchParams.get('type'), 'rer_evento');
  assert.equal(recenti.searchParams.get('sortBy'), 'firstPublishedAt');
  assert.equal(new URL(urlEventiComune({ perData: true })).searchParams.get('sortBy'), 'attributes.sys_start_date');
  assert.equal(new URL(urlEventiVisit()).pathname, '/it/wp-json/wp/v2/event');
});

test('dal JSON del portale agli eventi del Comune, senza quelli finiti', () => {
  const eventi = leggiEventiComune(COMUNE, VENERDI);
  const titoli = eventi.map((e) => e.titolo);
  assert.equal(eventi.length, 5);
  assert.ok(!titoli.includes('Serata di ballo musica latina'), 'era il 14 settembre');

  const cammino = eventi.find((e) => e.titolo.startsWith('Gruppi di Cammino'));
  assert.equal(cammino.fonte, 'comune');
  assert.equal(cammino.sezione.nome, 'Evento sportivo');
  assert.equal(cammino.luogo, 'Casa della salute- Fermata M1 MetroSalso');
  assert.equal(cammino.link, `${SITO}/vivere-il-comune/eventi/eventi-sportivi/gruppi-di-cammino-uisp-24-settembre`);
  assert.equal(cammino.inizio, Date.parse('2026-09-24T15:00:00Z'));
});

test('gli eventi programmati o tolti dal sito restano fuori', () => {
  const copia = structuredClone(COMUNE);
  const [primo, secondo] = copia.page.entities;
  primo.attributes.sys_start_pub_date = '2026-09-20T00:00:00.000Z';
  secondo.attributes.sys_end_pub_date = '2026-09-01T00:00:00.000Z';
  const ids = leggiEventiComune(copia, VENERDI).map((e) => e.id);
  assert.ok(!ids.includes(primo.id) && !ids.includes(secondo.id));
});

test('dal JSON di WordPress agli eventi di Visit Salsomaggiore', () => {
  const eventi = leggiEventiVisit(VISIT);
  assert.equal(eventi.length, 3);
  const [trekking] = eventi;
  assert.equal(trekking.id, 'visit-28591');
  assert.equal(trekking.fonte, 'visit');
  assert.equal(trekking.titolo, 'Trekking urbano con guida');
  assert.equal(trekking.link, 'https://visitsalsomaggiore.it/it/event/trekking-urbano-con-guida/');
  assert.ok(trekking.immagine.startsWith('https://visitsalsomaggiore.it/'));
  assert.ok(trekking.riassunto.endsWith('…') && !trekking.riassunto.includes('['));
  assert.equal(trekking.pubblicata, Date.parse('2026-09-17T15:15:42Z'));
  assert.deepEqual(leggiEventiVisit({ code: 'rest_no_route' }), []);
});

test('le date degli eventi in italiano, ora di Roma', () => {
  // 17:00 in Italia d'estate sono le 15:00 UTC.
  assert.equal(periodo(Date.parse('2026-09-24T15:00:00Z'), Date.parse('2026-09-24T16:00:00Z')), 'giovedì 24 settembre, 17:00–18:00');
  // Tutto il giorno: il portale mette la mezzanotte italiana, niente orario.
  assert.equal(periodo(Date.parse('2026-09-19T22:00:00Z')), 'domenica 20 settembre');
  assert.equal(periodo(Date.parse('2026-09-16T22:00:00Z'), Date.parse('2026-09-19T22:00:00Z')), 'dal 17 al 20 settembre');
  assert.equal(periodo(Date.parse('2026-10-30T08:00:00Z'), Date.parse('2026-11-01T17:00:00Z')), 'dal 30 ottobre al 1 novembre');
  // Una fine prima dell'inizio si ignora.
  assert.equal(periodo(Date.parse('2026-09-19T06:30:00Z'), Date.parse('2026-09-18T22:00:00Z')), 'sabato 19 settembre, 08:30');
  // D'inverno lo scarto e' di un'ora sola.
  assert.equal(periodo(Date.parse('2026-12-07T07:00:00Z')), 'lunedì 7 dicembre, 08:00');
  assert.equal(periodo(null), '');
});

test('la mezzanotte italiana, anche a cavallo del cambio dell\'ora', () => {
  assert.equal(mezzanotte(VENERDI), Date.parse('2026-09-17T22:00:00Z'));
  assert.equal(mezzanotte(VENERDI, 3), Date.parse('2026-09-20T22:00:00Z'));
  // Venerdi' 23 ottobre: il lunedi' dopo e' gia' ora solare.
  assert.equal(mezzanotte(Date.parse('2026-10-23T08:00:00Z'), 3), Date.parse('2026-10-25T23:00:00Z'));
  assert.equal(giorno(Date.parse('2026-09-18T22:30:00Z')), '2026-09-19');
  assert.equal(parti(VENERDI).settimana, 5);
});

test("l'agenda esce il venerdi' dalle 9, una volta sola", () => {
  assert.equal(agendaDovuta(VENERDI, null), '2026-09-18');
  assert.equal(agendaDovuta(VENERDI, '2026-09-11'), '2026-09-18');
  assert.equal(agendaDovuta(VENERDI, '2026-09-18'), null);
  assert.equal(agendaDovuta(Date.parse('2026-09-18T06:30:00Z'), null), null, 'alle 8:30 e\' presto');
  assert.equal(agendaDovuta(Date.parse('2026-09-19T08:00:00Z'), null), null, 'sabato no');
});

test("l'agenda del weekend: eventi di piu' giorni, poi giorno per giorno", () => {
  const finestra = finestraWeekend(VENERDI);
  const eventi = eventiDelWeekend(leggiEventiComune(COMUNE, VENERDI), finestra);
  assert.deepEqual(eventi.map((e) => e.titolo), [
    'Campionato a squadre miste di Bridge', 'Castelli e Calici', 'Sport City Day 2026',
  ]);

  const testo = testoAgenda(eventi, finestra);
  assert.ok(testo.startsWith('🗓️ <b>Questo weekend a Salsomaggiore</b>'));
  assert.match(testo, /<b>Per più giorni<\/b>\n• dal 17 al 20 settembre <a href="[^"]+">Campionato a squadre miste di Bridge<\/a> · Palazzo dei Congressi/);
  assert.match(testo, /<b>Sabato 19 settembre<\/b>\n• 08:30 <a href="[^"]+">Castelli e Calici<\/a>/);
  assert.match(testo, /<b>Domenica 20 settembre<\/b>\n• 09:00 /);
  assert.ok(!testo.includes('Venerdì'), 'niente blocchi vuoti');

  // Lo stesso evento due volte conta una.
  assert.equal(eventiDelWeekend([...eventi, { ...eventi[1], id: 'altro' }], finestra).length, 3);
});

test("un'agenda troppo lunga resta nel limite e dice quanti eventi mancano", () => {
  const finestra = finestraWeekend(VENERDI);
  const tanti = Array.from({ length: 80 }, (_, i) => ({
    id: String(i), titolo: `Evento numero ${i} con un titolo abbastanza lungo`, luogo: 'Piazza Libertà',
    link: `${SITO}/vivere-il-comune/eventi/evento-${i}`, inizio: Date.parse('2026-09-19T16:00:00Z') + i * 60_000, fine: null,
  }));
  const testo = testoAgenda(tanti, finestra);
  assert.ok(testo.length <= 4096, `${testo.length} caratteri`);
  assert.match(testo, /…e altri \d+\.\n\n<a href=/);
});

test("il messaggio di un evento: quando e dove sotto il titolo, link alla sua fonte", () => {
  const [musicanti] = leggiEventiComune(COMUNE, VENERDI).filter((e) => e.titolo.startsWith('Musicanti'));
  const righe = testoMessaggio(musicanti, 4096).split('\n');
  assert.equal(righe[0], '🎉 <b>Evento</b>');
  assert.equal(righe[3], '📅 venerdì 25 settembre, 21:15–22:30');
  assert.equal(righe[4], '📍 Sala Cariatidi Palazzo dei Congressi');
  assert.ok(righe.at(-1).endsWith('→ Leggi sul sito del Comune di Salsomaggiore Terme</a>'));

  const [trekking] = leggiEventiVisit(VISIT);
  const foto = chiamata(trekking, '@c');
  assert.equal(foto.metodo, 'sendPhoto');
  assert.ok(foto.parametri.caption.endsWith('→ Leggi su Visit Salsomaggiore Terme</a>'));
  assert.ok(!foto.parametri.caption.includes('📅'), 'Visit non da\' la data a parte');
});
