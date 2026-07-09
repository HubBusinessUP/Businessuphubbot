# Sincronizzazione contatti Telegram → Supabase

Legge i tuoi contatti Telegram e li carica in `businessup.contatti_telegram`, così li gestisci
dall'admin Cashly (scheda **Rubrica**) con i tag.

Usa la **stessa libreria (MTKruto) e le stesse credenziali di UniChat**: niente my.telegram.org.

## Setup (veloce, riusa UniChat)
```bash
cd tools/tg-contacts-sync
copy .env.example .env
```
Nel `.env` compili solo:
- `OWNER_ID=334179105`
- `SUPABASE_URL` (già pronto)
- `SUPABASE_SERVICE_ROLE_KEY` (Dashboard Supabase → Settings → API → service_role)

Le credenziali Telegram vengono prese in automatico da `Code/unichat/.env`
(`TG_API_ID`, `TG_API_HASH`, `TG_PHONE`).

```bash
npm install
npm start
```
Al **primo** avvio fa un login (numero + codice OTP, arriva su Telegram; + 2FA se attiva) su una
sessione **separata** da UniChat (cartella `./session`). Dagli avvii successivi non chiede più nulla.

## Aggiornare la rubrica
Rilancia `npm start`. I dati anagrafici si aggiornano; i **tag** messi dall'admin restano intatti.

## Note
- La sessione è separata da UniChat apposta, per non interferire col processo PM2 sempre attivo.
- `session/`, `.env` e `node_modules/` non vengono committati.
