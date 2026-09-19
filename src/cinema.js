// La programmazione del cinema Odeon. Il cinema non ha un sito suo: il programma
// della settimana lo pubblica Visit Salsomaggiore in un solo evento WordPress
// ("Cinema Odeon: film in programma") che riscrivono ogni settimana. Funzioni pure.
//
// Il contenuto e' un blocco per film: titolo in <h2>, poi Regia, Cast, Genere,
// Durata, "In programma:", una riga per giorno ("Domenica 20/09 ore 17.00 – 21.15")
// e la trama. Ogni programma diverso diventa una novita' con un id suo, calcolato
// da film e orari: la trama o un ritocco di impaginazione non la ripubblicano.

import { createHash } from 'node:crypto';
import { testo } from './comune.js';
import { SITO_VISIT } from './eventi.js';
import { parti, alle } from './quando.js';
import { sicuro, accorcia, LIMITE_TESTO } from './messaggio.js';

export const SLUG_CINEMA = 'cinema-odeon-programmazione';

export function urlCinema() {
  return `${SITO_VISIT}/it/wp-json/wp/v2/event?slug=${SLUG_CINEMA}`;
}

const GIORNO = /^(luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)\s+(\d{1,2})\/(\d{1,2})\b\s*(.*)$/i;
const MEZZO_ANNO = 180 * 24 * 3600 * 1000;

/** L'anno non c'e': quello che mette la data piu' vicina a oggi (a dicembre, gennaio e' dell'anno dopo). */
function annoPiuVicino(mese, giorno, adesso) {
  const anno = parti(adesso).anno;
  const quest = alle(anno, mese, giorno);
  if (quest < adesso - MEZZO_ANNO) return anno + 1;
  if (quest > adesso + MEZZO_ANNO) return anno - 1;
  return anno;
}

/** 'Domenica 20/09 ore 17.00 – 21.15 ( ridotto )' -> giorno, orari e note, con l'ora di ogni spettacolo. */
function leggiGiorno(riga, adesso) {
  const m = riga.match(GIORNO);
  if (!m) return null;
  const [, nome, g, me, resto] = m;
  const giorno = Number(g);
  const mese = Number(me);
  const anno = annoPiuVicino(mese, giorno, adesso);
  const orari = [...resto.matchAll(/\b(\d{1,2})[.:](\d{2})\b/g)].map(([, h, mi]) => ({
    testo: `${h.padStart(2, '0')}:${mi}`,
    quando: alle(anno, mese, giorno, Number(h), Number(mi)),
  }));
  const note = [...resto.matchAll(/\(([^)]*)\)/g)].map(([, n]) => n.trim()).filter(Boolean);
  return {
    giorno: `${nome[0].toUpperCase()}${nome.slice(1).toLowerCase()} ${String(giorno).padStart(2, '0')}/${String(mese).padStart(2, '0')}`,
    orari,
    note,
    // Senza orario leggibile vale tutto il giorno.
    ultimo: orari.length ? Math.max(...orari.map((o) => o.quando)) : alle(anno, mese, giorno, 23, 59),
  };
}

/** I film del programma, con tutti i giorni, anche quelli gia' passati. */
export function leggiFilm(html, adesso = Date.now()) {
  const film = [];
  for (const blocco of String(html || '').split(/<h2[^>]*>/i).slice(1)) {
    const [testa, ...corpo] = blocco.split(/<\/h2>/i);
    const titolo = testo(testa).replace(/\s+/g, ' ');
    if (!titolo) continue;
    const f = { titolo, regia: '', genere: '', durata: '', giorni: [], trama: [] };
    for (const riga of testo(corpo.join(' ')).split('\n')) {
      const campo = riga.match(/^(regia|cast|genere|durata|in programma)\s*:\s*(.*)$/i);
      if (campo) {
        const [, nome, valore] = campo;
        if (/regia/i.test(nome)) f.regia = valore.trim();
        if (/genere/i.test(nome)) f.genere = valore.trim();
        if (/durata/i.test(nome)) f.durata = (valore.match(/\d+/) || [''])[0];
        // Il cast si lascia fuori: sul sito e' spesso copiato da un altro film.
        continue;
      }
      const giorno = leggiGiorno(riga, adesso);
      if (giorno) f.giorni.push(giorno);
      else f.trama.push(riga);
    }
    f.trama = f.trama.join(' ');
    film.push(f);
  }
  return film;
}

