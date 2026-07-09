// Sincronizza i contatti Telegram personali (via Telegram Client API / MTProto) su Supabase.
// Primo avvio: chiede numero + codice (+ password 2FA se attiva) e salva una sessione locale in session.txt.
// Avvii successivi: usa la sessione salvata, nessun login richiesto.
//
// Uso:  npm install   →   npm start
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const input = require("input");
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { createClient } = require("@supabase/supabase-js");

const API_ID = parseInt(process.env.API_ID || "0", 10);
const API_HASH = process.env.API_HASH || "";
const OWNER_ID = parseInt(process.env.OWNER_ID || "0", 10);
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!API_ID || !API_HASH || !SUPABASE_URL || !SERVICE_KEY || !OWNER_ID) {
  console.error("❌ Config mancante. Compila .env con: API_ID, API_HASH, OWNER_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const SESSION_FILE = path.join(__dirname, "session.txt");
const savedSession = fs.existsSync(SESSION_FILE) ? fs.readFileSync(SESSION_FILE, "utf8").trim() : "";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  db: { schema: "businessup" },
  auth: { persistSession: false, autoRefreshToken: false },
});

(async () => {
  const client = new TelegramClient(new StringSession(savedSession), API_ID, API_HASH, { connectionRetries: 5 });

  await client.start({
    phoneNumber: async () => await input.text("📱 Numero (con prefisso, es. +39...): "),
    password: async () => await input.text("🔐 Password 2FA (premi Invio se non la usi): "),
    phoneCode: async () => await input.text("💬 Codice ricevuto su Telegram: "),
    onError: (err) => console.error("Errore login:", err),
  });

  fs.writeFileSync(SESSION_FILE, client.session.save());
  console.log("✅ Login ok. Sessione salvata in session.txt (NON condividerla: è l'accesso al tuo account).");

  const res = await client.invoke(new Api.contacts.GetContacts({ hash: BigInt(0) }));
  const users = (res.users || []).filter((u) => u.className === "User" && !u.bot && !u.deleted);
  console.log(`📇 Trovati ${users.length} contatti. Salvataggio su Supabase...`);

  const rows = users.map((u) => ({
    owner_id: OWNER_ID,
    tg_user_id: Number(u.id),
    first_name: u.firstName || null,
    last_name: u.lastName || null,
    username: u.username || null,
    phone: u.phone ? "+" + String(u.phone).replace(/^\+/, "") : null,
    updated_at: new Date().toISOString(),
  }));

  // Upsert a blocchi. Aggiorna solo i campi anagrafici: tag e note messi dall'admin restano intatti.
  let ok = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabase
      .from("contatti_telegram")
      .upsert(chunk, { onConflict: "owner_id,tg_user_id", ignoreDuplicates: false });
    if (error) console.error("⚠️ Errore su un blocco:", error.message);
    else ok += chunk.length;
  }

  console.log(`✅ Sincronizzati ${ok}/${rows.length} contatti. Ora li vedi nell'admin → Miei contatti.`);
  await client.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error("❌ Errore:", e);
  process.exit(1);
});
