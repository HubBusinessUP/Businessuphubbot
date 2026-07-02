const { updateLeadStage, getLead } = require("../lib/supabase");

function qualificaLead(risposte) {
  let motivo = null;
  let isQualificato = true;

  const capitale = risposte.capitale;
  const esperienza_broker = risposte.esperienza_broker;
  const willingness_to_pay = risposte.willingness_to_pay;

  // Squalifica se capitale < 2000
  if (capitale && !["€2.000-€10.000", "€10.000+"].includes(capitale)) {
    motivo = "capitale_insufficiente";
    isQualificato = false;
  }

  // Squalifica se no esperienza broker
  if (!isQualificato && esperienza_broker === "No mai") {
    motivo = "no_esperienza_broker";
    isQualificato = false;
  }

  // Squalifica se non disposto a pagare
  if (
    !isQualificato &&
    willingness_to_pay === "Solo se gratis"
  ) {
    motivo = "no_budget_mentale";
    isQualificato = false;
  }

  return {
    stage: isQualificato ? "qualificato" : "squalificato",
    motivo,
  };
}

function getMotivoSqualificaMessage(motivo) {
  const messaggi = {
    capitale_insufficiente:
      "Grazie per aver risposto.\nCon meno di €2.000 questi metodi non girano in positivo — te lo dico prima, non dopo.\nQuando sei pronto, sono qui.",
    no_esperienza_broker:
      "Grazie per aver risposto.\nSenza esperienza broker reale, non puoi saltare i passi.\nTorna quando hai operato almeno una volta con soldi veri.",
    no_budget_mentale:
      "Grazie per aver risposto.\nQuesti metodi funzionano solo se sei disposto a investire. Se poi non lo sei, non vale la pena partire.\nQuando cambi idea, sono qui.",
  };

  return messaggi[motivo] || "Grazie. Non sei il profilo che cerchiamo ora, ma rimani nel gruppo.";
}

function getQualificatoMessage() {
  const tutorialUrl = process.env.TUTORIAL_URL || "https://businessup-tutorial.netlify.app";
  return `Profilo confermato.
Hai il capitale, l'esperienza e la testa giusta.

Ecco cosa puoi accedere ora:
🎯 Broker vs Broker - ${tutorialUrl}/bvb.html
📊 Prop vs Broker - ${tutorialUrl}/prop.html
💰 Bonus ADM - ${tutorialUrl}/bonus.html`;
}

async function handleQualificazione(ctx, telegramId, risposte) {
  const qualifica = qualificaLead(risposte);

  await updateLeadStage(telegramId, qualifica.stage, qualifica.motivo);

  try {
    if (qualifica.stage === "qualificato") {
      await ctx.api.sendMessage(telegramId, getQualificatoMessage());
    } else {
      const motivoMsg = getMotivoSqualificaMessage(qualifica.motivo);
      await ctx.api.sendMessage(telegramId, motivoMsg);
    }
  } catch (error) {
    console.error(`Error sending qualification message to ${telegramId}:`, error);
  }
}

module.exports = {
  qualificaLead,
  getMotivoSqualificaMessage,
  getQualificatoMessage,
  handleQualificazione,
};
