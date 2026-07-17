-- Tracciatura legale dell'accettazione del disclaimer (attivazione + waitlist).
-- Applicata in produzione via Supabase MCP il 2026-07-18; qui per storia/riproducibilita'.

-- La lista d'attesa (prodotti "in arrivo") ora conserva l'accettazione come l'attivazione.
alter table businessup.waitlist
  add column if not exists disclaimer_accettato_at timestamptz,
  add column if not exists disclaimer_ver integer;

-- Snapshot del testo esattamente accettato: il puntatore "ver" da solo non prova COSA e' stato letto.
alter table businessup.lead_servizi
  add column if not exists disclaimer_testo text;
alter table businessup.waitlist
  add column if not exists disclaimer_testo text;

-- Registro append-only delle accettazioni: la prova. Una riga per ogni spunta, mai modificata.
create table if not exists businessup.disclaimer_accettazioni (
  id           bigint generated always as identity primary key,
  telegram_id  bigint not null,
  servizio_id  bigint,
  contesto     text   not null check (contesto in ('attivazione','waitlist')),
  versione     integer not null,
  testo        text   not null,
  accettato_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index if not exists idx_disc_acc_tid on businessup.disclaimer_accettazioni (telegram_id);
create index if not exists idx_disc_acc_svc on businessup.disclaimer_accettazioni (servizio_id);
