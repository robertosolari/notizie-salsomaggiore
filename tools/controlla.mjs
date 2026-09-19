// Il giro: legge le novita' e gli eventi del Comune, gli eventi di Visit
// Salsomaggiore e il programma del cinema Odeon, pubblica sul canale quelli mai
// visti, li segna in data/viste.json.
// Il venerdi' dalle 9 pubblica anche l'agenda del weekend. Lo lancia la GitHub
// Action ogni ora.
//
//   node tools/controlla.mjs [--prova]
//
// Variabili d'ambiente:
//   TELEGRAM_TOKEN   il token del bot, da @BotFather
//   TELEGRAM_CANALE  @nomecanale, con il bot amministratore
//   PUBBLICA_ULTIME  solo a mano: pubblica comunque le ultime N novita' (massimo 5)
//                    e segna le altre come viste, per provare il canale
//   AGENDA           solo a mano: 1 per pubblicare adesso l'agenda del weekend,
//                    anche se non e' venerdi' o se e' gia' uscita
//
// Con --prova, o senza token, stampa i messaggi e non tocca l'elenco delle viste.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { urlNotizie, leggiNotizie, daPubblicare, ultimeDaPubblicare } from '../src/comune.js';
import { urlEventiComune, leggiEventiComune, urlEventiVisit, leggiEventiVisit } from '../src/eventi.js';
import { urlCinema, leggiCinema } from '../src/cinema.js';
import { agendaDovuta, finestraWeekend, eventiDelWeekend, testoAgenda } from '../src/agenda.js';
import { giorno } from '../src/quando.js';
import { chiamata, ripiegoTesto } from '../src/messaggio.js';

const FILE_VISTE = new URL('../data/viste.json', import.meta.url);
// Si pubblicano al massimo tante novita' per giro, dalla piu' vecchia: le altre
// escono al giro dopo, cosi' un Comune che carica dieci eventi insieme non
// riempie il canale in un minuto.
const MASSIMO_PER_GIRO = 8;
// Oltre questo numero di novita' da una sola fonte qualcosa non va (ha cambiato
// gli id, per esempio): quella fonte si salta finche' qualcuno non controlla.
const ANOMALIA_PER_FONTE = 25;
const PAUSA_TRA_MESSAGGI_MS = 3500;
const MASSIMO_ULTIME = 5;

const FONTI = [
  // Per le notizie una risposta vuota e' un guasto; gli eventi invece possono
  // mancare davvero, se quelli pubblicati sono tutti passati.
  { chiave: 'notizie', nome: 'notizie del Comune', url: urlNotizie(), leggi: (j) => leggiNotizie(j), maiVuota: true },
  { chiave: 'eventi-comune', nome: 'eventi del Comune', url: urlEventiComune(), leggi: (j) => leggiEventiComune(j) },
  { chiave: 'visit', nome: 'eventi di Visit Salsomaggiore', url: urlEventiVisit(), leggi: (j) => leggiEventiVisit(j) },
  // Un solo messaggio per settimana, e solo con spettacoli ancora da fare: esce
  // anche alla prima lettura, non ci sono arretrati da evitare.
  { chiave: 'cinema', nome: 'programma del cinema Odeon', url: urlCinema(), leggi: (j) => leggiCinema(j), subito: true },
];

const prova = process.argv.includes('--prova');
const ultime = Math.max(0, Math.min(MASSIMO_ULTIME, Math.floor(Number(process.env.PUBBLICA_ULTIME) || 0)));
const agendaForzata = ['1', 'true'].includes(String(process.env.AGENDA || '').toLowerCase());
const { TELEGRAM_TOKEN: token, TELEGRAM_CANALE: canale } = process.env;
const pubblica = !prova && Boolean(token && canale);
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

