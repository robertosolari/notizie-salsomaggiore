# Notizie Salsomaggiore

Le novita' del Comune di Salsomaggiore Terme pubblicate da sole su un canale Telegram
**non ufficiale**: notizie, comunicati, avvisi, ordinanze e allerte meteo.

Nessun server e nessuna dipendenza. Una GitHub Action controlla il sito ogni mezz'ora
e pubblica solo le novita'.

## Avvio

```
npm test          # test su lettura del portale e messaggi
npm run prova     # legge il portale vero e stampa i messaggi, senza pubblicare
npm run controlla # il giro vero: serve TELEGRAM_TOKEN e TELEGRAM_CANALE
```

## Da dove arrivano le notizie

Il sito del Comune e' un'app MyPortal di Lepida, la piattaforma dei comuni
dell'Emilia-Romagna. La pagina `/novita` arriva vuota e le notizie le carica il
JavaScript da un'API JSON, che usiamo anche noi, invece di leggere l'HTML:

```
/myportal/C_H720/api/content?type=rer_news&sortBy=firstPublishedAt&desc=true&pageSize=30
```

Tutte le sezioni sono contenuti `rer_news`, distinti dalla cartella:

| Cartella del portale | Sezione | Indirizzo pubblico |
| --- | --- | --- |
| `/News/Notizie` | Notizie | `/novita/notizie/<slug>` |
| `/News/Comunicati` | Comunicati | `/novita/comunicati/<slug>` |
| `/News/Avvisi` | Avvisi | `/novita/avvisi/<slug>` |
| `/News/Avvisi/Ordinanze` | Ordinanze | `/novita/ordinanze/<slug>` |
| `/News/Avvisi/Allerte Meteo` | Allerta meteo | `/novita/allerte/<slug>` |

I campi usati: `sys_title` (il nome interno perde apostrofi e punteggiatura),
`sys_riassunto` in HTML, `sys_uri_immagine_alta_definiz` da scaricare con
`/api/content/download?id=`, `sys_start_pub_date` per le pubblicazioni programmate.

Il `robots.txt` del Comune chiede ai motori di ricerca di non indicizzare
`/myportal/`. Qui non si indicizza: una richiesta ogni mezz'ora, di giorno, con uno
user-agent che dice chi siamo. Teniamola cosi'.

## Il giro

1. Legge le ultime 30 novita'. Se il portale non risponde o risponde vuoto, si ferma
   senza toccare nulla.
2. **Al primo giro** segna tutte le notizie presenti come gia' viste e non pubblica
   niente: il canale parte pulito.
3. Pubblica le mai viste dalla piu' vecchia, una ogni 3,5 secondi, e le segna in
   `data/viste.json` una per una: se il giro si interrompe, il successivo non ripete.
4. Se le novita' sono piu' di 8 in un giro si ferma con un errore: vorrebbe dire che
   il portale ha cambiato qualcosa, e il canale si riempirebbe di notizie vecchie.

Il messaggio e' la foto in evidenza con sezione, titolo, riassunto e link. Senza foto,
o se Telegram non riesce a scaricarla (il limite e' 5 MB), esce solo il testo con
l'anteprima del link. Le didascalie si fermano a 1024 caratteri, tagliando il
riassunto su una parola.

## Messa in funzione

1. Su @BotFather, `/newbot`: il token.
2. Il bot come **amministratore** del canale, con il permesso di pubblicare.
3. Su GitHub, *Settings, Secrets and variables, Actions*, nella scheda
   **Repository secrets** (non Environment secrets: il job non dichiara un ambiente):
   `TELEGRAM_TOKEN` e `TELEGRAM_CANALE` (`@nomecanale`).
4. *Actions, Novita del Comune, Run workflow*: il primo giro segna le notizie
   esistenti. Dal giro dopo pubblica le nuove.

GitHub sospende i workflow programmati dopo 60 giorni senza commit nel repository.
Qui ogni notizia pubblicata e' un commit, quindi non succede finche' il Comune scrive.

## Struttura

| File | Cosa contiene |
| --- | --- |
| `src/comune.js` | API del portale, lettura delle notizie, testo dall'HTML, novita' da pubblicare. Funzioni pure. |
| `src/messaggio.js` | Il messaggio per Telegram, dentro i limiti. Funzioni pure. |
| `tools/controlla.mjs` | Il giro: legge, pubblica, salva le viste. |
| `data/viste.json` | **Versionato**, lo crea il primo giro: gli id gia' pubblicati o gia' presenti. |
| `test/risposta-portale.json` | Una risposta vera del portale, per i test. |
