# Business UP - Project Guide

## Panoramica

Sistema completo di lead generation, qualification e nurturing per Business UP (anti-guru, anti-hype brand trading).

**Stack**: Node.js bot (grammy) + Supabase + Netlify static sites + Railway hosting

## Componenti Principali

### 1. Bot Telegram (`bot/`)

- **Framework**: grammy (TypeScript-less Node.js Telegram)
- **Deploy**: Railway (Node.js 18+)
- **Responsabilità**:
  - `/start` command → salva lead
  - `new_chat_members` intercept → DM automatico
  - Webhook da sondaggio web → qualificazione automatica
  - Admin commands: `/menu`, `/kpi`, `/send_q/s/all`, `/dm`, `/set_stage`
  - API endpoints per dashboard admin

**File chiave**:
- `index.js`: entry point + Express server + bot handlers
- `handlers/`: moduli per ogni feature (start, newMember, admin, webhook, qualifica)
- `lib/supabase.js`: client Supabase + query helper

### 2. Sondaggio Web (`sondaggio/`)

- **Formato**: HTML puro (no build step)
- **Deploy**: Netlify (drag & drop o git)
- **Dati raccolti**: 8 campi (nome, livello trading, esperienza, capitale, prodotto, budget, note)
- **Validazione**: Lato client + server-side qualificazione
- **Submission**: POST JSON a `https://businessup-bot.railway.app/webhook/sondaggio`

**Design**: #0a0a0a background, #0d9e88 accent, Inter font, no hype

### 3. Tutorial Pages (`tutorial/`)

- **Pagine**: bvb.html, prop.html, bonus.html, swap.html
- **Deploy**: Netlify
- **Formato**: HTML puro + embedded CSS
- **Tono**: Diretto, data-driven, zero emoji
- **Link**: Inviati nel messaggio qualificato del bot

### 4. Dashboard Admin (`admin/`)

- **Autenticazione**: Password JS-side (cambia `CORRECT_PASSWORD`)
- **Deploy**: Netlify
- **Features**:
  - KPI in tempo reale (totale, qualificati, squalificati, clienti, tasso)
  - Tabella lead con filtri per stage
  - Broadcast rapido ai segmenti
  - Edit stage tramite modal

## Supabase Schema

Progetto: `jwpbopkoscqooovfvwqn`

### leads
- telegram_id (PK)
- username, nome
- pipeline_stage (nuovo/qualificato/squalificato/contattato/cliente)
- motivo_squalifica (capitale_insufficiente/no_esperienza_broker/no_budget_mentale)
- bot_started, sondaggio_completato
- ultimo_messaggio, created_at

### sondaggio_risposte
- telegram_id (PK)
- 19 campi (nome, livello_trading, esperienza_broker, capitale, etc.)
- created_at

### broadcast_log
- id (PK)
- tipo, testo, destinatari_count, inviati, falliti
- created_at

## Flusso Dati

```
[Telegram User] 
  → /start o new_chat_member
  → Bot salva in leads (stage: nuovo)
  → Bot invia link sondaggio
  
[Sondaggio Web]
  → User completa form
  → POST /webhook/sondaggio con dati
  
[Bot Webhook Handler]
  → Valida e salva in sondaggio_risposte
  → Qualifica (capital >= 2k + esperienza + budget)
  → Update lead stage (qualificato/squalificato)
  → Invia messaggio via Telegram
  
[Admin Dashboard]
  → Fetch /api/stats, /api/leads
  → Filter per stage
  → Broadcast manuale con /api/broadcast
  → Edit stage con /api/set-stage
```

## Criteri Qualificazione

**Qualificato se**:
- Capitale >= €2.000
- Esperienza broker ≠ "No mai"
- willingness_to_pay ≠ "Solo se gratis"

**Altrimenti squalificato** con uno dei motivi:
- `capitale_insufficiente`: < €2.000
- `no_esperienza_broker`: No mai
- `no_budget_mentale`: Solo se gratis

## Comandi Admin

**Nel Telegram privato** (solo ADMIN_TELEGRAM_ID=334179105):

```
/menu              → Pannello con bottoni
/kpi               → Statistiche
/send_q [testo]    → Broadcast qualificati
/send_s [testo]    → Broadcast squalificati
/send_all [testo]  → Broadcast tutti
/dm @user [testo]  → DM singolo
/set_stage @user [stage]  → Cambia pipeline stage
```

## Environment Variables (Railway)

```
BOT_TOKEN=xxx                          # BotFather
ADMIN_TELEGRAM_ID=334179105            # Your ID
SUPABASE_URL=https://...supabase.co    # Fixed
SUPABASE_SERVICE_KEY=xxx               # Service role (not anon!)
SONDAGGIO_URL=https://businessup-sondaggio.netlify.app
TUTORIAL_URL=https://businessup-tutorial.netlify.app
NODE_ENV=production
PORT=3000
```

## Messaggi (Tono Brand)

### Benvenuto
```
Ciao [nome]. Sono il bot di Business UP.
Ti ho visto nel gruppo — prima di mandarti roba a caso, voglio capire dove sei.

Compila il sondaggio: [LINK]

Ci vogliono 2 minuti. Dopo ti dico cosa fa al caso tuo.
```

### Qualificato
```
Profilo confermato.
Hai il capitale, l'esperienza e la testa giusta.

Ecco cosa puoi accedere ora:
[Tutorial links]
```

### Squalificato (esempio capitale)
```
Grazie per aver risposto.
Con meno di €2.000 questi metodi non girano in positivo — te lo dico prima, non dopo.
Quando sei pronto, sono qui.
```

**Principi**: No emoji hype, no promesse, schietto, data-driven

## Deploy Checklist

- [ ] Supabase schema: up
- [ ] Railway bot: env vars set, deployed
- [ ] Netlify sondaggio: deployed, webhook URL aggiornato
- [ ] Netlify tutorial: deployed
- [ ] Netlify admin: deployed, password cambiata
- [ ] Test /start flow
- [ ] Test sondaggio submission
- [ ] Test admin dashboard /api/stats
- [ ] Test broadcast command

## File di Configurazione

- `bot/package.json`: dipendenze Node.js
- `bot/.env.example`: template variabili
- `README.md`: guida deployment per utente

## Note Importanti

1. **Supabase service key**: Usa `service_role` key, NON `anon`. Altrimenti le query fail.
2. **Sondaggio webhook**: POST a Railway, non localhost (si deve aggiornare in sondaggio/index.html)
3. **Password admin**: Cambia `CORRECT_PASSWORD` in admin/index.html prima di far vedere a chiunque
4. **CORS**: Railway Express server non ha restrizioni CORS (aperto per Netlify)
5. **Telegram API rate limit**: ~30 msg/sec per chat, stai attento con broadcast
6. **Deploy flow**: Bot su Railway (auto-restart con git), siti statici drag-drop su Netlify

## Possibili Evoluzioni

- Database CMS per contenuti tutorial (invece di HTML hardcoded)
- Analytics tracking (su quale stage bloccano i drop)
- A/B testing sondaggio (diverse domande per cohort diversi)
- Integrazione email (nurturing automatico post-qualificazione)
- Booking call diretto nel bot
- Telegram Mini App per sondaggio (invece di link web)