// Errori che non dipendono dalla notizia ma dal canale o dal bot: inutile riprovare
// senza foto o passare alla notizia dopo. Il giro si ferma e dice cosa controllare.
const ERRORI_DI_CONFIGURAZIONE = [
  [/chat not found/i, "TELEGRAM_CANALE non corrisponde a nessun canale: serve @username del canale pubblico (non il nome, non il link t.me) oppure l'id numerico -100... di un canale privato"],
  [/not enough rights|need administrator|not a member|bot was kicked/i, "il bot non e' amministratore del canale, o non ha il permesso di pubblicare messaggi"],
  [/unauthorized|invalid token|not found$/i, "TELEGRAM_TOKEN non e' valido: ricopialo da @BotFather"],
];
const configurazioneSbagliata = (descrizione) => ERRORI_DI_CONFIGURAZIONE.find(([re]) => re.test(descrizione || ''))?.[1];
function fermatiSeConfigurazione(esito) {
  const problema = !esito.ok && configurazioneSbagliata(esito.description);
  if (!problema) return;
  console.error(`Telegram: ${esito.description}\n${problema}`);
  process.exit(1);
}

async function leggiViste() {
  if (!existsSync(FILE_VISTE)) return null;
  return JSON.parse(await readFile(FILE_VISTE, 'utf8'));
}

async function salvaViste(stato) {
  if (!pubblica) return; // una prova non deve cambiare cosa esce dopo
  await mkdir(new URL('.', FILE_VISTE), { recursive: true });
  await writeFile(FILE_VISTE, `${JSON.stringify(stato, null, 1)}\n`, 'utf8');
}

async function telegram(metodo, parametri) {
  const risposta = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(parametri),
  });
  const esito = await risposta.json().catch(() => ({}));
  // Troppi messaggi: Telegram dice quanto aspettare.
  if (esito.parameters?.retry_after) {
    await attendi((esito.parameters.retry_after + 1) * 1000);
    return telegram(metodo, parametri);
  }
  return esito;
}

