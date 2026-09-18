// Gli eventi: quelli del Comune, dalla stessa API delle notizie, e quelli di
// Visit Salsomaggiore, il sito turistico ufficiale. Funzioni pure.
//
// Tutto diventa lo stesso oggetto delle notizie (id, titolo, sezione, riassunto,
// immagine, link, pubblicata) piu' i campi dell'evento: inizio, fine, luogo.

import { SITO, TENANT, testo, urlImmagine } from './comune.js';

/**
 * Gli eventi del Comune. Di norma i piu' recenti per data di pubblicazione; con
 * `perData` quelli che si svolgono piu' avanti nel tempo, per l'agenda.
 */
export function urlEventiComune({ quante = 30, perData = false } = {}) {
  const q = new URLSearchParams({
    type: 'rer_evento',
    pageIndex: '1',
    pageSize: String(quante),
    onlyNotHidden: 'true',
    sortBy: perData ? 'attributes.sys_start_date' : 'firstPublishedAt',
    desc: 'true',
  });
  return `${SITO}/myportal/${TENANT}/api/content?${q}`;
}

export const PAGINA_EVENTI_COMUNE = `${SITO}/vivere-il-comune/eventi`;

/** Il tipo di evento dalla cartella del portale ('/Eventi/Vivere il comune/Eventi sportivi'). */
function sezioneComune(cartella) {
  if (/sportiv/i.test(cartella)) return { nome: 'Evento sportivo', emoji: '🏃' };
  if (/cultural/i.test(cartella)) return { nome: 'Evento culturale', emoji: '🎭' };
  return { nome: 'Evento', emoji: '🎉' };
}

const data = (s) => (s ? Date.parse(s) || null : null);

/**
 * Dalla risposta dell'API agli eventi. Restano fuori quelli con la pubblicazione
 * programmata nel futuro, quelli gia' tolti dal sito e quelli gia' finiti:
 * annunciare un evento passato non serve a nessuno.
 */
export function leggiEventiComune(json, adesso = Date.now()) {
  const eventi = [];
  for (const e of json?.page?.entities || []) {
    const a = e.attributes || {};
    const titolo = testo(a.sys_title || e.name);
    if (!e.id || !titolo) continue;
    if (data(a.sys_start_pub_date) > adesso) continue;
    if (a.sys_end_pub_date && data(a.sys_end_pub_date) < adesso) continue;

    const inizio = data(a.sys_start_date);
    const fine = data(a.sys_end_date);
    const finito = Math.max(inizio || 0, fine || 0);
    if (finito && finito < adesso) continue;

    const percorso = a.sys_canonical_url || '/vivere-il-comune/eventi';
    eventi.push({
      id: String(e.id),
      fonte: 'comune',
      titolo,
      sezione: sezioneComune(e.parent || ''),
      riassunto: testo(a.sys_riassunto),
      immagine: a.sys_uri_immagine_alta_definiz ? urlImmagine(a.sys_uri_immagine_alta_definiz) : null,
      link: `${SITO}${percorso.startsWith('/') ? '' : '/'}${percorso}`,
      pubblicata: data(e.firstPublishedAt) || data(a.sys_start_pub_date) || data(e.createdAt) || 0,
      inizio,
      fine,
      luogo: testo(a.sys_luogo).replace(/\s+/g, ' '),
    });
  }
  return eventi.sort((x, y) => y.pubblicata - x.pubblicata);
}

// --- Visit Salsomaggiore ----------------------------------------------------
// WordPress con l'API REST aperta e un robots.txt che non vieta nulla. Gli eventi
// sono il tipo di contenuto `event`; la data dell'evento non e' un campo a parte
// ma sta scritta nel testo, quindi questi eventi escono singoli e non nell'agenda.

export const SITO_VISIT = 'https://visitsalsomaggiore.it';

export function urlEventiVisit({ quante = 20 } = {}) {
  const q = new URLSearchParams({ per_page: String(quante), orderby: 'date', order: 'desc' });
  return `${SITO_VISIT}/it/wp-json/wp/v2/event?${q}`;
}

export function leggiEventiVisit(json) {
  const eventi = [];
  for (const e of Array.isArray(json) ? json : []) {
    const titolo = testo(e.title?.rendered);
    if (!e.id || !titolo || e.status !== 'publish' || !e.link) continue;
    eventi.push({
      id: `visit-${e.id}`,
      fonte: 'visit',
      titolo,
      sezione: { nome: 'Evento', emoji: '🎉' },
      // WordPress taglia l'estratto a meta' frase e chiude con [...]: restano i puntini.
      riassunto: testo(e.excerpt?.rendered).replace(/\s*\[(…|\.\.\.)\]\s*$/, '…'),
      immagine: e.yoast_head_json?.og_image?.[0]?.url || null,
      link: e.link,
      pubblicata: Date.parse(`${e.date_gmt}Z`) || Date.parse(e.date) || 0,
      inizio: null,
      fine: null,
      luogo: '',
    });
  }
  return eventi.sort((x, y) => y.pubblicata - x.pubblicata);
}
