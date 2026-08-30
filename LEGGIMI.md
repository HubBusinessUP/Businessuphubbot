# Cashly · Broker vs Broker

Tutto quello che serve per riprendere il lavoro. Aperto da Claude Code,
questo file basta a capire dove sono le cose e come si pubblica.

---

## Cosa c'è dentro

```
bot/index.ts          il bot Telegram, ~9.000 righe
web/                  le pagine del sito, già online
mt5/                  lettore conti MT5 (non in uso)
prototipi/            bozze da valutare
doc/                  schema database e impostazioni
deploy-bot.py         pubblica il bot
pubblica.py           pubblica le pagine
```

Sta tutto nel repository `HubBusinessUP/Businessuphubbot`, che è
**pubblico**: nei file non va scritto nessun segreto. I token stanno nelle
variabili della funzione su Supabase, le impostazioni sensibili nella
tabella `bvb_impostazioni`.

---

## Prima di tutto · i token

I token usati finora sono passati in chat per un mese: **vanno rigenerati**.

**Supabase** — dashboard, Account, Access Tokens, revoca il vecchio e creane
uno nuovo

**GitHub** — Settings, Developer settings, Personal access tokens

**BotFather** — `/mybots`, il bot, API Token, Revoke current token

⚠️ Se revochi quello di BotFather devi rimettere il webhook (sotto trovi come).

Poi:

```
export SB=il_token_supabase
export GH=il_token_github
```

**Anche `admin_token`** va rigenerato: è la chiave che apre
`/bvb/admin/` e `/api/admin`. Sta nella tabella `bvb_impostazioni`, riga
`admin_token`; in `doc/impostazioni.txt` non è riportato perché il
repository è pubblico. Per cambiarlo basta svuotare quella riga: il bot
ne genera uno nuovo da sé la prossima volta che apri **Affiliati
Dashboard** dal menu amministratore.

---

## Dove vive tutto

**Il bot** — funzione `bvb2` sul progetto Supabase `jwpbopkoscqooovfvwqn`,
versione 250. Il codice qui è quello pubblicato.

**Le pagine** — cartella `web/` di questo repository, servite da
`hub.cashlypro.com`. Ogni pagina sta già al percorso definitivo, quello che
il browser chiede:

```
web/bvb/index.html                dashboard cliente
web/bvb/ciclo/index.html          certificato del ciclo
web/bvb/totale/index.html         totale condivisibile
web/bvb/partner/index.html        area affiliato
web/bvb/admin/index.html          quadro delle reti
web/broker-vs-broker/index.html   landing
```

**I dati** — 23 tabelle sullo stesso progetto Supabase, tutte con prefisso
`bvb_`. Lo schema completo è in `doc/schema-database.md`.

---

## Come si pubblica

**Il bot**

```
python deploy-bot.py
```

Controlla il codice con deno, lo carica e stampa la versione.

**Le pagine**

```
python pubblica.py                       tutte
python pubblica.py web/bvb/index.html    una sola
```

Le pagine si possono anche pubblicare con un normale `git push` su `master`:
GitHub Pages le mette online da sé. `pubblica.py` serve quando si lavora
fuori da git.

⚠️ Dopo aver modificato una pagina, alza `APP_VER` in `bot/index.ts`:
è il numero che costringe Telegram a ricaricare la versione nuova.

---

## Gli indirizzi

```
hub.cashlypro.com/bvb/               dashboard cliente
hub.cashlypro.com/bvb/ciclo/         certificato del ciclo
hub.cashlypro.com/bvb/totale/        totale condivisibile
hub.cashlypro.com/bvb/partner/       area affiliato
hub.cashlypro.com/bvb/admin/         quadro delle reti
hub.cashlypro.com/broker-vs-broker/  landing
```

Ogni pagina vuole `?v=<APP_VER>&t=<token>`. I token stanno nella colonna
`app_token` di `bvb_utenti`.

---

## Se serve rimettere il webhook

```
https://api.telegram.org/bot<TOKEN>/setWebhook
  ?url=https://jwpbopkoscqooovfvwqn.supabase.co/functions/v1/bvb2
  &secret_token=<il segreto>
  &allowed_updates=["message","channel_post","callback_query","my_chat_member"]
```

Il segreto sta nelle variabili della funzione su Supabase.

---

## Com'è fatto il bot

Un file solo che serve quattro contesti, riconosciuti a ogni messaggio:

```
chat privata      cambia secondo chi scrive: sconosciuto, cliente,
                  affiliato o amministratore
gruppo cliente    apertura e chiusura dei cicli
gruppo fornitori  diciture e conferme
canali segnali    legge i messaggi MT5 e agisce da solo
```

### Il ciclo

Screenshot, capitale, scelta del broker, poi la dicitura ai fornitori.

**Vince Total FX** — conteggio, wallet, pagamento verificato on-chain,
chiusura automatica.

**Vince l'altro broker** — dal segnale il bot capisce se serve il reset o
il bonus, lo chiede ai fornitori da solo, e prosegue fino alla chiusura.

### I segnali

Il bot riconosce quattro messaggi MT5, in due formati diversi:

```
Bonus changed · New bonus: 900     bonus accreditato
Bonus changed · New bonus: 0.00    conto azzerato
Step 1 closed                      serve il secondo step
Cycle closed                       chiusura, con i saldi
```

Trova il cliente dal numero di conto o dal nome. Se non lo riconosce,
resta zitto.

---

## Cosa è rimasto aperto

**Il riconoscimento unico** — oggi ogni funzione decide da sé chi ha
davanti. Serve un punto solo, prima di aggiungere altri affiliati.

**I cicli che scadono** — uno stato appeso resta per sempre e sporca i
conteggi successivi. È la causa dei calcoli sbagliati di questi giorni.

**I controlli automatici** — sui calcoli del ciclo, così gli errori non li
scoprono i clienti.

**Mini App unica** — quattro voci per tutti i ruoli, cambia solo il
perimetro. Prototipo in `prototipi/miniapp-nuova.jsx`.

**White label** — ogni affiliato col suo bot, stesso codice dietro, e un
interruttore per spegnerlo. Le fee restano sul wallet principale.

**Dominio Mini App** — da registrare su BotFather, altrimenti da desktop
non si aprono.

**Scheda a catalogo** — pronta in `doc/scheda-catalogo-bvb.json`, non ancora
pubblicata.

---

## I clienti

```
C1  Antonio Mazzone              conto proprio, fee 50%
C2  Daniele Giagnorio            fee 40%
C3  Simone Bertozzi Barbagelata  fee 50%
C4  Marco Pittalis               fee 50%
C5  Daniele Angellotti           fee 50%, deve ancora partire
E1  Cristian Cipriano            rete EdgeFunds, fee 50%
```

**EdgeFunds** è l'unico affiliato: quota 11%, prefisso `E`, due
amministratori collegati.

La ripartizione su ogni ciclo: fornitori 35%, affiliato 11%, il resto a te.

---

## Cose da sapere prima di toccare il codice

**Le Mini App non funzionano nei gruppi.** Telegram rifiuta il messaggio.
Nei gruppi servono link normali: la funzione `appKb` decide da sola.

**Gli stati vivono in `bvb_bot_state`**, una riga per chat. Se restano
valori vecchi, i conteggi sbagliano: è successo più volte.

**Il profitto si arrotonda all'euro superiore.** La commissione si calcola
su quello.

**Se il saldo di Total FX è negativo conta zero**, perché il bonus si è
bruciato.

**Non scrivere mai nei gruppi durante le prove.** Ci sono clienti veri
dentro.
