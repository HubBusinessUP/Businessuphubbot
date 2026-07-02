-- Business UP Schema
-- Multi-category affiliate hub with RLS

CREATE SCHEMA IF NOT EXISTS businessup;

-- Categorie
CREATE TABLE businessup.categorie (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  descrizione TEXT,
  ordine INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Servizi
CREATE TABLE businessup.servizi (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  categoria_id BIGINT REFERENCES businessup.categorie(id),
  tipo TEXT,
  descrizione TEXT,
  requisiti TEXT,
  costi TEXT,
  split_percent INT,
  prezzo TEXT,
  stato TEXT DEFAULT 'pausa' CHECK(stato IN ('attivo', 'pausa', 'fermo')),
  link_principale TEXT,
  ordine INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leads
CREATE TABLE businessup.leads (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE,
  username TEXT,
  nome TEXT,
  cognome TEXT,
  foto_url TEXT,
  bot_started BOOLEAN DEFAULT FALSE,
  start_count INT DEFAULT 0,
  primo_start_at TIMESTAMPTZ,
  sondaggio_completato BOOLEAN DEFAULT FALSE,
  sondaggio_completato_at TIMESTAMPTZ,
  sondaggio_aperto_at TIMESTAMPTZ,
  pipeline_stage TEXT DEFAULT 'nuovo',
  motivo_squalifica TEXT,
  profilo_tipo TEXT,
  referred_by BIGINT,
  consenso_privacy BOOLEAN DEFAULT FALSE,
  consenso_at TIMESTAMPTZ,
  is_cliente BOOLEAN DEFAULT FALSE,
  can_insert_reflinks BOOLEAN DEFAULT FALSE,
  interesse_at TIMESTAMPTZ,
  convertito_at TIMESTAMPTZ,
  followup_livello INT DEFAULT 0,
  ultimo_followup_at TIMESTAMPTZ,
  ultimo_messaggio TIMESTAMPTZ,
  ultimo_tutorial_at TIMESTAMPTZ,
  digest_optin BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sondaggio Risposte
CREATE TABLE businessup.sondaggio_risposte (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT,
  nome TEXT,
  cognome TEXT,
  email TEXT,
  telefono TEXT,
  paese TEXT,
  citta TEXT,
  eta TEXT,
  situazione TEXT,
  cerca TEXT,
  budget TEXT,
  tempo TEXT,
  prontezza TEXT,
  note_libere TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lead Servizi
CREATE TABLE businessup.lead_servizi (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT,
  servizio_id BIGINT REFERENCES businessup.servizi(id),
  stato TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Affiliate Links
CREATE TABLE businessup.affiliate_link (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT,
  servizio_id BIGINT REFERENCES businessup.servizi(id),
  ref_link TEXT,
  approvato BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pagamenti
CREATE TABLE businessup.pagamenti (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT,
  servizio_id BIGINT REFERENCES businessup.servizi(id),
  importo NUMERIC,
  nota TEXT,
  data TIMESTAMPTZ DEFAULT NOW()
);

-- Note
CREATE TABLE businessup.note (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT,
  testo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tutorial Progress
CREATE TABLE businessup.tutorial_progress (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT,
  servizio_id BIGINT REFERENCES businessup.servizi(id),
  ultimo_step INT DEFAULT 0,
  completato BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Eventi
CREATE TABLE businessup.eventi (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT,
  tipo TEXT,
  dettaglio TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bot State
CREATE TABLE businessup.bot_state (
  telegram_id BIGINT PRIMARY KEY,
  flow TEXT DEFAULT 'none',
  step INT DEFAULT 0,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- News
CREATE TABLE businessup.news (
  id BIGSERIAL PRIMARY KEY,
  servizio_id BIGINT REFERENCES businessup.servizi(id),
  categoria_id BIGINT REFERENCES businessup.categorie(id),
  titolo TEXT,
  testo TEXT,
  immagine TEXT,
  tipo_media TEXT,
  data TIMESTAMPTZ DEFAULT NOW()
);

-- Gare (Leaderboard)
CREATE TABLE businessup.gare (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT,
  inizio TIMESTAMPTZ,
  fine TIMESTAMPTZ,
  premi TEXT,
  attiva BOOLEAN DEFAULT FALSE
);

-- Tenants
CREATE TABLE businessup.tenants (
  id INT PRIMARY KEY,
  gruppo_chat_id BIGINT,
  topic_id INT,
  gruppo_link TEXT
);

-- Broadcast Log
CREATE TABLE businessup.broadcast_log (
  id BIGSERIAL PRIMARY KEY,
  tipo TEXT,
  testo TEXT,
  destinatari_count INT,
  inviati INT,
  falliti INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SEED DATA
INSERT INTO businessup.tenants (id) VALUES (1) ON CONFLICT DO NOTHING;

INSERT INTO businessup.categorie (nome, descrizione, ordine) VALUES
  ('Trading', 'Metodi di trading e affiliate broker', 0)
ON CONFLICT DO NOTHING;

INSERT INTO businessup.servizi (nome, categoria_id, tipo, descrizione, split_percent, stato, ordine) VALUES
  ('Broker VS Broker Swap', 1, 'swap', 'Strategie di swap tra broker', 30, 'pausa', 1),
  ('Broker VS Broker Bonus', 1, 'bonus', 'Bonus tra broker', 50, 'fermo', 2),
  ('Prop VS Broker', 1, 'prop', 'Prop trading', 40, 'pausa', 3)
ON CONFLICT DO NOTHING;

-- RLS (Row Level Security) - disabled for now, Edge Function uses service_role
ALTER TABLE businessup.categorie ENABLE ROW LEVEL SECURITY;
ALTER TABLE businessup.servizi ENABLE ROW LEVEL SECURITY;
ALTER TABLE businessup.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE businessup.sondaggio_risposte ENABLE ROW LEVEL SECURITY;
ALTER TABLE businessup.lead_servizi ENABLE ROW LEVEL SECURITY;
ALTER TABLE businessup.affiliate_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE businessup.pagamenti ENABLE ROW LEVEL SECURITY;
ALTER TABLE businessup.note ENABLE ROW LEVEL SECURITY;
ALTER TABLE businessup.tutorial_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE businessup.eventi ENABLE ROW LEVEL SECURITY;
ALTER TABLE businessup.bot_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE businessup.news ENABLE ROW LEVEL SECURITY;
ALTER TABLE businessup.gare ENABLE ROW LEVEL SECURITY;
ALTER TABLE businessup.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE businessup.broadcast_log ENABLE ROW LEVEL SECURITY;
