import { serve } from "https://deno.land/std@0.208.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"

const BOT_TOKEN = Deno.env.get("BOT_TOKEN") || ""
const ADMIN_ID = parseInt(Deno.env.get("ADMIN_ID") || "334179105")
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") || ""
const ADMIN_API_KEY = Deno.env.get("ADMIN_API_KEY") || ""

const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { db: { schema: "businessup" }, auth: { persistSession: false } },
)

async function sendMessage(chatId: number, text: string, markup?: any) {
  const body: any = { chat_id: chatId, text }
  if (markup) body.reply_markup = markup
  return fetch(`${TG_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function handleStart(chatId: number, from: any) {
  await supabase.from("leads").upsert({
    telegram_id: from.id,
    username: from.username ?? null,
    nome: from.first_name ?? null,
    bot_started: true,
    primo_start_at: new Date().toISOString(),
  }, { onConflict: "telegram_id" })

  await supabase.from("eventi").insert({ telegram_id: from.id, tipo: "start" })

  await sendMessage(
    chatId,
    `Ciao ${from.first_name || ""}! 👋\n\nBenvenuto in Business UP.\n\nInfrastruttura pronta — bot e Mini App in arrivo.`,
  )
}

serve(async (req) => {
  const url = new URL(req.url)

  if (req.method === "POST" && url.pathname.endsWith("/telegram")) {
    const secret = req.headers.get("x-telegram-bot-api-secret-token")
    if (secret !== WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 })

    const update = await req.json()

    if (update.message?.text === "/start") {
      await handleStart(update.message.chat.id, update.message.from)
    }

    return new Response(JSON.stringify({ ok: true }))
  }

  return new Response(JSON.stringify({ service: "businessup-bot", status: "ready" }))
})
