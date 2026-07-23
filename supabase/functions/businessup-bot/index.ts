import { serve } from "https://deno.land/std@0.208.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"
// Redeploy: allinea la function online al codice (fix conteggio iscritti / ref_code).
// Redeploy per rileggere il secret SB_SECRET_KEY.

const BOT_TOKEN = Deno.env.get("BOT_TOKEN") || ""
const ADMIN_ID = parseInt(Deno.env.get("ADMIN_ID") || "334179105")
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") || ""
const ADMIN_API_KEY = Deno.env.get("ADMIN_API_KEY") || ""
const WEBAPP_URL = "https://hub.cashlypro.com"
const BOT_USERNAME = "cashlyhub_bot"

// Disclaimer legale: testo UNICO gestito dal server, cosi' cio' che l'utente vede e'
// esattamente cio' che registriamo come prova. Alza DISCLAIMER_VER a ogni modifica del testo:
// ogni accettazione conserva versione + testo esatto in businessup.disclaimer_accettazioni
// (registro append-only) e nella riga del servizio/waitlist dell'utente.
const DISCLAIMER_VER = 3
const DISCLAIMER_ATTIVAZIONE =
  "<b>Servizio erogato da terzi</b><br>Il servizio che stai per attivare è offerto e gestito da un fornitore esterno, autonomo e indipendente da Cashly. Cashly si limita a segnalarlo: non è parte del contratto, che si perfeziona unicamente tra te e il fornitore, e non interviene nella sua esecuzione.<br><br><b>Assenza di garanzie</b><br>Cashly non verifica né certifica il fornitore, le sue autorizzazioni o la sua solidità patrimoniale. Non garantisce qualità, continuità o disponibilità del servizio, né l'adempimento degli obblighi del fornitore, compresi accrediti, prelievi e rimborsi.<br><br><b>Responsabilità</b><br>Di ogni evento, conseguenza, disservizio o danno connesso al servizio risponde esclusivamente il fornitore. Attivi il servizio di tua iniziativa e sotto la tua esclusiva responsabilità. Nei limiti consentiti dalla legge, Cashly non risponde di ritardi, blocchi, mancati pagamenti, chiusure improvvise o perdite.<br><br><b>Rischio finanziario</b><br>L'operatività su servizi e strumenti finanziari comporta un rischio elevato, fino alla perdita totale del capitale impiegato. Nessun rendimento è garantito e i risultati passati non sono indicativi di quelli futuri.<br><br><b>Nessuna consulenza</b><br>I contenuti pubblicati hanno finalità meramente informativa e non costituiscono consulenza finanziaria, legale o fiscale, né sollecitazione all'investimento. Per valutazioni personali rivolgiti a un professionista abilitato.<br><br><b>Link di affiliazione</b><br>L'attivazione può avvenire tramite link di affiliazione e Cashly può percepire una commissione dal fornitore. Per te non cambia nulla: non paghi di più.<br><br><b>Termini del fornitore</b><br>Sei tenuto a leggere e accettare termini, condizioni e informative del fornitore, comprese eventuali restrizioni geografiche o di età, che regolano integralmente il rapporto.<br><br><b>Accettazione</b><br>Spuntando la casella dichiari di aver letto e compreso quanto sopra. L'accettazione viene registrata con identificativo utente, data, ora e versione del testo."
const DISCLAIMER_WAITLIST =
  "<b>Prodotto non ancora attivo</b><br>Ti stai prenotando per un prodotto non ancora disponibile, offerto da un fornitore esterno indipendente da Cashly. La prenotazione non è un acquisto: nessun pagamento e nessun impegno.<br><br><b>Assenza di garanzie</b><br>Cashly non garantisce che il prodotto venga reso disponibile, né tempi, condizioni o caratteristiche definitive, che restano di competenza del fornitore.<br><br><b>Responsabilità</b><br>Al momento dell'eventuale attivazione, di ogni evento o conseguenza risponde esclusivamente il fornitore. Cashly si limita a segnalarlo e a raccogliere la prenotazione.<br><br><b>Informazioni e accettazione</b><br>I contenuti pubblicati hanno finalità informativa e non costituiscono consulenza finanziaria, legale o fiscale. Cashly può percepire una commissione dal fornitore, senza costi aggiuntivi per te. Prima dell'attivazione dovrai accettare i termini del fornitore. Spuntando la casella dichiari di aver letto e compreso quanto sopra; l'accettazione viene registrata."
const DISCLAIMER_CHECKBOX =
  "Ho letto e compreso: il servizio è di un fornitore terzo, che risponde di ogni conseguenza. Cashly si limita a segnalarlo e non garantisce nulla."

// Confronto a TEMPO COSTANTE. Con === la funzione esce al primo carattere diverso:
// misurando quanto ci mette a rispondere si puo' ricostruire la chiave un carattere
// alla volta. Qui si scorrono sempre tutti i caratteri, quindi il tempo non dice nulla.
function confrontoCostante(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Registra l'accettazione nel registro immodificabile: la prova legale (chi/quando/versione/testo).
async function registraAccettazioneDisclaimer(telegramId: number, servizioId: number, contesto: "attivazione" | "waitlist", testo: string) {
  const { error } = await supabase.from("disclaimer_accettazioni").insert({
    telegram_id: telegramId, servizio_id: servizioId, contesto, versione: DISCLAIMER_VER, testo,
  })
  if (error) console.error("disclaimer log failed:", error)
}

const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`

// Chiave con privilegi elevati (bypassa RLS): usa la nuova secret key sb_secret_... se
// impostata (SB_SECRET_KEY), altrimenti ripiega sulla vecchia service_role legacy.
const SERVICE_KEY = Deno.env.get("SB_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  SERVICE_KEY,
  { db: { schema: "businessup" }, auth: { persistSession: false } },
)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key, x-telegram-init-data",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } })
}

async function sendMessage(chatId: number, text: string, markup?: any, parseMode?: string) {
  const body: any = { chat_id: chatId, text }
  if (markup) body.reply_markup = markup
  if (parseMode) body.parse_mode = parseMode
  return fetch(`${TG_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

// La foto va rinfrescata se non l'abbiamo mai presa o se e' piu' vecchia di 12h.
function fotoStale(fotoUpdatedAt: string | null | undefined): boolean {
  if (!fotoUpdatedAt) return true
  return Date.now() - new Date(fotoUpdatedAt).getTime() > 12 * 3600 * 1000
}

// Carica i byte di un avatar sul nostro storage pubblico e salva l'URL (stabile, non scade).
async function uploadAvatar(telegramId: number, bytes: Uint8Array, contentType: string): Promise<string | null> {
  const path = `${telegramId}.jpg`
  const up = await supabase.storage.from("avatars").upload(path, bytes, { contentType, upsert: true })
  if (up.error) { console.error("avatar upload failed:", telegramId, up.error.message); return null }
  const pub = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl
  const url = `${pub}?v=${Date.now()}`               // cache-buster: cambia ad ogni refresh
  await supabase.from("leads").update({ foto_url: url, foto_updated_at: new Date().toISOString() }).eq("telegram_id", telegramId)
  return url
}

// Scarica un file Telegram (per file_id) e lo mette sul nostro storage.
async function storeTelegramFile(telegramId: number, fileId: string): Promise<string | null> {
  const rf = await fetch(`${TG_API}/getFile?file_id=${fileId}`)
  const jf = await rf.json()
  if (!jf.ok || !jf.result?.file_path) return null
  const bin = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${jf.result.file_path}`)
  if (!bin.ok) return null
  const ct = bin.headers.get("content-type") || "image/jpeg"
  return await uploadAvatar(telegramId, new Uint8Array(await bin.arrayBuffer()), ct)
}

// Scarica una foto da URL (quella dell'initData dell'utente stesso) e la mette sul nostro storage.
// Serve quando il bot NON puo' vedere la foto dell'utente (privacy) ma l'utente apre la Mini App.
// ATTENZIONE: se l'utente ha la foto non pubblica, Telegram serve un SEGNAPOSTO (SVG ~600 byte con
// le iniziali su gradiente): non e' una foto, quindi lo scartiamo e lasciamo la nostra iniziale.
async function storePhotoFromUrl(telegramId: number, photoUrl: string): Promise<string | null> {
  try {
    const bin = await fetch(photoUrl, { redirect: "follow" })
    if (!bin.ok) return null
    const ct = bin.headers.get("content-type") || "image/jpeg"
    const bytes = new Uint8Array(await bin.arrayBuffer())
    if (ct.includes("svg") || bytes.length < 2000) {
      console.log("foto: segnaposto Telegram, scartato", telegramId, ct, bytes.length)
      return null
    }
    return await uploadAvatar(telegramId, bytes, ct)
  } catch (e) {
    console.error("storePhotoFromUrl failed", telegramId, e)
    return null
  }
}

// Prende la foto profilo Telegram dell'utente via Bot API e la salva sul nostro storage.
// 1) getUserProfilePhotos  2) fallback getChat (a volte disponibile quando la 1 e' bloccata dalla privacy)
// Best-effort: qualsiasi errore -> null senza bloccare.
async function refreshPhoto(telegramId: number): Promise<string | null> {
  try {
    let fileId: string | null = null

    const r1 = await fetch(`${TG_API}/getUserProfilePhotos?user_id=${telegramId}&limit=1`)
    const j1 = await r1.json()
    if (j1.ok && j1.result?.total_count > 0 && j1.result.photos?.length) {
      const sizes = j1.result.photos[0]               // varie risoluzioni della stessa foto
      fileId = sizes[sizes.length - 1]?.file_id ?? null   // la piu' grande
    } else {
      console.log("foto: getUserProfilePhotos vuoto", telegramId, JSON.stringify(j1).slice(0, 160))
    }

    // getChat serve come fallback per la foto, ma restituisce anche nome/cognome/username/bio:
    // finché non lo leggevamo, buttavamo via dati che Telegram ci dà gratis. Lo chiamiamo
    // SEMPRE (non solo quando manca la foto) così i profili della rete restano aggiornati.
    try {
      const r2 = await fetch(`${TG_API}/getChat?chat_id=${telegramId}`)
      const j2 = await r2.json()
      const c = j2?.ok ? j2.result : null
      if (c) {
        if (!fileId && c.photo) fileId = c.photo.big_file_id || c.photo.small_file_id || null
        // Se l'utente ha scritto la sua anagrafica nel Profilo, il suo nome vince su Telegram.
        const { data: cur } = await supabase.from("leads").select("anagrafica_manuale").eq("telegram_id", telegramId).maybeSingle()
        const manuale = (cur as any)?.anagrafica_manuale === true
        const patch: Record<string, unknown> = {}
        if (!manuale && c.first_name) patch.nome = String(c.first_name).slice(0, 120)
        if (!manuale && c.last_name) patch.cognome = String(c.last_name).slice(0, 120)
        if (c.username) patch.username = String(c.username).slice(0, 60)
        // bio: c'è solo se l'utente l'ha scritta e la privacy la espone
        patch.tg_bio = c.bio ? String(c.bio).slice(0, 300) : null
        if (Object.keys(patch).length) {
          await supabase.from("leads").update(patch).eq("telegram_id", telegramId)
        }
      }
    } catch (e) {
      console.error("getChat profilo failed", telegramId, e)
    }

    if (!fileId) {
      await supabase.from("leads").update({ foto_updated_at: new Date().toISOString() }).eq("telegram_id", telegramId)
      return null
    }
    return await storeTelegramFile(telegramId, fileId)
  } catch (e) {
    console.error("refreshPhoto failed", telegramId, e)
    return null
  }
}

// Escape per testo inserito in messaggi Telegram con parse_mode HTML.
function htmlEsc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// Costruisce un URL dell'app con cache-buster inserito PRIMA dell'eventuale #ancora (così l'hash resta valido).
function appUrl(path: string): string {
  const [base, hash] = path.split("#")
  const sep = base.includes("?") ? "&" : "?"
  return WEBAPP_URL + base + sep + "_=" + Date.now() + (hash ? "#" + hash : "")
}

// Notifica l'utente via bot con un pulsante che apre la Mini App direttamente sulla sezione giusta.
async function notifyUser(chatId: number, text: string, btnText: string, path: string, parseMode = "HTML") {
  try {
    await sendMessage(
      chatId,
      text,
      { inline_keyboard: [[{ text: btnText, web_app: { url: appUrl(path) } }]] },
      parseMode,
    )
  } catch (e) {
    console.error("notifyUser failed:", e)
  }
}

async function sendPhoto(chatId: number, photoFileId: string, caption?: string, markup?: any) {
  const body: any = { chat_id: chatId, photo: photoFileId }
  if (caption) body.caption = caption
  if (markup) body.reply_markup = markup
  return fetch(`${TG_API}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function sendVideo(chatId: number, videoFileId: string, caption?: string, markup?: any, parseMode?: string) {
  const body: any = { chat_id: chatId, video: videoFileId }
  if (caption) body.caption = caption
  if (markup) body.reply_markup = markup
  if (parseMode) body.parse_mode = parseMode
  return fetch(`${TG_API}/sendVideo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function sendAnimation(chatId: number, animationFileId: string, caption?: string, markup?: any) {
  const body: any = { chat_id: chatId, animation: animationFileId }
  if (caption) body.caption = caption
  if (markup) body.reply_markup = markup
  return fetch(`${TG_API}/sendAnimation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function answerCallback(callbackId: string, text?: string) {
  return fetch(`${TG_API}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId, text: text || "" }),
  })
}

async function editMessageText(chatId: number, messageId: number, text: string) {
  return fetch(`${TG_API}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text }),
  })
}

// Verifica la firma initData di una Telegram Mini App; ritorna telegram_id se valida.
async function validateInitData(initData: string): Promise<number | null> {
  try {
    if (!initData) return null
    const params = new URLSearchParams(initData)
    const hash = params.get("hash")
    if (!hash) return null
    params.delete("hash")
    const dcs = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n")
    const enc = new TextEncoder()
    const kSecret = await crypto.subtle.importKey("raw", enc.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    const secret = await crypto.subtle.sign("HMAC", kSecret, enc.encode(BOT_TOKEN))
    const kFinal = await crypto.subtle.importKey("raw", new Uint8Array(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    const sig = await crypto.subtle.sign("HMAC", kFinal, enc.encode(dcs))
    const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("")
    if (hex !== hash) return null
    const user = JSON.parse(params.get("user") || "{}")
    return user.id ?? null
  } catch {
    return null
  }
}

// Estrae l'oggetto user dall'initData; da usare SOLO dopo che validateInitData è passata.
function parseInitDataUser(initData: string): any {
  try {
    return JSON.parse(new URLSearchParams(initData).get("user") || "{}")
  } catch {
    return {}
  }
}

// Quale ref link mostrare per (utente, servizio): quello dello sponsor se ha un suo link approvato per quel servizio,
// altrimenti quello ufficiale del sistema. La fonte viene sempre dichiarata all'utente (niente scavalcamenti nascosti).
async function resolveRefLinkConFonte(telegramId: number, servizioId: number): Promise<{ link: string | null; fonte: "sponsor" | "sistema"; sponsor_id: number | null }> {
  const { data: lead } = await supabase.from("leads").select("referred_by").eq("telegram_id", telegramId).maybeSingle()
  if (lead?.referred_by) {
    const { data: al } = await supabase.from("affiliate_link").select("ref_link").eq("telegram_id", lead.referred_by).eq("servizio_id", servizioId).eq("approvato", true).maybeSingle()
    if (al?.ref_link) return { link: al.ref_link, fonte: "sponsor", sponsor_id: lead.referred_by }
  }
  const { data: sv } = await supabase.from("servizi").select("link_principale").eq("id", servizioId).maybeSingle()
  return { link: sv?.link_principale || null, fonte: "sistema", sponsor_id: lead?.referred_by ?? null }
}

async function resolveRefLink(telegramId: number, servizioId: number): Promise<string | null> {
  return (await resolveRefLinkConFonte(telegramId, servizioId)).link
}

// Genera un codice referral opaco (non rivela il telegram_id) e lo salva sulla lead, se non presente.
function generateRefCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  let code = ""
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}
async function getOrCreateRefCode(telegramId: number): Promise<string> {
  const { data: lead } = await supabase.from("leads").select("ref_code").eq("telegram_id", telegramId).maybeSingle()
  if (lead?.ref_code) return lead.ref_code
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRefCode()
    const { error } = await supabase.from("leads").update({ ref_code: code }).eq("telegram_id", telegramId)
    if (!error) return code
  }
  return String(telegramId)
}

// ---------- BOT ----------
const PARTNER_SOGLIA = 3
// Livello piu' alto ("Partner Senior"): soglie sulla DIMENSIONE DELLA RETE, scelta di Antonio.
// Sono numeri TARATI A OCCHIO, non misurati: con la base utenti attuale non li raggiunge
// nessuno. Vanno rivisti quando ci sara' una distribuzione vera da guardare.
const SENIOR_DIRETTI = 5
const SENIOR_RETE = 25

// Al raggiungimento della soglia di invitati lo sponsor diventa Partner in automatico e viene avvisato.
async function verificaSbloccoPartner(sponsorId: number) {
  const { data: sponsor } = await supabase.from("leads").select("is_partner").eq("telegram_id", sponsorId).maybeSingle()
  if (!sponsor || sponsor.is_partner) return
  // Contano solo i diretti ATTIVI (attivo != false: true o non ancora impostato). Chi ha bloccato il bot (attivo=false) è escluso.
  const { count } = await supabase.from("leads").select("telegram_id", { count: "exact", head: true }).eq("referred_by", sponsorId).eq("bot_started", true).not("attivo", "is", false)
  if ((count ?? 0) < PARTNER_SOGLIA) return
  await supabase.from("leads").update({ is_partner: true }).eq("telegram_id", sponsorId)
  await notifyUser(
    sponsorId,
    `🚀 <b>Complimenti, ora sei Partner!</b>\n\nHai portato ${count} iscritti. Da adesso puoi inserire i tuoi link referral sui business: la tua rete vedrà i TUOI link.`,
    "🔗 Inserisci i miei link",
    "/app.html?s=wallet",
  )
}

// Un diretto ha bloccato/lasciato il bot: marcalo inattivo, avvisa il padrino (con tasto Scrivigli) e rivaluta il suo stato Partner.
async function onIscrittoUscito(uid: number) {
  const { data: lead } = await supabase.from("leads").select("referred_by, nome, username").eq("telegram_id", uid).maybeSingle()
  await supabase.from("leads").update({ attivo: false, bloccato_at: new Date().toISOString() }).eq("telegram_id", uid)
  await supabase.from("eventi").insert({ telegram_id: uid, tipo: "bot_bloccato", dettaglio: null }).catch(() => {})
  const sponsor = lead?.referred_by
  if (sponsor && sponsor !== ADMIN_ID) {
    const nome = String(lead?.nome || lead?.username || "Un iscritto").replace(/[<>&]/g, "").trim() || "Un iscritto"
    const uname = String(lead?.username || "").replace(/^@/, "")
    // Il bot NON può scrivere a chi lo ha bloccato: notifichiamo il PADRINO, che scrive dal suo account.
    const markup = uname ? { inline_keyboard: [[{ text: "✍️ Scrivigli", url: `https://t.me/${uname}` }]] } : undefined
    await sendMessage(sponsor, `👋 <b>${nome}</b> ha lasciato la tua rete (ha chiuso il bot).\n\nNon conta più per lo stato Partner. Se vuoi, scrivigli tu.`, markup, "HTML").catch((e) => console.error("notifica uscita:", e))
    await verificaRetentionPartner(sponsor).catch((e) => console.error("retention partner:", e))
  }
}

// Se i diretti attivi scendono sotto soglia, il Partner resta SOLO se ha un suggerimento approvato o un ref link attivo.
async function verificaRetentionPartner(sponsorId: number) {
  if (sponsorId === ADMIN_ID) return
  const { data: sponsor } = await supabase.from("leads").select("is_partner").eq("telegram_id", sponsorId).maybeSingle()
  if (!sponsor?.is_partner) return
  const { count: attivi } = await supabase.from("leads").select("telegram_id", { count: "exact", head: true }).eq("referred_by", sponsorId).eq("bot_started", true).not("attivo", "is", false)
  if ((attivi ?? 0) >= PARTNER_SOGLIA) return
  const { count: suggOk } = await supabase.from("suggerimenti").select("id", { count: "exact", head: true }).eq("telegram_id", sponsorId).eq("stato", "approvato")
  const { count: refOk } = await supabase.from("affiliate_link").select("id", { count: "exact", head: true }).eq("telegram_id", sponsorId).eq("approvato", true)
  if ((suggOk ?? 0) > 0 || (refOk ?? 0) > 0) return // ha contribuito o ha ref link attivi -> mantiene Partner
  await supabase.from("leads").update({ is_partner: false }).eq("telegram_id", sponsorId)
  await notifyUser(sponsorId, `⚠️ Sei sceso sotto i ${PARTNER_SOGLIA} iscritti attivi e non hai ancora un suggerimento approvato né un link referral attivo: lo stato Partner è in pausa.\n\nInvita ancora qualcuno per riattivarlo.`, "👀 La mia rete", "/app.html?s=wallet").catch(() => {})
}

// Imposta il menu button (in basso nella chat) sull'app nuova (app.html), così l'ingresso non usa il vecchio dashboard.html cachato da Telegram.
async function setMenuButton(chatId: number) {
  try {
    await fetch(`${TG_API}/setChatMenuButton`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, menu_button: { type: "web_app", text: "Cashly", web_app: { url: WEBAPP_URL + "/app.html" } } }),
    })
  } catch (e) { console.error("setMenuButton:", e) }
}