async function scarica(url) {
  const risposta = await fetch(url, {
    headers: { 'user-agent': 'notizie-salsomaggiore (canale Telegram non ufficiale)', accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!risposta.ok) throw new Error(`HTTP ${risposta.status}`);
  return risposta.json();
}

let errori = 0;

// 1. Le fonti, una per una. Se una non risponde si va avanti con le altre, senza
//    toccare niente di suo: un giro saltato non fa danni, un elenco azzerato si'.
const lette = [];
for (const fonte of FONTI) {
  try {
    const elementi = fonte.leggi(await scarica(fonte.url));
    if (fonte.maiVuota && !elementi.length) throw new Error('risposta senza contenuti');
    lette.push({ fonte, elementi });
  } catch (e) {
    console.error(`${fonte.nome}: ${e.message}, salto questa fonte`);
    errori += 1;
  }
}

// 2. Le fonti mai lette prima: tutto quello che c'e' oggi conta come gia' visto,
//    cosi' il canale non si riempie di arretrati. Vale per il primo giro in
//    assoluto e per ogni fonte aggiunta dopo. Un elenco di prima delle fonti
//    conosceva solo le notizie.
let stato = await leggiViste();
const primoGiro = !stato;
stato ??= { dal: new Date().toISOString(), viste: [] };
stato.fonti ??= primoGiro ? [] : ['notizie'];

let nuove = [];
if (ultime) {
  // Giro a mano: le ultime N novita' fra tutte le fonti escono, le altre diventano viste.
  const scelta = ultimeDaPubblicare(lette.flatMap((l) => l.elementi), stato.viste, ultime);
  stato.viste = scelta.viste;
  stato.fonti = [...new Set([...stato.fonti, ...lette.map((l) => l.fonte.chiave)])];
  nuove = scelta.nuove;
  console.log(`giro a mano: pubblico le ultime ${nuove.length} novita', le altre restano segnate come viste`);
} else {
  for (const { fonte, elementi } of lette) {
    if (!stato.fonti.includes(fonte.chiave) && fonte.subito) {
      stato.fonti.push(fonte.chiave);
      console.log(`${fonte.nome}, prima lettura: pubblico subito`);
    } else if (!stato.fonti.includes(fonte.chiave)) {
      stato.viste.push(...elementi.map((n) => n.id).filter((id) => !stato.viste.includes(id)));
      stato.fonti.push(fonte.chiave);
      console.log(`${fonte.nome}, prima lettura: ${elementi.length} segnate come gia' viste, nessuna pubblicata`);
      continue;
    }
    const sue = daPubblicare(elementi, stato.viste);
    if (sue.length > ANOMALIA_PER_FONTE) {
      console.error(`${fonte.nome}: ${sue.length} novita' in un solo giro, oltre il limite di ${ANOMALIA_PER_FONTE}: controllare prima di pubblicare`);
      errori += 1;
      continue;
    }
    nuove.push(...sue);
  }
}
await salvaViste(stato);

// 3. Le novita', dalla piu' vecchia, al massimo MASSIMO_PER_GIRO.
nuove.sort((x, y) => x.pubblicata - y.pubblicata);
if (nuove.length > MASSIMO_PER_GIRO) {
  console.log(`${nuove.length} novita': ne pubblico ${MASSIMO_PER_GIRO}, le altre al giro dopo`);
  nuove = nuove.slice(0, MASSIMO_PER_GIRO);
}
if (!nuove.length) console.log('nessuna novita');
if (!pubblica && nuove.length) {
  if (!prova) console.log('TELEGRAM_TOKEN o TELEGRAM_CANALE mancanti: stampo invece di pubblicare\n');
  for (const n of nuove) console.log(`${JSON.stringify(chiamata(n, canale || '@canale'), null, 1)}\n`);
}

// 4. Una per volta, salvando dopo ognuna: se il giro si interrompe a meta',
//    il successivo non ripubblica quelle gia' uscite.
let messaggi = 0;
for (const n of pubblica ? nuove : []) {
  if (messaggi > 0) await attendi(PAUSA_TRA_MESSAGGI_MS);
  let { metodo, parametri } = chiamata(n, canale);
  let esito = await telegram(metodo, parametri);
  fermatiSeConfigurazione(esito);
  if (!esito.ok && metodo === 'sendPhoto') {
    console.warn(`foto rifiutata per "${n.titolo}" (${esito.description}), pubblico solo il testo`);
    ({ metodo, parametri } = ripiegoTesto(n, canale));
    esito = await telegram(metodo, parametri);
  }
  messaggi += 1;
  if (!esito.ok) {
    // Non si segna come vista: ci riprova il giro dopo.
    console.error(`non pubblicata "${n.titolo}": ${esito.description || 'errore sconosciuto'}`);
    errori += 1;
    continue;
  }
  if (!stato.viste.includes(n.id)) stato.viste.push(n.id);
  await salvaViste(stato);
  console.log(`pubblicata: ${n.sezione.nome} | ${n.titolo}`);
}

// 5. L'agenda del weekend, il venerdi' dalle 9 (o quando la si chiede a mano).
const adesso = Date.now();
const agenda = agendaForzata ? giorno(adesso) : agendaDovuta(adesso, stato.agenda);
if (agenda) {
  try {
    // Per data dell'evento, dal piu' lontano: 100 bastano a coprire i prossimi mesi.
    const finestra = finestraWeekend(adesso);
    const eventi = eventiDelWeekend(leggiEventiComune(await scarica(urlEventiComune({ quante: 100, perData: true })), adesso), finestra);
    if (!eventi.length) {
      console.log("agenda: nessun evento del Comune nel weekend, non la pubblico");
    } else {
      const parametri = { chat_id: canale, text: testoAgenda(eventi, finestra), parse_mode: 'HTML', link_preview_options: { is_disabled: true } };
      if (!pubblica) {
        console.log(`agenda del weekend, ${eventi.length} eventi:\n\n${parametri.text}\n`);
      } else {
        if (messaggi > 0) await attendi(PAUSA_TRA_MESSAGGI_MS);
        const esito = await telegram('sendMessage', parametri);
        fermatiSeConfigurazione(esito);
        if (!esito.ok) throw new Error(esito.description || 'errore sconosciuto');
        console.log(`pubblicata l'agenda del weekend: ${eventi.length} eventi`);
      }
    }
    stato.agenda = agenda;
    await salvaViste(stato);
  } catch (e) {
    // Non si segna come uscita: ci riprova il giro dopo.
    console.error(`agenda del weekend: ${e.message}`);
    errori += 1;
  }
}

if (errori) process.exit(1);
