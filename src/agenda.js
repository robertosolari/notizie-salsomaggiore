// L'agenda del weekend: il venerdi' mattina un solo messaggio con gli eventi del
// Comune da venerdi' a domenica. Funzioni pure.

import { parti, giorno, mezzanotte, nomeGiorno, periodo, orarioInizio } from './quando.js';
import { sicuro, LIMITE_TESTO } from './messaggio.js';
import { PAGINA_EVENTI_COMUNE } from './eventi.js';

export const GIORNO_AGENDA = 5; // venerdi'
export const ORA_AGENDA = 9;

/**
 * Il giorno dell'agenda da pubblicare adesso ('AAAA-MM-GG'), o null. Si guarda solo
 * se e' venerdi' dopo le 9 e se l'agenda di oggi non e' gia' uscita: cosi' la
 * pubblica il primo giro utile, anche se GitHub ne salta uno.
 */
export function agendaDovuta(adesso, ultima) {
  const p = parti(adesso);
  if (p.settimana !== GIORNO_AGENDA || p.ora < ORA_AGENDA) return null;
  const oggi = giorno(adesso);
  return ultima === oggi ? null : oggi;
}

/** Da venerdi' a mezzanotte a lunedi' a mezzanotte, ora italiana. */
export function finestraWeekend(adesso) {
  return { da: mezzanotte(adesso), a: mezzanotte(adesso, 3) };
}

const piuGiorni = (e) => e.fine > e.inizio && giorno(e.fine) !== giorno(e.inizio);

/** Gli eventi che toccano la finestra, senza doppioni, in ordine di inizio. */
export function eventiDelWeekend(eventi, { da, a }) {
  const visti = new Set();
  return eventi
    .filter((e) => e.inizio && e.inizio < a && Math.max(e.inizio, e.fine || 0) >= da)
    .sort((x, y) => x.inizio - y.inizio)
    .filter((e) => {
      const chiave = `${e.titolo.toLowerCase()}|${e.inizio}`;
      if (visti.has(chiave)) return false;
      visti.add(chiave);
      return true;
    });
}

function riga(e, quando) {
  const luogo = e.luogo ? ` · ${sicuro(e.luogo)}` : '';
  return `• ${quando ? `${sicuro(quando)} ` : ''}<a href="${sicuro(e.link)}">${sicuro(e.titolo)}</a>${luogo}`;
}

/**
 * Il messaggio dell'agenda: prima gli eventi di piu' giorni, poi un blocco per
 * giorno. Se non ci sta nei 4096 caratteri di Telegram, gli ultimi restano fuori
 * e il messaggio rimanda alla pagina degli eventi del Comune.
 */
export function testoAgenda(eventi, { da }, limite = LIMITE_TESTO) {
  const blocchi = [];
  const lunghi = eventi.filter(piuGiorni);
  if (lunghi.length) blocchi.push({ titolo: 'Per più giorni', righe: lunghi.map((e) => riga(e, periodo(e.inizio, e.fine))) });
  for (let i = 0; i < 3; i += 1) {
    const inizio = mezzanotte(da, i);
    const delGiorno = eventi.filter((e) => !piuGiorni(e) && giorno(e.inizio) === giorno(inizio));
    if (delGiorno.length) {
      const nome = nomeGiorno(inizio);
      blocchi.push({ titolo: nome[0].toUpperCase() + nome.slice(1), righe: delGiorno.map((e) => riga(e, orarioInizio(e.inizio))) });
    }
  }

  const testa = '🗓️ <b>Questo weekend a Salsomaggiore</b>';
  const piede = `<a href="${PAGINA_EVENTI_COMUNE}">→ Tutti gli eventi sul sito del Comune di Salsomaggiore Terme</a>`;
  const componi = (tagliate) => {
    const corpo = blocchi.map((b) => `<b>${b.titolo}</b>\n${b.righe.join('\n')}`).join('\n\n');
    const altri = tagliate ? `\n\n…e altri ${tagliate}.` : '';
    return `${testa}\n\n${corpo}${altri}\n\n${piede}`;
  };

  let tagliate = 0;
  let messaggio = componi(0);
  while (messaggio.length > limite && blocchi.length) {
    const ultimo = blocchi[blocchi.length - 1];
    ultimo.righe.pop();
    if (!ultimo.righe.length) blocchi.pop();
    tagliate += 1;
    messaggio = componi(tagliate);
  }
  return messaggio;
}
