-- Applicata in produzione il 2026-07-20 via MCP apply_migration.
--
-- Un utente attiva un servizio una volta sola. Senza questo vincolo il doppio tap da
-- due webview (desktop + telefono) creava due righe: conteggi gonfiati e maybeSingle()
-- in errore, con la scheda che riproponeva "Attiva servizio" a chi aveva gia' attivato.
-- Serve anche all'upsert onConflict di apiAttiva, che senza indice fallirebbe.
create unique index if not exists lead_servizi_tid_svc_uniq
  on businessup.lead_servizi (telegram_id, servizio_id);

-- RLS mancante su tabelle che contengono dati personali e il registro legale dei consensi.
-- Lo schema businessup e' esposto nella Data API, e il ruolo anon ha i grant: senza RLS
-- erano leggibili dall'esterno. L'edge function usa la service key, che ignora RLS,
-- quindi abilitarla senza policy non tocca il funzionamento dell'app.
alter table businessup.waitlist enable row level security;
alter table businessup.disclaimer_accettazioni enable row level security;
alter table businessup.tenants enable row level security;
alter table businessup.sondaggio_risposte_backup_20260718 enable row level security;
