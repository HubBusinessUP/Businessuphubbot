-- Rimozione del questionario (sondaggio/identikit). Applicata in produzione via MCP il 2026-07-18.
-- DECISIONE: si butta il QUESTIONARIO, si TIENE l'ANAGRAFICA.
-- Motivo: businessup.sondaggio_risposte e' l'unico posto dello schema dove esistono email,
-- citta, telefono e i nomi REALI. leads.nome/cognome contiene il display name di Telegram,
-- che diverge (es. "Legal Power" vs "Cristian Cipriano"): non e' un duplicato.
-- Backup integrale: businessup.sondaggio_risposte_backup_20260718.

alter table businessup.sondaggio_risposte
  drop column if exists consapevolezza,
  drop column if exists identikit,
  drop column if exists livello_trading,
  drop column if exists esperienza_broker,
  drop column if exists capitale,
  drop column if exists prodotto_preferito,
  drop column if exists willingness_to_pay,
  drop column if exists note_libere,
  drop column if exists eta,
  drop column if exists situazione;

comment on table businessup.sondaggio_risposte is
  'ANAGRAFICA utente (nome/cognome reali, email, telefono, citta). Nome storico: il questionario non esiste piu dal 2026-07-18. Scritta da POST /anagrafica.';

-- Colonne morte del questionario su leads: verificate 0 righe valorizzate su 4.
alter table businessup.leads
  drop column if exists profilo_tipo,
  drop column if exists sondaggio_aperto_at;

-- leads.sondaggio_completato NON si tocca: e' il gate di 7 funzioni. Da oggi lo alza
-- apiAnagrafica (salvataggio dati dal Profilo) al posto del questionario eliminato.
comment on column businessup.leads.sondaggio_completato is
  'Gate di 7 funzioni (attiva servizio, pagina pubblica, suggerimenti...). Dal 2026-07-18 lo alza il salvataggio dell anagrafica, non piu il questionario.';
