const { saveLead, getLead } = require("../lib/supabase");

async function handleStart(ctx) {
  const telegramId = ctx.from.id;
  const username = ctx.from.username || null;
  const nome = ctx.from.first_name || null;

  await saveLead(telegramId, username, nome);

  const welcomeText = `Ciao ${nome || ""}. Sono il bot di Business UP.
Ti ho visto nel gruppo — prima di mandarti roba a caso, voglio capire dove sei.

Compila il sondaggio: ${process.env.SONDAGGIO_URL || "https://businessup-sondaggio.netlify.app"}

Ci vogliono 2 minuti. Dopo ti dico cosa fa al caso tuo.`;

  await ctx.reply(welcomeText);
}

module.exports = { handleStart };
