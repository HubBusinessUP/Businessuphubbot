import { serve } from "https://deno.land/std@0.208.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"

const BOT_TOKEN = Deno.env.get("BOT_TOKEN") || ""
const ADMIN_ID = parseInt(Deno.env.get("ADMIN_ID") || "334179105")
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") || ""
const ADMIN_API_KEY = Deno.env.get("ADMIN_API_KEY") || ""
const WEBAPP_URL = "https://hubbusinessup.github.io/Businessuphubbot"
const BOT_USERNAME = "hubbusinessup_bot"

const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
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

async function sendMessage(chatId: number, text: string, markup?: any) {
  const body: any = { chat_id: chatId, text }
  if (markup) body.reply_markup = markup
  return fetch(`${TG_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

// Al raggiungimento della soglia di invitati lo sponsor diventa Partner in automatico e viene avvisato.
async function verificaSbloccoPartner(sponsorId: number) {
  const { data: sponsor } = await supabase.from("leads").select("is_partner").eq("telegram_id", sponsorId).maybeSingle()
  if (!sponsor || sponsor.is_partner) return
  const { count } = await supabase.from("leads").select("telegram_id", { count: "exact", head: true }).eq("referred_by", sponsorId).eq("bot_started", true)
  if ((count ?? 0) < PARTNER_SOGLIA) return
  await supabase.from("leads").update({ is_partner: true }).eq("telegram_id", sponsorId)
  await sendMessage(
    sponsorId,
    `🎉 Complimenti, ora sei Partner!\n\nHai portato ${count} iscritti nel bot. Da adesso puoi inserire i tuoi link referral sui business: i tuoi invitati vedranno i TUOI link nei tutorial.\n\nVai nel profilo → La mia pagina → I miei link.`,
    { inline_keyboard: [[{ text: "Inserisci i miei link", web_app: { url: WEBAPP_URL + "/mia-pagina.html?_=" + Date.now() } }]] },
  )
}

async function handleStart(chatId: number, from: any, payload?: string) {
  let refBy: number | undefined
  if (payload?.startsWith("ref_")) {
    const code = payload.slice(4)
    const { data: referrer } = await supabase.from("leads").select("telegram_id").eq("ref_code", code).maybeSingle()
    if (referrer && referrer.telegram_id !== from.id) refBy = referrer.telegram_id
  }
  // Chi entra senza link viene assegnato al Sistema (Founder): il legame sponsor è a vita e non cambia mai.
  if (!refBy && from.id !== ADMIN_ID) refBy = ADMIN_ID

  const { data: existing } = await supabase.from("leads").select("referred_by, start_count").eq("telegram_id", from.id).maybeSingle()

  await supabase.from("leads").upsert({
    telegram_id: from.id,
    username: from.username ?? null,
    nome: from.first_name ?? null,
    bot_started: true,
    start_count: (existing?.start_count ?? 0) + 1,
    primo_start_at: existing ? undefined : new Date().toISOString(),
    ultimo_messaggio: new Date().toISOString(),
    referred_by: existing?.referred_by ?? refBy ?? null,
  }, { onConflict: "telegram_id" })

  await supabase.from("eventi").insert({ telegram_id: from.id, tipo: "start", dettaglio: refBy ? `ref:${refBy}` : null })

  const sponsorFinale = existing?.referred_by ?? refBy
  if (!existing && sponsorFinale && sponsorFinale !== ADMIN_ID) {
    verificaSbloccoPartner(sponsorFinale).catch((e) => console.error("sblocco partner:", e))
  }

  await sendMessage(
    chatId,
    `Ciao ${from.first_name || ""}! 👋\n\nBenvenuto in Business UP.\n\nUsa il bottone Menu qui sotto (accanto a dove scrivi) per aprire l'app.`,
    { inline_keyboard: [[{ text: "🚀 Apri Business UP", web_app: { url: WEBAPP_URL + "/dashboard.html?_=" + Date.now() } }]] },
  )
}