async function handleStart(chatId: number, from: any, payload?: string) {
  setMenuButton(chatId).catch(() => {})
  let refBy: number | undefined
  if (payload?.startsWith("ref_")) {
    const code = payload.slice(4)
    const { data: referrer } = await supabase.from("leads").select("telegram_id").eq("ref_code", code).maybeSingle()
    if (referrer && referrer.telegram_id !== from.id) refBy = referrer.telegram_id
  }
  // Chi entra senza link viene assegnato al Sistema (Founder): il legame sponsor è a vita e non cambia mai.
  if (!refBy && from.id !== ADMIN_ID) refBy = ADMIN_ID

  const { data: existing } = await supabase.from("leads").select("referred_by, start_count, anagrafica_manuale").eq("telegram_id", from.id).maybeSingle()
  // Chi si e' scritto nome/cognome a mano nel Profilo non se li vede sovrascrivere da /start.
  const anagraficaManuale = (existing as any)?.anagrafica_manuale === true

  await supabase.from("leads").upsert({
    telegram_id: from.id,
    username: from.username ?? null,
    nome: anagraficaManuale ? undefined : (from.first_name ?? null),
    // Dati che l'update di Telegram porta con sé: cognome, lingua e Premium NON sono
    // recuperabili in altro modo per i membri della rete (getChat non li espone).
    cognome: anagraficaManuale ? undefined : (from.last_name ?? undefined),
    lingua: from.language_code ?? undefined,
    is_premium: from.is_premium ?? undefined,
    bot_started: true,
    attivo: true,
    bloccato_at: null,
    start_count: (existing?.start_count ?? 0) + 1,
    primo_start_at: existing ? undefined : new Date().toISOString(),
    ultimo_messaggio: new Date().toISOString(),
    referred_by: existing?.referred_by ?? refBy ?? null,
  }, { onConflict: "telegram_id" })

  await supabase.from("eventi").insert({ telegram_id: from.id, tipo: "start", dettaglio: refBy ? `ref:${refBy}` : null })

  const sponsorFinale = existing?.referred_by ?? refBy
  if (!existing && sponsorFinale) {
    // Avvisa lo sponsor del nuovo iscritto nella sua rete (deep-link alla sezione Affiliazione).
    const nuovoNome = String(from.first_name || "Qualcuno").replace(/[<>&]/g, "").trim() || "Qualcuno"
    notifyUser(
      sponsorFinale,
      `🎉 <b>Nuovo iscritto nella tua rete!</b>\n\n<b>${nuovoNome}</b> è appena entrato in Cashly col tuo invito. Ora è collegato a te per sempre.`,
      "👀 Vedi la tua rete",
      "/app.html?s=wallet",
    ).catch((e) => console.error("notifica nuovo iscritto:", e))
    if (sponsorFinale !== ADMIN_ID) verificaSbloccoPartner(sponsorFinale).catch((e) => console.error("sblocco partner:", e))
  }

  const nomeBenvenuto = String(from.first_name || "").replace(/[<>&]/g, "").trim()
  const btn = { inline_keyboard: [[{ text: "🚀 Apri il tuo HUB", web_app: { url: WEBAPP_URL + "/app.html?_=" + Date.now() } }]] }

  // Video di presentazione (se impostato dall'admin con /presentazione): appare sopra al benvenuto.
  const { data: vid } = await supabase.from("config").select("valore").eq("chiave", "welcome_video").maybeSingle()
  const welcomeVideo = vid?.valore

  if (welcomeVideo) {
    // Con video: didascalia breve (limite Telegram 1024 caratteri).
    await sendVideo(
      chatId,
      welcomeVideo,
      `Ciao ${nomeBenvenuto || ""} 👋\n\n` +
      `Benvenuto in <b>Cashly</b>. Guarda la presentazione qui sopra 👆, poi apri l'app col pulsante. 👇`,
      btn,
      "HTML",
    )
    return
  }

  await sendMessage(
    chatId,
    `Ciao ${nomeBenvenuto || ""} 👋\n\n` +
    `Benvenuto in <b>Cashly</b> — la directory dei business online.`,
    btn,
    "HTML",
  )
}

// Invia un contenuto (testo/foto/video/gif) a una chat, riusando il file_id salvato.
async function inviaContenuto(chatId: number, tipo: string, testo: string | null, mediaFileId: string | null, markup?: any) {
  if (tipo === "photo" && mediaFileId) return sendPhoto(chatId, mediaFileId, testo || undefined, markup)
  if (tipo === "video" && mediaFileId) return sendVideo(chatId, mediaFileId, testo || undefined, markup)
  if (tipo === "animation" && mediaFileId) return sendAnimation(chatId, mediaFileId, testo || undefined, markup)
  return sendMessage(chatId, testo || "", markup)
}

// Destinatari di un annuncio dalla chat, per segmento scelto dall'admin.
const NEWS_SEGMENTI: Record<string, string> = {
  tutti: "Tutti gli iscritti",
  partner: "Solo Partner",
  lead: "Chi non ha attivato nessun business",
  top: "Top 10 sponsor",
}
async function destinatariNews(segmento: string): Promise<number[]> {
  const { data: leads } = await supabase.from("leads").select("telegram_id, is_partner, referred_by").eq("bot_started", true)
  const tutti = leads ?? []
  if (segmento === "partner") return tutti.filter((l: any) => l.is_partner).map((l: any) => l.telegram_id)
  if (segmento === "top") {
    const conteggio: Record<number, number> = {}
    for (const l of tutti) if ((l as any).referred_by) conteggio[(l as any).referred_by] = (conteggio[(l as any).referred_by] ?? 0) + 1
    return Object.entries(conteggio).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tid]) => parseInt(tid))
  }
  if (segmento === "lead") {
    const { data: att } = await supabase.from("lead_servizi").select("telegram_id")
    const haAttivato = new Set((att ?? []).map((a: any) => a.telegram_id))
    return tutti.filter((l: any) => !haAttivato.has(l.telegram_id)).map((l: any) => l.telegram_id)
  }
  return tutti.map((l: any) => l.telegram_id)
}

// Prepara un annuncio (testo o media): lo salva come "pending" e mostra l'anteprima con la scelta del destinatario.
async function preparaNews(chatId: number, tipo: string, testo: string, mediaFileId?: string) {
  await supabase.from("broadcast_pending").upsert(
    { telegram_id: ADMIN_ID, tipo, testo: testo || null, photo_file_id: mediaFileId || null },
    { onConflict: "telegram_id" },
  )
  const [nTutti, nPartner, nLead, nTop] = await Promise.all([
    destinatariNews("tutti"), destinatariNews("partner"), destinatariNews("lead"), destinatariNews("top"),
  ].map((p) => p.then((l) => l.length)))
  const markup = { inline_keyboard: [
    [{ text: `👥 Tutti (${nTutti})`, callback_data: "news_send:tutti" }],
    [{ text: `🤝 Solo Partner (${nPartner})`, callback_data: "news_send:partner" }],
    [{ text: `🌱 Chi non ha attivato nulla (${nLead})`, callback_data: "news_send:lead" }],
    [{ text: `⭐ Top 10 sponsor (${nTop})`, callback_data: "news_send:top" }],
    [{ text: "❌ Annulla", callback_data: "news_cancel" }],
  ] }
  const caption = testo
    ? `ANTEPRIMA — ecco come arriverà.\n\n${testo}\n\nA chi lo invio?`
    : "ANTEPRIMA — ecco come arriverà (solo il media).\n\nA chi lo invio?"
  await inviaContenuto(chatId, tipo, caption, mediaFileId || null, markup)
}

// Attiva la modalità "in attesa del contenuto": il prossimo messaggio dell'admin diventa l'annuncio.
async function attendiNews(chatId: number) {
  await supabase.from("broadcast_pending").upsert(
    { telegram_id: ADMIN_ID, tipo: "awaiting", testo: null, photo_file_id: null },
    { onConflict: "telegram_id" },
  )
  await sendMessage(chatId, "📣 Ok! Mandami ora l'annuncio da inviare a tutti: può essere testo, una foto o un video (con l'eventuale didascalia).\n\nScrivi /annulla per uscire.")
}

// Invia l'annuncio pending al segmento scelto.
async function inviaNews(segmento: string): Promise<{ inviati: number; falliti: number }> {
  const { data: pending } = await supabase.from("broadcast_pending").select("*").eq("telegram_id", ADMIN_ID).maybeSingle()
  if (!pending || pending.tipo === "awaiting") return { inviati: 0, falliti: 0 }
  const destinatari = await destinatariNews(segmento)

  let inviati = 0, falliti = 0
  for (const tid of destinatari) {
    const res = await inviaContenuto(tid, pending.tipo, pending.testo, pending.photo_file_id)
    const data = await res.json().catch(() => ({}))
    if (data.ok) inviati++
    else falliti++
    await new Promise((r) => setTimeout(r, 50))
  }
  await supabase.from("broadcast_pending").delete().eq("telegram_id", ADMIN_ID)
  await supabase.from("eventi").insert({ telegram_id: ADMIN_ID, tipo: "broadcast_chat", dettaglio: `${pending.tipo}/${segmento} inviati:${inviati} falliti:${falliti}` })
  return { inviati, falliti }
}

// ---------- YOUTUBE TRANSCRIPT ----------
const YT_INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"

function estraiYouTubeId(text: string): string | null {
  const m = text.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}