/** L'impronta del programma: titoli e orari, in minuscolo. */
function impronta(film) {
  const chiave = film.map((f) => [f.titolo.toLowerCase(), ...f.giorni.map((g) => `${g.giorno} ${g.orari.map((o) => o.testo).join(',')}`)]);
  return createHash('sha1').update(JSON.stringify(chiave)).digest('hex').slice(0, 12);
}

const riga = (g) => `${g.giorno} · ${g.orari.map((o) => o.testo).join(', ') || 'orario sul sito'}${g.note.length ? ` (${g.note.join('; ')})` : ''}`;

/**
 * Il messaggio: un blocco per film con genere, durata, regia, i giorni ancora a
 * venire e la trama in breve. Se supera i 4096 caratteri, prima si tolgono le trame.
 */
export function testoCinema(film, link, limite = LIMITE_TESTO) {
  const testa = '🎬 <b>Al cinema Odeon</b>\nvia Valentini 11 · tel. 0524 581036';
  const piede = `<a href="${sicuro(link)}">→ Il programma su Visit Salsomaggiore Terme</a>`;
  const componi = (conTrama, quanti = film.length) => {
    const blocchi = film.slice(0, quanti).map((f) => {
      const info = [f.genere, f.durata && `${f.durata} min`, f.regia && `regia di ${f.regia}`].filter(Boolean).join(' · ');
      let b = `<b>${sicuro(f.titolo)}</b>`;
      if (info) b += `\n<i>${sicuro(info)}</i>`;
      b += `\n${f.giorni.map((g) => `▸ ${sicuro(riga(g))}`).join('\n')}`;
      if (conTrama && f.trama) b += `\n${sicuro(accorcia(f.trama, 220))}`;
      return b;
    });
    const altri = quanti < film.length ? `\n\n…e altri ${film.length - quanti} film.` : '';
    return `${testa}\n\n${blocchi.join('\n\n')}${altri}\n\n${piede}`;
  };
  let messaggio = componi(true);
  if (messaggio.length > limite) messaggio = componi(false);
  // Poi, se non basta ancora, gli ultimi film restano fuori.
  for (let quanti = film.length - 1; messaggio.length > limite && quanti > 0; quanti -= 1) messaggio = componi(false, quanti);
  return messaggio;
}

/**
 * Dalla risposta di WordPress alla novita' da pubblicare, nello stesso formato
 * delle notizie ma con il testo gia' composto. Nessuna novita' se il programma
 * e' tutto passato: vuol dire che quello della settimana non e' ancora uscito.
 */
export function leggiCinema(json, adesso = Date.now()) {
  const e = (Array.isArray(json) ? json : []).find((x) => x.slug === SLUG_CINEMA && x.status === 'publish');
  if (!e) return [];
  const tutti = leggiFilm(e.content?.rendered, adesso);
  // L'impronta si prende sul programma intero: togliendo prima i giorni passati
  // cambierebbe ogni sera e il programma uscirebbe di nuovo.
  const id = `odeon-${impronta(tutti)}`;
  const film = tutti
    .map((f) => ({ ...f, giorni: f.giorni.filter((g) => g.ultimo >= adesso) }))
    .filter((f) => f.giorni.length);
  if (!film.length) return [];
  const link = e.link || `${SITO_VISIT}/it/event/${SLUG_CINEMA}/`;
  return [{
    id,
    fonte: 'visit',
    titolo: `Al cinema Odeon: ${film.map((f) => f.titolo).join(', ')}`,
    sezione: { nome: 'Cinema', emoji: '🎬' },
    riassunto: '',
    immagine: null,
    link,
    pubblicata: Date.parse(`${e.modified_gmt}Z`) || Date.parse(e.modified) || 0,
    testo: testoCinema(film, link),
  }];
}
