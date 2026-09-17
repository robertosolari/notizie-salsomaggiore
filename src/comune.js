// Le novita' del Comune di Salsomaggiore Terme, dall'API del portale.
// Funzioni pure: nessuna rete, girano uguali nei test.
//
// Il sito e' un'app MyPortal di Lepida, la piattaforma dei comuni dell'Emilia-Romagna:
// la pagina /novita arriva vuota e le notizie le carica il JavaScript da un'API
// JSON. La stessa API la usiamo noi, senza leggere l'HTML.

export const SITO = 'https://www.comune.salsomaggiore-terme.pr.it';
const TENANT = 'C_H720';

/** Le ultime notizie, dalla piu' recente. Tutte le sezioni sono contenuti rer_news. */
export function urlNotizie({ quante = 30 } = {}) {
  const q = new URLSearchParams({
    type: 'rer_news',
    pageIndex: '1',
    pageSize: String(quante),
    onlyNotHidden: 'true',
    sortBy: 'firstPublishedAt',
    desc: 'true',
  });
  return `${SITO}/myportal/${TENANT}/api/content?${q}`;
}

export const urlImmagine = (id) => `${SITO}/myportal/${TENANT}/api/content/download?id=${encodeURIComponent(id)}`;

/**
 * Le sezioni della pagina Novita': la cartella del portale, il pezzo di indirizzo
 * pubblico e come si presenta sul canale.
 */
export const SEZIONI = {
  '/News/Notizie': { percorso: 'notizie', nome: 'Notizie', emoji: '📰' },
  '/News/Comunicati': { percorso: 'comunicati', nome: 'Comunicati', emoji: '📣' },
  '/News/Avvisi': { percorso: 'avvisi', nome: 'Avvisi', emoji: '📌' },
  '/News/Avvisi/Ordinanze': { percorso: 'ordinanze', nome: 'Ordinanze', emoji: '📜' },
  '/News/Avvisi/Allerte Meteo': { percorso: 'allerte', nome: 'Allerta meteo', emoji: '⚠️' },
};

const ENTITA = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', laquo: '«', raquo: '»',
  hellip: '…', ndash: '–', mdash: '—', euro: '€', deg: '°', middot: '·', bull: '•',
  ordm: 'º', ordf: 'ª', sect: '§', copy: '©',
  agrave: 'à', egrave: 'è', eacute: 'é', igrave: 'ì', ograve: 'ò', ugrave: 'ù',
  Agrave: 'À', Egrave: 'È', Eacute: 'É', Igrave: 'Ì', Ograve: 'Ò', Ugrave: 'Ù',
  aacute: 'á', iacute: 'í', oacute: 'ó', uacute: 'ú', ccedil: 'ç', ntilde: 'ñ', uuml: 'ü', ouml: 'ö',
};

/** Da HTML dell'editor del portale a testo semplice, paragrafi compresi. */
export function testo(html) {
  return String(html || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (tutto, nome) => ENTITA[nome] ?? tutto)
    .replace(/[ \t ]+/g, ' ')
    .split('\n').map((r) => r.trim()).filter(Boolean)
    .join('\n');
}

/**
 * Dalla risposta dell'API alle notizie. Restano fuori quelle con la pubblicazione
 * programmata nel futuro: le si prende al giro in cui diventano visibili.
 */
export function leggiNotizie(json, adesso = Date.now()) {
  const notizie = [];
  for (const e of json?.page?.entities || []) {
    const a = e.attributes || {};
    const titolo = testo(a.sys_title || a.sys_titolo_breve || e.name);
    if (!e.id || !titolo) continue;
    if (a.sys_start_pub_date && Date.parse(a.sys_start_pub_date) > adesso) continue;

    const sezione = SEZIONI[e.parent] || null;
    const slug = a.sys_slug || e.slug;
    // Indirizzo della sezione quando la conosciamo, altrimenti quello canonico del portale.
    const percorso = sezione && slug ? `/novita/${sezione.percorso}/${slug}` : a.sys_canonical_url || '/novita';

    notizie.push({
      id: String(e.id),
      titolo,
      sezione: sezione || { percorso: '', nome: 'Novità', emoji: '🏛️' },
      riassunto: testo(a.sys_riassunto),
      immagine: a.sys_uri_immagine_alta_definiz ? urlImmagine(a.sys_uri_immagine_alta_definiz) : null,
      link: `${SITO}${percorso.startsWith('/') ? '' : '/'}${percorso}`,
      pubblicata: Date.parse(e.firstPublishedAt || a.sys_start_pub_date || e.createdAt) || 0,
    });
  }
  return notizie.sort((x, y) => y.pubblicata - x.pubblicata);
}

/**
 * Cosa pubblicare: le notizie mai viste, dalla piu' vecchia, cosi' sul canale
 * finiscono nell'ordine in cui il Comune le ha scritte.
 */
export function daPubblicare(notizie, viste) {
  const gia = new Set(viste);
  return notizie.filter((n) => !gia.has(n.id)).sort((x, y) => x.pubblicata - y.pubblicata);
}