// Recupera il transcript di un video YouTube via InnerTube (WEB + params captions) e timedtext json3.
async function fetchTranscript(videoId: string): Promise<{ text: string; lang: string; title: string } | null> {
  const playerRes = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${YT_INNERTUBE_KEY}&prettyPrint=false`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      context: { client: { clientName: "WEB", clientVersion: "2.20240726.00.00", hl: "it" } },
      videoId, params: "8AEB",
    }),
  })
  if (!playerRes.ok) return null
  const player = await playerRes.json()
  const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks
  if (!Array.isArray(tracks) || !tracks.length) return null

  // Preferenza lingua: italiano manuale > italiano auto > inglese manuale > inglese auto > prima disponibile.
  const byLang = (p: string, manual: boolean) => tracks.find((t: any) => (t.languageCode || "").startsWith(p) && (manual ? t.kind !== "asr" : true))
  const pick = byLang("it", true) || byLang("it", false) || byLang("en", true) || byLang("en", false) || tracks[0]
  if (!pick?.baseUrl) return null

  const ttRes = await fetch(`${pick.baseUrl}&fmt=json3`, { headers: { "User-Agent": "Mozilla/5.0" } })
  if (!ttRes.ok) return null
  const tt = await ttRes.json()
  const parts: string[] = []
  for (const ev of tt.events ?? []) {
    for (const s of ev.segs ?? []) if (s.utf8) parts.push(s.utf8)
  }
  const text = parts.join("").replace(/\s+/g, " ").trim()
  if (!text) return null
  return { text, lang: pick.languageCode || "?", title: player?.videoDetails?.title || "" }
}

async function sendDocument(chatId: number, filename: string, content: string, caption?: string) {
  const form = new FormData()
  form.append("chat_id", String(chatId))
  if (caption) form.append("caption", caption.slice(0, 1000))
  form.append("document", new Blob([content], { type: "text/plain" }), filename)
  return fetch(`${TG_API}/sendDocument`, { method: "POST", body: form })
}

// Invia il transcript: messaggio se corto, file .txt se lungo (limite Telegram 4096).
async function inviaTranscript(chatId: number, videoId: string) {
  await sendMessage(chatId, "🎬 Recupero il transcript, un attimo...")
  let tr: Awaited<ReturnType<typeof fetchTranscript>> = null
  try {
    tr = await fetchTranscript(videoId)
  } catch (e) {
    console.error("transcript:", e)
  }
  if (!tr) {
    await sendMessage(chatId, "Non sono riuscito a recuperare il transcript. Il video potrebbe non avere sottotitoli, oppure YouTube ha bloccato la richiesta. Riprova con un altro video.")
    return
  }
  const header = `📝 Transcript${tr.title ? " — " + tr.title : ""} (${tr.lang})`
  if (tr.text.length <= 3800) {
    await sendMessage(chatId, `${header}\n\n${tr.text}`)
  } else {
    const nomeFile = (tr.title || "transcript").replace(/[^\w\-]+/g, "_").slice(0, 40) + ".txt"
    await sendDocument(chatId, nomeFile, `${header}\n\n${tr.text}`, header)
  }
}

// Estrae tipo e file_id del media da un messaggio Telegram (foto, video, gif); null se non è un media supportato.
function estraiMedia(msg: any): { tipo: string; fileId: string } | null {
  if (msg.photo?.length) return { tipo: "photo", fileId: msg.photo[msg.photo.length - 1].file_id }
  if (msg.video?.file_id) return { tipo: "video", fileId: msg.video.file_id }
  if (msg.animation?.file_id) return { tipo: "animation", fileId: msg.animation.file_id }
  if (msg.document?.mime_type?.startsWith("video/") && msg.document.file_id) return { tipo: "video", fileId: msg.document.file_id }
  return null
}

async function handleUpdate(u: any) {
  // Conferma o annullo dell'invio annuncio (bottoni sotto l'anteprima), solo per l'admin.
  if (u.callback_query) {
    const cb = u.callback_query
    const fromId = cb.from?.id
    const chatId = cb.message?.chat?.id
    const messageId = cb.message?.message_id
    if (fromId !== ADMIN_ID) { await answerCallback(cb.id); return }
    if (cb.data?.startsWith("news_send:")) {
      const segmento = cb.data.slice("news_send:".length)
      await answerCallback(cb.id, "Invio in corso...")
      if (chatId) await sendMessage(chatId, `Invio in corso a: ${NEWS_SEGMENTI[segmento] || segmento}...`)
      const { inviati, falliti } = await inviaNews(segmento)
      if (chatId) await sendMessage(chatId, `✅ Annuncio inviato a "${NEWS_SEGMENTI[segmento] || segmento}".\nRecapitati: ${inviati}${falliti ? ` · Non recapitati: ${falliti}` : ""}`)
    } else if (cb.data === "news_cancel") {
      await supabase.from("broadcast_pending").delete().eq("telegram_id", ADMIN_ID)
      await answerCallback(cb.id, "Annullato")
      if (chatId && messageId) await editMessageText(chatId, messageId, "Annuncio annullato.")
    } else {
      await answerCallback(cb.id)
    }
    return
  }

  // Un iscritto blocca/sblocca il bot -> aggiorna lo stato attivo; se esce, avvisa il padrino.
  if (u.my_chat_member) {
    const st = u.my_chat_member.new_chat_member?.status
    const uid = u.my_chat_member.from?.id
    if (uid) {
      if (st === "kicked" || st === "left") await onIscrittoUscito(uid)
      else if (st === "member" || st === "administrator" || st === "creator") await supabase.from("leads").update({ attivo: true, bloccato_at: null }).eq("telegram_id", uid)
    }
    return
  }

  if (!u.message) return
  const from = u.message.from
  const chatId = u.message.chat.id
  const text = (u.message.text || "").trim()
  const caption = (u.message.caption || "").trim()
  const isAdmin = from?.id === ADMIN_ID

  // ----- Flusso annunci (solo admin) -----
  if (isAdmin) {
    // /news [testo]: senza testo apre la modalità (mandami il contenuto), con testo prepara subito.
    if (text === "/news") { await attendiNews(chatId); return }
    if (text.startsWith("/news ")) {
      const testo = text.slice(6).trim()
      if (testo) await preparaNews(chatId, "text", testo)
      else await attendiNews(chatId)
      return
    }

    // Conferma/annulla: fallback testuale ai bottoni dell'anteprima.
    if (text === "/conferma" || text === "/annulla") {
      const { data: pending } = await supabase.from("broadcast_pending").select("tipo").eq("telegram_id", ADMIN_ID).maybeSingle()
      if (!pending) { await sendMessage(chatId, "Non c'è nessun annuncio in attesa. Scrivi /news per prepararne uno."); return }
      if (text === "/annulla") {
        await supabase.from("broadcast_pending").delete().eq("telegram_id", ADMIN_ID)
        await sendMessage(chatId, "Annuncio annullato.")
      } else if (pending.tipo === "awaiting") {
        await sendMessage(chatId, "Prima mandami il contenuto dell'annuncio (testo, foto o video).")
      } else {
        // /conferma testuale invia a tutti; per un segmento specifico usa i bottoni dell'anteprima.
        await sendMessage(chatId, "Invio in corso a tutti...")
        const { inviati, falliti } = await inviaNews("tutti")
        await sendMessage(chatId, `✅ Annuncio inviato a tutti.\nRecapitati: ${inviati}${falliti ? ` · Non recapitati: ${falliti}` : ""}`)
      }
      return
    }

    const media = estraiMedia(u.message)

    // Imposta il video di presentazione mostrato ai nuovi utenti al /start.
    if (media?.tipo === "video" && (caption === "/presentazione" || caption === "/welcome")) {
      await supabase.from("config").delete().eq("chiave", "welcome_video")
      await supabase.from("config").insert({ chiave: "welcome_video", valore: media.fileId })
      await sendMessage(chatId, "✅ Video di presentazione impostato! Da ora appare a ogni nuovo utente che avvia il bot. Per cambiarlo, rimandami un altro video con /presentazione. Per rimuoverlo, scrivi /rimuovipresentazione.")
      return
    }
    if (text === "/rimuovipresentazione") {
      await supabase.from("config").delete().eq("chiave", "welcome_video")
      await sendMessage(chatId, "Video di presentazione rimosso. I nuovi utenti riceveranno il benvenuto solo testuale.")
      return
    }

    // Scorciatoia: media con didascalia che inizia per /news.
    if (media && (caption === "/news" || caption.startsWith("/news "))) {
      await preparaNews(chatId, media.tipo, caption.slice(5).trim(), media.fileId)
      return
    }

    // Modalità attesa: il messaggio successivo (media o testo non-comando) diventa l'annuncio.
    const { data: pending } = await supabase.from("broadcast_pending").select("tipo").eq("telegram_id", ADMIN_ID).maybeSingle()
    if (pending?.tipo === "awaiting") {
      if (media) { await preparaNews(chatId, media.tipo, caption, media.fileId); return }
      if (text && !text.startsWith("/")) { await preparaNews(chatId, "text", text); return }
      await sendMessage(chatId, "Contenuto non supportato. Mandami testo, una foto o un video.")
      return
    }

    // Link YouTube: rispondi con il transcript.
    const ytId = estraiYouTubeId(text)
    if (ytId) { await inviaTranscript(chatId, ytId); return }
  }

  if (text === "/start" || text.startsWith("/start ")) {
    const payload = text.startsWith("/start ") ? text.slice(7).trim() : ""
    await handleStart(chatId, from, payload)
  }
}

// ---------- API: MINI APP ----------
async function apiMe(telegramId: number, tgUser?: any) {
  // Tiene aggiornati foto/username presi dall'initData validato, così la rete dello sponsor mostra dati Telegram reali.
  if (tgUser?.id === telegramId) {
    await supabase.from("leads").update({
      username: tgUser.username ?? null,
    }).eq("telegram_id", telegramId)
  }
  const { data: lead } = await supabase.from("leads").select("*").eq("telegram_id", telegramId).maybeSingle()
  // Foto profilo: dall'API bot -> nostro storage (URL stabile), al massimo ogni 12h.
  // Se il bot NON puo' vederla (privacy del contatto), ripieghiamo sulla foto dell'initData
  // dell'utente stesso: e' sempre disponibile a lui e la salviamo in modo permanente.
  if (lead && fotoStale((lead as any).foto_updated_at)) {
    let f = await refreshPhoto(telegramId)
    if (!f && tgUser?.id === telegramId && tgUser.photo_url) {
      f = await storePhotoFromUrl(telegramId, tgUser.photo_url)
    }
    if (f) (lead as any).foto_url = f
  }
  const { data: sondaggio } = await supabase.from("sondaggio_risposte").select("*").eq("telegram_id", telegramId).maybeSingle()
  const { count: invitati } = await supabase.from("leads").select("telegram_id", { count: "exact", head: true }).eq("referred_by", telegramId)

  // Livello dell'utente: servono i DIRETTI ATTIVI (non i semplici invitati) e la rete a tutti i livelli.
  // "Attivo" = non ha bloccato il bot E ha almeno un servizio attivo: e' la stessa definizione che usa
  // gia' la soglia Partner, quindi i due conteggi non possono divergere.
  const { count: direttiAttivi } = await supabase.from("leads")
    .select("telegram_id", { count: "exact", head: true })
    .eq("referred_by", telegramId).eq("attivo", true).eq("is_cliente", true)
  const { data: reteTotale } = await supabase.rpc("rete_totale", { root_id: telegramId })

  // Tutti i tutorial iniziati ma non completati, per le notifiche "Riprendi" impilabili.
  const riprese: any[] = []
  const { data: progress } = await supabase.from("tutorial_progress")
    .select("servizio_id, ultimo_step")
    .eq("telegram_id", telegramId).eq("completato", false).gt("ultimo_step", 0)
    .order("updated_at", { ascending: false })
  const progSvcIds = [...new Set((progress ?? []).map((p: any) => p.servizio_id))]
  if (progSvcIds.length) {
    const { data: svs } = await supabase.from("servizi").select("id, nome, tutorial_steps").in("id", progSvcIds)
    const svMap: Record<number, any> = {}
    for (const s of svs ?? []) svMap[(s as any).id] = s
    for (const p of progress ?? []) {
      const sv = svMap[(p as any).servizio_id]
      if (!sv) continue
      const totale = Array.isArray(sv.tutorial_steps) && sv.tutorial_steps.length ? sv.tutorial_steps.length : 4
      // Tagliato al totale: se l'admin ha accorciato il tutorial, il progresso salvato
      // e' piu' alto e il Profilo scriveva assurdita' tipo "Step 3 di 2".
      const fatti = Math.min((p as any).ultimo_step, totale)
      riprese.push({ servizio_id: (p as any).servizio_id, servizio_nome: sv.nome, ultimo_step: fatti, totale_step: totale })
    }
  }
  const ripresa = riprese[0] ?? null

  // Performance profilo: proposte inviate e approvate.
  const { count: suggeriti } = await supabase.from("suggerimenti").select("id", { count: "exact", head: true }).eq("telegram_id", telegramId)
  const { count: approvati } = await supabase.from("suggerimenti").select("id", { count: "exact", head: true }).eq("telegram_id", telegramId).eq("stato", "approvato")

  // Sponsor a vita: visibile nel profilo con contatto diretto.
  let sponsor = null
  if (lead?.referred_by) {
    const { data: sp } = await supabase.from("leads").select("nome, username, foto_url").eq("telegram_id", lead.referred_by).maybeSingle()
    if (sp) sponsor = { nome: sp.nome || sp.username || "Sistema", username: sp.username || "", foto_url: sp.foto_url || "", is_founder: lead.referred_by === ADMIN_ID }
  }

  // Prodotti attivi dell'utente: i business che ha attivato, con il link che deve usare e lo stato del tutorial.
  const { data: attivazioni } = await supabase.from("lead_servizi").select("servizio_id, stato, created_at, disclaimer_accettato_at, disclaimer_ver").eq("telegram_id", telegramId).order("created_at", { ascending: false })
  const attSvcIds = [...new Set((attivazioni ?? []).map((a: any) => a.servizio_id))]
  const { data: attServizi } = attSvcIds.length
    ? await supabase.from("servizi").select("id, nome, categoria_id").in("id", attSvcIds)
    : { data: [] }
  const attSvcMap: Record<number, any> = {}
  for (const s of attServizi ?? []) attSvcMap[(s as any).id] = s
  const { data: attProgress } = attSvcIds.length
    ? await supabase.from("tutorial_progress").select("servizio_id, ultimo_step, completato").eq("telegram_id", telegramId).in("servizio_id", attSvcIds)
    : { data: [] }
  const attProgMap: Record<number, any> = {}
  for (const p of attProgress ?? []) attProgMap[(p as any).servizio_id] = p
  const prodottiAttivi = []
  for (const a of attivazioni ?? []) {
    const sv = attSvcMap[(a as any).servizio_id]
    if (!sv) continue
    const refInfo = await resolveRefLinkConFonte(telegramId, sv.id)
    const prog = attProgMap[sv.id]
    prodottiAttivi.push({
      servizio_id: sv.id,
      nome: sv.nome,
      ref_link: refInfo.link,
      ref_fonte: refInfo.fonte,
      tutorial_completato: !!prog?.completato,
      attivato_il: (a as any).created_at,
      disclaimer_accettato_at: (a as any).disclaimer_accettato_at,
      disclaimer_ver: (a as any).disclaimer_ver,
    })
  }

  // Prodotti "in arrivo": quelli per cui l'utente si e' prenotato (waitlist) e che non sono ancora attivi.
  // Con la data e la versione del disclaimer accettato: l'utente vede la sua traccia di consenso.
  const { data: attese } = await supabase.from("waitlist").select("servizio_id, created_at, disclaimer_accettato_at, disclaimer_ver").eq("telegram_id", telegramId).order("created_at", { ascending: false })
  const attesaIds = [...new Set((attese ?? []).map((a: any) => a.servizio_id))]
  const { data: attesaServizi } = attesaIds.length
    ? await supabase.from("servizi").select("id, nome, stato").in("id", attesaIds)
    : { data: [] }
  const attesaMap: Record<number, any> = {}
  for (const s of attesaServizi ?? []) attesaMap[(s as any).id] = s
  const prodottiInArrivo = []
  for (const a of attese ?? []) {
    const sv = attesaMap[(a as any).servizio_id]
    if (!sv || sv.stato === "attivo") continue   // se e' gia' partito non e' piu' "in arrivo"
    prodottiInArrivo.push({
      servizio_id: sv.id,
      nome: sv.nome,
      prenotato_il: (a as any).created_at,
      disclaimer_accettato_at: (a as any).disclaimer_accettato_at,
      disclaimer_ver: (a as any).disclaimer_ver,
    })
  }

  return json({ lead, sondaggio, rete_count: invitati ?? 0, ripresa, riprese, suggeriti_count: suggeriti ?? 0, approvati_count: approvati ?? 0, sponsor, prodotti_attivi: prodottiAttivi, prodotti_in_arrivo: prodottiInArrivo, is_partner: !!lead?.is_partner, partner_richiesto: !!lead?.partner_richiesto, partner_soglia: PARTNER_SOGLIA, diretti_attivi: direttiAttivi ?? 0, rete_totale: reteTotale ?? 0, senior_soglia: SENIOR_DIRETTI, senior_rete: SENIOR_RETE, is_admin: telegramId === ADMIN_ID })
}

// Anagrafica modificabile dal Profilo: unico punto in cui l'utente da' i suoi dati,
// da quando il questionario e' stato eliminato. La tabella si chiama ancora
// sondaggio_risposte per ragioni storiche, ma ormai contiene SOLO anagrafica.
async function apiAnagrafica(telegramId: number, body: any) {
  const clean = (v: unknown, max: number) => {
    const s = String(v ?? "").trim()
    return s ? s.slice(0, max) : null
  }
  const nome = clean(body?.nome, 80)
  const cognome = clean(body?.cognome, 80)
  const email = clean(body?.email, 160)
  const telefono = clean(body?.telefono, 40)
  const citta = clean(body?.citta, 80)

  if (!nome) return json({ error: "nome_richiesto" }, 400)
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return json({ error: "email_non_valida" }, 400)
  if (telefono && !/^[0-9+()\s.\-]{6,}$/.test(telefono)) return json({ error: "telefono_non_valido" }, 400)

  const row = { telegram_id: telegramId, nome, cognome, email, telefono, citta }
  const { data: ex } = await supabase.from("sondaggio_risposte").select("id").eq("telegram_id", telegramId).maybeSingle()
  const saved = ex
    ? await supabase.from("sondaggio_risposte").update(row).eq("id", ex.id)
    : await supabase.from("sondaggio_risposte").insert(row)
  if (saved.error) {
    console.error("anagrafica save failed:", saved.error)
    return json({ error: "save_failed", detail: saved.error.message }, 500)
  }

  // Il nome sul lead e' quello che vede lo sponsor nella sua rete: tienilo allineato.
  // anagrafica_manuale blinda la scelta dell'utente contro /start e il refresh getChat.
  // sondaggio_completato: il questionario non esiste piu', ma il flag resta il gate
  // di 7 funzioni (attiva servizio, pagina pubblica, suggerimenti...). Ora lo alza
  // il salvataggio dell'anagrafica: chi ha dato i dati passa, esattamente come prima.
  const lu = await supabase.from("leads").update({
    nome,
    cognome,
    anagrafica_manuale: true,
    sondaggio_completato: true,
  }).eq("telegram_id", telegramId)
  if (lu.error) {
    console.error("anagrafica leads update failed:", lu.error)
    return json({ error: "save_failed", detail: lu.error.message }, 500)
  }

  return json({ ok: true, anagrafica: row })
}

async function apiBusinessList(telegramId?: number | null) {
  const { data: macroCategorie } = await supabase.from("macro_categorie").select("*").order("ordine")
  const { data: categorie } = await supabase.from("categorie").select("*").order("ordine")
  // "fermo" = ritirato: resta in archivio con voti e storico, ma sparisce dall'app.
  // E' l'unico modo di togliere un business senza cancellarlo.
  const { data: servizi } = await supabase.from("servizi").select("id, nome, categoria_id, tipo, descrizione, requisiti, costi, split_percent, prezzo, stato, ordine, created_at, budget_minimo, rischio_livello, tempo_richiesto, esperienza_richiesta, logo_url, in_evidenza").neq("stato", "fermo").order("created_at", { ascending: false })

  // Voti per servizio: la posizione in classifica è determinata dal numero di voti.
  const { data: voti } = await supabase.from("voti").select("servizio_id, telegram_id")
  const votiCount: Record<number, number> = {}
  const mieiVoti: number[] = []
  for (const v of voti ?? []) {
    votiCount[(v as any).servizio_id] = (votiCount[(v as any).servizio_id] ?? 0) + 1
    if (telegramId && (v as any).telegram_id === telegramId) mieiVoti.push((v as any).servizio_id)
  }
  // Salvataggi TOTALI per servizio (non solo i miei). NON entrano nell'ordine della
  // directory: l'ordine lo fanno i soli VOTI, perche' il voto e' l'unico numero che
  // l'utente vede, e l'ordine deve essere spiegato da cio' che si vede. Il salvataggio
  // resta un segnale privato, utile in admin per capire cosa interessa davvero.
  const { data: prefTutti } = await supabase.from("preferiti").select("servizio_id")
  const salvatiCount: Record<number, number> = {}
  for (const p of prefTutti ?? []) {
    salvatiCount[(p as any).servizio_id] = (salvatiCount[(p as any).servizio_id] ?? 0) + 1
  }

  const serviziConVoti = (servizi ?? [])
    .map((s: any) => ({ ...s, voti: votiCount[s.id] ?? 0, salvati: salvatiCount[s.id] ?? 0 }))
    .sort((a: any, b: any) => b.voti - a.voti || (a.created_at < b.created_at ? 1 : -1))

  let mieiPreferiti: number[] = []
  if (telegramId) {
    const { data: pref } = await supabase.from("preferiti").select("servizio_id").eq("telegram_id", telegramId)
    mieiPreferiti = (pref ?? []).map((p: any) => p.servizio_id)
  }

  const list = (categorie ?? []).map((c: any) => ({ ...c, servizi: serviziConVoti.filter((s: any) => s.categoria_id === c.id) }))
  const macroList = (macroCategorie ?? []).map((m: any) => ({
    ...m,
    categorie: list.filter((c: any) => c.macro_categoria_id === m.id),
  }))

  return json({ macro_categorie: macroList, categorie: list, miei_voti: mieiVoti, miei_preferiti: mieiPreferiti })
}

// Toggle preferito: un business salvato resta in primo piano nella lista dell'utente.
async function apiPreferito(telegramId: number, body: any) {
  const servizioId = parseInt(body?.servizio_id)
  if (!servizioId) return json({ error: "servizio_richiesto" }, 400)

  const { data: existing } = await supabase.from("preferiti").select("id").eq("telegram_id", telegramId).eq("servizio_id", servizioId).maybeSingle()
  if (existing) {
    const { error } = await supabase.from("preferiti").delete().eq("id", existing.id)
    if (error) return json({ error: error.message }, 500)
  } else {
    const { error } = await supabase.from("preferiti").insert({ telegram_id: telegramId, servizio_id: servizioId })
    if (error) return json({ error: error.message }, 500)
  }
  return json({ ok: true, preferito: !existing })
}

// Un voto per utente per servizio (vincolo UNIQUE a DB); rivotare lo stesso servizio toglie il voto.
async function apiVota(telegramId: number, body: any) {
  const servizioId = parseInt(body?.servizio_id)
  if (!servizioId) return json({ error: "servizio_richiesto" }, 400)

  const { data: existing } = await supabase.from("voti").select("id").eq("telegram_id", telegramId).eq("servizio_id", servizioId).maybeSingle()
  if (existing) {
    const { error } = await supabase.from("voti").delete().eq("id", existing.id)
    if (error) return json({ error: error.message }, 500)
  } else {
    const { error } = await supabase.from("voti").insert({ telegram_id: telegramId, servizio_id: servizioId })
    if (error) return json({ error: error.message }, 500)
  }

  const { count } = await supabase.from("voti").select("id", { count: "exact", head: true }).eq("servizio_id", servizioId)
  return json({ ok: true, votato: !existing, voti: count ?? 0 })
}

// Disattiva un servizio: l'utente torna a poterlo riattivare da capo.
// Non tocchiamo tutorial_progress: se lo riattiva, riprende da dove era.
async function apiDisattiva(telegramId: number, body: any) {
  const servizioId = parseInt(body?.servizio_id) || 0
  if (!servizioId) return json({ error: "servizio_id_richiesto" }, 400)

  const { error } = await supabase.from("lead_servizi")
    .delete().eq("telegram_id", telegramId).eq("servizio_id", servizioId)
  if (error) {
    console.error("disattiva failed:", error)
    return json({ error: "save_failed", detail: error.message }, 500)
  }
  await supabase.from("eventi").insert({ telegram_id: telegramId, tipo: "servizio_disattivato", dettaglio: `servizio:${servizioId}` })

  // is_cliente resta vero solo se ha ancora almeno un servizio attivo.
  const { count } = await supabase.from("lead_servizi")
    .select("id", { count: "exact", head: true }).eq("telegram_id", telegramId)
  if (!count) await supabase.from("leads").update({ is_cliente: false }).eq("telegram_id", telegramId)

  return json({ ok: true, attivi_rimasti: count ?? 0 })
}

// Lista d'attesa: per i servizi non ancora attivi, al posto di "Attiva" c'e' "Avvisami".
// Quando l'admin lo mette attivo, parte il messaggio del bot a chi si e' iscritto qui.
async function apiWaitlist(telegramId: number, body: any) {
  const servizioId = parseInt(body?.servizio_id) || 0
  if (!servizioId) return json({ error: "servizio_id_richiesto" }, 400)

  const { data: sv } = await supabase.from("servizi").select("id, nome, stato").eq("id", servizioId).maybeSingle()
  if (!sv) return json({ error: "not_found" }, 404)
  if (sv.stato === "attivo") return json({ error: "gia_attivo" }, 409)
  // Ci si prenota solo per cio' che deve ancora partire. Su un servizio ritirato la
  // prenotazione sarebbe una promessa che non manterremo mai.
  if (sv.stato !== "pausa") return json({ error: "non_prenotabile" }, 409)

  // Anche la prenotazione e' un consenso da tracciare: e' pur sempre un servizio di terzi.
  if (!body?.disclaimer_accettato) return json({ error: "disclaimer_richiesto" }, 400)

  const { error } = await supabase.from("waitlist")
    .upsert({
      telegram_id: telegramId, servizio_id: servizioId,
      disclaimer_accettato_at: new Date().toISOString(),
      disclaimer_ver: DISCLAIMER_VER,
      disclaimer_testo: DISCLAIMER_WAITLIST,
    }, { onConflict: "telegram_id,servizio_id" })
  if (error) {
    console.error("waitlist upsert failed:", error)
    return json({ error: "save_failed", detail: error.message }, 500)
  }
  await registraAccettazioneDisclaimer(telegramId, servizioId, "waitlist", DISCLAIMER_WAITLIST)
  await supabase.from("eventi").insert({ telegram_id: telegramId, tipo: "waitlist", dettaglio: sv.nome })

  const { count } = await supabase.from("waitlist").select("id", { count: "exact", head: true }).eq("servizio_id", servizioId)
  return json({ ok: true, in_lista: true, waitlist_count: count ?? 0 })
}

// Avvisa chi aspettava: chiamata quando un servizio passa ad attivo.
// avvisato_at evita il doppio invio se lo stato viene toccato piu' volte.
//
// Qui si scrive a persone vere una sola volta: avvisato_at e' l'UNICA guardia
// anti-doppione, quindi marcare per sbaglio qualcuno significa che quel messaggio
// non partira' MAI piu'. Da qui le tre regole di questa funzione:
//  1) si guarda data.ok della risposta Telegram, non il fatto che la fetch non abbia
//     lanciato: un "bot was blocked" e' un HTTP 403 che si risolve normalmente;
//  2) si marca RIGA PER RIGA subito dopo l'invio riuscito, non in blocco alla fine.
//     Cosi' se l'isolate viene ucciso a meta' coda, chi non ha ricevuto resta NULL
//     ed e' ripescabile, e chi ha ricevuto non viene riavvisato;
//  3) si marca per id della riga, non con un filtro sul servizio: chi si prenota
//     MENTRE il ciclo gira non deve risultare avvisato senza aver ricevuto niente.
async function avvisaWaitlist(servizioId: number, nomeServizio: string) {
  const { data: attesa } = await supabase.from("waitlist")
    .select("id, telegram_id").eq("servizio_id", servizioId).is("avvisato_at", null)
  if (!attesa?.length) return 0

  const btn = { inline_keyboard: [[{ text: "🚀 Aprilo su Cashly", web_app: { url: WEBAPP_URL + "/app.html?_=" + Date.now() } }]] }
  let inviati = 0
  for (const w of attesa) {
    const uid = (w as any).telegram_id
    try {
      const res = await sendMessage(uid,
        `🔔 <b>${nomeServizio}</b> è attivo.\n\nMi avevi chiesto di avvisarti: ora puoi partire.`, btn, "HTML")
      const data = await res.json()
      if (!data.ok) {
        // Non marcare: al prossimo passaggio ad attivo ci riproviamo.
        console.error("waitlist notify rifiutata", uid, data.description)
        continue
      }
      await supabase.from("waitlist")
        .update({ avvisato_at: new Date().toISOString() }).eq("id", (w as any).id)
      inviati++
    } catch (e) {
      console.error("waitlist notify failed", uid, e)
    }
  }
  return inviati
}

async function apiServizio(telegramId: number, servizioId: number) {
  const { data: servizio } = await supabase.from("servizi").select("*").eq("id", servizioId).maybeSingle()
  if (!servizio) return json({ error: "not_found" }, 404)
  const { data: lead } = await supabase.from("leads").select("sondaggio_completato, is_cliente, anagrafica_manuale").eq("telegram_id", telegramId).maybeSingle()
  const { data: interesse } = await supabase.from("lead_servizi").select("id").eq("telegram_id", telegramId).eq("servizio_id", servizioId).maybeSingle()
  const { data: mioLink } = await supabase.from("affiliate_link").select("ref_link, approvato").eq("telegram_id", telegramId).eq("servizio_id", servizioId).maybeSingle()
  const { data: progress } = await supabase.from("tutorial_progress").select("id, ultimo_step, completato, notificato_at").eq("telegram_id", telegramId).eq("servizio_id", servizioId).maybeSingle()
  const refInfo = await resolveRefLinkConFonte(telegramId, servizioId)

  // Se l'admin ACCORCIA un tutorial mentre qualcuno e' a meta', il progresso salvato
  // resta piu' alto degli step rimasti: tutti i passi risultano fatti e all'utente non
  // resta niente da premere, quindi la riconciliazione non puo' aspettare una sua azione.
  // Va fatta qui, in lettura, che e' il momento in cui quello stato torna a galla.
  const nStep = Array.isArray(servizio.tutorial_steps) ? servizio.tutorial_steps.length : 0
  let progressoOk = progress
  if (progress && !progress.completato && nStep > 0 && progress.ultimo_step >= nStep) {
    await supabase.from("tutorial_progress")
      .update({ ultimo_step: nStep, completato: true, updated_at: new Date().toISOString() })
      .eq("id", progress.id)
    await annunciaCompletamento(telegramId, servizioId, progress.id, progress.notificato_at)
    progressoOk = { ...progress, ultimo_step: nStep, completato: true }
  }

  // Servizio non ancora attivo -> lista d'attesa al posto dell'attivazione.
  const attivo = servizio.stato === "attivo"
  const { data: inAttesa } = await supabase.from("waitlist").select("id")
    .eq("telegram_id", telegramId).eq("servizio_id", servizioId).maybeSingle()
  const { count: attesaCount } = await supabase.from("waitlist")
    .select("id", { count: "exact", head: true }).eq("servizio_id", servizioId)

  // Utenti Cashly attivi su questo servizio: dato NOSTRO, non dichiarato dal fornitore.
  const { count: attiviCount } = await supabase.from("lead_servizi")
    .select("id", { count: "exact", head: true }).eq("servizio_id", servizioId)

  return json({
    servizio,
    attivo,
    gia_interessato: !!interesse,
    in_waitlist: !!inAttesa,
    waitlist_count: attesaCount ?? 0,
    utenti_attivi: attiviCount ?? 0,
    ref_link: refInfo.link,
    ref_fonte: refInfo.fonte,
    sondaggio_completato: !!lead?.sondaggio_completato,
    // Stessa condizione che apiAttiva applica come gate: cosi' la scheda puo' dirlo
    // PRIMA, invece di far premere un bottone che risponde 403.
    anagrafica_ok: !!(lead?.sondaggio_completato || lead?.anagrafica_manuale),
    is_cliente: !!lead?.is_cliente,
    mio_link: mioLink || null,
    step_progress: { ultimo_step: progressoOk?.ultimo_step ?? 0, completato: !!progressoOk?.completato },
    disclaimer: { ver: DISCLAIMER_VER, attivazione: DISCLAIMER_ATTIVAZIONE, waitlist: DISCLAIMER_WAITLIST, checkbox: DISCLAIMER_CHECKBOX },
  })
}

// Etichetta di stato di un invitato dal punto di vista dello sponsor, basata solo su segnali reali (non su qualifica capitale).
function membroStatoLabel(i: { is_cliente: boolean; sondaggio_completato: boolean }): string {
  if (i.is_cliente) return "Cliente attivo"
  if (i.sondaggio_completato) return "Anagrafica completata"
  return "Iscritto"
}

async function apiAffiliazione(telegramId: number) {
  const { data: lead } = await supabase.from("leads").select("is_cliente, is_partner, partner_richiesto, ref_clicks").eq("telegram_id", telegramId).maybeSingle()
  const { data: invitati } = await supabase.from("leads").select("telegram_id, nome, cognome, username, foto_url, foto_updated_at, sondaggio_completato, is_cliente, created_at, attivo, bloccato_at, tg_bio, lingua, is_premium").eq("referred_by", telegramId).order("created_at", { ascending: false })
  // Rete completa a ogni profondita' (non solo i diretti): funzione ricorsiva businessup.rete_totale.
  const { data: reteTot } = await supabase.rpc("rete_totale", { root_id: telegramId })
  // Rinfresca le foto profilo dei membri dall'API bot -> storage (URL stabile), max ogni 12h, con un tetto per non rallentare troppo.
  let fotoRefreshed = 0
  for (const i of (invitati ?? [])) {
    if (fotoRefreshed >= 15) break
    if (fotoStale((i as any).foto_updated_at)) {
      const u = await refreshPhoto((i as any).telegram_id)
      if (u) (i as any).foto_url = u   // se il bot non la vede, teniamo quella gia' salvata (non azzerare)
      fotoRefreshed++
    }
  }
  const { data: mieiLink } = await supabase.from("affiliate_link").select("*").eq("telegram_id", telegramId)
  const { data: pagamenti } = await supabase.from("pagamenti").select("importo").eq("telegram_id", telegramId)
  const guadagni = (pagamenti ?? []).reduce((s: number, p: any) => s + Number(p.importo || 0), 0)
  const refCode = await getOrCreateRefCode(telegramId)

  // Servizi attivati e business approvati di ciascun invitato, in due query totali.
  const invitatiIds = (invitati ?? []).map((i: any) => i.telegram_id)
  const { data: attivazioni } = invitatiIds.length
    ? await supabase.from("lead_servizi").select("telegram_id").in("telegram_id", invitatiIds)
    : { data: [] }
  const serviziCount: Record<number, number> = {}
  for (const a of attivazioni ?? []) serviziCount[(a as any).telegram_id] = (serviziCount[(a as any).telegram_id] ?? 0) + 1

  const { data: approvatiMembri } = invitatiIds.length
    ? await supabase.from("suggerimenti").select("telegram_id").eq("stato", "approvato").in("telegram_id", invitatiIds)
    : { data: [] }
  const approvatiCount: Record<number, number> = {}
  for (const a of approvatiMembri ?? []) approvatiCount[(a as any).telegram_id] = (approvatiCount[(a as any).telegram_id] ?? 0) + 1

  const membri = (invitati ?? []).map((i: any) => ({
    telegram_id: i.telegram_id,
    nome: i.nome || i.username || "Utente",
    cognome: i.cognome || "",
    username: i.username || "",
    foto_url: i.foto_url || "",
    is_cliente: !!i.is_cliente,
    sondaggio_completato: !!i.sondaggio_completato,
    stato_label: membroStatoLabel(i),
    servizi_count: serviziCount[i.telegram_id] ?? 0,
    business_approvati: approvatiCount[i.telegram_id] ?? 0,
    iscritto_il: i.created_at || null,
    uscito: i.attivo === false,
    // Dati Telegram: bio da getChat; lingua/premium solo per chi ha fatto /start dopo il 16/07/26.
    tg_bio: i.tg_bio || "",
    lingua: i.lingua || "",
    is_premium: i.is_premium === true,
  }))

  const { data: servizi } = await supabase.from("servizi").select("id, nome").order("nome")
  const attivazioniTot = Object.values(serviziCount).reduce((s: number, n: number) => s + n, 0)
  const clientiCount = membri.filter((m: any) => m.is_cliente).length

  return json({
    ref_link: `https://t.me/${BOT_USERNAME}?start=ref_${refCode}`,
    ref_code: refCode,
    track_link: `${WEBAPP_URL}/r.html?c=${refCode}`,
    is_cliente: lead?.is_cliente ?? false,
    is_partner: !!lead?.is_partner,
    partner_richiesto: !!lead?.partner_richiesto,
    soglia: PARTNER_SOGLIA,
    stats: {
      click: lead?.ref_clicks ?? 0,
      iscritti: membri.length,
      attivazioni: attivazioniTot,
      clienti: clientiCount,
    },
    rete: {
      invitati_count: membri.length,
      // Rete completa: i diretti piu' tutti quelli invitati da loro, a ogni livello.
      totale_count: typeof reteTot === "number" ? reteTot : membri.length,
      attivati_count: clientiCount,
      membri,
    },
    guadagni_totali: guadagni,
    miei_reflink: mieiLink ?? [],
    servizi: servizi ?? [],
  })
}

