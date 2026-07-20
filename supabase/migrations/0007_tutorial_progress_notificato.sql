-- Applicata in produzione il 2026-07-20 via MCP apply_migration.
--
-- Il toggle "fatto" diventa reversibile: si puo' tornare indietro di uno step.
-- Ma "hai completato l'attivazione" e' un messaggio che parte allo sponsor e
-- all'admin, e con completato che va e viene ripartirebbe ad ogni riaccensione.
-- Questa colonna si scrive UNA volta e non si azzera mai: e' la memoria del fatto
-- che quell'avviso e' gia' stato mandato.
alter table businessup.tutorial_progress
  add column if not exists notificato_at timestamptz;

-- Chi risulta gia' completato adesso e' gia' stato annunciato (o non lo sara' mai
-- retroattivamente): marcarlo evita che la prima riaccensione faccia partire un
-- avviso per qualcosa di vecchio.
update businessup.tutorial_progress
set notificato_at = coalesce(updated_at, now())
where completato is true and notificato_at is null;
