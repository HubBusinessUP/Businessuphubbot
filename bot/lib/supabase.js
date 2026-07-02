const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function saveLead(telegramId, username, nome) {
  const { data, error } = await supabase
    .from("leads")
    .upsert(
      {
        telegram_id: telegramId,
        username: username || null,
        nome: nome || null,
        pipeline_stage: "nuovo",
        bot_started: true,
        ultimo_messaggio: new Date().toISOString(),
      },
      { onConflict: "telegram_id" }
    )
    .select();

  if (error) console.error("Error saving lead:", error);
  return data;
}

async function getLead(telegramId) {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("telegram_id", telegramId)
    .single();

  if (error && error.code !== "PGRST116") console.error("Error getting lead:", error);
  return data;
}

async function updateLeadStage(telegramId, stage, motivo = null) {
  const { data, error } = await supabase
    .from("leads")
    .update({
      pipeline_stage: stage,
      motivo_squalifica: motivo,
      ultimo_messaggio: new Date().toISOString(),
    })
    .eq("telegram_id", telegramId)
    .select();

  if (error) console.error("Error updating lead stage:", error);
  return data;
}

async function saveSondaggioRisposte(telegramId, risposte) {
  const { data, error } = await supabase
    .from("sondaggio_risposte")
    .upsert(
      {
        telegram_id: telegramId,
        ...risposte,
      },
      { onConflict: "telegram_id" }
    )
    .select();

  if (error) console.error("Error saving sondaggio:", error);
  return data;
}

async function getLeadsByStage(stage) {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("pipeline_stage", stage);

  if (error) console.error("Error getting leads by stage:", error);
  return data || [];
}

async function getAllLeads() {
  const { data, error } = await supabase
    .from("leads")
    .select("*");

  if (error) console.error("Error getting all leads:", error);
  return data || [];
}

async function logBroadcast(tipo, testo, destinatariCount, inviati, falliti) {
  const { data, error } = await supabase
    .from("broadcast_log")
    .insert({
      tipo,
      testo,
      destinatari_count: destinatariCount,
      inviati,
      falliti,
    })
    .select();

  if (error) console.error("Error logging broadcast:", error);
  return data;
}

async function getStats() {
  const allLeads = await getAllLeads();
  const qualificati = allLeads.filter((l) => l.pipeline_stage === "qualificato").length;
  const squalificati = allLeads.filter((l) => l.pipeline_stage === "squalificato").length;
  const clienti = allLeads.filter((l) => l.pipeline_stage === "cliente").length;

  return {
    totale: allLeads.length,
    qualificati,
    squalificati,
    clienti,
    nuovi: allLeads.filter((l) => l.pipeline_stage === "nuovo").length,
    tassoQualifica: allLeads.length > 0 ? ((qualificati / allLeads.length) * 100).toFixed(2) : 0,
  };
}

module.exports = {
  supabase,
  saveLead,
  getLead,
  updateLeadStage,
  saveSondaggioRisposte,
  getLeadsByStage,
  getAllLeads,
  logBroadcast,
  getStats,
};
