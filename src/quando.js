// Date degli eventi nell'ora italiana, qualunque sia il fuso di chi fa girare il
// codice (la GitHub Action gira in UTC). Funzioni pure.

const FUSO = 'Europe/Rome';
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

const formato = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO, hourCycle: 'h23',
  year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short',
});
const SETTIMANA = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Giorno, ora e giorno della settimana (0 = domenica) in Italia. */
export function parti(ms) {
  const p = Object.fromEntries(formato.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return {
    anno: Number(p.year), mese: Number(p.month), giorno: Number(p.day),
    ora: Number(p.hour), minuti: Number(p.minute), settimana: SETTIMANA[p.weekday],
  };
}

/** Il giorno italiano come 'AAAA-MM-GG', per confrontare e raggruppare. */
export function giorno(ms) {
  const p = parti(ms);
  return `${p.anno}-${String(p.mese).padStart(2, '0')}-${String(p.giorno).padStart(2, '0')}`;
}

/** La mezzanotte italiana del giorno di `ms`, spostata di `piuGiorni`. */
export function mezzanotte(ms, piuGiorni = 0) {
  const p = parti(ms);
  const comeUtc = Date.UTC(p.anno, p.mese - 1, p.giorno + piuGiorni);
  // Lo scarto di Roma da UTC in quel giorno: un'ora d'inverno, due d'estate.
  const q = parti(comeUtc);
  const scarto = Date.UTC(q.anno, q.mese - 1, q.giorno, q.ora, q.minuti) - comeUtc;
  return comeUtc - scarto;
}

const ora = (p) => `${String(p.ora).padStart(2, '0')}:${String(p.minuti).padStart(2, '0')}`;
// Il portale segna gli eventi di tutto il giorno a mezzanotte: nessun orario da mostrare.
const conOrario = (p) => p.ora !== 0 || p.minuti !== 0;

/** 'sabato 19 settembre' */
export function nomeGiorno(ms) {
  const p = parti(ms);
  return `${GIORNI[p.settimana]} ${p.giorno} ${MESI[p.mese - 1]}`;
}

/**
 * Quando si svolge un evento, in italiano:
 * 'sabato 19 settembre, 18:00–19:00', 'dal 17 al 20 settembre', 'dal 30 ottobre al 1 novembre'.
 * Una fine prima dell'inizio (capita, sul portale) si ignora.
 */
export function periodo(inizio, fine) {
  if (!inizio) return '';
  const a = parti(inizio);
  const b = fine && fine > inizio ? parti(fine) : null;
  const stessoGiorno = !b || giorno(inizio) === giorno(fine);

  if (stessoGiorno) {
    let testo = nomeGiorno(inizio);
    if (conOrario(a)) testo += `, ${ora(a)}`;
    if (conOrario(a) && b && conOrario(b)) testo += `–${ora(b)}`;
    return testo;
  }
  const stessoMese = a.mese === b.mese && a.anno === b.anno;
  return `dal ${a.giorno}${stessoMese ? '' : ` ${MESI[a.mese - 1]}`} al ${b.giorno} ${MESI[b.mese - 1]}`;
}

/** Solo l'orario d'inizio, per l'agenda ('21:00'), o '' per gli eventi di tutto il giorno. */
export function orarioInizio(inizio) {
  const p = parti(inizio);
  return conOrario(p) ? ora(p) : '';
}
