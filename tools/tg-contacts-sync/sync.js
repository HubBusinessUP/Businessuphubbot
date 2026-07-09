// Sincronizza i contatti Telegram personali su Cashly, riusando la STESSA libreria
// (MTKruto) e le STESSE credenziali di UniChat (TG_API_ID / TG_API_HASH / TG_PHONE).
//
// - Credenziali Telegram: prese dal .env locale o, se assenti, da Code/unichat/.env.
// - Scrittura: NON usa la service_role. Invia i contatti al backend Cashly con la ADMIN_KEY.
// - Sessione separata da UniChat (cartella ./session): un login al primo avvio, poi nulla.
//
// Uso:  npm install   →   npm start
const path = require("path");
require("dotenv").config();
const UNICHAT_ENV = process.env.UNICHAT_ENV || path.join(__dirname, "..", "..", "..", "unichat", ".env");
require("dotenv").config({ path: UNICHAT_ENV });

const fs = require("fs");
const { createInterface } = require("node:readline");
const { Client, StorageLocalStorage } = require("@mtkruto/node");

const API_ID = Number(process.env.TG_API_ID || 0);
const API_HASH = process.env.TG_API_HASH || "";
const PHONE = process.env.TG_PHONE || "";
const FUNCTION_URL = process.env.FUNCTION_URL || "https://jwpbopkoscqooovfvwqn.supabase.co/functions/v1/businessup-bot";
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const SESSION = process.env.CONTACTS_SESSION_PATH || path.join(__dirname, "session");

if (!API_ID || !API_HASH) {
  console.error("❌ TG_API_ID / TG_API_HASH mancanti (né nel .env locale né in " + UNICHAT_ENV + ")");
  process.exit(1);
}
if (!ADMIN_KEY) {
  console.error("❌ ADMIN_KEY mancante nel .env (è la password admin di Cashly).");
  process.exit(1);
}

function ask(q) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((r) => rl.question(q + " ", (a) => { rl.close(); r(a.trim()); }));
}

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
  console.log(`📇 Trovati ${users.length} contatti. Invio a Cashly...`);

  const payload = users.map((u) => ({
    tg_user_id: Number(u.id),
    first_name: u.firstName || null,
    last_name: u.lastName || null,
    username: u.username || null,
    phone: u.phoneNumber ? "+" + String(u.phoneNumber).replace(/\D/g, "") : null,
  }));

  const res = await fetch(FUNCTION_URL + "/admin/contatti-import", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-key": ADMIN_KEY },
    body: JSON.stringify({ contatti: payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    console.error("❌ Errore import:", res.status, JSON.stringify(data));
    process.exit(1);
  }
  console.log(`✅ Importati ${data.importati} contatti. Vai nell'admin → Rubrica.`);
  process.exit(0);
})().catch((e) => { console.error("❌ Errore:", e); process.exit(1); });
