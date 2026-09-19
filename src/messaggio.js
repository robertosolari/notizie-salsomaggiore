// Il messaggio per il canale Telegram: foto con didascalia, o solo testo se la
// notizia non ha un'immagine. Funzioni pure.

import { periodo } from './quando.js';

/** Telegram tronca le didascalie delle foto a 1024 caratteri, i messaggi a 4096. */
export const LIMITE_DIDASCALIA = 1024;
export const LIMITE_TESTO = 4096;

export const sicuro = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/** Il link in fondo al messaggio, con il nome del sito da cui arriva la notizia. */
const FONTI = {
  comune: 'Leggi sul sito del Comune di Salsomaggiore Terme',
  visit: 'Leggi su Visit Salsomaggiore Terme',
};

/** Taglia su uno spazio, non a meta' parola. */
export function accorcia(testo, massimo) {
  if (testo.length <= massimo) return testo;
  const taglio = testo.slice(0, massimo - 1);
  const spazio = taglio.lastIndexOf(' ');
  return `${(spazio > massimo * 0.6 ? taglio.slice(0, spazio) : taglio).replace(/[\s,;:.]+$/, '')}…`;
}

/** Il testo del messaggio, dentro il limite. Il riassunto e' l'unica parte che si accorcia. */
export function testoMessaggio(n, limite) {
  let testa = `${n.sezione.emoji} <b>${sicuro(n.sezione.nome)}</b>\n<b>${sicuro(n.titolo)}</b>`;
  // Gli eventi: quando e dove, subito sotto il titolo.
  const quando = periodo(n.inizio, n.fine);
  if (quando || n.luogo) testa += '\n';
  if (quando) testa += `\n📅 ${sicuro(quando)}`;
  if (n.luogo) testa += `\n📍 ${sicuro(n.luogo)}`;
  // Le note legali del Comune chiedono link "chiaramente titolati" con il nome del sito.
  const piede = `<a href="${sicuro(n.link)}">→ ${FONTI[n.fonte] || FONTI.comune}</a>`;
  if (!n.riassunto) return `${testa}\n\n${piede}`;

  // Lo spazio si misura sul testo escapato, piu' lungo di quello che Telegram
  // conta dopo aver letto l'HTML: cosi' si resta sempre dentro il limite.
  const spazio = limite - `${testa}\n\n\n\n${piede}`.length;
  let riassunto = n.riassunto;
  for (let massimo = spazio; sicuro(riassunto).length > spazio && massimo > 1; massimo -= 20) {
    riassunto = accorcia(n.riassunto, massimo);
  }
  return `${testa}\n\n${sicuro(riassunto)}\n\n${piede}`;
}

/** La chiamata a Telegram per una notizia: { metodo, parametri }. */
export function chiamata(n, canale) {
  // Il programma del cinema arriva con il testo gia' composto e piu' link dentro.
  if (n.testo) {
    return {
      metodo: 'sendMessage',
      parametri: { chat_id: canale, text: n.testo, parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
    };
  }
  if (n.immagine) {
    return {
      metodo: 'sendPhoto',
      parametri: { chat_id: canale, photo: n.immagine, caption: testoMessaggio(n, LIMITE_DIDASCALIA), parse_mode: 'HTML' },
    };
  }
  return {
    metodo: 'sendMessage',
    parametri: {
      chat_id: canale,
      text: testoMessaggio(n, LIMITE_TESTO),
      parse_mode: 'HTML',
      link_preview_options: { url: n.link, prefer_large_media: true },
    },
  };
}

/** Se la foto non passa (Telegram non riesce a scaricarla), si ripiega sul testo. */
export function ripiegoTesto(n, canale) {
  return chiamata({ ...n, immagine: null }, canale);
}