async function handleUpdate(u: any) {
  if (!u.message?.text) return
  const from = u.message.from
  const chatId = u.message.chat.id
  const text = u.message.text.trim()

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
      foto_url: tgUser.photo_url ?? null,
    }).eq("telegram_id", telegramId)
  }
  const { data: lead } = await supabase.from("leads").select("*").eq("telegram_id", telegramId).maybeSingle()
  const { data: sondaggio } = await supabase.from("sondaggio_risposte").select("*").eq("telegram_id", telegramId).maybeSingle()
  const { count: invitati } = await supabase.from("leads").select("telegram_id", { count: "exact", head: true }).eq("referred_by", telegramId)

  // Tutorial iniziato ma non completato più recente, per la card "Riprendi da dove eri".
  let ripresa = null
  const { data: progress } = await supabase.from("tutorial_progress")
    .select("servizio_id, ultimo_step")
    .eq("telegram_id", telegramId).eq("completato", false).gt("ultimo_step", 0)
    .order("updated_at", { ascending: false }).limit(1).maybeSingle()
  if (progress) {
    const { data: sv } = await supabase.from("servizi").select("nome, tutorial_steps").eq("id", progress.servizio_id).maybeSingle()
    if (sv) {
      const totale = Array.isArray(sv.tutorial_steps) && sv.tutorial_steps.length ? sv.tutorial_steps.length : 4
      ripresa = { servizio_id: progress.servizio_id, servizio_nome: sv.nome, ultimo_step: progress.ultimo_step, totale_step: totale }
    }
  }

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
  const { data: attivazioni } = await supabase.from("lead_servizi").select("servizio_id, stato, created_at").eq("telegram_id", telegramId).order("created_at", { ascending: false })
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
    })
  }

  return json({ lead, sondaggio, rete_count: invitati ?? 0, ripresa, suggeriti_count: suggeriti ?? 0, approvati_count: approvati ?? 0, sponsor, prodotti_attivi: prodottiAttivi, is_partner: !!lead?.is_partner, partner_richiesto: !!lead?.partner_richiesto, partner_soglia: PARTNER_SOGLIA })
}

async function apiSondaggioSave(telegramId: number, body: any) {
  const { nome, cognome, email, telefono, citta, livello_trading, esperienza_broker, capitale, prodotto_preferito, willingness_to_pay, note_libere, disclaimer_accettato } = body
  if (!disclaimer_accettato) return json({ error: "disclaimer_richiesto" }, 400)

  const row = { telegram_id: telegramId, nome, cognome, email, telefono, citta, livello_trading, esperienza_broker, capitale, prodotto_preferito, willingness_to_pay, note_libere, disclaimer_accettato: true }

  const { data: ex } = await supabase.from("sondaggio_risposte").select("id").eq("telegram_id", telegramId).maybeSingle()
  const saveResult = ex
    ? await supabase.from("sondaggio_risposte").update(row).eq("id", ex.id)
    : await supabase.from("sondaggio_risposte").insert(row)
  if (saveResult.error) {
    console.error("sondaggio_risposte save failed:", saveResult.error)
    return json({ error: "save_failed", detail: saveResult.error.message }, 500)
  }

  const leadUpdate = await supabase.from("leads").update({
    sondaggio_completato: true,
    sondaggio_completato_at: new Date().toISOString(),
    nome: nome ?? undefined,
    cognome: cognome ?? undefined,
  }).eq("telegram_id", telegramId)
  if (leadUpdate.error) {
    console.error("leads update failed:", leadUpdate.error)
    return json({ error: "save_failed", detail: leadUpdate.error.message }, 500)
  }

  await supabase.from("eventi").insert({ telegram_id: telegramId, tipo: "sondaggio_completato" })

  return json({ ok: true })
}

