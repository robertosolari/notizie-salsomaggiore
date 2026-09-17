// Il giro: legge le novita' del Comune, pubblica sul canale quelle mai viste,
// le segna in data/viste.json. Lo lancia la GitHub Action ogni mezz'ora.
//
//   node tools/controlla.mjs [--prova]
//
// Variabili d'ambiente:
//   TELEGRAM_TOKEN   il token del bot, da @BotFather
//   TELEGRAM_CANALE  @nomecanale, con il bot amministratore
//   PUBBLICA_ULTIME  solo a mano: pubblica comunque le ultime N notizie (massimo 5)
//                    e segna le altre come viste, per provare il canale
//
// Con --prova, o senza token, stampa i messaggi e non tocca l'elenco delle viste.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { urlNotizie, leggiNotizie, daPubblicare, ultimeDaPubblicare } from '../src/comune.js';
import { chiamata, ripiegoTesto } from '../src/messaggio.js';

const FILE_VISTE = new URL('../data/viste.json', import.meta.url);
// Oltre questo numero di novita' in un giro qualcosa non va (il portale ha cambiato
// gli id, per esempio): meglio fermarsi che riempire il canale di vecchie notizie.
const MASSIMO_PER_GIRO = 8;
const PAUSA_TRA_MESSAGGI_MS = 3500;

const MASSIMO_ULTIME = 5;

const prova = process.argv.includes('--prova');
const ultime = Math.max(0, Math.min(MASSIMO_ULTIME, Math.floor(Number(process.env.PUBBLICA_ULTIME) || 0)));
const { TELEGRAM_TOKEN: token, TELEGRAM_CANALE: canale } = process.env;
const pubblica = !prova && Boolean(token && canale);
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

async function leggiViste() {
  if (!existsSync(FILE_VISTE)) return null;
  return JSON.parse(await readFile(FILE_VISTE, 'utf8'));
}

async function salvaViste(stato) {
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

// 1. Le notizie dal portale. Se il portale non risponde o risponde vuoto, non si
//    tocca nulla: un giro saltato non fa danni, un elenco azzerato si'.
const risposta = await fetch(urlNotizie(), {
  headers: { 'user-agent': 'notizie-salsomaggiore (canale Telegram non ufficiale)', accept: 'application/json' },
});
if (!risposta.ok) throw new Error(`portale del Comune: HTTP ${risposta.status}`);
const notizie = leggiNotizie(await risposta.json());
if (!notizie.length) throw new Error('il portale ha risposto senza notizie: non tocco nulla');

// 2. Primo giro: tutto quello che c'e' oggi conta come gia' visto.
//    Con PUBBLICA_ULTIME si salta: le ultime N escono, le altre diventano viste.
let stato = await leggiViste();
if (!stato && !ultime) {
  const iniziale = { dal: new Date().toISOString(), viste: notizie.map((n) => n.id) };
  if (prova) {
    console.log(`primo giro: segnerei ${notizie.length} notizie come gia' viste, senza pubblicarle`);
  } else {
    await salvaViste(iniziale);
    console.log(`primo giro: ${notizie.length} notizie segnate come gia' viste, nessuna pubblicata`);
  }
  process.exit(0);
}

// 3. Le novita'.
let nuove;
if (ultime) {
  const scelta = ultimeDaPubblicare(notizie, stato?.viste, ultime);
  stato = { dal: stato?.dal || new Date().toISOString(), viste: scelta.viste };
  nuove = scelta.nuove;
  console.log(`giro a mano: pubblico le ultime ${nuove.length} notizie, le altre ${scelta.viste.length} restano segnate come viste
`);
  // Si salva solo se si pubblica davvero: una prova non deve cambiare cosa esce dopo.
  if (pubblica) await salvaViste(stato);
} else {
  nuove = daPubblicare(notizie, stato.viste);
}
if (!nuove.length) {
  console.log('nessuna novita');
  process.exit(0);
}
if (nuove.length > MASSIMO_PER_GIRO) {
  throw new Error(`${nuove.length} novita' in un solo giro, oltre il limite di ${MASSIMO_PER_GIRO}: controllare prima di pubblicare`);
}
if (!pubblica) {
  if (!prova) console.log('TELEGRAM_TOKEN o TELEGRAM_CANALE mancanti: stampo invece di pubblicare\n');
  for (const n of nuove) console.log(`${JSON.stringify(chiamata(n, canale || '@canale'), null, 1)}\n`);
  process.exit(0);
}

// 4. Una per volta, salvando dopo ognuna: se il giro si interrompe a meta',
//    il successivo non ripubblica quelle gia' uscite.
let errori = 0;
for (const [i, n] of nuove.entries()) {
  if (i > 0) await attendi(PAUSA_TRA_MESSAGGI_MS);
  let { metodo, parametri } = chiamata(n, canale);
  let esito = await telegram(metodo, parametri);
  if (!esito.ok && metodo === 'sendPhoto') {
    console.warn(`foto rifiutata per "${n.titolo}" (${esito.description}), pubblico solo il testo`);
    ({ metodo, parametri } = ripiegoTesto(n, canale));
    esito = await telegram(metodo, parametri);
  }
  if (!esito.ok) {
    // Non si segna come vista: ci riprova il giro dopo.
    console.error(`non pubblicata "${n.titolo}": ${esito.description || 'errore sconosciuto'}`);
    errori += 1;
    continue;
  }
  stato.viste.push(n.id);
  await salvaViste(stato);
  console.log(`pubblicata: ${n.sezione.nome} | ${n.titolo}`);
}
if (errori) process.exit(1);
