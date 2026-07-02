const { saveLead } = require("../lib/supabase");

async function handleNewChatMembers(ctx) {
  const newMembers = ctx.message.new_chat_members;

  for (const member of newMembers) {
    if (member.is_bot) continue;

    const telegramId = member.id;
    const username = member.username || null;
    const nome = member.first_name || null;

    await saveLead(telegramId, username, nome);

    try {
      const dmText = `Ciao ${nome || ""}. Sono il bot di Business UP.
Ti ho visto nel gruppo — prima di mandarti roba a caso, voglio capire dove sei.

Compila il sondaggio: ${process.env.SONDAGGIO_URL || "https://businessup-sondaggio.netlify.app"}

Ci vogliono 2 minuti. Dopo ti dico cosa fa al caso tuo.`;

      await ctx.api.sendMessage(telegramId, dmText);
    } catch (error) {
      console.error(`Error sending DM to ${telegramId}:`, error);
    }
  }
}

module.exports = { handleNewChatMembers };
