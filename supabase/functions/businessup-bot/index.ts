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

// Quale ref link mostrare per (utente, servizio): quello del referrer se ha un suo link approvato per quel servizio, altrimenti quello principale.
async function resolveRefLink(telegramId: number, servizioId: number): Promise<string | null> {
  const { data: lead } = await supabase.from("leads").select("referred_by").eq("telegram_id", telegramId).maybeSingle()
  if (lead?.referred_by) {
    const { data: al } = await supabase.from("affiliate_link").select("ref_link").eq("telegram_id", lead.referred_by).eq("servizio_id", servizioId).eq("approvato", true).maybeSingle()
    if (al?.ref_link) return al.ref_link
  }
  const { data: sv } = await supabase.from("servizi").select("link_principale").eq("id", servizioId).maybeSingle()
  return sv?.link_principale || null
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
async function handleStart(chatId: number, from: any, payload?: string) {
  let refBy: number | undefined
  if (payload?.startsWith("ref_")) {
    const code = payload.slice(4)
    const { data: referrer } = await supabase.from("leads").select("telegram_id").eq("ref_code", code).maybeSingle()
    if (referrer && referrer.telegram_id !== from.id) refBy = referrer.telegram_id
  }

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

  return json({ lead, sondaggio, rete_count: invitati ?? 0, ripresa })
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
  const refLink = await resolveRefLink(telegramId, servizioId)
  return json({
    servizio,
    gia_interessato: !!interesse,
    ref_link: refLink,
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

  // Servizi attivati da ciascun invitato, in una sola query.
  const invitatiIds = (invitati ?? []).map((i: any) => i.telegram_id)
  const { data: attivazioni } = invitatiIds.length
    ? await supabase.from("lead_servizi").select("telegram_id").in("telegram_id", invitatiIds)
    : { data: [] }
  const serviziCount: Record<number, number> = {}
  for (const a of attivazioni ?? []) serviziCount[(a as any).telegram_id] = (serviziCount[(a as any).telegram_id] ?? 0) + 1

  const membri = (invitati ?? []).map((i: any) => ({
    nome: i.nome || i.username || "Utente",
    username: i.username || "",
    foto_url: i.foto_url || "",
    is_cliente: !!i.is_cliente,
    sondaggio_completato: !!i.sondaggio_completato,
    stato_label: membroStatoLabel(i),
    servizi_count: serviziCount[i.telegram_id] ?? 0,
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

async function apiAffiliateLinkSave(telegramId: number, body: any) {
  const { data: lead } = await supabase.from("leads").select("sondaggio_completato").eq("telegram_id", telegramId).maybeSingle()
  if (!lead?.sondaggio_completato) return json({ error: "non_autorizzato" }, 403)

  const { servizio_id, ref_link } = body
  await supabase.from("affiliate_link").upsert(
    { telegram_id: telegramId, servizio_id, ref_link, approvato: false },
    { onConflict: "telegram_id,servizio_id" },
  )
  await supabase.from("eventi").insert({ telegram_id: telegramId, tipo: "affiliate_link_salvato", dettaglio: `servizio:${servizio_id}` })
  return json({ ok: true })
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
  const { data: lead } = await supabase.from("leads").select("nome, cognome, sondaggio_completato, bio_titolo, bio_testo, bio_foto_url, social_links").eq("telegram_id", telegramId).maybeSingle()
  const { data: mieiLink } = await supabase.from("affiliate_link").select("*").eq("telegram_id", telegramId)
  const { data: servizi } = await supabase.from("servizi").select("id, nome")
  const svcMap: Record<number, string> = {}
  for (const s of servizi ?? []) svcMap[(s as any).id] = (s as any).nome
  const links = (mieiLink ?? []).map((l: any) => ({ ...l, servizio_nome: svcMap[l.servizio_id] || "?" }))
  const refCode = await getOrCreateRefCode(telegramId)
  return json({
    sondaggio_completato: lead?.sondaggio_completato ?? false,
    bio_titolo: lead?.bio_titolo || "",
    bio_testo: lead?.bio_testo || "",
    bio_foto_url: lead?.bio_foto_url || "",
    social_links: lead?.social_links ?? [],
    link_pagina: `${WEBAPP_URL}/u.html?c=${refCode}`,
    miei_link: links,
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
  // Attivare un servizio rende l'utente cliente e gli sblocca la possibilità di proporre un proprio link affiliato
  // (l'approvazione del singolo link resta comunque un controllo admin separato).
  await supabase.from("leads").update({ is_cliente: true }).eq("telegram_id", telegramId)
  const refLink = await resolveRefLink(telegramId, servizio_id)
  await supabase.from("eventi").insert({ telegram_id: telegramId, tipo: "servizio_attivato", dettaglio: `servizio:${servizio_id}` })
  return json({ ok: true, ref_link: refLink })
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

async function apiSuggerisci(telegramId: number, body: any) {
  const nome = String(body?.nome || "").trim()
  if (!nome) return json({ error: "nome_richiesto" }, 400)
  const descrizione = String(body?.descrizione || "").trim()
  const link = String(body?.link || "").trim()

  const { error } = await supabase.from("suggerimenti").insert({ telegram_id: telegramId, nome, descrizione, link })
  if (error) return json({ error: error.message }, 500)

  await supabase.from("eventi").insert({ telegram_id: telegramId, tipo: "suggerimento_inviato", dettaglio: nome })
  await sendMessage(ADMIN_ID, `💡 Nuovo suggerimento per la Business List\n\n${nome}${descrizione ? "\n" + descrizione : ""}${link ? "\n" + link : ""}`)
  return json({ ok: true })
}

async function apiAdminSuggerimentiList() {
  const { data: suggerimenti } = await supabase.from("suggerimenti").select("*").order("created_at", { ascending: false })
  const { data: leads } = await supabase.from("leads").select("telegram_id, nome, username")
  const leadMap: Record<number, any> = {}
  for (const l of leads ?? []) leadMap[(l as any).telegram_id] = l
  const list = (suggerimenti ?? []).map((s: any) => ({
    ...s,
    utente_nome: leadMap[s.telegram_id]?.nome || leadMap[s.telegram_id]?.username || `ID ${s.telegram_id}`,
  }))
  return json({ suggerimenti: list })
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
  const { id, nome, categoria_id, tipo, descrizione, requisiti, costi, split_percent, prezzo, stato, ordine, link_principale, tutorial_steps } = body
  const row = { nome, categoria_id, tipo, descrizione, requisiti, costi, split_percent, prezzo, stato, ordine, link_principale, tutorial_steps: tutorial_steps ?? [] }
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
      if (sub === "admin/suggerimenti/delete" && req.method === "POST") return await apiAdminSuggerimentiDelete(await req.json())

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
