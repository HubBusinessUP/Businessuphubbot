# Sincronizzazione contatti Telegram → Supabase

Legge i tuoi contatti Telegram (via Telegram Client API / MTProto) e li carica nella tabella
`businessup.contatti_telegram`, così li gestisci dall'admin Cashly (sezione **Miei contatti**) con tag.

> ⚠️ È un *userbot*: accede come te. La sessione salvata in `session.txt` è l'accesso pieno
> al tuo account: tienila privata, non committarla, non condividerla.

## Prerequisiti
- Node.js 18+ (hai la v24, ok)
- api_id e api_hash da https://my.telegram.org → *API development tools* (crea un'app qualsiasi)
- La chiave **service_role** di Supabase (Dashboard → Settings → API)

## Setup
```bash
cd tools/tg-contacts-sync
cp .env.example .env      # poi compila .env con i tuoi valori
npm install
npm start
```

Al primo avvio ti chiede **numero**, **codice** (arriva su Telegram) ed eventuale **password 2FA**.
Dopo salva la sessione: gli avvii successivi non chiedono più il login.

## Aggiornare la rubrica
Rilancia `npm start` quando vuoi ri-sincronizzare. I dati anagrafici vengono aggiornati;
i **tag** e le **note** che hai messo dall'admin restano intatti.
