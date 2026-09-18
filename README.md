# Notizie Salsomaggiore

Le novita' di Salsomaggiore Terme pubblicate da sole su un canale Telegram
**non ufficiale**:

- dal sito del Comune: notizie, comunicati, avvisi, ordinanze, allerte meteo ed **eventi**;
- da [Visit Salsomaggiore](https://visitsalsomaggiore.it), il sito turistico ufficiale: gli **eventi**;
- il venerdi' mattina, l'**agenda del weekend** in un solo messaggio.

Nessun server e nessuna dipendenza. Una GitHub Action controlla i siti ogni ora, dalle 7 alle 23,
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
`/myportal/`. Qui non si indicizza: due richieste ogni ora (notizie ed eventi), di
giorno, con uno user-agent che dice chi siamo, piu' una il venerdi' per l'agenda.
Teniamola cosi'.

### Eventi del Comune

Stessa API, tipo `rer_evento`, cartelle sotto `/Eventi` (sportivi, culturali, altri).
Campi in piu': `sys_start_date` e `sys_end_date` in UTC (gli eventi di tutto il giorno
sono a mezzanotte italiana, a volte con la fine prima dell'inizio), `sys_luogo`,
`sys_canonical_url` per il link. Gli eventi gia' finiti non si pubblicano.

Per l'agenda si chiedono invece i 100 eventi con la data piu' lontana
(`sortBy=attributes.sys_start_date&desc=true`) e si tengono quelli da venerdi' a domenica.

### Visit Salsomaggiore

WordPress, con l'API REST aperta e un `robots.txt` che non vieta nulla:

```
https://visitsalsomaggiore.it/it/wp-json/wp/v2/event?per_page=20&orderby=date&order=desc
```

Titolo, estratto, immagine da `yoast_head_json.og_image`. La data dell'evento non e' un
campo a parte, sta scritta nel testo: per questo gli eventi di Visit escono come messaggi
singoli ma non entrano nell'agenda. Lo stesso evento puo' uscire sia dal Comune sia da
Visit: sono due siti diversi e gli id non si possono confrontare.

Le fonti scartate: tabianoterme.it (eventi di tutta la provincia, quasi tutti doppioni) e
i giornali locali (niente feed aperto, e servirebbero solo titolo e link).

## Il giro

1. Legge le tre fonti: notizie del Comune, eventi del Comune, eventi di Visit. Se una
   non risponde (o le notizie arrivano vuote) salta quella e va avanti con le altre,
   senza toccare niente di suo; il giro finisce in errore per farlo vedere.
2. **La prima volta che legge una fonte** segna tutto quello che c'e' come gia' visto e
   non pubblica niente: il canale non si riempie di arretrati. Vale per il primo giro e
   per ogni fonte aggiunta dopo (`fonti` in `data/viste.json` dice quali sono gia' partite).
3. Pubblica le mai viste dalla piu' vecchia, una ogni 3,5 secondi, e le segna in
   `data/viste.json` una per una: se il giro si interrompe, il successivo non ripete.
   Al massimo 8 per giro: se il Comune carica dieci eventi insieme, gli altri escono
   l'ora dopo.
4. Se una fonte ha piu' di 25 novita' in un giro, quella fonte si salta con un errore:
   vorrebbe dire che ha cambiato qualcosa, e il canale si riempirebbe di roba vecchia.
5. Il venerdi', al primo giro dalle 9, pubblica l'agenda del weekend: gli eventi del
   Comune da venerdi' a domenica, prima quelli di piu' giorni e poi giorno per giorno,
   con orario, titolo linkato e luogo. Se il weekend e' vuoto non esce niente. In
   `data/viste.json`, `agenda` e' il giorno dell'ultima uscita.

Il messaggio e' la foto in evidenza con sezione, titolo, riassunto e link; per gli eventi
del Comune anche data, orario e luogo sotto il titolo. Senza foto,
o se Telegram non riesce a scaricarla (il limite e' 5 MB), esce solo il testo con
l'anteprima del link. Le didascalie si fermano a 1024 caratteri, tagliando il
riassunto su una parola.

## Condizioni del sito del Comune

Le [note legali](https://www.comune.salsomaggiore-terme.pr.it/note-legali) consentono di
riutilizzare i contenuti per finalita' non commerciali, citando la fonte e l'indirizzo
della pagina originale. Per questo:

- ogni messaggio porta il link alla notizia, titolato "sito del Comune di Salsomaggiore
  Terme" come chiedono le regole sui collegamenti;
- titolo e riassunto sono quelli del Comune, accorciati solo se troppo lunghi;
- il canale e' dichiaratamente non ufficiale, senza stemma del Comune e senza pubblicita'.

## Messa in funzione

1. Su @BotFather, `/newbot`: il token.
2. Il bot come **amministratore** del canale, con il permesso di pubblicare.
3. Su GitHub, *Settings, Secrets and variables, Actions*, nella scheda
   **Repository secrets** (non Environment secrets: il job non dichiara un ambiente):
   `TELEGRAM_TOKEN` e `TELEGRAM_CANALE` (`@nomecanale`).
4. *Actions, Novita del Comune, Run workflow*: il primo giro segna le notizie
   esistenti. Dal giro dopo pubblica le nuove.

Per provare il canale con notizie vere, *Run workflow* con **pubblica_ultime** a 2:
escono le ultime due notizie, anche se gia' viste, e tutte le altre vengono segnate
come viste. I giri programmati non usano mai questa opzione.

Per vedere l'agenda senza aspettare venerdi', *Run workflow* con **agenda** spuntato.
In locale: `AGENDA=1 npm run prova` la stampa senza pubblicarla.

GitHub sospende i workflow programmati dopo 60 giorni senza commit nel repository.
Qui ogni notizia pubblicata e' un commit, quindi non succede finche' il Comune scrive.

## Struttura

| File | Cosa contiene |
| --- | --- |
| `src/comune.js` | API del portale, lettura delle notizie, testo dall'HTML, novita' da pubblicare. Funzioni pure. |
| `src/eventi.js` | Eventi del Comune e di Visit Salsomaggiore, nello stesso formato delle notizie. Funzioni pure. |
| `src/agenda.js` | L'agenda del weekend: quando esce, quali eventi, il messaggio. Funzioni pure. |
| `src/quando.js` | Date in ora italiana: "sabato 19 settembre, 18:00", "dal 17 al 20 settembre". |
| `src/messaggio.js` | Il messaggio per Telegram, dentro i limiti. Funzioni pure. |
| `tools/controlla.mjs` | Il giro: legge le fonti, pubblica, salva le viste, l'agenda del venerdi'. |
| `data/viste.json` | **Versionato**, lo crea il primo giro: gli id gia' pubblicati o gia' presenti, le fonti gia' partite, l'ultima agenda. |
| `test/*.json` | Risposte vere del portale e di Visit, ridotte, per i test. |