// Estrae il dominio (senza www) da un URL; null se non è un http/https valido.
function dominioDi(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
    return parsed.hostname.replace(/^www\./, "").toLowerCase()
  } catch {
    return null
  }
}

// Solo i Partner inseriscono link. Dominio in whitelist → approvato subito; altrimenti resta in attesa dell'admin.
async function apiAffiliateLinkSave(telegramId: number, body: any) {
  const { data: lead } = await supabase.from("leads").select("is_partner").eq("telegram_id", telegramId).maybeSingle()
  if (!lead?.is_partner) return json({ error: "non_partner" }, 403)

  const servizioId = parseInt(body?.servizio_id)
  const refLink = String(body?.ref_link || "").trim()
  const dominio = dominioDi(refLink)
  if (!servizioId || !dominio) return json({ error: "link_non_valido" }, 400)

  // Ogni link inserito resta in attesa: viene attivato solo dopo l'approvazione dell'admin.
  const autoApprovato = false

  const { error } = await supabase.from("affiliate_link").upsert(
    { telegram_id: telegramId, servizio_id: servizioId, ref_link: refLink, approvato: autoApprovato },
    { onConflict: "telegram_id,servizio_id" },
  )
  if (error) return json({ error: error.message }, 500)

  await supabase.from("eventi").insert({ telegram_id: telegramId, tipo: "affiliate_link_salvato", dettaglio: `servizio:${servizioId} ${autoApprovato ? "auto" : "pending"}` })
  if (!autoApprovato) {
    sendMessage(ADMIN_ID, `🔗 Link affiliato in attesa di approvazione\n\nDominio: ${dominio} (non in whitelist)\n${refLink}\nDa utente ID ${telegramId}. Approvalo dall'admin.`).catch(() => {})
  }
  return json({ ok: true, approvato: autoApprovato })
}

const ALLOWED_SOCIAL = ["instagram", "telegram", "whatsapp", "tiktok", "youtube", "facebook"]

// Tiene solo piattaforme note con un URL http/https valido; scarta il resto.
function sanitizeSocialLinks(input: any): { tipo: string; url: string }[] {
  if (!Array.isArray(input)) return []
  const out: { tipo: string; url: string }[] = []
  for (const item of input) {
    const tipo = String(item?.tipo || "")
    const url = String(item?.url || "").trim()
    if (!ALLOWED_SOCIAL.includes(tipo) || !url) continue
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue
      out.push({ tipo, url: parsed.href })
    } catch {
      continue
    }
  }
  return out
}

async function apiPaginaGet(telegramId: number) {
  const { data: lead } = await supabase.from("leads").select("nome, cognome, username, sondaggio_completato, is_partner, pagina_pubblicata, bio_nome, bio_titolo, bio_testo, bio_foto_url, social_links").eq("telegram_id", telegramId).maybeSingle()
  const { data: mieiLink } = await supabase.from("affiliate_link").select("*").eq("telegram_id", telegramId)
  const { data: servizi } = await supabase.from("servizi").select("id, nome, descrizione").order("nome")
  const svcMap: Record<number, any> = {}
  for (const s of servizi ?? []) svcMap[(s as any).id] = s
  const links = (mieiLink ?? []).map((l: any) => ({ ...l, servizio_nome: svcMap[l.servizio_id]?.nome || "?", descrizione: svcMap[l.servizio_id]?.descrizione || "" }))
  const refCode = await getOrCreateRefCode(telegramId)
  return json({
    sondaggio_completato: lead?.sondaggio_completato ?? false,
    is_partner: !!lead?.is_partner,
    pagina_pubblicata: !!lead?.pagina_pubblicata,
    nome: lead?.nome || "",
    bio_nome: lead?.bio_nome || "",
    username: lead?.username || "",
    bio_titolo: lead?.bio_titolo || "",
    bio_testo: lead?.bio_testo || "",
    bio_foto_url: lead?.bio_foto_url || "",
    social_links: lead?.social_links ?? [],
    link_pagina: `${WEBAPP_URL}/u.html?c=${refCode}`,
    miei_link: links,
    servizi: servizi ?? [],
  })
}

async function apiPaginaSave(telegramId: number, body: any) {
  const { data: lead } = await supabase.from("leads").select("sondaggio_completato").eq("telegram_id", telegramId).maybeSingle()
  if (!lead?.sondaggio_completato) return json({ error: "non_autorizzato" }, 403)

  const { bio_nome, bio_titolo, bio_testo, bio_foto_url, social_links, pagina_pubblicata } = body
  const upd: any = {
    bio_titolo, bio_testo, bio_foto_url,
    social_links: sanitizeSocialLinks(social_links),
  }
  if (bio_nome !== undefined) upd.bio_nome = String(bio_nome).slice(0, 60).trim() || null
  // Pubblica/bozza: aggiornato solo se il campo è presente nel salvataggio.
  if (pagina_pubblicata !== undefined) upd.pagina_pubblicata = !!pagina_pubblicata
  const { error } = await supabase.from("leads").update(upd).eq("telegram_id", telegramId)
  if (error) {
    console.error("pagina save failed:", error)
    return json({ error: "save_failed", detail: error.message }, 500)
  }
  return json({ ok: true })
}

async function apiPaginaPubblica(code: string) {
  const { data: lead } = await supabase.from("leads").select("telegram_id, nome, username, sondaggio_completato, pagina_pubblicata, bio_nome, bio_titolo, bio_testo, bio_foto_url, social_links").eq("ref_code", code).maybeSingle()
  // Pagina visibile solo se anagrafica completata e pagina pubblicata (non in bozza).
  if (!lead || !lead.sondaggio_completato || !lead.pagina_pubblicata) return json({ error: "not_found" }, 404)

  const { data: links } = await supabase.from("affiliate_link").select("servizio_id, ref_link").eq("telegram_id", lead.telegram_id).eq("approvato", true)
  const servizioIds = (links ?? []).map((l: any) => l.servizio_id)
  const { data: servizi } = servizioIds.length
    ? await supabase.from("servizi").select("id, nome, descrizione").in("id", servizioIds)
    : { data: [] }
  const svcMap: Record<number, any> = {}
  for (const s of servizi ?? []) svcMap[(s as any).id] = s

  return json({
    nome: lead.bio_nome || lead.nome || "Utente",
    username: lead.username || "",
    bio_titolo: lead.bio_titolo || "",
    bio_testo: lead.bio_testo || "",
    social_links: lead.social_links ?? [],
    bio_foto_url: lead.bio_foto_url || "",
    link: (links ?? []).map((l: any) => ({
      nome: svcMap[l.servizio_id]?.nome || "Link",
      descrizione: svcMap[l.servizio_id]?.descrizione || "",
      ref_link: l.ref_link,
    })),
  })
}

async function apiAttiva(telegramId: number, body: any) {
  // Il gate chiede i dati, non il sondaggio: da quando l'anagrafica si compila dal Profilo
  // (anagrafica_manuale), guardare solo sondaggio_completato bloccava chi li aveva gia' dati.
  const { data: lead } = await supabase.from("leads").select("sondaggio_completato, anagrafica_manuale").eq("telegram_id", telegramId).maybeSingle()
  if (!lead?.sondaggio_completato && !lead?.anagrafica_manuale) return json({ error: "anagrafica_richiesta" }, 403)

  const servizio_id = parseInt(body?.servizio_id) || 0
  if (!servizio_id) return json({ error: "servizio_id_richiesto" }, 400)

  // Non si attiva un servizio non ancora attivo: per quelli c'e' la lista d'attesa.
  const { data: sv0 } = await supabase.from("servizi").select("stato, disclaimer_ver").eq("id", servizio_id).maybeSingle()
  if (!sv0) return json({ error: "not_found" }, 404)
  if (sv0.stato !== "attivo") return json({ error: "non_attivo" }, 409)

  // Il disclaimer deve lasciare traccia: chi, quando, quale versione, quale testo. Senza, non copre da niente.
  if (!body?.disclaimer_accettato) return json({ error: "disclaimer_richiesto" }, 400)

  // upsert e non insert: il bottone disabilitato lato client e' un accorgimento di UI,
  // non un vincolo. Due webview aperte (desktop + telefono) creerebbero due righe, e i
  // duplicati gonfiano i conteggi e rompono il maybeSingle() che legge l'attivazione.
  const { error: errAtt } = await supabase.from("lead_servizi").upsert({
    telegram_id: telegramId, servizio_id, stato: "interessato",
    disclaimer_accettato_at: new Date().toISOString(),
    disclaimer_ver: DISCLAIMER_VER,
    disclaimer_testo: DISCLAIMER_ATTIVAZIONE,
  }, { onConflict: "telegram_id,servizio_id" })
  if (errAtt) {
    console.error("attivazione fallita:", errAtt)
    return json({ error: "save_failed", detail: errAtt.message }, 500)
  }
  // Ha attivato: non e' piu' in attesa. Senza questo resterebbe in lista per un
  // servizio che sta gia' usando, e l'admin lo conterebbe tra i prenotati.
  await supabase.from("waitlist").delete().eq("telegram_id", telegramId).eq("servizio_id", servizio_id)
  await registraAccettazioneDisclaimer(telegramId, servizio_id, "attivazione", DISCLAIMER_ATTIVAZIONE)
  await supabase.from("leads").update({ is_cliente: true }).eq("telegram_id", telegramId)
  const refInfo = await resolveRefLinkConFonte(telegramId, servizio_id)
  await supabase.from("eventi").insert({ telegram_id: telegramId, tipo: "servizio_attivato", dettaglio: `servizio:${servizio_id}` })

  // Il promoter viene avvisato quando un suo invitato apre un business con il SUO link.
  if (refInfo.fonte === "sponsor" && refInfo.sponsor_id && refInfo.sponsor_id !== ADMIN_ID) {
    const { data: chi } = await supabase.from("leads").select("nome, username").eq("telegram_id", telegramId).maybeSingle()
    const { data: sv } = await supabase.from("servizi").select("nome").eq("id", servizio_id).maybeSingle()
    sendMessage(refInfo.sponsor_id, `🔔 ${chi?.nome || chi?.username || "Un tuo iscritto"} ha appena aperto "${sv?.nome || "un business"}" con il tuo link.`).catch((e) => console.error("notifica sponsor:", e))
  }

  return json({ ok: true, ref_link: refInfo.link, ref_fonte: refInfo.fonte })
}

