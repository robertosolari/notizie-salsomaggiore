import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { urlNotizie, leggiNotizie, daPubblicare, ultimeDaPubblicare, testo, SITO } from '../src/comune.js';
import { chiamata, ripiegoTesto, testoMessaggio, accorcia, LIMITE_DIDASCALIA } from '../src/messaggio.js';

// Risposta vera del portale del 17 settembre 2026, le prime sei novita'.
const RISPOSTA = JSON.parse(readFileSync(new URL('./risposta-portale.json', import.meta.url), 'utf8'));
const OGGI = Date.parse('2026-09-17T12:00:00Z');

test("l'indirizzo dell'API chiede le novita' ordinate per data", () => {
  const url = new URL(urlNotizie({ quante: 10 }));
  assert.equal(url.pathname, '/myportal/C_H720/api/content');
  assert.equal(url.searchParams.get('type'), 'rer_news');
  assert.equal(url.searchParams.get('sortBy'), 'firstPublishedAt');
  assert.equal(url.searchParams.get('desc'), 'true');
  assert.equal(url.searchParams.get('pageSize'), '10');
});

test('dal JSON del portale alle notizie', () => {
  const notizie = leggiNotizie(RISPOSTA, OGGI);
  assert.equal(notizie.length, 6);
  const [allerta, volontario] = notizie;

  assert.equal(allerta.titolo, 'Allerta di Protezione civile n° 099/2026');
  assert.equal(allerta.sezione.nome, 'Allerta meteo');
  assert.equal(allerta.link, `${SITO}/novita/allerte/allerta-di-protezione-civile-n0992026`);
  assert.match(allerta.riassunto, /valida dalle 00:00 del 17-09-2026/);

  assert.equal(volontario.sezione.nome, 'Notizie');
  assert.ok(volontario.link.startsWith(`${SITO}/novita/notizie/`));
  assert.ok(notizie.every((n) => n.immagine === null || n.immagine.startsWith(`${SITO}/myportal/C_H720/api/content/download?id=`)));
  // Il titolo vero, con apostrofi e punteggiatura, non il nome interno ripulito.
  assert.ok(notizie.some((n) => n.titolo.includes('dell’Alberghiero')));
});

test("le notizie programmate per il futuro aspettano il loro giorno", () => {
  const futura = structuredClone(RISPOSTA);
  futura.page.entities[0].attributes.sys_start_pub_date = '2026-09-20T07:00:00.000Z';
  assert.equal(leggiNotizie(futura, OGGI).length, 5);
  assert.equal(leggiNotizie(futura, Date.parse('2026-09-21T00:00:00Z')).length, 6);
});

test("una sezione sconosciuta usa l'indirizzo canonico del portale", () => {
  const strana = structuredClone(RISPOSTA);
  strana.page.entities[1].parent = '/News/Bandi';
  const n = leggiNotizie(strana, OGGI).find((x) => x.id === strana.page.entities[1].id);
  assert.equal(n.sezione.nome, 'Novità');
  assert.equal(n.link, `${SITO}${strana.page.entities[1].attributes.sys_canonical_url}`);
});

test("dall'HTML dell'editor al testo", () => {
  assert.equal(testo('<p>Dal 23 settembre sar&agrave; attiva la mensa dell&rsquo;istituto</p>'), 'Dal 23 settembre sarà attiva la mensa dell’istituto');
  assert.equal(testo('<p>Uno</p>\n<p>&nbsp;</p>\n<p>Due<br>tre</p>'), 'Uno\nDue\ntre');
  assert.equal(testo('<ul><li>a</li><li>b</li></ul>'), '• a\n• b');
  assert.equal(testo('caff&#232; &#x20AC; 5 &unknown;'), 'caffè € 5 &unknown;');
  assert.equal(testo(null), '');
});

test('si pubblicano solo le mai viste, dalla piu vecchia', () => {
  const notizie = leggiNotizie(RISPOSTA, OGGI);
  const viste = notizie.slice(2).map((n) => n.id);
  const nuove = daPubblicare(notizie, viste);
  assert.deepEqual(nuove.map((n) => n.id), [notizie[1].id, notizie[0].id]);
  assert.deepEqual(daPubblicare(notizie, notizie.map((n) => n.id)), []);
});

