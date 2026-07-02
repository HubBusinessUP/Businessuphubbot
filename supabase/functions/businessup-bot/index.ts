import { serve } from "https://deno.land/std@0.208.0/http/server.ts"

const BOT_TOKEN = Deno.env.get("BOT_TOKEN") || ""
const ADMIN_ID = parseInt(Deno.env.get("ADMIN_ID") || "334179105")
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") || ""

serve(async (req) => {
  if (req.method === "POST") {
    const secret = req.headers.get("x-telegram-bot-api-secret-token")
    if (secret !== WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 })

    const update = await req.json()
    
    if (update.message?.text === "/start") {
      const chatId = update.message.chat.id
      const name = update.message.from.first_name || "User"
      
      // Bot logic here (TODO)
      console.log(`/start from ${name} (${chatId})`)
    }

    return new Response(JSON.stringify({ ok: true }))
  }

  return new Response(JSON.stringify({ service: "businessup-bot", status: "ready" }))
})
