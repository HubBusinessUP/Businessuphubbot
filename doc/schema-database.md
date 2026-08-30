# Schema database Cashly BvB

## bvb_admins
  telegram_user_id           bigint ·
  nome                       text
  creato_il                  timestamp with time zone

## bvb_affiliati
  id                         uuid ·
  nome                       text ·
  comando                    text ·
  percentuale                numeric ·
  gruppo_id                  bigint
  link_gruppo                text
  attivo                     boolean
  creato_il                  timestamp with time zone
  wallet_fee                 text

## bvb_bot_state
  chat_id                    bigint ·
  step                       text
  dati                       jsonb
  aggiornato_il              timestamp with time zone

## bvb_broker
  id                         uuid ·
  nome                       text ·
  slug                       text ·
  ruolo                      text ·
  link_iscrizione            text
  istruzioni                 text
  attivo                     boolean
  ordine                     integer
  creato_il                  timestamp with time zone

## bvb_canale_posts
  id                         bigint ·
  chat_id                    bigint ·
  message_id                 bigint ·
  testo                      text
  data                       timestamp with time zone ·

## bvb_cicli
  id                         uuid ·
  utente_id                  uuid
  numero                     integer ·
  saldo_ini_a                numeric
  saldo_ini_b                numeric
  saldo_fin_a                numeric
  saldo_fin_b                numeric
  profitto_eur               numeric
  fee_eur                    numeric
  cambio_usdt                numeric
  fee_usdt                   numeric
  screenshot_file_id         text
  stato                      text
  aperto_il                  timestamp with time zone
  chiuso_il                  timestamp with time zone
  avviato_il                 timestamp with time zone
  affiliato_id               uuid
  affiliato_pct              numeric
  storico                    boolean
  broker_b                   text

## bvb_cicli_chiusi
  id                         uuid
  utente_id                  uuid
  codice                     text
  nome                       text
  numero                     integer
  profitto_eur               numeric
  fee_eur                    numeric
  netto_cliente              numeric
  fee_usdt                   numeric
  stato                      text
  chiuso_il                  timestamp with time zone
  giorno                     date
  settimana                  date
  mese                       text
  anno                       integer

## bvb_comunicazioni
  id                         uuid ·
  testo                      text ·
  inviata_il                 timestamp with time zone ·
  destinatari                integer ·
  autore                     bigint

## bvb_comunicazioni2
  id                         uuid ·
  testo                      text ·
  scope                      text
  creata_il                  timestamp with time zone ·
  inviata_a                  integer

## bvb_contabilita
  id                         uuid
  utente_id                  uuid
  codice                     text
  nome                       text
  numero                     integer
  profitto_eur               numeric
  fee_eur                    numeric
  fee_usdt                   numeric
  stato                      text
  data_incasso               timestamp with time zone
  giorno                     date
  mese                       text
  anno                       numeric

## bvb_conti
  id                         uuid ·
  utente_id                  uuid ·
  broker_id                  uuid ·
  login                      text
  pass                       text
  server                     text
  email                      text
  aggiornato_il              timestamp with time zone

## bvb_disclaimer
  id                         uuid ·
  utente_id                  uuid
  codice                     text
  nome                       text
  telegram_id                bigint
  telegram_username          text
  esito                      text ·
  testo                      text
  testo_hash                 text
  gruppo_id                  bigint
  message_id                 bigint
  creato_il                  timestamp with time zone ·

## bvb_eventi
  id                         uuid ·
  utente_id                  uuid
  ciclo_id                   uuid
  tipo                       text
  attore                     text
  meta                       jsonb
  creato_il                  timestamp with time zone

## bvb_impostazioni
  chiave                     text ·
  valore                     text ·
  aggiornato_il              timestamp with time zone

## bvb_incassi
  id                         uuid
  tipo                       text
  utente_id                  uuid
  codice                     text
  nome                       text
  gruppo_fornitori_id        bigint
  ciclo_id                   uuid
  ciclo_numero               integer
  importo_usdt               numeric
  importo_eur                numeric
  cambio_eur                 numeric
  profitto_eur               numeric
  fee_pct                    numeric
  tx_hash                    text
  stato                      text
  copre_dal                  date
  copre_fino                 date
  data_incasso               timestamp with time zone
  giorno                     date
  settimana                  date
  mese                       date
  anno                       date