// Segna completato uno step del tutorial; sblocca il successivo solo se gli step precedenti sono già fatti.
//
// "Completato" NON e' una parola del client: fa partire un messaggio allo sponsor e
// all'admin, quindi lo decide il server contando gli step veri del servizio. Allo stesso
// modo il progresso si registra solo su un servizio attivo che l'utente ha davvero
// attivato: senza queste guardie bastava una POST per annunciare un'attivazione mai avvenuta.
async function apiStepProgressSave(telegramId: number, body: any) {
  const servizioId = parseInt(body?.servizio_id) || 0
  const stepIndex = Number.isInteger(body?.step_index) ? body.step_index : -1
  if (!servizioId) return json({ error: "servizio_id_richiesto" }, 400)
  if (stepIndex < 0) return json({ error: "step_index_non_valido" }, 400)

  const { data: sv } = await supabase.from("servizi").select("stato, tutorial_steps").eq("id", servizioId).maybeSingle()
  if (!sv) return json({ error: "not_found" }, 404)
  if (sv.stato !== "attivo") return json({ error: "non_attivo" }, 409)

  const { data: attivazione } = await supabase.from("lead_servizi")
    .select("id").eq("telegram_id", telegramId).eq("servizio_id", servizioId).limit(1).maybeSingle()
  if (!attivazione) return json({ error: "servizio_non_attivato" }, 403)

  const totale = Array.isArray(sv.tutorial_steps) ? sv.tutorial_steps.length : 0
  if (!totale) return json({ error: "nessuno_step" }, 409)
  if (stepIndex >= totale) return json({ error: "step_fuori_range" }, 400)

  const { data: existing } = await supabase.from("tutorial_progress").select("id, ultimo_step, completato, notificato_at").eq("telegram_id", telegramId).eq("servizio_id", servizioId).maybeSingle()
  const attuale = existing?.ultimo_step ?? 0

  // Il toggle e' reversibile: fatto=false vuol dire "questo passo non l'ho fatto".
  // Chi manda solo lo step_index, senza dire altro, sta avanzando (contratto vecchio).
  const fatto = body?.fatto === undefined ? true : !!body.fatto

  // L'admin puo' ACCORCIARE un tutorial mentre qualcuno e' a meta': il progresso
  // salvato resta piu' alto del numero di step rimasti, e da li' non si esce piu'
  // (ogni indice sotto il totale e' fuori sequenza, ogni indice sopra e' fuori range).
  // Quel progresso ha di fatto superato il tutorial: si riconcilia e si chiude.
  if (fatto && attuale >= totale) {
    if (existing && !existing.completato) {
      await supabase.from("tutorial_progress")
        .update({ ultimo_step: totale, completato: true, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
      await annunciaCompletamento(telegramId, servizioId, existing.id, existing.notificato_at)
    }
    return json({ ok: true, ultimo_step: totale, completato: true, totale_step: totale })
  }

  let ultimoStep: number
  if (fatto) {
    if (stepIndex !== attuale) return json({ error: "step_non_in_sequenza" }, 409)
    ultimoStep = attuale + 1
  } else {
    // Spegnere un passo riporta il progresso LI': i passi successivi tornano da fare,
    // perche' "ultimo_step = N" significa "i primi N sono fatti" e non si puo' avere
    // il primo non fatto e il terzo si'. Spegnere qualcosa che non era acceso non ha senso.
    if (stepIndex >= attuale) return json({ error: "step_non_fatto" }, 409)
    ultimoStep = stepIndex
  }

  const completato = ultimoStep >= totale
  const row = { telegram_id: telegramId, servizio_id: servizioId, ultimo_step: ultimoStep, completato, updated_at: new Date().toISOString() }
  const { error } = existing
    ? await supabase.from("tutorial_progress").update(row).eq("id", existing.id)
    : await supabase.from("tutorial_progress").insert(row)
  if (error) return json({ error: error.message }, 500)

  if (completato) await annunciaCompletamento(telegramId, servizioId, existing?.id, existing?.notificato_at)
  return json({ ok: true, ultimo_step: ultimoStep, completato, totale_step: totale })
}

// Avvisa sponsor e admin che l'attivazione e' completa, UNA VOLTA SOLA. Da quando il
// toggle si puo' rimettere indietro, "completato" va e viene: senza questa memoria
// bastava spegnere e riaccendere l'ultimo passo per far ripartire il messaggio ogni volta.
async function annunciaCompletamento(telegramId: number, servizioId: number, rigaId?: number, notificatoAt?: string | null) {
  if (notificatoAt) return
  if (rigaId) {
    // Marca PRIMA di inviare: se l'invio fallisce si perde un avviso, se si marca dopo
    // si rischia di mandarne due. Meglio uno in meno che due allo stesso sponsor.
    await supabase.from("tutorial_progress").update({ notificato_at: new Date().toISOString() }).eq("id", rigaId)
  }
  inBackground(notificaAttivazioneCompletata(telegramId, servizioId).catch((e) => console.error("notifica attivazione:", e)))
}

async function notificaAttivazioneCompletata(telegramId: number, servizioId: number) {
  const { data: lead } = await supabase.from("leads").select("nome, username, referred_by").eq("telegram_id", telegramId).maybeSingle()
  const { data: sv } = await supabase.from("servizi").select("nome").eq("id", servizioId).maybeSingle()
  const chi = lead?.nome || lead?.username || `ID ${telegramId}`
  const nomeSv = sv?.nome || "un business"
  const testo = `✅ ${chi} ha completato l'attivazione di "${nomeSv}".`
  const destinatari = new Set<number>()
  if (lead?.referred_by && lead.referred_by !== ADMIN_ID) destinatari.add(lead.referred_by)
  destinatari.add(ADMIN_ID)
  for (const tid of destinatari) await sendMessage(tid, testo)
}

// Candidatura moderata: tutti i campi obbligatori, utenti bloccati esclusi, ref link accettato solo da profili verificati.
async function apiSuggerisci(telegramId: number, body: any) {
  // Proporre un business e' aperto a TUTTI (scelta di Antonio): la directory deve crescere e
  // la selezione la fa comunque l'admin approvando. Resta il blocco per chi abusa (sugg_bloccato).
  const { data: lead } = await supabase.from("leads").select("sondaggio_completato, sugg_bloccato, is_partner").eq("telegram_id", telegramId).maybeSingle()
  if (lead?.sugg_bloccato) return json({ error: "funzione_bloccata" }, 403)

  const nome = String(body?.nome || "").trim()
  const link = String(body?.link || "").trim()
  const categoriaId = parseInt(body?.categoria_id) || null
  const motivazione = String(body?.motivazione || "").trim()
  if (!nome || !link || !categoriaId || !motivazione) return json({ error: "campi_obbligatori" }, 400)

  const verificato = !!lead?.sondaggio_completato
  const refLinkUtente = verificato ? String(body?.ref_link_utente || "").trim() : ""

  const { error } = await supabase.from("suggerimenti").insert({
    telegram_id: telegramId, nome, link, categoria_id: categoriaId, motivazione,
    ref_link_utente: refLinkUtente || null, stato: "in_revisione",
  })
  if (error) return json({ error: error.message }, 500)

  await supabase.from("eventi").insert({ telegram_id: telegramId, tipo: "suggerimento_inviato", dettaglio: nome })
  await sendMessage(ADMIN_ID, `💡 Nuova candidatura per la Business List\n\n${nome}\n${link}\nPerché: ${motivazione}${refLinkUtente ? "\nRef link utente: " + refLinkUtente : ""}\n\nVai nell'admin per approvare o rifiutare.`)
  return json({ ok: true })
}

// I suggerimenti dell'utente con lo stato, per la sezione profilo.
async function apiMieiSuggerimenti(telegramId: number) {
  const { data } = await supabase.from("suggerimenti").select("id, nome, stato, causale_rifiuto, created_at").eq("telegram_id", telegramId).order("created_at", { ascending: false })
  return json({ suggerimenti: data ?? [] })
}

async function apiAdminSuggerimentiList() {
  const { data: suggerimenti } = await supabase.from("suggerimenti").select("*").order("created_at", { ascending: false })
  const { data: leads } = await supabase.from("leads").select("telegram_id, nome, username")
  const { data: cats } = await supabase.from("categorie").select("id, nome")
  const leadMap: Record<number, any> = {}
  for (const l of leads ?? []) leadMap[(l as any).telegram_id] = l
  const catMap: Record<number, string> = {}
  for (const c of cats ?? []) catMap[(c as any).id] = (c as any).nome
  const list = (suggerimenti ?? []).map((s: any) => ({
    ...s,
    utente_nome: leadMap[s.telegram_id]?.nome || leadMap[s.telegram_id]?.username || `ID ${s.telegram_id}`,
    categoria_nome: catMap[s.categoria_id] || "—",
  }))
  return json({ suggerimenti: list })
}

// Approva: crea il servizio in lista, opzionalmente inserisce il ref link dell'utente come reward, e lo avvisa.
async function apiAdminSuggerimentoApprova(body: any) {
  const { id, inserisci_link_utente } = body
  const { data: sug } = await supabase.from("suggerimenti").select("*").eq("id", id).maybeSingle()
  if (!sug) return json({ error: "not_found" }, 404)
  if (sug.stato === "approvato") return json({ error: "gia_approvato" }, 409)

  const { data: nuovo, error } = await supabase.from("servizi").insert({
    nome: sug.nome, categoria_id: sug.categoria_id, descrizione: sug.motivazione,
    link_principale: sug.link, stato: "attivo", tutorial_steps: [],
  }).select("id").single()
  if (error) return json({ error: error.message }, 500)

  await supabase.from("suggerimenti").update({ stato: "approvato", servizio_id: nuovo.id }).eq("id", id)

  let reward = false
  if (inserisci_link_utente && sug.ref_link_utente) {
    await supabase.from("affiliate_link").upsert(
      { telegram_id: sug.telegram_id, servizio_id: nuovo.id, ref_link: sug.ref_link_utente, approvato: true },
      { onConflict: "telegram_id,servizio_id" },
    )
    reward = true
  }

  await notifyUser(sug.telegram_id, `✅ <b>La tua candidatura "${htmlEsc(sug.nome)}" è stata approvata!</b>\n\nIl business è ora nella Business List.${reward ? "\n🎁 Come premio per la segnalazione di qualità, il tuo link affiliato è stato attivato su questo business." : ""}`, "🔎 Vedi nella lista", "/app.html")
  notificaNuovoServizio(sug.nome, sug.categoria_id).catch((e) => console.error("notifica:", e))
  return json({ ok: true, servizio_id: nuovo.id })
}

const CAUSALI_RIFIUTO: Record<string, string> = {
  non_conforme: "Non conforme alle linee guida dell'HUB",
  dati_mancanti: "Dati insufficienti o non verificabili",
  sospetto_scam: "Sospetto schema non trasparente (Ponzi/rendite garantite)",
}

// Rifiuta con causale predefinita: l'utente riceve il motivo via Telegram; opzionale il blocco della funzione.
async function apiAdminSuggerimentoRifiuta(body: any) {
  const { id, causale, blocca } = body
  const { data: sug } = await supabase.from("suggerimenti").select("*").eq("id", id).maybeSingle()
  if (!sug) return json({ error: "not_found" }, 404)

  const testoCausale = CAUSALI_RIFIUTO[causale] || CAUSALI_RIFIUTO.non_conforme
  const { error } = await supabase.from("suggerimenti").update({ stato: "rifiutato", causale_rifiuto: testoCausale }).eq("id", id)
  if (error) return json({ error: error.message }, 500)

  if (blocca) await supabase.from("leads").update({ sugg_bloccato: true }).eq("telegram_id", sug.telegram_id)

  await notifyUser(sug.telegram_id, `❌ <b>La tua candidatura "${htmlEsc(sug.nome)}" non è stata approvata.</b>\n\nMotivo: ${htmlEsc(testoCausale)}${blocca ? "\n\n⚠️ La funzione suggerimenti è stata disattivata per il tuo profilo." : ""}`, "➕ Proponine un altro", "/app.html")
  return json({ ok: true })
}

async function apiAdminSuggerimentiDelete(body: any) {
  const { id } = body
  const { error } = await supabase.from("suggerimenti").delete().eq("id", id)
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
}

// ---------- ADMIN: CATEGORIE & SERVIZI ----------
async function apiAdminMacroCategorieList() {
  const { data } = await supabase.from("macro_categorie").select("*").order("ordine")
  return json({ macro_categorie: data ?? [] })
}

async function apiAdminMacroCategorieSave(body: any) {
  const { id, nome, ordine } = body
  if (id) {
    const { error } = await supabase.from("macro_categorie").update({ nome, ordine }).eq("id", id)
    if (error) return json({ error: error.message }, 500)
  } else {
    const { error } = await supabase.from("macro_categorie").insert({ nome, ordine: ordine ?? 0 })
    if (error) return json({ error: error.message }, 500)
  }
  return json({ ok: true })
}

async function apiAdminMacroCategorieDelete(body: any) {
  const { id } = body
  // Le categorie collegate restano, ma senza macro.
  await supabase.from("categorie").update({ macro_categoria_id: null }).eq("macro_categoria_id", id)
  const { error } = await supabase.from("macro_categorie").delete().eq("id", id)
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
}

async function apiAdminCategorieList() {
  const { data } = await supabase.from("categorie").select("*").order("ordine")
  return json({ categorie: data ?? [] })
}

async function apiAdminCategorieSave(body: any) {
  const { id, nome, descrizione, ordine, macro_categoria_id } = body
  if (id) {
    const { error } = await supabase.from("categorie").update({ nome, descrizione, ordine, macro_categoria_id }).eq("id", id)
    if (error) return json({ error: error.message }, 500)
  } else {
    const { error } = await supabase.from("categorie").insert({ nome, descrizione, ordine: ordine ?? 0, macro_categoria_id })
    if (error) return json({ error: error.message }, 500)
  }
  return json({ ok: true })
}

async function apiAdminCategorieDelete(body: any) {
  const { id } = body
  // I servizi/segnalazioni/news collegati restano, ma senza categoria.
  await supabase.from("news").update({ categoria_id: null }).eq("categoria_id", id)
  await supabase.from("suggerimenti").update({ categoria_id: null }).eq("categoria_id", id)
  await supabase.from("servizi").update({ categoria_id: null }).eq("categoria_id", id)
  const { error } = await supabase.from("categorie").delete().eq("id", id)
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
}

async function apiAdminServiziList() {
  const { data } = await supabase.from("servizi").select("*").order("ordine")
  // Quante persone aspettano ciascun servizio. L'admin sta per far partire un invio
  // irreversibile: deve sapere PRIMA se scrive a una persona o a cinquecento.
  const { data: att } = await supabase.from("waitlist").select("servizio_id").is("avvisato_at", null)
  const inAttesa: Record<number, number> = {}
  for (const w of att ?? []) inAttesa[(w as any).servizio_id] = (inAttesa[(w as any).servizio_id] ?? 0) + 1
  const servizi = (data ?? []).map((s: any) => ({ ...s, in_attesa: inAttesa[s.id] ?? 0 }))
  return json({ servizi })
}

// Un lavoro che deve sopravvivere alla risposta HTTP. Senza waitUntil l'isolate Deno
// puo' essere ucciso appena la response chiude, troncando la coda delle notifiche a meta'.
function inBackground(p: Promise<unknown>) {
  const rt = (globalThis as any).EdgeRuntime
  if (rt?.waitUntil) rt.waitUntil(p)
  return p
}

// Le due transizioni di stato che hanno conseguenze verso gli utenti, in un punto solo:
// il salvataggio completo e il flag rapido devono comportarsi in modo identico.
async function applicaCambioStato(id: number, nome: string, prima: string, dopo: string) {
  if (prima === dopo) return
  if (dopo === "attivo") {
    // Parte adesso: avvisa chi si era prenotato.
    inBackground(avvisaWaitlist(id, nome).catch((e) => console.error("avvisaWaitlist:", e)))
    return
  }
  if (prima === "attivo") {
    // Esce da attivo: le prenotazioni tornano "da avvisare", altrimenti chi era gia'
    // stato avvisato resterebbe muto per sempre al successivo riavvio del servizio.
    await supabase.from("waitlist").update({ avvisato_at: null }).eq("servizio_id", id)
  }
}

async function apiAdminServiziSave(body: any) {
  const { id, nome, categoria_id, tipo, descrizione, requisiti, costi, split_percent, prezzo, stato, ordine, link_principale, tutorial_steps, tempo_stimato, difficolta, budget_minimo, rischio_livello, tempo_richiesto, esperienza_richiesta, risorse, longevita, attivo_da, logo_url, voci, budget_nota, costi_nota, in_evidenza } = body
  const row: Record<string, unknown> = { nome, categoria_id: categoria_id || null, tipo, descrizione, requisiti, costi, split_percent, prezzo, stato, ordine, link_principale, tutorial_steps: tutorial_steps ?? [], tempo_stimato, difficolta,
    budget_minimo: budget_minimo || null, rischio_livello: rischio_livello || null, tempo_richiesto: tempo_richiesto || null, esperienza_richiesta: esperienza_richiesta || null, risorse: risorse ?? [], logo_url: logo_url || null }
  // longevita e attivo_da NON sono nel form dell'admin: scriverli sempre significherebbe
  // azzerarli a ogni salvataggio (undefined -> null). Si toccano solo se arrivano davvero.
  // Stessa regola per le voci: un admin vecchio in cache non le manderebbe, e scriverle
  // sempre cancellerebbe la scheda di chi salva da quella pagina.
  if (voci !== undefined) row.voci = Array.isArray(voci) ? voci : []
  if (budget_nota !== undefined) row.budget_nota = budget_nota || null
  if (costi_nota !== undefined) row.costi_nota = costi_nota || null
  // In vetrina ce ne sta UNO: l'indice unico parziale rifiuterebbe il secondo con
  // un errore incomprensibile ("duplicate key"). Quindi accendere questo significa
  // spegnere il precedente, che e' anche quello che l'admin si aspetta: sposta la
  // vetrina, non ne apre una seconda.
  if (in_evidenza !== undefined) {
    row.in_evidenza = !!in_evidenza
    if (in_evidenza) {
      const q = supabase.from("servizi").update({ in_evidenza: false }).eq("in_evidenza", true)
      await (id ? q.neq("id", id) : q)
    }
  }
  if (longevita !== undefined) row.longevita = longevita || null
  if (attivo_da !== undefined) row.attivo_da = attivo_da || null
  if (id) {
    // Leggi lo stato PRIMA di scrivere: il passaggio a "attivo" e' cio' che fa partire
    // le notifiche a chi era in lista d'attesa.
    const { data: prima } = await supabase.from("servizi").select("stato, nome").eq("id", id).maybeSingle()
    const { error } = await supabase.from("servizi").update(row).eq("id", id)
    if (error) return json({ error: error.message }, 500)
    if (prima) await applicaCambioStato(id, nome || prima.nome, prima.stato, stato)
  } else {
    const { error } = await supabase.from("servizi").insert(row)
    if (error) return json({ error: error.message }, 500)
    notificaNuovoServizio(nome, categoria_id).catch((e) => console.error("notifica nuovo servizio:", e))
  }
  return json({ ok: true })
}

// Flag rapido dello stato dalla lista admin. Deliberatamente separato dal salvataggio
// completo: cambiare stato non deve poter riscrivere tutorial, risorse o descrizione.
const STATI_SERVIZIO = ["attivo", "pausa", "fermo"]

async function apiAdminServiziStato(body: any) {
  const id = parseInt(body?.id) || 0
  const stato = String(body?.stato ?? "")
  if (!id) return json({ error: "id_richiesto" }, 400)
  if (!STATI_SERVIZIO.includes(stato)) return json({ error: "stato_non_valido" }, 400)

  const { data: prima } = await supabase.from("servizi").select("stato, nome").eq("id", id).maybeSingle()
  if (!prima) return json({ error: "not_found" }, 404)
  if (prima.stato === stato) return json({ ok: true, stato, invariato: true })

  const { error } = await supabase.from("servizi").update({ stato }).eq("id", id)
  if (error) return json({ error: error.message }, 500)
  await applicaCambioStato(id, prima.nome, prima.stato, stato)
  return json({ ok: true, stato })
}

// Media degli step del tutorial: screenshot e clip brevi caricati dall'admin.
// Il tetto e' basso di proposito: il file viaggia in base64 dentro il JSON della
// richiesta, e un video lungo va su YouTube, non nel nostro storage.
const UPLOAD_MAX = 6 * 1024 * 1024
const ESTENSIONE_MEDIA: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
}

async function apiAdminUpload(body: any) {
  const contentType = String(body?.content_type ?? "")
  const b64 = String(body?.data ?? "")
  const est = ESTENSIONE_MEDIA[contentType]
  if (!est) return json({ error: "tipo_non_supportato" }, 400)
  if (!b64) return json({ error: "file_mancante" }, 400)

  let bytes: Uint8Array
  try {
    const bin = atob(b64)
    bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  } catch (_e) {
    return json({ error: "file_illeggibile" }, 400)
  }
  if (!bytes.length) return json({ error: "file_vuoto" }, 400)
  if (bytes.length > UPLOAD_MAX) return json({ error: "file_troppo_grande" }, 413)

  // Nome non indovinabile: il bucket e' pubblico, quindi il percorso non deve essere
  // enumerabile. Mai il nome originale del file, che puo' contenere di tutto.
  const nome = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.${est}`
  const up = await supabase.storage.from("tutorial").upload(nome, bytes, { contentType, upsert: false })
  if (up.error) {
    console.error("upload tutorial fallito:", up.error.message)
    return json({ error: "upload_fallito", detail: up.error.message }, 500)
  }
  const url = supabase.storage.from("tutorial").getPublicUrl(nome).data.publicUrl
  return json({ ok: true, url, tipo: contentType.startsWith("video/") ? "video" : "foto", byte: bytes.length })
}

// Avvisa via bot gli utenti che hanno preferiti nella stessa categoria del nuovo servizio.
async function notificaNuovoServizio(nomeServizio: string, categoriaId: number) {
  if (!categoriaId) return
  const { data: serviziCategoria } = await supabase.from("servizi").select("id").eq("categoria_id", categoriaId)
  const ids = (serviziCategoria ?? []).map((s: any) => s.id)
  if (!ids.length) return
  const { data: pref } = await supabase.from("preferiti").select("telegram_id").in("servizio_id", ids)
  const destinatari = [...new Set((pref ?? []).map((p: any) => p.telegram_id))]
  const { data: cat } = await supabase.from("categorie").select("nome").eq("id", categoriaId).maybeSingle()

  for (const tid of destinatari) {
    // Un destinatario irraggiungibile non deve interrompere la coda di tutti gli altri.
    try {
      await sendMessage(
        tid,
        `🆕 Nuovo business nella categoria ${cat?.nome || "che segui"}!\n\n${nomeServizio} è appena arrivato nella Business List.`,
        { inline_keyboard: [[{ text: "Guardalo ora", web_app: { url: WEBAPP_URL + "/app.html?_=" + Date.now() } }]] },
      )
    } catch (e) {
      console.error("notifica nuovo servizio fallita", tid, e)
    }
  }
}

async function apiAdminServiziDelete(body: any) {
  const { id } = body
  // Rimuove prima le righe collegate (voti e preferiti si cancellano in cascata da soli).
  await supabase.from("news").delete().eq("servizio_id", id)
  await supabase.from("suggerimenti").delete().eq("servizio_id", id)
  await supabase.from("lead_servizi").delete().eq("servizio_id", id)
  await supabase.from("affiliate_link").delete().eq("servizio_id", id)
  await supabase.from("pagamenti").delete().eq("servizio_id", id)
  await supabase.from("tutorial_progress").delete().eq("servizio_id", id)
  const { error } = await supabase.from("servizi").delete().eq("id", id)
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
}

// ---------- ADMIN: LINK AFFILIATO ----------
async function apiAdminAffiliateLinksList() {
  const { data: links } = await supabase.from("affiliate_link").select("*").order("created_at", { ascending: false })
  const { data: leads } = await supabase.from("leads").select("telegram_id, nome, cognome, username")
  const { data: servizi } = await supabase.from("servizi").select("id, nome")
  const leadMap: Record<number, any> = {}
  for (const l of leads ?? []) leadMap[(l as any).telegram_id] = l
  const svcMap: Record<number, string> = {}
  for (const s of servizi ?? []) svcMap[(s as any).id] = (s as any).nome
  const list = (links ?? []).map((l: any) => ({
    ...l,
    utente_nome: [leadMap[l.telegram_id]?.nome, leadMap[l.telegram_id]?.cognome].filter(Boolean).join(" ") || leadMap[l.telegram_id]?.username || `ID ${l.telegram_id}`,
    servizio_nome: svcMap[l.servizio_id] || "?",
  }))
  return json({ links: list })
}

async function apiAdminAffiliateLinkApprove(body: any) {
  const { id } = body
  const { data: link } = await supabase.from("affiliate_link").select("servizio_id, ref_link, telegram_id").eq("id", id).maybeSingle()
  if (!link) return json({ error: "not_found" }, 404)

  const { error } = await supabase.from("affiliate_link").update({ approvato: true }).eq("id", id)
  if (error) return json({ error: error.message }, 500)

  // Se il servizio non ha ancora un link di default, questo diventa il link base per tutti finché l'admin non ne imposta uno.
  const { data: sv } = await supabase.from("servizi").select("nome, link_principale").eq("id", link.servizio_id).maybeSingle()
  if (sv && !sv.link_principale) {
    await supabase.from("servizi").update({ link_principale: link.ref_link }).eq("id", link.servizio_id)
  }

  if (link.telegram_id) {
    await notifyUser(link.telegram_id, `🔗 <b>Il tuo link affiliato è stato approvato!</b>\n\nSu <b>${htmlEsc(sv?.nome || "un business")}</b> ora la tua rete vedrà il tuo referral.`, "📊 I miei link", "/app.html?s=wallet")
  }

  return json({ ok: true })
}

async function apiAdminAffiliateLinkDelete(body: any) {
  const { id } = body
  // Se il link era ancora in attesa, avvisa l'utente che è stato rifiutato.
  const { data: link } = await supabase.from("affiliate_link").select("servizio_id, approvato, telegram_id").eq("id", id).maybeSingle()
  const { error } = await supabase.from("affiliate_link").delete().eq("id", id)
  if (error) return json({ error: error.message }, 500)
  if (link && !link.approvato && link.telegram_id) {
    const { data: sv } = await supabase.from("servizi").select("nome").eq("id", link.servizio_id).maybeSingle()
    await notifyUser(link.telegram_id, `❌ <b>Il tuo link affiliato non è stato approvato.</b>\n\nSu <b>${htmlEsc(sv?.nome || "il business")}</b>. Puoi proporne uno nuovo dalla sezione Affiliazione.`, "🔗 Riprova", "/app.html?s=wallet")
  }
  return json({ ok: true })
}

// ---------- SEGNALAZIONI ----------
const TIPI_SEGNALAZIONE: Record<string, string> = {
  link_rotto: "Link rotto",
  sospetto_scam: "Sospetto scam",
  altro: "Altro problema",
}

async function apiSegnala(telegramId: number, body: any) {
  const servizioId = parseInt(body?.servizio_id) || null
  const tipo = TIPI_SEGNALAZIONE[body?.tipo] ? String(body.tipo) : "altro"
  const messaggio = String(body?.messaggio || "").trim().slice(0, 500)
  const { error } = await supabase.from("segnalazioni").insert({ telegram_id: telegramId, servizio_id: servizioId, tipo, messaggio: messaggio || null })
  if (error) return json({ error: error.message }, 500)

  let nomeServizio = ""
  let linkSospeso = false
  if (servizioId) {
    const { data: sv } = await supabase.from("servizi").select("nome").eq("id", servizioId).maybeSingle()
    nomeServizio = sv?.nome || ""

    // Se il link segnalato (rotto o scam) era quello dello sponsor del segnalante, viene sospeso subito
    // in attesa di verifica: torna visibile solo se l'admin lo riapprova. Lo sponsor riceve l'alert.
    if (tipo === "link_rotto" || tipo === "sospetto_scam") {
      const refInfo = await resolveRefLinkConFonte(telegramId, servizioId)
      if (refInfo.fonte === "sponsor" && refInfo.sponsor_id && refInfo.sponsor_id !== ADMIN_ID) {
        await supabase.from("affiliate_link").update({ approvato: false }).eq("telegram_id", refInfo.sponsor_id).eq("servizio_id", servizioId)
        linkSospeso = true
        sendMessage(refInfo.sponsor_id, `⚠️ Link Sospeso\n\nIl tuo link referral su "${nomeServizio}" è stato segnalato (${TIPI_SEGNALAZIONE[tipo]}) ed è stato sospeso in attesa di verifica.\n\nControlla che funzioni e, se serve, aggiornalo da La mia pagina → I miei link. L'admin lo riesaminerà a breve.`).catch(() => {})
      }
    }
  }
  await sendMessage(ADMIN_ID, `🚨 Segnalazione: ${TIPI_SEGNALAZIONE[tipo]}${nomeServizio ? `\nBusiness: ${nomeServizio}` : ""}${messaggio ? `\nMessaggio: ${messaggio}` : ""}${linkSospeso ? "\n⚠️ Il link dello sponsor è stato sospeso automaticamente: riesaminalo dall'admin." : ""}\nDa utente ID ${telegramId}. Gestiscila dall'admin.`)
  return json({ ok: true })
}

