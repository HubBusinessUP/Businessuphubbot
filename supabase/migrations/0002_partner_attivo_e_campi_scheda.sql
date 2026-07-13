-- 0002 — Cashly: stato attivo/inattivo iscritti (Partner) + campi scheda servizio + identikit
-- Additiva e idempotente. Applicare PRIMA di deployare la nuova edge function businessup-bot.

-- === leads: attivo/inattivo (per "3 diretti ATTIVI" e retention Partner) ===
ALTER TABLE businessup.leads
  ADD COLUMN IF NOT EXISTS attivo      BOOLEAN     NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS bloccato_at TIMESTAMPTZ;

-- Indici per i conteggi rete per sponsor (referred_by + bot_started + attivo)
CREATE INDEX IF NOT EXISTS idx_leads_referred_by_attivo
  ON businessup.leads (referred_by, bot_started, attivo);

-- === servizi: campi scheda usati da scheda + matching identikit ===
ALTER TABLE businessup.servizi
  ADD COLUMN IF NOT EXISTS panoramica          TEXT,
  ADD COLUMN IF NOT EXISTS costo_attivazione   NUMERIC,   -- una tantum, per hard-filter "spesa avvio"
  ADD COLUMN IF NOT EXISTS costi_fissi_mensili NUMERIC,   -- ricorrente, concorre alla "spesa avvio"
  ADD COLUMN IF NOT EXISTS ha_affiliazione     BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tipo_rischio        TEXT,       -- es. protetto / esecuzione / mercato
  ADD COLUMN IF NOT EXISTS media_url           TEXT;

-- === sondaggio_risposte: formalizza il salvataggio delle risposte identikit (wizard 5 domande) ===
ALTER TABLE businessup.sondaggio_risposte
  ADD COLUMN IF NOT EXISTS identikit JSONB;

-- NOTA: il seed delle macro_categorie (Trading, Banca e conti, Crypto, E-commerce,
-- Business online/digitale, Rendite automatiche) NON è incluso qui perché lo schema
-- esatto di macro_categorie va confermato: inserirle dall'admin o in una migration dedicata.
