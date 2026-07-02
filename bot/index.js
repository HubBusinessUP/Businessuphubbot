require("dotenv").config();

const { Bot } = require("grammy");
const express = require("express");

const { handleStart } = require("./handlers/start");
const { handleNewChatMembers } = require("./handlers/newMember");
const {
  handleAdminMenu,
  handleAdminKpi,
  handleAdminLista,
  handleBroadcast,
  handleDM,
  handleSetStage,
} = require("./handlers/admin");
const { handleSondaggioWebhook } = require("./handlers/webhook");

const bot = new Bot(process.env.BOT_TOKEN);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ============= BOT HANDLERS =============

// /start command
bot.command("start", handleStart);

// New chat members in group
bot.on("message:new_chat_members", handleNewChatMembers);

// Admin commands
const adminId = parseInt(process.env.ADMIN_TELEGRAM_ID);

bot.command("menu", async (ctx) => {
  if (ctx.from.id !== adminId) {
    await ctx.reply("Non autorizzato.");
    return;
  }
  await handleAdminMenu(ctx);
});

bot.command("lista", async (ctx) => {
  if (ctx.from.id !== adminId) {
    await ctx.reply("Non autorizzato.");
    return;
  }
  await handleAdminKpi(ctx);
});

bot.command("kpi", async (ctx) => {
  if (ctx.from.id !== adminId) {
    await ctx.reply("Non autorizzato.");
    return;
  }
  await handleAdminKpi(ctx);
});

bot.command("send_q", async (ctx) => {
  if (ctx.from.id !== adminId) {
    await ctx.reply("Non autorizzato.");
    return;
  }
  await handleBroadcast(ctx, "qualificato");
});

bot.command("send_s", async (ctx) => {
  if (ctx.from.id !== adminId) {
    await ctx.reply("Non autorizzato.");
    return;
  }
  await handleBroadcast(ctx, "squalificato");
});

bot.command("send_all", async (ctx) => {
  if (ctx.from.id !== adminId) {
    await ctx.reply("Non autorizzato.");
    return;
  }
  await handleBroadcast(ctx, "all");
});

bot.command("dm", async (ctx) => {
  if (ctx.from.id !== adminId) {
    await ctx.reply("Non autorizzato.");
    return;
  }
  await handleDM(ctx);
});

bot.command("set_stage", async (ctx) => {
  if (ctx.from.id !== adminId) {
    await ctx.reply("Non autorizzato.");
    return;
  }
  await handleSetStage(ctx);
});

// Callback queries for inline buttons
bot.on("callback_query", async (ctx) => {
  if (ctx.from.id !== adminId) {
    await ctx.answerCallbackQuery({ text: "Non autorizzato." });
    return;
  }

  const data = ctx.callbackQuery.data;

  if (data === "admin_kpi") {
    await handleAdminKpi(ctx);
    await ctx.answerCallbackQuery();
  } else if (data === "admin_lista") {
    await handleAdminLista(ctx);
    await ctx.answerCallbackQuery();
  } else if (data === "admin_broadcast_q") {
    await ctx.reply("Invia il testo da broadcastare ai qualificati:");
    ctx.session = ctx.session || {};
    ctx.session.broadcast_stage = "qualificato";
    await ctx.answerCallbackQuery();
  } else if (data === "admin_broadcast_s") {
    await ctx.reply("Invia il testo da broadcastare agli squalificati:");
    ctx.session = ctx.session || {};
    ctx.session.broadcast_stage = "squalificato";
    await ctx.answerCallbackQuery();
  } else if (data === "admin_broadcast_all") {
    await ctx.reply("Invia il testo da broadcastare a tutti:");
    ctx.session = ctx.session || {};
    ctx.session.broadcast_stage = "all";
    await ctx.answerCallbackQuery();
  }
});

// ============= EXPRESS ROUTES =============

// Webhook da sondaggio web
app.post("/webhook/sondaggio", async (req, res) => {
  await handleSondaggioWebhook(req, res, bot);
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", bot: "Business UP" });
});

// API: Get stats
app.get("/api/stats", async (req, res) => {
  try {
    const { getStats } = require("./lib/supabase");
    const stats = await getStats();
    res.json(stats);
  } catch (error) {
    console.error("API error:", error);
    res.status(500).json({ error: error.message });
  }
});

// API: Get all leads
app.get("/api/leads", async (req, res) => {
  try {
    const { getAllLeads } = require("./lib/supabase");
    const leads = await getAllLeads();
    res.json(leads);
  } catch (error) {
    console.error("API error:", error);
    res.status(500).json({ error: error.message });
  }
});

// API: Broadcast
app.post("/api/broadcast", async (req, res) => {
  try {
    const { stage, text } = req.body;
    if (!stage || !text) {
      return res.status(400).json({ error: "stage and text required" });
    }

    const { getLeadsByStage, getAllLeads, logBroadcast } = require("./lib/supabase");

    let leads = [];
    if (stage === "all") {
      leads = await getAllLeads();
    } else {
      leads = await getLeadsByStage(stage);
    }

    let inviati = 0;
    let falliti = 0;

    for (const lead of leads) {
      try {
        await bot.api.sendMessage(lead.telegram_id, text);
        inviati++;
      } catch (error) {
        console.error(`Error sending to ${lead.telegram_id}:`, error);
        falliti++;
      }
    }

    await logBroadcast(stage, text, leads.length, inviati, falliti);

    res.json({
      success: true,
      inviati,
      falliti,
      totale: leads.length,
    });
  } catch (error) {
    console.error("Broadcast error:", error);
    res.status(500).json({ error: error.message });
  }
});

// API: Set stage
app.post("/api/set-stage", async (req, res) => {
  try {
    const { telegram_id, stage } = req.body;
    if (!telegram_id || !stage) {
      return res.status(400).json({ error: "telegram_id and stage required" });
    }

    const { updateLeadStage } = require("./lib/supabase");
    const result = await updateLeadStage(telegram_id, stage);

    res.json({ success: true, result });
  } catch (error) {
    console.error("Set stage error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============= SERVER START =============

app.listen(PORT, async () => {
  console.log(`🚀 Business UP Bot running on port ${PORT}`);
  console.log(`📡 Webhook at http://localhost:${PORT}/webhook/sondaggio`);

  try {
    await bot.start();
    console.log("✅ Bot started successfully");
  } catch (error) {
    console.error("❌ Bot start error:", error);
  }
});