// ---------- PARTNER ----------
// Richiesta manuale di diventare Partner: arriva all'admin che approva o rifiuta con un click.
async function apiDiventaPartner(telegramId: number) {
  const { data: lead } = await supabase.from("leads").select("nome, username, is_partner, partner_richiesto").eq("telegram_id", telegramId).maybeSingle()
  if (!lead) return json({ error: "not_found" }, 404)
  if (lead.is_partner) return json({ error: "gia_partner" }, 409)
  if (lead.partner_richiesto) return json({ error: "richiesta_gia_inviata" }, 409)

  await supabase.from("leads").update({ partner_richiesto: true }).eq("telegram_id", telegramId)
  await sendMessage(ADMIN_ID, `🤝 Richiesta Partner\n\n${lead.nome || lead.username || "Utente"} (ID ${telegramId}) chiede di diventare Partner per inserire i suoi link referral.\n\nApprova o rifiuta dall'admin.`)
  return json({ ok: true })
}

// Broadcast di rete: il Partner con abbastanza iscritti scrive SOLO ai propri invitati, massimo una volta al giorno.
async function apiReteBroadcast(telegramId: number, body: any) {
  const testo = String(body?.testo || "").trim().slice(0, 1000)
  if (!testo) return json({ error: "testo_richiesto" }, 400)

  const { data: lead } = await supabase.from("leads").select("nome, username, is_partner").eq("telegram_id", telegramId).maybeSingle()
  if (!lead?.is_partner) return json({ error: "non_partner" }, 403)

  const { data: invitati } = await supabase.from("leads").select("telegram_id").eq("referred_by", telegramId).eq("bot_started", true)
  if ((invitati ?? []).length < PARTNER_SOGLIA) return json({ error: "rete_troppo_piccola", minimo: PARTNER_SOGLIA }, 403)

  // Anti-spam: massimo un broadcast di rete ogni 24 ore.
  const ieri = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { count: recenti } = await supabase.from("eventi").select("id", { count: "exact", head: true }).eq("telegram_id", telegramId).eq("tipo", "rete_broadcast").gte("created_at", ieri)
  if ((recenti ?? 0) > 0) return json({ error: "limite_giornaliero" }, 429)

  const mittente = lead.nome || lead.username || "Il tuo sponsor"
  let inviati = 0
  for (const inv of invitati ?? []) {
    const res = await sendMessage((inv as any).telegram_id, `📣 Messaggio da ${mittente} (il tuo sponsor):\n\n${testo}`)
    const data = await res.json().catch(() => ({}))
    if (data.ok) inviati++
    await new Promise((r) => setTimeout(r, 50))
  }
  await supabase.from("eventi").insert({ telegram_id: telegramId, tipo: "rete_broadcast", dettaglio: `inviati:${inviati}` })
  return json({ ok: true, inviati })
}

// ---------- ADMIN: PARTNER & WHITELIST ----------
async function apiAdminPartnerList() {
  const { data } = await supabase.from("leads").select("telegram_id, nome, username, foto_url, partner_richiesto, is_partner").eq("partner_richiesto", true).eq("is_partner", false)
  const richieste = (data ?? []).map((l: any) => ({
    telegram_id: l.telegram_id,
    nome: l.nome || l.username || `ID ${l.telegram_id}`,
    username: l.username || "",
  }))
  return json({ richieste })
}

async function apiAdminPartnerDecidi(body: any) {
  const telegramId = parseInt(body?.telegram_id)
  const approva = !!body?.approva
  if (!telegramId) return json({ error: "telegram_id_richiesto" }, 400)

  const { error } = await supabase.from("leads").update({ is_partner: approva, partner_richiesto: false }).eq("telegram_id", telegramId)
  if (error) return json({ error: error.message }, 500)

  if (approva) {
    await notifyUser(telegramId, `🚀 <b>La tua richiesta è stata approvata: ora sei Partner!</b>\n\nPuoi inserire i tuoi link referral sui business: la tua rete vedrà i TUOI link.`, "🔗 Inserisci i miei link", "/app.html?s=wallet")
  } else {
    await notifyUser(telegramId, `La tua richiesta Partner non è stata approvata per ora.\n\nPorta ${PARTNER_SOGLIA} iscritti con il tuo link invito e lo status si sblocca in automatico.`, "🔗 Il tuo link invito", "/app.html?s=wallet")
  }
  return json({ ok: true })
}

async function apiAdminWhitelistList() {
  const { data } = await supabase.from("domini_whitelist").select("*").order("dominio")
  return json({ domini: data ?? [] })
}

async function apiAdminWhitelistSave(body: any) {
  const dominio = String(body?.dominio || "").trim().toLowerCase().replace(/^www\./, "")
  if (!dominio || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(dominio)) return json({ error: "dominio_non_valido" }, 400)
  const { error } = await supabase.from("domini_whitelist").upsert({ dominio }, { onConflict: "dominio" })
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
}

async function apiAdminWhitelistDelete(body: any) {
  const { error } = await supabase.from("domini_whitelist").delete().eq("id", body?.id)
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
}

async function apiAdminSegnalazioniList() {
  const { data: segnalazioni } = await supabase.from("segnalazioni").select("*").order("created_at", { ascending: false })
  const { data: leads } = await supabase.from("leads").select("telegram_id, nome, username")
  const { data: servizi } = await supabase.from("servizi").select("id, nome")
  const leadMap: Record<number, any> = {}
  for (const l of leads ?? []) leadMap[(l as any).telegram_id] = l
  const svcMap: Record<number, string> = {}
  for (const s of servizi ?? []) svcMap[(s as any).id] = (s as any).nome
  const list = (segnalazioni ?? []).map((s: any) => ({
    ...s,
    tipo_label: TIPI_SEGNALAZIONE[s.tipo] || s.tipo,
    utente_nome: leadMap[s.telegram_id]?.nome || leadMap[s.telegram_id]?.username || `ID ${s.telegram_id}`,
    servizio_nome: s.servizio_id ? (svcMap[s.servizio_id] || "?") : null,
  }))
  return json({ segnalazioni: list })
}

async function apiAdminSegnalazioneRisolvi(body: any) {
  const { id } = body
  const { error } = await supabase.from("segnalazioni").update({ stato: "risolta" }).eq("id", id)
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
}

// ---------- ADMIN: KPI & SPONSORBOARD ----------
// Registra la scelta fatta nell'ultima slide dell'onboarding: "profilo" (crea subito) o "esplora".
// Registra solo la PRIMA scelta, per non falsare le percentuali se l'utente rivede l'onboarding.
async function apiOnboarding(telegramId: number, body: any) {
  const choice = body?.choice === "profilo" ? "profilo" : "esplora"
  const { data: lead } = await supabase.from("leads").select("onboarding_choice").eq("telegram_id", telegramId).maybeSingle()
  if (lead && !(lead as any).onboarding_choice) {
    await supabase.from("leads").update({ onboarding_choice: choice }).eq("telegram_id", telegramId)
  }
  return json({ ok: true })
}

async function apiAdminKpi() {
  const inizioOggi = new Date()
  inizioOggi.setUTCHours(0, 0, 0, 0)
  const setteGiorniFa = new Date(Date.now() - 7 * 864e5).toISOString()

  const { count: totale } = await supabase.from("leads").select("telegram_id", { count: "exact", head: true })
  const { count: nuoviOggi } = await supabase.from("leads").select("telegram_id", { count: "exact", head: true }).gte("created_at", inizioOggi.toISOString())
  const { count: nuovi7gg } = await supabase.from("leads").select("telegram_id", { count: "exact", head: true }).gte("created_at", setteGiorniFa)
  const { count: clienti } = await supabase.from("leads").select("telegram_id", { count: "exact", head: true }).eq("is_cliente", true)
  const { count: pendingSuggerimenti } = await supabase.from("suggerimenti").select("id", { count: "exact", head: true }).eq("stato", "in_revisione")
  const { count: pendingLinks } = await supabase.from("affiliate_link").select("id", { count: "exact", head: true }).eq("approvato", false)
  const { count: segnalazioniAperte } = await supabase.from("segnalazioni").select("id", { count: "exact", head: true }).eq("stato", "aperta")
  const { count: pendingPartner } = await supabase.from("leads").select("telegram_id", { count: "exact", head: true }).eq("partner_richiesto", true).eq("is_partner", false)

  // Onboarding: quanti scelgono di creare il profilo subito vs esplorare prima.
  const { count: onbProfilo } = await supabase.from("leads").select("telegram_id", { count: "exact", head: true }).eq("onboarding_choice", "profilo")
  const { count: onbEsplora } = await supabase.from("leads").select("telegram_id", { count: "exact", head: true }).eq("onboarding_choice", "esplora")
  const onbTot = (onbProfilo ?? 0) + (onbEsplora ?? 0)
  const onbProfiloPct = onbTot ? Math.round((onbProfilo ?? 0) * 100 / onbTot) : 0
  const onbEsploraPct = onbTot ? 100 - onbProfiloPct : 0

  // Top business: per voti totali e per attivazioni recenti (ultimi 7 giorni come indicatore di trend).
  const { data: servizi } = await supabase.from("servizi").select("id, nome")
  const svcMap: Record<number, string> = {}
  for (const s of servizi ?? []) svcMap[(s as any).id] = (s as any).nome

  const { data: voti } = await supabase.from("voti").select("servizio_id")
  const votiCount: Record<number, number> = {}
  for (const v of voti ?? []) votiCount[(v as any).servizio_id] = (votiCount[(v as any).servizio_id] ?? 0) + 1

  const { data: attivazioni } = await supabase.from("lead_servizi").select("servizio_id, created_at")
  const attCount: Record<number, number> = {}
  const attRecenti: Record<number, number> = {}
  for (const a of attivazioni ?? []) {
    attCount[(a as any).servizio_id] = (attCount[(a as any).servizio_id] ?? 0) + 1
    if ((a as any).created_at >= setteGiorniFa) attRecenti[(a as any).servizio_id] = (attRecenti[(a as any).servizio_id] ?? 0) + 1
  }

  const topBusiness = Object.keys(svcMap).map((id) => ({
    id: parseInt(id),
    nome: svcMap[parseInt(id)],
    voti: votiCount[parseInt(id)] ?? 0,
    attivazioni: attCount[parseInt(id)] ?? 0,
    attivazioni_7gg: attRecenti[parseInt(id)] ?? 0,
  })).sort((a, b) => b.voti - a.voti || b.attivazioni - a.attivazioni).slice(0, 5)

  return json({
    totale: totale ?? 0,
    nuovi_oggi: nuoviOggi ?? 0,
    nuovi_7gg: nuovi7gg ?? 0,
    clienti: clienti ?? 0,
    pending_suggerimenti: pendingSuggerimenti ?? 0,
    pending_links: pendingLinks ?? 0,
    segnalazioni_aperte: segnalazioniAperte ?? 0,
    pending_partner: pendingPartner ?? 0,
    onboarding: { profilo: onbProfilo ?? 0, esplora: onbEsplora ?? 0, tot: onbTot, profilo_pct: onbProfiloPct, esplora_pct: onbEsploraPct },
    top_business: topBusiness,
  })
}

async function apiAdminSponsorboard() {
  const { data: leads } = await supabase.from("leads").select("telegram_id, nome, username, foto_url, referred_by, is_cliente")
  const perSponsor: Record<number, { invitati: number; attivati: number }> = {}
  for (const l of leads ?? []) {
    const ref = (l as any).referred_by
    if (!ref) continue
    perSponsor[ref] = perSponsor[ref] ?? { invitati: 0, attivati: 0 }
    perSponsor[ref].invitati++
    if ((l as any).is_cliente) perSponsor[ref].attivati++
  }
  const leadMap: Record<number, any> = {}
  for (const l of leads ?? []) leadMap[(l as any).telegram_id] = l
  const board = Object.entries(perSponsor)
    .map(([tid, s]) => ({
      telegram_id: parseInt(tid),
      nome: leadMap[parseInt(tid)]?.nome || leadMap[parseInt(tid)]?.username || `ID ${tid}`,
      username: leadMap[parseInt(tid)]?.username || "",
      foto_url: leadMap[parseInt(tid)]?.foto_url || "",
      invitati: s.invitati,
      attivati: s.attivati,
    }))
    .sort((a, b) => b.invitati - a.invitati || b.attivati - a.attivati)
    .slice(0, 10)
  return json({ sponsorboard: board })
}

// ---------- ADMIN: CRM PIPELINE ----------
const STADI_PIPELINE = ["lead", "attivato", "in_training", "attivo", "criticita"]

// Stadi derivati dai dati reali; l'override manuale (es. "criticita") vince su tutto.
async function calcolaStadi(leads: any[]): Promise<Record<number, string>> {
  const ids = leads.map((l) => l.telegram_id)
  const { data: attivazioni } = ids.length ? await supabase.from("lead_servizi").select("telegram_id").in("telegram_id", ids) : { data: [] }
  const { data: progress } = ids.length ? await supabase.from("tutorial_progress").select("telegram_id, ultimo_step, completato").in("telegram_id", ids) : { data: [] }
  const { data: links } = ids.length ? await supabase.from("affiliate_link").select("telegram_id").eq("approvato", true).in("telegram_id", ids) : { data: [] }

  const haAttivato = new Set((attivazioni ?? []).map((a: any) => a.telegram_id))
  const inTraining = new Set<number>()
  const haCompletato = new Set<number>()
  for (const p of progress ?? []) {
    if ((p as any).completato) haCompletato.add((p as any).telegram_id)
    else if ((p as any).ultimo_step > 0) inTraining.add((p as any).telegram_id)
  }
  const haLinkApprovato = new Set((links ?? []).map((l: any) => l.telegram_id))

  const stadi: Record<number, string> = {}
  for (const l of leads) {
    if (l.pipeline_override && STADI_PIPELINE.includes(l.pipeline_override)) { stadi[l.telegram_id] = l.pipeline_override; continue }
    if (haCompletato.has(l.telegram_id) || haLinkApprovato.has(l.telegram_id)) stadi[l.telegram_id] = "attivo"
    else if (inTraining.has(l.telegram_id)) stadi[l.telegram_id] = "in_training"
    else if (haAttivato.has(l.telegram_id)) stadi[l.telegram_id] = "attivato"
    else stadi[l.telegram_id] = "lead"
  }
  return stadi
}