async function apiBusinessList(telegramId?: number | null) {
  const { data: macroCategorie } = await supabase.from("macro_categorie").select("*").order("ordine")
  const { data: categorie } = await supabase.from("categorie").select("*").order("ordine")
  const { data: servizi } = await supabase.from("servizi").select("id, nome, categoria_id, tipo, descrizione, requisiti, costi, split_percent, prezzo, stato, ordine, created_at").order("created_at", { ascending: false })

  // Voti per servizio: la posizione in classifica è determinata dal numero di voti.
  const { data: voti } = await supabase.from("voti").select("servizio_id, telegram_id")
  const votiCount: Record<number, number> = {}
  const mieiVoti: number[] = []
  for (const v of voti ?? []) {
    votiCount[(v as any).servizio_id] = (votiCount[(v as any).servizio_id] ?? 0) + 1
    if (telegramId && (v as any).telegram_id === telegramId) mieiVoti.push((v as any).servizio_id)
  }
  const serviziConVoti = (servizi ?? [])
    .map((s: any) => ({ ...s, voti: votiCount[s.id] ?? 0 }))
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

async function apiServizio(telegramId: number, servizioId: number) {
  const { data: servizio } = await supabase.from("servizi").select("*").eq("id", servizioId).maybeSingle()
  if (!servizio) return json({ error: "not_found" }, 404)
  const { data: lead } = await supabase.from("leads").select("sondaggio_completato, is_cliente").eq("telegram_id", telegramId).maybeSingle()
  const { data: interesse } = await supabase.from("lead_servizi").select("id").eq("telegram_id", telegramId).eq("servizio_id", servizioId).maybeSingle()
  const { data: mioLink } = await supabase.from("affiliate_link").select("ref_link, approvato").eq("telegram_id", telegramId).eq("servizio_id", servizioId).maybeSingle()
  const { data: progress } = await supabase.from("tutorial_progress").select("ultimo_step, completato").eq("telegram_id", telegramId).eq("servizio_id", servizioId).maybeSingle()
  const refInfo = await resolveRefLinkConFonte(telegramId, servizioId)
  return json({
    servizio,
    gia_interessato: !!interesse,
    ref_link: refInfo.link,
    ref_fonte: refInfo.fonte,
    sondaggio_completato: !!lead?.sondaggio_completato,
    is_cliente: !!lead?.is_cliente,
    mio_link: mioLink || null,
    step_progress: { ultimo_step: progress?.ultimo_step ?? 0, completato: !!progress?.completato },
  })
}

// Etichetta di stato di un invitato dal punto di vista dello sponsor, basata solo su segnali reali (non su qualifica capitale).
function membroStatoLabel(i: { is_cliente: boolean; sondaggio_completato: boolean }): string {
  if (i.is_cliente) return "Cliente attivo"
  if (i.sondaggio_completato) return "Anagrafica completata"
  return "Iscritto"
}

async function apiAffiliazione(telegramId: number) {
  const { data: lead } = await supabase.from("leads").select("is_cliente").eq("telegram_id", telegramId).maybeSingle()
  const { data: invitati } = await supabase.from("leads").select("telegram_id, nome, username, foto_url, sondaggio_completato, is_cliente, created_at").eq("referred_by", telegramId).order("created_at", { ascending: false })
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
    nome: i.nome || i.username || "Utente",
    username: i.username || "",
    foto_url: i.foto_url || "",
    is_cliente: !!i.is_cliente,
    sondaggio_completato: !!i.sondaggio_completato,
    stato_label: membroStatoLabel(i),
    servizi_count: serviziCount[i.telegram_id] ?? 0,
    business_approvati: approvatiCount[i.telegram_id] ?? 0,
  }))

  return json({
    ref_link: `https://t.me/${BOT_USERNAME}?start=ref_${refCode}`,
    is_cliente: lead?.is_cliente ?? false,
    rete: {
      invitati_count: membri.length,
      attivati_count: membri.filter((m: any) => m.is_cliente).length,
      membri,
    },
    guadagni_totali: guadagni,
    miei_reflink: mieiLink ?? [],
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

  const { data: wl } = await supabase.from("domini_whitelist").select("id").eq("dominio", dominio).maybeSingle()
  const autoApprovato = !!wl

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
  const { data: lead } = await supabase.from("leads").select("nome, cognome, sondaggio_completato, is_partner, bio_titolo, bio_testo, bio_foto_url, social_links").eq("telegram_id", telegramId).maybeSingle()
  const { data: mieiLink } = await supabase.from("affiliate_link").select("*").eq("telegram_id", telegramId)
  const { data: servizi } = await supabase.from("servizi").select("id, nome").order("nome")
  const svcMap: Record<number, string> = {}
  for (const s of servizi ?? []) svcMap[(s as any).id] = (s as any).nome
  const links = (mieiLink ?? []).map((l: any) => ({ ...l, servizio_nome: svcMap[l.servizio_id] || "?" }))
  const refCode = await getOrCreateRefCode(telegramId)
  return json({
    sondaggio_completato: lead?.sondaggio_completato ?? false,
    is_partner: !!lead?.is_partner,
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

  const { bio_titolo, bio_testo, bio_foto_url, social_links } = body
  const { error } = await supabase.from("leads").update({
    bio_titolo, bio_testo, bio_foto_url,
    social_links: sanitizeSocialLinks(social_links),
  }).eq("telegram_id", telegramId)
  if (error) {
    console.error("pagina save failed:", error)
    return json({ error: "save_failed", detail: error.message }, 500)
  }
  return json({ ok: true })
}

async function apiPaginaPubblica(code: string) {
  const { data: lead } = await supabase.from("leads").select("telegram_id, nome, username, sondaggio_completato, bio_titolo, bio_testo, bio_foto_url, social_links").eq("ref_code", code).maybeSingle()
  if (!lead || !lead.sondaggio_completato) return json({ error: "not_found" }, 404)

  const { data: links } = await supabase.from("affiliate_link").select("servizio_id, ref_link").eq("telegram_id", lead.telegram_id).eq("approvato", true)
  const servizioIds = (links ?? []).map((l: any) => l.servizio_id)
  const { data: servizi } = servizioIds.length
    ? await supabase.from("servizi").select("id, nome, descrizione").in("id", servizioIds)
    : { data: [] }
  const svcMap: Record<number, any> = {}
  for (const s of servizi ?? []) svcMap[(s as any).id] = s

  return json({
    nome: lead.nome || "Utente",
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
  const { data: lead } = await supabase.from("leads").select("sondaggio_completato").eq("telegram_id", telegramId).maybeSingle()
  if (!lead?.sondaggio_completato) return json({ error: "anagrafica_richiesta" }, 403)

  const { servizio_id } = body
  await supabase.from("lead_servizi").insert({ telegram_id: telegramId, servizio_id, stato: "interessato" })
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
async function apiStepProgressSave(telegramId: number, body: any) {
  const { servizio_id, step_index, is_last } = body
  const { data: existing } = await supabase.from("tutorial_progress").select("id, ultimo_step").eq("telegram_id", telegramId).eq("servizio_id", servizio_id).maybeSingle()
  const attuale = existing?.ultimo_step ?? 0
  if (step_index !== attuale) return json({ error: "step_non_in_sequenza" }, 409)

  const row = { telegram_id: telegramId, servizio_id, ultimo_step: attuale + 1, completato: !!is_last, updated_at: new Date().toISOString() }
  const { error } = existing
    ? await supabase.from("tutorial_progress").update(row).eq("id", existing.id)
    : await supabase.from("tutorial_progress").insert(row)
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true, ultimo_step: row.ultimo_step, completato: row.completato })
}

// Candidatura moderata: tutti i campi obbligatori, utenti bloccati esclusi, ref link accettato solo da profili verificati.
async function apiSuggerisci(telegramId: number, body: any) {
  const { data: lead } = await supabase.from("leads").select("sondaggio_completato, sugg_bloccato").eq("telegram_id", telegramId).maybeSingle()
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

  await sendMessage(sug.telegram_id, `✅ La tua candidatura "${sug.nome}" è stata approvata!\n\nIl business è ora nella Business List.${reward ? "\n🎁 Come premio per la segnalazione di qualità, il tuo link affiliato è stato attivato su questo business." : ""}`)
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

  await sendMessage(sug.telegram_id, `❌ La tua candidatura "${sug.nome}" non è stata approvata.\n\nMotivo: ${testoCausale}${blocca ? "\n\n⚠️ La funzione suggerimenti è stata disattivata per il tuo profilo." : ""}`)
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
  const { error } = await supabase.from("categorie").delete().eq("id", id)
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
}

async function apiAdminServiziList() {
  const { data } = await supabase.from("servizi").select("*").order("ordine")
  return json({ servizi: data ?? [] })
}

async function apiAdminServiziSave(body: any) {
  const { id, nome, categoria_id, tipo, descrizione, requisiti, costi, split_percent, prezzo, stato, ordine, link_principale, tutorial_steps, tempo_stimato, difficolta } = body
  const row = { nome, categoria_id, tipo, descrizione, requisiti, costi, split_percent, prezzo, stato, ordine, link_principale, tutorial_steps: tutorial_steps ?? [], tempo_stimato, difficolta }
  if (id) {
    const { error } = await supabase.from("servizi").update(row).eq("id", id)
    if (error) return json({ error: error.message }, 500)
  } else {
    const { error } = await supabase.from("servizi").insert(row)
    if (error) return json({ error: error.message }, 500)
    notificaNuovoServizio(nome, categoria_id).catch((e) => console.error("notifica nuovo servizio:", e))
  }
  return json({ ok: true })
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
    await sendMessage(
      tid,
      `🆕 Nuovo business nella categoria ${cat?.nome || "che segui"}!\n\n${nomeServizio} è appena arrivato nella Business List.`,
      { inline_keyboard: [[{ text: "Guardalo ora", web_app: { url: WEBAPP_URL + "/dashboard.html?_=" + Date.now() } }]] },
    )
  }
}

async function apiAdminServiziDelete(body: any) {
  const { id } = body
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
  const { data: link } = await supabase.from("affiliate_link").select("servizio_id, ref_link").eq("id", id).maybeSingle()
  if (!link) return json({ error: "not_found" }, 404)

  const { error } = await supabase.from("affiliate_link").update({ approvato: true }).eq("id", id)
  if (error) return json({ error: error.message }, 500)

  // Se il servizio non ha ancora un link di default, questo diventa il link base per tutti finché l'admin non ne imposta uno.
  const { data: sv } = await supabase.from("servizi").select("link_principale").eq("id", link.servizio_id).maybeSingle()
  if (sv && !sv.link_principale) {
    await supabase.from("servizi").update({ link_principale: link.ref_link }).eq("id", link.servizio_id)
  }

  return json({ ok: true })
}

async function apiAdminAffiliateLinkDelete(body: any) {
  const { id } = body
  const { error } = await supabase.from("affiliate_link").delete().eq("id", id)
  if (error) return json({ error: error.message }, 500)
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
    await sendMessage(telegramId, `🎉 La tua richiesta è stata approvata: ora sei Partner!\n\nPuoi inserire i tuoi link referral sui business: i tuoi invitati vedranno i TUOI link nei tutorial.`, {
      inline_keyboard: [[{ text: "Inserisci i miei link", web_app: { url: WEBAPP_URL + "/mia-pagina.html?_=" + Date.now() } }]],
    })
  } else {
    await sendMessage(telegramId, `La tua richiesta Partner non è stata approvata per ora.\n\nPorta ${PARTNER_SOGLIA} iscritti con il tuo link invito e lo status si sblocca in automatico.`)
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
  const { data: leads } = await supabase.from("leads").select("telegram_id, nome, cognome, username, foto_url, referred_by, is_cliente, sondaggio_completato, pipeline_override, created_at").order("created_at", { ascending: false })
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
    iscritto_il: l.created_at,
  }))
  return json({ contatti })
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

  let inviati = 0, falliti = 0
  for (const d of destinatari) {
    const personalizzato = testo.replaceAll("{nome}", d.nome)
    const res = await sendMessage(d.telegram_id, personalizzato, {
      inline_keyboard: [[{ text: "Apri Business UP", web_app: { url: WEBAPP_URL + "/dashboard.html?_=" + Date.now() } }]],
    })
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
  if (giorno === 1) return `Ciao ${nome}! Ho visto che ti sei iscritto a Business UP. Hai già dato un'occhiata alla Business List? Dentro trovi i business testati, ordinati dai voti della community.`
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
        inline_keyboard: [[{ text: "Apri Business UP", web_app: { url: WEBAPP_URL + "/dashboard.html?_=" + Date.now() } }]],
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

    if (sub === "me" && req.method === "GET") {
      const rawInitData = req.headers.get("x-telegram-init-data") || ""
      const tid = await validateInitData(rawInitData)
      if (!tid) return json({ error: "unauthorized" }, 401)
      return await apiMe(tid, parseInitDataUser(rawInitData))
    }

    if (sub === "sondaggio" && req.method === "POST") {
      const tid = await validateInitData(req.headers.get("x-telegram-init-data") || "")
      if (!tid) return json({ error: "unauthorized" }, 401)
      return await apiSondaggioSave(tid, await req.json())
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
      if (req.headers.get("x-admin-key") !== ADMIN_API_KEY) return json({ error: "unauthorized" }, 401)

      if (sub === "admin/stats" && req.method === "GET") {
        const { count: leads } = await supabase.from("leads").select("*", { count: "exact", head: true })
        const { count: clienti } = await supabase.from("leads").select("*", { count: "exact", head: true }).eq("is_cliente", true)
        return json({ leads, clienti })
      }

      if (sub === "admin/macro-categorie" && req.method === "GET") return await apiAdminMacroCategorieList()
      if (sub === "admin/macro-categorie/save" && req.method === "POST") return await apiAdminMacroCategorieSave(await req.json())
      if (sub === "admin/macro-categorie/delete" && req.method === "POST") return await apiAdminMacroCategorieDelete(await req.json())

      if (sub === "admin/categorie" && req.method === "GET") return await apiAdminCategorieList()
      if (sub === "admin/categorie/save" && req.method === "POST") return await apiAdminCategorieSave(await req.json())
      if (sub === "admin/categorie/delete" && req.method === "POST") return await apiAdminCategorieDelete(await req.json())

      if (sub === "admin/servizi" && req.method === "GET") return await apiAdminServiziList()
      if (sub === "admin/servizi/save" && req.method === "POST") return await apiAdminServiziSave(await req.json())
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
    }

    return json({ service: "businessup-bot", status: "ready" })
  } catch (e) {
    console.error("Error:", e)
    return json({ error: String(e) }, 500)
  }
})