test('il messaggio: foto con didascalia, sezione, titolo, riassunto, link', () => {
  const [allerta] = leggiNotizie(RISPOSTA, OGGI);
  const conFoto = chiamata({ ...allerta, immagine: `${SITO}/x.jpg` }, '@canale');
  assert.equal(conFoto.metodo, 'sendPhoto');
  assert.equal(conFoto.parametri.chat_id, '@canale');
  assert.equal(conFoto.parametri.parse_mode, 'HTML');
  const righe = conFoto.parametri.caption.split('\n');
  assert.equal(righe[0], '⚠️ <b>Allerta meteo</b>');
  assert.equal(righe[1], '<b>Allerta di Protezione civile n° 099/2026</b>');
  assert.ok(conFoto.parametri.caption.endsWith(`<a href="${allerta.link}">→ Leggi sul sito del Comune di Salsomaggiore Terme</a>`));

  const senzaFoto = ripiegoTesto({ ...allerta, immagine: `${SITO}/x.jpg` }, '@canale');
  assert.equal(senzaFoto.metodo, 'sendMessage');
  assert.equal(senzaFoto.parametri.link_preview_options.url, allerta.link);
});

test('titoli e riassunti con caratteri HTML non rompono il messaggio', () => {
  const n = {
    titolo: 'Lavori <urgenti> & chiusure', riassunto: 'A & B', link: `${SITO}/a?b=1&c=2`,
    sezione: { nome: 'Avvisi', emoji: '📌' }, immagine: null,
  };
  const t = testoMessaggio(n, 4096);
  assert.ok(t.includes('<b>Lavori &lt;urgenti&gt; &amp; chiusure</b>'));
  assert.ok(t.includes('A &amp; B'));
  assert.ok(t.includes('href="https://www.comune.salsomaggiore-terme.pr.it/a?b=1&amp;c=2"'));
});

test('riassunti lunghi: la didascalia resta nel limite, tagliata su una parola', () => {
  const lungo = Array.from({ length: 400 }, (_, i) => `parola${i} & più`).join(' ');
  const n = { titolo: 'Titolo', riassunto: lungo, link: `${SITO}/x`, sezione: { nome: 'Notizie', emoji: '📰' }, immagine: `${SITO}/x.jpg` };
  const didascalia = chiamata(n, '@c').parametri.caption;
  assert.ok(didascalia.length <= LIMITE_DIDASCALIA, `${didascalia.length} caratteri`);
  assert.match(didascalia, /…\n\n<a href=/);
  assert.equal(accorcia('una frase abbastanza lunga', 14), 'una frase…');
  assert.equal(accorcia('breve', 14), 'breve');
});

test('giro a mano: le ultime N escono comunque, tutte le altre diventano viste', () => {
  const notizie = leggiNotizie(RISPOSTA, OGGI);
  const [prima, seconda] = notizie;

  // Senza elenco delle viste, come al primo giro.
  const scelta = ultimeDaPubblicare(notizie, null, 2);
  assert.deepEqual(scelta.nuove.map((n) => n.id), [seconda.id, prima.id]);
  assert.equal(scelta.viste.length, notizie.length - 2);
  assert.ok(!scelta.viste.includes(prima.id) && !scelta.viste.includes(seconda.id));

  // Con le due ultime gia' pubblicate: si ripubblicano, e restano viste anche le vecchie
  // uscite dalla finestra delle 30 notizie.
  const giaViste = ['vecchia-fuori-finestra', ...notizie.map((n) => n.id)];
  const ancora = ultimeDaPubblicare(notizie, giaViste, 2);
  assert.equal(ancora.nuove.length, 2);
  assert.ok(ancora.viste.includes('vecchia-fuori-finestra'));
  assert.equal(new Set(ancora.viste).size, ancora.viste.length);

  // Dopo la pubblicazione, il giro normale non trova piu' niente.
  assert.deepEqual(daPubblicare(notizie, [...scelta.viste, prima.id, seconda.id]), []);
});