async function apiAdminCrm() {
  const { data: leads } = await supabase.from("leads").select("telegram_id, nome, cognome, username, foto_url, referred_by, is_cliente, sondaggio_completato, pipeline_override, tags, created_at").order("created_at", { ascending: false })
  const stadi = await calcolaStadi(leads ?? [])

  const ids = (leads ?? []).map((l: any) => l.telegram_id)
  const { data: attivazioni } = ids.length ? await supabase.from("lead_servizi").select("telegram_id").in("telegram_id", ids) : { data: [] }
  const attCount: Record<number, number> = {}
  for (const a of attivazioni ?? []) attCount[(a as any).telegram_id] = (attCount[(a as any).telegram_id] ?? 0) + 1

  const leadMap: Record<number, any> = {}
  for (const l of leads ?? []) leadMap[(l as any).telegram_id] = l

  const contatti = (leads ?? []).map((l: any) => ({
    telegram_id: l.telegram_id,
    nome: [l.nome, l.cognome].filter(Boolean).join(" ") || l.username || `ID ${l.telegram_id}`,
    username: l.username || "",
    foto_url: l.foto_url || "",
    stadio: stadi[l.telegram_id],
    override: l.pipeline_override || null,
    sponsor_nome: l.referred_by ? (leadMap[l.referred_by]?.nome || leadMap[l.referred_by]?.username || `ID ${l.referred_by}`) : null,
    servizi_attivati: attCount[l.telegram_id] ?? 0,
    tags: Array.isArray(l.tags) ? l.tags : [],
    iscritto_il: l.created_at,
  }))
  // Elenco di tutti i tag già usati, per suggerimenti/filtri nell'admin.
  const tuttiTag = [...new Set((leads ?? []).flatMap((l: any) => Array.isArray(l.tags) ? l.tags : []))].sort()
  return json({ contatti, tags: tuttiTag })
}

// ---------- ADMIN: MIEI CONTATTI (rubrica Telegram personale, sincronizzata via tool MTProto) ----------
async function apiAdminMieiContatti() {
  const { data } = await supabase.from("contatti_telegram")
    .select("id, tg_user_id, first_name, last_name, username, phone, tags, cartelle, note")
    .eq("owner_id", ADMIN_ID).order("first_name", { ascending: true })
  const contatti = (data ?? []).map((c: any) => ({
    ...c,
    tags: Array.isArray(c.tags) ? c.tags : [],
    cartelle: Array.isArray(c.cartelle) ? c.cartelle : [],
    nome: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.username || c.phone || `ID ${c.tg_user_id}`,
  }))
  const tags = [...new Set((data ?? []).flatMap((c: any) => Array.isArray(c.tags) ? c.tags : []))].sort()
  const cartelle = [...new Set((data ?? []).flatMap((c: any) => Array.isArray(c.cartelle) ? c.cartelle : []))].sort()
  return json({ contatti, tags, cartelle })
}

async function apiAdminContattoCartelle(body: any) {
  const id = parseInt(body?.id)
  if (!id) return json({ error: "id_richiesto" }, 400)
  const raw = Array.isArray(body?.cartelle) ? body.cartelle : []
  const cartelle = [...new Set(raw.map((t: any) => String(t || "").trim().slice(0, 30)).filter(Boolean))].slice(0, 20)
  const { error } = await supabase.from("contatti_telegram").update({ cartelle }).eq("id", id).eq("owner_id", ADMIN_ID)
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true, cartelle })
}

// UniChat segnala un messaggio in arrivo da un contatto: marca come "risposto" gli invii recenti a quel contatto.
async function apiAdminContattoInbound(body: any) {
  const uid = parseInt(body?.tg_user_id)
  if (!uid) return json({ error: "tg_user_id" }, 400)
  const since = new Date(Date.now() - 30 * 864e5).toISOString() // finestra 30 giorni
  // Broadcast dest inviati e non ancora risposti.
  const { data: dests } = await supabase.from("contatti_broadcast_dest").select("id, job_id").eq("tg_user_id", uid).eq("stato", "sent").eq("risposto", false).gte("sent_at", since)
  for (const d of dests ?? []) {
    await supabase.from("contatti_broadcast_dest").update({ risposto: true, risposto_at: new Date().toISOString() }).eq("id", (d as any).id)
    const { data: job } = await supabase.from("contatti_broadcast").select("risposti").eq("id", (d as any).job_id).maybeSingle()
    if (job) await supabase.from("contatti_broadcast").update({ risposti: ((job as any).risposti || 0) + 1 }).eq("id", (d as any).job_id)
  }
  await supabase.from("messaggi_singoli").update({ risposto: true, risposto_at: new Date().toISOString() }).eq("owner_id", ADMIN_ID).eq("tg_user_id", uid).eq("stato", "sent").eq("risposto", false).gte("sent_at", since)
  return json({ ok: true })
}

async function apiAdminBroadcastList() {
  const { data } = await supabase.from("contatti_broadcast").select("id, message, tag, delay_min, stato, totali, inviati, falliti, risposti, scheduled_at, created_at").eq("owner_id", ADMIN_ID).order("created_at", { ascending: false }).limit(30)
  return json({ broadcasts: data ?? [] })
}

async function apiAdminMsgList() {
  const { data } = await supabase.from("messaggi_singoli").select("id, nome, username, message, stato, scheduled_at, risposto, created_at, sent_at").eq("owner_id", ADMIN_ID).order("created_at", { ascending: false }).limit(40)
  return json({ messaggi: data ?? [] })
}

async function apiAdminMsgAnnulla(body: any) {
  const id = parseInt(body?.id)
  if (!id) return json({ error: "id" }, 400)
  // Annulla solo se ancora in attesa (non già inviato).
  await supabase.from("messaggi_singoli").update({ stato: "annullato" }).eq("id", id).eq("owner_id", ADMIN_ID).eq("stato", "pending")
  return json({ ok: true })
}

// Import massivo dei contatti Telegram dal tool di sync (protetto dalla admin key).
async function apiAdminContattiImport(body: any) {
  const list = Array.isArray(body?.contatti) ? body.contatti : []
  const rows = list.map((c: any) => ({
    owner_id: ADMIN_ID,
    tg_user_id: parseInt(c.tg_user_id),
    first_name: c.first_name ?? null,
    last_name: c.last_name ?? null,
    username: c.username ?? null,
    phone: c.phone ?? null,
    updated_at: new Date().toISOString(),
  })).filter((r: any) => r.tg_user_id)
  let importati = 0
  for (let i = 0; i < rows.length; i += 300) {
    const chunk = rows.slice(i, i + 300)
    const { error } = await supabase.from("contatti_telegram").upsert(chunk, { onConflict: "owner_id,tg_user_id" })
    if (error) console.error("import contatti:", error.message)
    else importati += chunk.length
  }
  return json({ ok: true, importati })
}

// ---------- ADMIN: messaggio singolo a un contatto (inviato dal client MTProto di UniChat) ----------
async function apiAdminContattoInvia(body: any) {
  const message = String(body?.message || "").trim()
  if (!message) return json({ error: "message_richiesto" }, 400)
  const tg_user_id = body?.tg_user_id ? parseInt(body.tg_user_id) : null
  const username = body?.username ? String(body.username) : null
  const nome = body?.nome ? String(body.nome) : null
  if (!tg_user_id && !username) return json({ error: "destinatario_richiesto" }, 400)
  const scheduledAt = body?.scheduled_at ? new Date(body.scheduled_at).toISOString() : null
  const { error } = await supabase.from("messaggi_singoli").insert({ owner_id: ADMIN_ID, tg_user_id, username, nome, message, stato: "pending", scheduled_at: scheduledAt })
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true, scheduled_at: scheduledAt })
}

// Worker UniChat: prossimo messaggio singolo in coda (priorità sui broadcast, invio immediato). Salta i programmati non ancora scaduti.
async function apiAdminMsgPoll() {
  const now = new Date().toISOString()
  const { data } = await supabase.from("messaggi_singoli").select("id, tg_user_id, username, nome, message").eq("owner_id", ADMIN_ID).eq("stato", "pending").or(`scheduled_at.is.null,scheduled_at.lte.${now}`).order("id", { ascending: true }).limit(1).maybeSingle()
  return json({ msg: data || null })
}
async function apiAdminMsgMark(body: any) {
  const id = parseInt(body?.id)
  const ok = !!body?.ok
  if (!id) return json({ error: "id" }, 400)
  await supabase.from("messaggi_singoli").update({ stato: ok ? "sent" : "failed", sent_at: new Date().toISOString() }).eq("id", id)
  return json({ ok: true })
}

// ---------- ADMIN: BROADCAST ai contatti (inviato dal client MTProto di UniChat) ----------
async function apiAdminBroadcastCreate(body: any) {
  const message = String(body?.message || "").trim()
  const tag = body?.tag ? String(body.tag) : null
  let delay = parseInt(body?.delay_min)
  if (!(delay >= 1 && delay <= 20)) delay = 5
  if (!message) return json({ error: "message_richiesto" }, 400)
  const scheduledAt = body?.scheduled_at ? new Date(body.scheduled_at).toISOString() : null

  // Blocca un broadcast IMMEDIATO solo se ce n'è già uno attivo e "dovuto"; i programmati futuri si accodano.
  if (!scheduledAt) {
    const { data: attivi } = await supabase.from("contatti_broadcast").select("id, scheduled_at").eq("owner_id", ADMIN_ID).eq("stato", "running")
    const dueActive = (attivi ?? []).some((j: any) => !j.scheduled_at || new Date(j.scheduled_at) <= new Date())
    if (dueActive) return json({ error: "broadcast_gia_attivo" }, 409)
  }

  let q = supabase.from("contatti_telegram").select("tg_user_id, username, first_name, last_name").eq("owner_id", ADMIN_ID)
  if (tag) q = q.contains("tags", [tag])
  const { data: contatti } = await q
  const dest = (contatti ?? []).filter((c: any) => c.tg_user_id)
  if (!dest.length) return json({ error: "nessun_destinatario" }, 400)

  const { data: job, error } = await supabase.from("contatti_broadcast")
    .insert({ owner_id: ADMIN_ID, message, tag, delay_min: delay, stato: "running", totali: dest.length, scheduled_at: scheduledAt })
    .select("id").single()
  if (error) return json({ error: error.message }, 500)

  const rows = dest.map((c: any) => ({
    job_id: job.id,
    tg_user_id: c.tg_user_id,
    username: c.username || null,
    nome: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.username || String(c.tg_user_id),
  }))
  for (let i = 0; i < rows.length; i += 300) await supabase.from("contatti_broadcast_dest").insert(rows.slice(i, i + 300))
  return json({ ok: true, job_id: job.id, totali: dest.length })
}

async function apiAdminBroadcastStatus() {
  const { data } = await supabase.from("contatti_broadcast").select("*").eq("owner_id", ADMIN_ID).order("created_at", { ascending: false }).limit(1).maybeSingle()
  return json({ job: data || null })
}

async function apiAdminBroadcastStop(body: any) {
  const jobId = body?.job_id ? parseInt(body.job_id) : null
  let q = supabase.from("contatti_broadcast").update({ stato: "stopped", updated_at: new Date().toISOString() }).eq("owner_id", ADMIN_ID).eq("stato", "running")
  if (jobId) q = q.eq("id", jobId)
  await q
  return json({ ok: true })
}

// Usato dal worker UniChat: restituisce il prossimo destinatario da servire per il job attivo.
async function apiAdminBroadcastPoll() {
  const now = new Date().toISOString()
  const { data: job } = await supabase.from("contatti_broadcast").select("*").eq("owner_id", ADMIN_ID).eq("stato", "running")
    .or(`scheduled_at.is.null,scheduled_at.lte.${now}`)
    .order("scheduled_at", { ascending: true, nullsFirst: true }).order("created_at", { ascending: true }).limit(1).maybeSingle()
  if (!job) return json({ job: null })
  const { data: next } = await supabase.from("contatti_broadcast_dest").select("id, tg_user_id, username, nome").eq("job_id", job.id).eq("stato", "pending").order("id", { ascending: true }).limit(1).maybeSingle()
  if (!next) {
    await supabase.from("contatti_broadcast").update({ stato: "done", updated_at: new Date().toISOString() }).eq("id", job.id)
    return json({ job: null })
  }
  return json({ job: { id: job.id, message: job.message, delay_min: job.delay_min }, next })
}

async function apiAdminBroadcastMark(body: any) {
  const destId = parseInt(body?.dest_id)
  const ok = !!body?.ok
  if (!destId) return json({ error: "dest_id" }, 400)
  const { data: d } = await supabase.from("contatti_broadcast_dest").select("job_id, stato").eq("id", destId).maybeSingle()
  if (!d || d.stato !== "pending") return json({ ok: true })
  await supabase.from("contatti_broadcast_dest").update({ stato: ok ? "sent" : "failed", sent_at: new Date().toISOString() }).eq("id", destId)
  const col = ok ? "inviati" : "falliti"
  const { data: job } = await supabase.from("contatti_broadcast").select("inviati, falliti").eq("id", d.job_id).maybeSingle()
  if (job) await supabase.from("contatti_broadcast").update({ [col]: ((job as any)[col] || 0) + 1, updated_at: new Date().toISOString() }).eq("id", d.job_id)
  return json({ ok: true })
}

async function apiAdminMieiContattiTags(body: any) {
  const id = parseInt(body?.id)
  if (!id) return json({ error: "id_richiesto" }, 400)
  const raw = Array.isArray(body?.tags) ? body.tags : []
  const tags = [...new Set(raw.map((t: any) => String(t || "").trim().slice(0, 24)).filter(Boolean))].slice(0, 12)
  const { error } = await supabase.from("contatti_telegram").update({ tags }).eq("id", id).eq("owner_id", ADMIN_ID)
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true, tags })
}

// Salva i tag di un contatto (lista completa, sostituisce quelli esistenti).
async function apiAdminCrmTags(body: any) {
  const telegramId = parseInt(body?.telegram_id)
  if (!telegramId) return json({ error: "telegram_id_richiesto" }, 400)
  const raw = Array.isArray(body?.tags) ? body.tags : []
  // Normalizza: stringhe non vuote, max 24 caratteri, senza duplicati, max 12 tag.
  const tags = [...new Set(raw.map((t: any) => String(t || "").trim().slice(0, 24)).filter(Boolean))].slice(0, 12)
  const { error } = await supabase.from("leads").update({ tags }).eq("telegram_id", telegramId)
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true, tags })
}

async function apiAdminCrmDetail(telegramId: number) {
  const { data: lead } = await supabase.from("leads").select("*").eq("telegram_id", telegramId).maybeSingle()
  if (!lead) return json({ error: "not_found" }, 404)

  let sponsor = null
  if (lead.referred_by) {
    const { data: sp } = await supabase.from("leads").select("telegram_id, nome, username").eq("telegram_id", lead.referred_by).maybeSingle()
    if (sp) sponsor = { telegram_id: sp.telegram_id, nome: sp.nome || sp.username || `ID ${sp.telegram_id}` }
  }

  const { data: attivazioni } = await supabase.from("lead_servizi").select("servizio_id, created_at").eq("telegram_id", telegramId)
  const svcIds = (attivazioni ?? []).map((a: any) => a.servizio_id)
  const { data: servizi } = svcIds.length ? await supabase.from("servizi").select("id, nome").in("id", svcIds) : { data: [] }
  const svcMap: Record<number, string> = {}
  for (const s of servizi ?? []) svcMap[(s as any).id] = (s as any).nome

  const { data: progress } = await supabase.from("tutorial_progress").select("servizio_id, ultimo_step, completato").eq("telegram_id", telegramId)
  const { data: sugg } = await supabase.from("suggerimenti").select("nome, stato, created_at").eq("telegram_id", telegramId).order("created_at", { ascending: false })
  const { count: invitati } = await supabase.from("leads").select("telegram_id", { count: "exact", head: true }).eq("referred_by", telegramId)
  const { data: followups } = await supabase.from("followup_log").select("giorno, inviato_at").eq("telegram_id", telegramId).order("giorno")

  const stadi = await calcolaStadi([lead])
  return json({
    lead,
    stadio: stadi[telegramId],
    sponsor,
    business_attivati: (attivazioni ?? []).map((a: any) => ({ nome: svcMap[a.servizio_id] || "?", data: a.created_at })),
    tutorial: (progress ?? []).map((p: any) => ({ servizio_nome: svcMap[p.servizio_id] || `#${p.servizio_id}`, ultimo_step: p.ultimo_step, completato: p.completato })),
    suggerimenti: sugg ?? [],
    invitati_count: invitati ?? 0,
    followups: followups ?? [],
  })
}

async function apiAdminCrmStage(body: any) {
  const telegramId = parseInt(body?.telegram_id)
  const override = body?.override ? String(body.override) : null
  if (!telegramId) return json({ error: "telegram_id_richiesto" }, 400)
  if (override && !STADI_PIPELINE.includes(override)) return json({ error: "stadio_non_valido" }, 400)
  const { error } = await supabase.from("leads").update({ pipeline_override: override }).eq("telegram_id", telegramId)
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
}

async function apiAdminMessaggio(body: any) {
  const telegramId = parseInt(body?.telegram_id)
  const testo = String(body?.testo || "").trim()
  if (!telegramId || !testo) return json({ error: "campi_obbligatori" }, 400)
  const res = await sendMessage(telegramId, testo)
  const data = await res.json().catch(() => ({}))
  if (!data.ok) return json({ error: data.description || "invio_fallito" }, 502)
  await supabase.from("eventi").insert({ telegram_id: telegramId, tipo: "dm_admin", dettaglio: testo.slice(0, 200) })
  return json({ ok: true })
}

// ---------- ADMIN: BROADCAST & TEMPLATE ----------
async function apiAdminTemplatesList() {
  const { data } = await supabase.from("broadcast_templates").select("*").order("created_at", { ascending: false })
  return json({ templates: data ?? [] })
}

async function apiAdminTemplateSave(body: any) {
  const nome = String(body?.nome || "").trim()
  const testo = String(body?.testo || "").trim()
  if (!nome || !testo) return json({ error: "campi_obbligatori" }, 400)
  const { error } = await supabase.from("broadcast_templates").insert({ nome, testo })
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
}

async function apiAdminTemplateDelete(body: any) {
  const { error } = await supabase.from("broadcast_templates").delete().eq("id", body?.id)
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
}

// Risolve i destinatari di un broadcast in base al filtro scelto.
async function risolviDestinatari(filtro: any): Promise<{ telegram_id: number; nome: string }[]> {
  const { data: leads } = await supabase.from("leads").select("telegram_id, nome, username, referred_by, is_cliente, pipeline_override, bot_started").eq("bot_started", true)
  const tutti = (leads ?? []).map((l: any) => ({ ...l, display: l.nome || l.username || `ID ${l.telegram_id}` }))
  const tipo = filtro?.tipo || "tutti"

  let selezionati = tutti
  if (tipo === "stadio") {
    const stadi = await calcolaStadi(tutti)
    selezionati = tutti.filter((l: any) => stadi[l.telegram_id] === filtro.stadio)
  } else if (tipo === "top_sponsor") {
    const conteggio: Record<number, number> = {}
    for (const l of tutti) if (l.referred_by) conteggio[l.referred_by] = (conteggio[l.referred_by] ?? 0) + 1
    const topIds = Object.entries(conteggio).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tid]) => parseInt(tid))
    selezionati = tutti.filter((l: any) => topIds.includes(l.telegram_id))
  } else if (tipo === "no_servizio") {
    const servizioId = parseInt(filtro?.servizio_id) || 0
    const { data: att } = await supabase.from("lead_servizi").select("telegram_id").eq("servizio_id", servizioId)
    const haAttivato = new Set((att ?? []).map((a: any) => a.telegram_id))
    selezionati = tutti.filter((l: any) => !haAttivato.has(l.telegram_id))
  }
  return selezionati.map((l: any) => ({ telegram_id: l.telegram_id, nome: l.display }))
}

async function apiAdminBroadcast(body: any) {
  const testo = String(body?.testo || "").trim()
  const anteprima = !!body?.anteprima
  if (!testo && !anteprima) return json({ error: "testo_richiesto" }, 400)

  const destinatari = await risolviDestinatari(body?.filtro || {})
  if (anteprima) {
    return json({ destinatari_count: destinatari.length, esempi: destinatari.slice(0, 5).map((d) => d.nome) })
  }

  // Bottone sotto la news: se l'admin indica testo + URL usa quello (link esterno),
  // altrimenti resta il bottone di default che apre la Mini App.
  const btnText = String(body?.btn_text || "").trim()
  const btnUrl = String(body?.btn_url || "").trim()
  let markup: any = { inline_keyboard: [[{ text: "Apri Cashly", web_app: { url: WEBAPP_URL + "/app.html?_=" + Date.now() } }]] }
  if (btnText && btnUrl && /^https?:\/\//.test(btnUrl)) {
    markup = { inline_keyboard: [[{ text: btnText.slice(0, 40), url: btnUrl }]] }
  } else if (btnText === "" && btnUrl === "" && body?.senza_bottone) {
    markup = undefined
  }

  let inviati = 0, falliti = 0
  for (const d of destinatari) {
    const personalizzato = testo.replaceAll("{nome}", d.nome)
    const res = await sendMessage(d.telegram_id, personalizzato, markup)
    const data = await res.json().catch(() => ({}))
    if (data.ok) inviati++
    else falliti++
    // Il limite Telegram è ~30 msg/sec: piccola pausa tra un invio e l'altro.
    await new Promise((r) => setTimeout(r, 50))
  }

  await supabase.from("eventi").insert({ telegram_id: ADMIN_ID, tipo: "broadcast", dettaglio: `filtro:${body?.filtro?.tipo || "tutti"} inviati:${inviati} falliti:${falliti}` })
  return json({ ok: true, inviati, falliti })
}

