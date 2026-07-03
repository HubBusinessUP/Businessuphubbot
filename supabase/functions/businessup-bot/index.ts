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

// Qualifica: capitale >= 2.000, esperienza broker reale, disposto a investire su di sé
function qualifica(r: Record<string, string>): { stage: string; motivo: string | null } {
  const capOk = r.capitale === "2.000-10.000 euro" || r.capitale === "10.000+ euro"
  const brokerOk = !!r.esperienza_broker && r.esperienza_broker !== "No mai"
  const payOk = !!r.willingness_to_pay && r.willingness_to_pay !== "Solo se gratis"
  if (!capOk) return { stage: "squalificato", motivo: "capitale_insufficiente" }
  if (!brokerOk) return { stage: "squalificato", motivo: "no_esperienza_broker" }
  if (!payOk) return { stage: "squalificato", motivo: "no_budget_mentale" }
  return { stage: "qualificato", motivo: null }
}

// Quale ref link mostrare per (utente, servizio): quello del referrer se affiliato approvato, altrimenti quello principale.
async function resolveRefLink(telegramId: number, servizioId: number): Promise<string | null> {
  const { data: lead } = await supabase.from("leads").select("referred_by").eq("telegram_id", telegramId).maybeSingle()
  if (lead?.referred_by) {
    const { data: referrer } = await supabase.from("leads").select("is_cliente").eq("telegram_id", lead.referred_by).maybeSingle()
    if (referrer?.is_cliente) {
      const { data: al } = await supabase.from("affiliate_link").select("ref_link").eq("telegram_id", lead.referred_by).eq("servizio_id", servizioId).eq("approvato", true).maybeSingle()
      if (al?.ref_link) return al.ref_link
    }
  }
  const { data: sv } = await supabase.from("servizi").select("link_principale").eq("id", servizioId).maybeSingle()
  return sv?.link_principale || null
}

