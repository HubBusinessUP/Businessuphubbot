const { saveSondaggioRisposte, updateLeadStage } = require("../lib/supabase");
const { handleQualificazione } = require("./qualifica");

async function handleSondaggioWebhook(req, res, bot) {
  try {
    const { telegram_id, risposte } = req.body;

    if (!telegram_id) {
      return res.status(400).json({ error: "telegram_id required" });
    }

    // Salva risposte nel DB
    await saveSondaggioRisposte(telegram_id, risposte);

    // Qualifica il lead e invia messaggio
    // Creiamo un context fake per poter usare ctx.api
    const fakeCtx = {
      api: bot.api,
    };

    await handleQualificazione(fakeCtx, telegram_id, risposte);

    res.json({
      success: true,
      message: "Sondaggio registrato, lead qualificato",
    });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = { handleSondaggioWebhook };
