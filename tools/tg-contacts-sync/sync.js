// Sincronizza i contatti Telegram personali su Supabase, riusando la STESSA libreria
// (MTKruto) e le STESSE credenziali di UniChat (TG_API_ID / TG_API_HASH / TG_PHONE).
//
// - Le credenziali Telegram vengono lette dal .env di questo tool; se mancano,
//   vengono prese in automatico dal .env di UniChat (Code/unichat/.env).
// - La sessione è SEPARATA da quella di UniChat (cartella ./session): al primo avvio
//   fa un login (numero + codice); dagli avvii successivi non lo richiede più.
//
// Uso:  npm install   →   npm start
const path = require("path");
require("dotenv").config();
// Fallback: riusa le credenziali Telegram di UniChat se non impostate nel .env locale.
const UNICHAT_ENV = process.env.UNICHAT_ENV || path.join(__dirname, "..", "..", "..", "unichat", ".env");
require("dotenv").config({ path: UNICHAT_ENV });

const fs = require("fs");
const { createInterface } = require("node:readline");
const { Client, StorageLocalStorage } = require("@mtkruto/node");
const { createClient } = require("@supabase/supabase-js");

const API_ID = Number(process.env.TG_API_ID || 0);
const API_HASH = process.env.TG_API_HASH || "";
const PHONE = process.env.TG_PHONE || "";
const OWNER_ID = parseInt(process.env.OWNER_ID || "0", 10);
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
// Sessione separata da UniChat (evita conflitti). Puoi puntarla alla sessione di UniChat
// impostando TG_SESSION_PATH, ma in quel caso ferma prima UniChat (pm2 stop unichat).
const SESSION = process.env.CONTACTS_SESSION_PATH || path.join(__dirname, "session");

if (!API_ID || !API_HASH) {
  console.error("❌ TG_API_ID / TG_API_HASH mancanti (né nel .env locale né in quello di UniChat: " + UNICHAT_ENV + ")");
  process.exit(1);
}
if (!SUPABASE_URL || !SERVICE_KEY || !OWNER_ID) {
  console.error("❌ Config Supabase mancante. Nel .env locale servono: OWNER_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

function ask(q) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((r) => rl.question(q + " ", (a) => { rl.close(); r(a.trim()); }));
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  db: { schema: "businessup" },
  auth: { persistSession: false, autoRefreshToken: false },
});

(async () => {
  fs.mkdirSync(SESSION, { recursive: true });
  const client = new Client({ storage: new StorageLocalStorage(SESSION), apiId: API_ID, apiHash: API_HASH });

  console.log("🔐 Avvio (al primo avvio: numero + codice OTP)...");
  await client.start({
    phone: () => PHONE || ask("📱 Numero (con prefisso, es. +39...):"),
    code: () => ask("💬 Codice OTP ricevuto su Telegram:"),
    password: () => ask("🔐 Password 2FA (premi Invio se non la usi):"),
  });
  console.log("✅ Connesso.");

  const contacts = await client.getContacts();
  const users = (contacts || []).filter((u) => u && u.id != null);
  console.log(`📇 Trovati ${users.length} contatti. Salvataggio su Supabase...`);

  const rows = users.map((u) => ({
    owner_id: OWNER_ID,
    tg_user_id: Number(u.id),
    first_name: u.firstName || null,
    last_name: u.lastName || null,
    username: u.username || null,
    phone: u.phoneNumber ? "+" + String(u.phoneNumber).replace(/\D/g, "") : null,
    updated_at: new Date().toISOString(),
  }));

  let ok = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabase
      .from("contatti_telegram")
      .upsert(chunk, { onConflict: "owner_id,tg_user_id", ignoreDuplicates: false });
    if (error) console.error("⚠️ Errore su un blocco:", error.message);
    else ok += chunk.length;
  }

  console.log(`✅ Sincronizzati ${ok}/${rows.length} contatti. Vai nell'admin → Rubrica.`);
  process.exit(0);
})().catch((e) => { console.error("❌ Errore:", e); process.exit(1); });