// ---------- BOT ----------
async function handleStart(chatId: number, from: any, payload?: string) {
  let refBy: number | undefined
  if (payload?.startsWith("ref_")) {
    const refId = parseInt(payload.slice(4))
    if (refId && refId !== from.id) refBy = refId
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
    { inline_keyboard: [[{ text: "🚀 Apri Business UP", web_app: { url: WEBAPP_URL + "/index.html?_=" + Date.now() } }]] },
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
async function apiMe(telegramId: number) {
  const { data: lead } = await supabase.from("leads").select("*").eq("telegram_id", telegramId).maybeSingle()
  const { data: sondaggio } = await supabase.from("sondaggio_risposte").select("*").eq("telegram_id", telegramId).maybeSingle()
  const { data: invitati } = await supabase.from("leads").select("telegram_id", { count: "exact", head: true }).eq("referred_by", telegramId)
  return json({ lead, sondaggio, rete_count: invitati ?? 0 })
}

async function apiSondaggioSave(telegramId: number, body: any) {
  const { nome, livello_trading, esperienza_broker, capitale, prodotto_preferito, willingness_to_pay, note_libere } = body
  const row = { telegram_id: telegramId, nome, livello_trading, esperienza_broker, capitale, prodotto_preferito, willingness_to_pay, note_libere }

  const { data: ex } = await supabase.from("sondaggio_risposte").select("id").eq("telegram_id", telegramId).maybeSingle()
  if (ex) await supabase.from("sondaggio_risposte").update(row).eq("id", ex.id)
  else await supabase.from("sondaggio_risposte").insert(row)

  const ql = qualifica(row as Record<string, string>)
  await supabase.from("leads").update({
    sondaggio_completato: true,
    sondaggio_completato_at: new Date().toISOString(),
    pipeline_stage: ql.stage,
    motivo_squalifica: ql.motivo,
    nome: nome ?? undefined,
  }).eq("telegram_id", telegramId)

  await supabase.from("eventi").insert({ telegram_id: telegramId, tipo: "sondaggio_completato", dettaglio: ql.stage })

  return json({ stage: ql.stage, motivo: ql.motivo })
}

async function apiBusinessList() {
  const { data: categorie } = await supabase.from("categorie").select("*").order("ordine")
  const { data: servizi } = await supabase.from("servizi").select("id, nome, categoria_id, tipo, descrizione, requisiti, costi, split_percent, prezzo, stato, ordine").order("ordine")
  const list = (categorie ?? []).map((c: any) => ({ ...c, servizi: (servizi ?? []).filter((s: any) => s.categoria_id === c.id) }))
  return json({ categorie: list })
}

function maskName(nome: string | null, telegramId: number): string {
  const src = (nome || `U${telegramId}`).trim()
  const parts = src.split(/\s+/)
  if (parts.length > 1) return `${parts[0][0]}. ${parts[1][0]}.`.toUpperCase()
  return `${src.slice(0, 1)}.`.toUpperCase()
}

const STAGE_LABEL: Record<string, string> = { nuovo: "Nuovo", qualificato: "Attivo", squalificato: "Non idonea ora", contattato: "In contatto", cliente: "Cliente" }

async function apiAffiliazione(telegramId: number) {
  const { data: lead } = await supabase.from("leads").select("is_cliente, can_insert_reflinks").eq("telegram_id", telegramId).maybeSingle()
  const { data: invitati } = await supabase.from("leads").select("telegram_id, nome, sondaggio_completato, pipeline_stage, created_at").eq("referred_by", telegramId).order("created_at", { ascending: false })
  const { data: mieiLink } = await supabase.from("affiliate_link").select("*").eq("telegram_id", telegramId)
  const { data: pagamenti } = await supabase.from("pagamenti").select("importo").eq("telegram_id", telegramId)
  const guadagni = (pagamenti ?? []).reduce((s: number, p: any) => s + Number(p.importo || 0), 0)

  const membri = (invitati ?? []).map((i: any) => ({
    nome_mascherato: maskName(i.nome, i.telegram_id),
    stato: i.pipeline_stage || "nuovo",
    stato_label: STAGE_LABEL[i.pipeline_stage] || "Nuova",
    sondaggio_completato: i.sondaggio_completato,
  }))

  return json({
    ref_link: `https://t.me/${BOT_USERNAME}?start=ref_${telegramId}`,
    is_cliente: lead?.is_cliente ?? false,
    can_insert_reflinks: lead?.can_insert_reflinks ?? false,
    rete: {
      invitati_count: membri.length,
      attivati_count: membri.filter((m: any) => m.stato === "qualificato" || m.stato === "cliente").length,
      membri,
    },
    guadagni_totali: guadagni,
    miei_reflink: mieiLink ?? [],
  })
}

async function apiAffiliateLinkSave(telegramId: number, body: any) {
  const { data: lead } = await supabase.from("leads").select("can_insert_reflinks").eq("telegram_id", telegramId).maybeSingle()
  if (!lead?.can_insert_reflinks) return json({ error: "non_autorizzato" }, 403)

  const { servizio_id, ref_link } = body
  await supabase.from("affiliate_link").upsert(
    { telegram_id: telegramId, servizio_id, ref_link, approvato: false },
    { onConflict: "telegram_id,servizio_id" },
  )
  await supabase.from("eventi").insert({ telegram_id: telegramId, tipo: "affiliate_link_salvato", dettaglio: `servizio:${servizio_id}` })
  return json({ ok: true })
}

async function apiAttiva(telegramId: number, body: any) {
  const { servizio_id } = body
  await supabase.from("lead_servizi").insert({ telegram_id: telegramId, servizio_id, stato: "interessato" })
  const refLink = await resolveRefLink(telegramId, servizio_id)
  await supabase.from("eventi").insert({ telegram_id: telegramId, tipo: "servizio_attivato", dettaglio: `servizio:${servizio_id}` })
  return json({ ok: true, ref_link: refLink })
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
      const tid = await validateInitData(req.headers.get("x-telegram-init-data") || "")
      if (!tid) return json({ error: "unauthorized" }, 401)
      return await apiMe(tid)
    }

    if (sub === "sondaggio" && req.method === "POST") {
      const tid = await validateInitData(req.headers.get("x-telegram-init-data") || "")
      if (!tid) return json({ error: "unauthorized" }, 401)
      return await apiSondaggioSave(tid, await req.json())
    }

    if (sub === "business-list" && req.method === "GET") {
      return await apiBusinessList()
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

    if (sub === "admin/stats" && req.method === "GET") {
      if (req.headers.get("x-admin-key") !== ADMIN_API_KEY) return json({ error: "unauthorized" }, 401)
      const { count: leads } = await supabase.from("leads").select("*", { count: "exact", head: true })
      const { count: qualificati } = await supabase.from("leads").select("*", { count: "exact", head: true }).eq("pipeline_stage", "qualificato")
      return json({ leads, qualificati })
    }

    return json({ service: "businessup-bot", status: "ready" })
  } catch (e) {
    console.error("Error:", e)
    return json({ error: String(e) }, 500)
  }
})