// ---------- FOLLOW-UP AUTOMATICI ----------
// Messaggi Day 1/3/7 per chi non ha ancora attivato nessun business; ogni invio è loggato e mai ripetuto.
function testoFollowup(giorno: number, nome: string): string {
  if (giorno === 1) return `Ciao ${nome}! Ho visto che ti sei iscritto a Cashly. Hai già dato un'occhiata alla Business List? Dentro trovi i business testati, ordinati dai voti della community.`
  if (giorno === 3) return `Ehi ${nome}, c'è qualcosa che non ti è chiaro nei tutorial? Ogni business ha una checklist passo-passo: apri la scheda e segui gli step. Se ti blocchi, scrivimi pure.`
  return `${nome}, ultima chiamata da parte mia: nella Business List ci sono opportunità che la community sta già usando. Bastano 5 minuti per attivare la prima. Poi non ti disturbo più, promesso.`
}

async function cronFollowup() {
  const { data: leads } = await supabase.from("leads").select("telegram_id, nome, username, created_at, primo_start_at, bot_started").eq("bot_started", true)
  const { data: attivazioni } = await supabase.from("lead_servizi").select("telegram_id")
  const haAttivato = new Set((attivazioni ?? []).map((a: any) => a.telegram_id))
  const { data: logs } = await supabase.from("followup_log").select("telegram_id, giorno")
  const giaInviati = new Set((logs ?? []).map((l: any) => `${l.telegram_id}:${l.giorno}`))

  let inviati = 0
  for (const l of leads ?? []) {
    if (l.telegram_id === ADMIN_ID) continue
    const inizio = new Date(l.primo_start_at || l.created_at).getTime()
    const giorni = Math.floor((Date.now() - inizio) / 864e5)
    const applicabili = [1, 3, 7].filter((s) => giorni >= s && !giaInviati.has(`${l.telegram_id}:${s}`))
    if (!applicabili.length) continue

    // Chi ha già attivato un business non riceve nudge: si loggano le soglie come chiuse.
    if (!haAttivato.has(l.telegram_id)) {
      const soglia = Math.max(...applicabili)
      const nome = l.nome || l.username || "ciao"
      await sendMessage(l.telegram_id, testoFollowup(soglia, nome), {
        inline_keyboard: [[{ text: "Apri Cashly", web_app: { url: WEBAPP_URL + "/app.html?_=" + Date.now() } }]],
      })
      inviati++
      await new Promise((r) => setTimeout(r, 50))
    }
    for (const s of applicabili) {
      await supabase.from("followup_log").insert({ telegram_id: l.telegram_id, giorno: s })
    }
  }
  return json({ ok: true, inviati })
}

// ---------- MAIN SERVER ----------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })

  const url = new URL(req.url)
  const parts = url.pathname.split("/").filter(Boolean)
  const i = parts.indexOf("businessup-bot")
  const sub = i >= 0 ? parts.slice(i + 1).join("/") : ""

  try {
    if (sub === "telegram" && req.method === "POST") {
      const secret = req.headers.get("x-telegram-bot-api-secret-token")
      if (secret !== WEBHOOK_SECRET) return json({ error: "unauthorized" }, 401)
      await handleUpdate(await req.json())
      return json({ ok: true })
    }

    // Riconfigura il webhook includendo i click dei bottoni (callback_query), oltre ai messaggi.
    if (sub === "admin/setup-webhook" && req.method === "POST") {
      if (req.headers.get("x-admin-key") !== ADMIN_API_KEY) return json({ error: "unauthorized" }, 401)
      const webhookUrl = `${url.origin}${url.pathname.replace(/\/admin\/setup-webhook$/, "/telegram")}`
      const res = await fetch(`${TG_API}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl, secret_token: WEBHOOK_SECRET, allowed_updates: ["message", "callback_query", "my_chat_member"] }),
      })
      return json({ ok: true, telegram: await res.json(), webhook_url: webhookUrl })
    }

    if (sub === "me" && req.method === "GET") {
      const rawInitData = req.headers.get("x-telegram-init-data") || ""
      const tid = await validateInitData(rawInitData)
      if (!tid) return json({ error: "unauthorized" }, 401)
      return await apiMe(tid, parseInitDataUser(rawInitData))
    }


    if (sub === "waitlist" && req.method === "POST") {
      const tid = await validateInitData(req.headers.get("x-telegram-init-data") || "")
      if (!tid) return json({ error: "unauthorized" }, 401)
      return await apiWaitlist(tid, await req.json())
    }

    if (sub === "disattiva" && req.method === "POST") {
      const tid = await validateInitData(req.headers.get("x-telegram-init-data") || "")
      if (!tid) return json({ error: "unauthorized" }, 401)
      return await apiDisattiva(tid, await req.json())
    }

    if (sub === "anagrafica" && req.method === "POST") {
      const tid = await validateInitData(req.headers.get("x-telegram-init-data") || "")
      if (!tid) return json({ error: "unauthorized" }, 401)
      return await apiAnagrafica(tid, await req.json())
    }

    if (sub === "onboarding" && req.method === "POST") {
      const tid = await validateInitData(req.headers.get("x-telegram-init-data") || "")
      if (!tid) return json({ error: "unauthorized" }, 401)
      return await apiOnboarding(tid, await req.json())
    }

    if (sub === "business-list" && req.method === "GET") {
      // Auth facoltativa: se l'initData è presente e valido, la risposta include anche i voti dell'utente.
      const tid = await validateInitData(req.headers.get("x-telegram-init-data") || "")
      return await apiBusinessList(tid)
    }

    if (sub === "vota" && req.method === "POST") {
      const tid = await validateInitData(req.headers.get("x-telegram-init-data") || "")
      if (!tid) return json({ error: "unauthorized" }, 401)
      return await apiVota(tid, await req.json())
    }

    if (sub === "preferito" && req.method === "POST") {
      const tid = await validateInitData(req.headers.get("x-telegram-init-data") || "")
      if (!tid) return json({ error: "unauthorized" }, 401)
      return await apiPreferito(tid, await req.json())
    }

    if (sub === "servizio" && req.method === "GET") {
      const tid = await validateInitData(req.headers.get("x-telegram-init-data") || "")
      if (!tid) return json({ error: "unauthorized" }, 401)
      const servizioId = parseInt(url.searchParams.get("id") || "0")
      return await apiServizio(tid, servizioId)
    }

    if (sub === "affiliazione" && req.method === "GET") {
      const tid = await validateInitData(req.headers.get("x-telegram-init-data") || "")
      if (!tid) return json({ error: "unauthorized" }, 401)
      return await apiAffiliazione(tid)
    }

    // Conteggio click sul link d'invito (pubblico): la pagina r.html lo chiama prima di aprire il bot.
    if (sub === "click" && req.method === "GET") {
      const code = url.searchParams.get("c") || ""
      if (code) {
        const { data: l } = await supabase.from("leads").select("telegram_id, ref_clicks").eq("ref_code", code).maybeSingle()
        if (l) await supabase.from("leads").update({ ref_clicks: ((l as any).ref_clicks ?? 0) + 1 }).eq("telegram_id", (l as any).telegram_id)
      }
      return json({ ok: true })
    }

    if (sub === "affiliate-link" && req.method === "POST") {
      const tid = await validateInitData(req.headers.get("x-telegram-init-data") || "")
      if (!tid) return json({ error: "unauthorized" }, 401)
      return await apiAffiliateLinkSave(tid, await req.json())
    }

    if (sub === "attiva" && req.method === "POST") {
      const tid = await validateInitData(req.headers.get("x-telegram-init-data") || "")
      if (!tid) return json({ error: "unauthorized" }, 401)
      return await apiAttiva(tid, await req.json())
    }

    if (sub === "step-progress" && req.method === "POST") {
      const tid = await validateInitData(req.headers.get("x-telegram-init-data") || "")
      if (!tid) return json({ error: "unauthorized" }, 401)
      return await apiStepProgressSave(tid, await req.json())
    }

    if (sub === "suggerisci" && req.method === "POST") {
      const tid = await validateInitData(req.headers.get("x-telegram-init-data") || "")
      if (!tid) return json({ error: "unauthorized" }, 401)
      return await apiSuggerisci(tid, await req.json())
    }

    if (sub === "miei-suggerimenti" && req.method === "GET") {
      const tid = await validateInitData(req.headers.get("x-telegram-init-data") || "")
      if (!tid) return json({ error: "unauthorized" }, 401)
      return await apiMieiSuggerimenti(tid)
    }

    if (sub === "pagina" && req.method === "GET") {
      const tid = await validateInitData(req.headers.get("x-telegram-init-data") || "")
      if (!tid) return json({ error: "unauthorized" }, 401)
      return await apiPaginaGet(tid)
    }

    if (sub === "pagina" && req.method === "POST") {
      const tid = await validateInitData(req.headers.get("x-telegram-init-data") || "")
      if (!tid) return json({ error: "unauthorized" }, 401)
      return await apiPaginaSave(tid, await req.json())
    }

    if (sub === "pagina-pubblica" && req.method === "GET") {
      const code = url.searchParams.get("c") || ""
      return await apiPaginaPubblica(code)
    }

    if (sub === "segnala" && req.method === "POST") {
      const tid = await validateInitData(req.headers.get("x-telegram-init-data") || "")
      if (!tid) return json({ error: "unauthorized" }, 401)
      return await apiSegnala(tid, await req.json())
    }

    if (sub === "diventa-partner" && req.method === "POST") {
      const tid = await validateInitData(req.headers.get("x-telegram-init-data") || "")
      if (!tid) return json({ error: "unauthorized" }, 401)
      return await apiDiventaPartner(tid)
    }

    if (sub === "rete-broadcast" && req.method === "POST") {
      const tid = await validateInitData(req.headers.get("x-telegram-init-data") || "")
      if (!tid) return json({ error: "unauthorized" }, 401)
      return await apiReteBroadcast(tid, await req.json())
    }

    if (sub === "cron/followup" && req.method === "POST") {
      const { data: cfg } = await supabase.from("config").select("valore").eq("chiave", "cron_secret").maybeSingle()
      if (!cfg?.valore || req.headers.get("x-cron-key") !== cfg.valore) return json({ error: "unauthorized" }, 401)
      return await cronFollowup()
    }

    if (sub.startsWith("admin/")) {
      const provided = req.headers.get("x-admin-key") || ""
      let adminOk = !!ADMIN_API_KEY && confrontoCostante(provided, ADMIN_API_KEY)
      if (!adminOk) {
        const { data: cfgKey } = await supabase.from("config").select("valore").eq("chiave", "admin_key").maybeSingle()
        adminOk = !!cfgKey?.valore && confrontoCostante(provided, cfgKey.valore)
      }
      if (!adminOk) {
        // Il pannello sta su internet pubblico (hub.cashlypro.com/admin/) e la chiave e'
        // l'unica cosa che lo protegge: chi prova a indovinarla deve lasciare traccia e
        // deve rallentare. Un secondo di attesa rende inutile il tentativo a tappeto e
        // non da' fastidio a chi ha solo sbagliato a incollare.
        await supabase.from("eventi").insert({
          tipo: "admin_accesso_negato",
          dettaglio: sub + " | chiave di " + provided.length + " caratteri",
        }).then(() => {}, () => {})
        await new Promise((r) => setTimeout(r, 1000))
        return json({ error: "unauthorized" }, 401)
      }

      if (sub === "admin/stats" && req.method === "GET") {
        const { count: leads } = await supabase.from("leads").select("*", { count: "exact", head: true })
        const { count: clienti } = await supabase.from("leads").select("*", { count: "exact", head: true }).eq("is_cliente", true)
        return json({ leads, clienti })
      }

      if (sub === "admin/macro-categorie" && req.method === "GET") return await apiAdminMacroCategorieList()
      if (sub === "admin/macro-categorie/save" && req.method === "POST") return await apiAdminMacroCategorieSave(await req.json())
      if (sub === "admin/macro-categorie/delete" && req.method === "POST") return await apiAdminMacroCategorieDelete(await req.json())

      // Chi si e' prenotato per un servizio non ancora attivo, servizio per servizio.
      // Sta QUI dentro perche' la guardia admin (x-admin-key) copre tutto il blocco:
      // fuori sarebbe un endpoint aperto che espone nomi e telegram_id di tutti.
      if (sub === "admin/waitlist" && req.method === "GET") {
      const { data: righe } = await supabase.from("waitlist")
        .select("servizio_id, telegram_id, created_at, avvisato_at")
        .order("created_at", { ascending: false })
      const ids = [...new Set((righe ?? []).map((r: any) => r.telegram_id))]
      const { data: persone } = ids.length
        ? await supabase.from("leads").select("telegram_id, nome, cognome, username, foto_url").in("telegram_id", ids)
        : { data: [] }
      const pMap: Record<number, any> = {}
      for (const p of persone ?? []) pMap[(p as any).telegram_id] = p
      const svIds = [...new Set((righe ?? []).map((r: any) => r.servizio_id))]
      const { data: svs } = svIds.length
        ? await supabase.from("servizi").select("id, nome, stato").in("id", svIds)
        : { data: [] }
      const sMap: Record<number, any> = {}
      for (const sv of svs ?? []) sMap[(sv as any).id] = sv
      return json({
        lista: (righe ?? []).map((r: any) => {
          const p = pMap[r.telegram_id]
          return {
            servizio_id: r.servizio_id,
            servizio_nome: sMap[r.servizio_id]?.nome ?? `ID ${r.servizio_id}`,
            servizio_stato: sMap[r.servizio_id]?.stato ?? "?",
            telegram_id: r.telegram_id,
            nome: [p?.nome, p?.cognome].filter(Boolean).join(" ") || p?.username || `ID ${r.telegram_id}`,
            username: p?.username || "",
            foto_url: p?.foto_url || "",
            in_lista_dal: r.created_at,
            avvisato: !!r.avvisato_at,
          }
        }),
      })
      }

      if (sub === "admin/categorie" && req.method === "GET") return await apiAdminCategorieList()
      if (sub === "admin/categorie/save" && req.method === "POST") return await apiAdminCategorieSave(await req.json())
      if (sub === "admin/categorie/delete" && req.method === "POST") return await apiAdminCategorieDelete(await req.json())

      if (sub === "admin/servizi" && req.method === "GET") return await apiAdminServiziList()
      if (sub === "admin/servizi/save" && req.method === "POST") return await apiAdminServiziSave(await req.json())
      if (sub === "admin/servizi/stato" && req.method === "POST") return await apiAdminServiziStato(await req.json())
      if (sub === "admin/upload" && req.method === "POST") return await apiAdminUpload(await req.json())
      if (sub === "admin/servizi/delete" && req.method === "POST") return await apiAdminServiziDelete(await req.json())

      if (sub === "admin/suggerimenti" && req.method === "GET") return await apiAdminSuggerimentiList()
      if (sub === "admin/suggerimenti/approva" && req.method === "POST") return await apiAdminSuggerimentoApprova(await req.json())
      if (sub === "admin/suggerimenti/rifiuta" && req.method === "POST") return await apiAdminSuggerimentoRifiuta(await req.json())
      if (sub === "admin/suggerimenti/delete" && req.method === "POST") return await apiAdminSuggerimentiDelete(await req.json())

      if (sub === "admin/kpi" && req.method === "GET") return await apiAdminKpi()
      if (sub === "admin/partner-richieste" && req.method === "GET") return await apiAdminPartnerList()
      if (sub === "admin/partner-decidi" && req.method === "POST") return await apiAdminPartnerDecidi(await req.json())
      if (sub === "admin/whitelist" && req.method === "GET") return await apiAdminWhitelistList()
      if (sub === "admin/whitelist/save" && req.method === "POST") return await apiAdminWhitelistSave(await req.json())
      if (sub === "admin/whitelist/delete" && req.method === "POST") return await apiAdminWhitelistDelete(await req.json())
      if (sub === "admin/sponsorboard" && req.method === "GET") return await apiAdminSponsorboard()

      if (sub === "admin/crm" && req.method === "GET") return await apiAdminCrm()
      if (sub === "admin/crm-detail" && req.method === "GET") return await apiAdminCrmDetail(parseInt(url.searchParams.get("id") || "0"))
      if (sub === "admin/crm-stage" && req.method === "POST") return await apiAdminCrmStage(await req.json())
      if (sub === "admin/crm-tags" && req.method === "POST") return await apiAdminCrmTags(await req.json())
      if (sub === "admin/contatti-import" && req.method === "POST") return await apiAdminContattiImport(await req.json())
      if (sub === "admin/contatto-cartelle" && req.method === "POST") return await apiAdminContattoCartelle(await req.json())
      if (sub === "admin/contatto-inbound" && req.method === "POST") return await apiAdminContattoInbound(await req.json())
      if (sub === "admin/broadcast-list" && req.method === "GET") return await apiAdminBroadcastList()
      if (sub === "admin/msg-list" && req.method === "GET") return await apiAdminMsgList()
      if (sub === "admin/msg-annulla" && req.method === "POST") return await apiAdminMsgAnnulla(await req.json())
      if (sub === "admin/contatto-invia" && req.method === "POST") return await apiAdminContattoInvia(await req.json())
      if (sub === "admin/msg-poll" && req.method === "GET") return await apiAdminMsgPoll()
      if (sub === "admin/msg-mark" && req.method === "POST") return await apiAdminMsgMark(await req.json())
      if (sub === "admin/broadcast-create" && req.method === "POST") return await apiAdminBroadcastCreate(await req.json())
      if (sub === "admin/broadcast-status" && req.method === "GET") return await apiAdminBroadcastStatus()
      if (sub === "admin/broadcast-stop" && req.method === "POST") return await apiAdminBroadcastStop(await req.json())
      if (sub === "admin/broadcast-poll" && req.method === "GET") return await apiAdminBroadcastPoll()
      if (sub === "admin/broadcast-mark" && req.method === "POST") return await apiAdminBroadcastMark(await req.json())
      if (sub === "admin/miei-contatti" && req.method === "GET") return await apiAdminMieiContatti()
      if (sub === "admin/miei-contatti-tags" && req.method === "POST") return await apiAdminMieiContattiTags(await req.json())
      if (sub === "admin/messaggio" && req.method === "POST") return await apiAdminMessaggio(await req.json())

      if (sub === "admin/segnalazioni" && req.method === "GET") return await apiAdminSegnalazioniList()
      if (sub === "admin/segnalazioni/risolvi" && req.method === "POST") return await apiAdminSegnalazioneRisolvi(await req.json())

      if (sub === "admin/templates" && req.method === "GET") return await apiAdminTemplatesList()
      if (sub === "admin/templates/save" && req.method === "POST") return await apiAdminTemplateSave(await req.json())
      if (sub === "admin/templates/delete" && req.method === "POST") return await apiAdminTemplateDelete(await req.json())

      if (sub === "admin/broadcast" && req.method === "POST") return await apiAdminBroadcast(await req.json())

      if (sub === "admin/affiliate-links" && req.method === "GET") return await apiAdminAffiliateLinksList()
      if (sub === "admin/affiliate-links/approve" && req.method === "POST") return await apiAdminAffiliateLinkApprove(await req.json())
      if (sub === "admin/affiliate-links/delete" && req.method === "POST") return await apiAdminAffiliateLinkDelete(await req.json())

      // Una rotta admin scritta male cadeva fuori dal blocco e finiva sul 200 "ready"
      // finale: il pannello lo leggeva come successo, chiudeva la finestra e ricaricava
      // come se avesse salvato, mentre non era stato scritto niente.
      return json({ error: "not_found", path: sub }, 404)
    }

    return json({ service: "businessup-bot", status: "ready" })
  } catch (e) {
    console.error("Error:", e)
    return json({ error: String(e) }, 500)
  }
})