## bvb_lead
  id                         uuid ·
  telegram_id                bigint
  username                   text
  nome                       text
  capitale                   text
  esperienza                 text
  stato                      text
  partner_id                 uuid
  utente_id                  uuid
  note                       text
  creato_il                  timestamp with time zone
  aggiornato_il              timestamp with time zone

## bvb_letture
  id                         uuid ·
  com_id                     uuid
  utente_id                  uuid
  telegram_id                bigint
  nome                       text
  letta_il                   timestamp with time zone ·

## bvb_pagamenti
  id                         uuid ·
  ciclo_id                   uuid
  tx_hash                    text
  importo_usdt               numeric
  wallet_destinatario        text
  stato                      text
  verificato_at              timestamp with time zone
  creato_il                  timestamp with time zone
  utente_id                  uuid
  tipo                       text ·
  cambio_eur                 numeric
  copre_dal                  date
  copre_fino                 date
  nota                       text
  storico                    boolean

## bvb_partner
  id                         uuid ·
  tipo                       text ·
  nome                       text ·
  telegram_id                bigint
  percentuale                numeric
  wallet_fee                 text
  attivo                     boolean
  creato_il                  timestamp with time zone
  app_token                  uuid
  prefisso                   text
  invito                     text

## bvb_partner_admins
  id                         uuid ·
  partner_id                 uuid ·
  telegram_id                bigint
  nome                       text
  ruolo                      text ·
  invito                     text
  attivo                     boolean
  collegato_il               timestamp with time zone
  creato_il                  timestamp with time zone
  primo_accesso              timestamp with time zone

## bvb_prove
  id                         uuid ·
  file_id                    text ·
  didascalia                 text
  ordine                     integer
  attivo                     boolean
  creato_il                  timestamp with time zone

## bvb_totali_giorno
  giorno                     date
  cicli                      bigint
  profitto                   numeric
  fee_eur                    numeric
  fee_usdt                   numeric

## bvb_utenti
  id                         uuid ·
  codice                     text
  nome                       text ·
  telegram_chat_id           bigint
  gruppo_utente_id           bigint
  gruppo_fornitori_id        bigint
  login_a                    text
  login_b                    text
  attivo                     boolean
  creato_il                  timestamp with time zone
  tag_fornitori              text
  vps_stato                  text
  vps_pagato_il              timestamp with time zone
  vps_copre_fino             date
  vps_prossimo_pagamento     date
  vps_alert_inviato          date
  budget_ciclo               numeric
  disclaimer_ok              boolean
  supporto_fino              timestamp with time zone
  ciclo_attivo               boolean
  onboarding_step            text
  tfx_email                  text
  tfx_server                 text
  tfx_setup_ok               boolean
  rbx_email                  text
  rbx_server                 text
  rbx_verificato             boolean
  depositi_ok                boolean
  onboarding_ok              boolean
  onboarding_fine            timestamp with time zone
  attesa_tipo                text
  attesa_dal                 timestamp with time zone
  sollecito_ultimo           timestamp with time zone
  sollecito_n                integer
  tag_utente                 text
  deposito_rbx               numeric
  ticket_aperto              boolean
  ticket_dal                 timestamp with time zone
  reset_richiesto_il         timestamp with time zone
  bonus_richiesto_il         timestamp with time zone
  link_gruppo_utente         text
  link_gruppo_fornitori      text
  sospeso                    boolean
  bannato                    boolean
  sospeso_dal                timestamp with time zone
  nota_admin                 text
  affiliato_id               uuid
  topic_cicli                integer
  topic_supporto             integer
  topic_pagamenti            integer
  topic_guadagni             integer
  topic_comunicazioni        integer
  topic_fornitori            integer
  msg_fissato                bigint
  fee_percent                numeric
  tfx_pass                   text
  rbx_pass                   text
  wallet_fee                 text
  app_token                  uuid
  telegram_id                bigint
  disclaimer_il              timestamp with time zone
  fornitore_id               uuid
  proprio                    boolean
  creato_da                  uuid
  login_c                    text
  mnx_pass                   text
  mnx_server                 text
  mnx_verificato             boolean
  mnx_email                  text
