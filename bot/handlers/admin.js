const {
  getStats,
  getLeadsByStage,
  getAllLeads,
  updateLeadStage,
  logBroadcast,
} = require("../lib/supabase");

async function handleAdminMenu(ctx) {
  const adminId = parseInt(process.env.ADMIN_TELEGRAM_ID);
  if (ctx.from.id !== adminId) {
    await ctx.reply("Non autorizzato.");
    return;
  }

  const keyboard = {
    inline_keyboard: [
      [{ text: "📊 KPI", callback_data: "admin_kpi" }],
      [{ text: "📋 Lista Lead", callback_data: "admin_lista" }],
      [{ text: "📤 Broadcast Qualificati", callback_data: "admin_broadcast_q" }],
      [{ text: "📤 Broadcast Squalificati", callback_data: "admin_broadcast_s" }],
      [{ text: "📤 Broadcast Tutti", callback_data: "admin_broadcast_all" }],
    ],
  };

  await ctx.reply("Pannello Admin Business UP", { reply_markup: keyboard });
}

async function handleAdminKpi(ctx) {
  const adminId = parseInt(process.env.ADMIN_TELEGRAM_ID);
  if (ctx.from.id !== adminId) {
    await ctx.reply("Non autorizzato.");
    return;
  }

  const stats = await getStats();

  const kpiText = `📊 KPI Business UP

Totale lead: ${stats.totale}
✅ Qualificati: ${stats.qualificati}
❌ Squalificati: ${stats.squalificati}
🎯 Clienti: ${stats.clienti}
🆕 Nuovi: ${stats.nuovi}

Tasso qualifica: ${stats.tassoQualifica}%`;

  await ctx.reply(kpiText);
}

async function handleAdminLista(ctx) {
  const adminId = parseInt(process.env.ADMIN_TELEGRAM_ID);
  if (ctx.from.id !== adminId) {
    await ctx.reply("Non autorizzato.");
    return;
  }

  const allLeads = await getAllLeads();

  if (allLeads.length === 0) {
    await ctx.reply("Nessun lead nel database.");
    return;
  }

  const stageEmoji = {
    nuovo: "🆕",
    qualificato: "✅",
    squalificato: "❌",
    contattato: "📞",
    cliente: "🎯",
  };

  let listaText = "📋 Lista Lead\n\n";
  allLeads.slice(0, 20).forEach((lead) => {
    const emoji = stageEmoji[lead.pipeline_stage] || "❓";
    listaText += `${emoji} @${lead.username || lead.telegram_id} - ${lead.nome || "N/A"}\n`;
  });

  if (allLeads.length > 20) {
    listaText += `\n... e ${allLeads.length - 20} altri`;
  }

  await ctx.reply(listaText);
}

async function handleBroadcast(ctx, stage) {
  const adminId = parseInt(process.env.ADMIN_TELEGRAM_ID);
  if (ctx.from.id !== adminId) {
    await ctx.reply("Non autorizzato.");
    return;
  }

  const args = ctx.message.text.split(" ").slice(1).join(" ");

  if (!args) {
    await ctx.reply(
      `Uso: /send_${stage === "qualificato" ? "q" : stage === "squalificato" ? "s" : "all"} [testo]`
    );
    return;
  }

  let leads = [];
  if (stage === "all") {
    leads = await getAllLeads();
  } else {
    leads = await getLeadsByStage(stage);
  }

  if (leads.length === 0) {
    await ctx.reply(`Nessun lead con stage: ${stage}`);
    return;
  }

  let inviati = 0;
  let falliti = 0;

  for (const lead of leads) {
    try {
      await ctx.api.sendMessage(lead.telegram_id, args);
      inviati++;
    } catch (error) {
      console.error(`Error sending to ${lead.telegram_id}:`, error);
      falliti++;
    }
  }

  await logBroadcast(
    stage,
    args,
    leads.length,
    inviati,
    falliti
  );

  await ctx.reply(`✅ Broadcast completato: ${inviati} inviati, ${falliti} falliti`);
}

async function handleDM(ctx) {
  const adminId = parseInt(process.env.ADMIN_TELEGRAM_ID);
  if (ctx.from.id !== adminId) {
    await ctx.reply("Non autorizzato.");
    return;
  }

  const args = ctx.message.text.split(" ");
  if (args.length < 3) {
    await ctx.reply("Uso: /dm @username [testo]");
    return;
  }

  const username = args[1].replace("@", "");
  const testo = args.slice(2).join(" ");

  const allLeads = await getAllLeads();
  const lead = allLeads.find((l) => l.username === username);

  if (!lead) {
    await ctx.reply(`Lead @${username} non trovato`);
    return;
  }

  try {
    await ctx.api.sendMessage(lead.telegram_id, testo);
    await ctx.reply(`✅ Messaggio inviato a @${username}`);
  } catch (error) {
    await ctx.reply(`❌ Errore: ${error.message}`);
  }
}

async function handleSetStage(ctx) {
  const adminId = parseInt(process.env.ADMIN_TELEGRAM_ID);
  if (ctx.from.id !== adminId) {
    await ctx.reply("Non autorizzato.");
    return;
  }

  const args = ctx.message.text.split(" ");
  if (args.length < 3) {
    await ctx.reply("Uso: /set_stage @username [stage]");
    return;
  }

  const username = args[1].replace("@", "");
  const newStage = args[2];

  const validStages = ["nuovo", "qualificato", "squalificato", "contattato", "cliente"];
  if (!validStages.includes(newStage)) {
    await ctx.reply(`Stage non valido. Usa: ${validStages.join(", ")}`);
    return;
  }

  const allLeads = await getAllLeads();
  const lead = allLeads.find((l) => l.username === username);

  if (!lead) {
    await ctx.reply(`Lead @${username} non trovato`);
    return;
  }

  await updateLeadStage(lead.telegram_id, newStage);
  await ctx.reply(`✅ Stage di @${username} cambiato a: ${newStage}`);
}

module.exports = {
  handleAdminMenu,
  handleAdminKpi,
  handleAdminLista,
  handleBroadcast,
  handleDM,
  handleSetStage,
};
