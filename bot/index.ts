// @ts-nocheck
// Cashly BvB · v2.0 — riscrittura
// Ruoli: admin (privato) · cliente (gruppo) · fornitori (gruppo) · lead (privato sconosciuto)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const TOKEN = Deno.env.get("BVB2_TOKEN") ?? "";
const SECRET = Deno.env.get("BVB2_SECRET") ?? "";
const API = "https://api.telegram.org/bot" + TOKEN + "/";
const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SB_SECRET_KEY") ?? "", {
  auth: {
    persistSession: false
  }
});
const APP_VER = "19";
const APP_DASH = "https://hub.cashlypro.com/bvb/";
const APP_CICLO = "https://hub.cashlypro.com/bvb/ciclo/";
const APP_PARTNER = "https://hub.cashlypro.com/bvb/partner/";
const T_UT = "bvb_utenti", T_CI = "bvb_cicli", T_PA = "bvb_pagamenti";
const T_ST = "bvb_bot_state", T_IM = "bvb_impostazioni", T_AD = "bvb_admins";
// ─────────────────────────── util Telegram ───────────────────────────
async function tg(metodo, corpo) {
  try {
    const r = await fetch(API + metodo, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(corpo)
    });
    return await r.json();
  } catch (e) {
    console.error("TG_FAIL", metodo, String(e));
    return null;
  }
}
const send = (chat, testo, extra = {})=>tg("sendMessage", {
    chat_id: chat,
    text: testo,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra
  });
const editKb = (chat, mid, kb)=>!mid ? Promise.resolve(null) : tg("editMessageReplyMarkup", {
    chat_id: chat,
    message_id: mid,
    reply_markup: kb ?? {
      inline_keyboard: []
    }
  });
const rispondi = (id, testo = "")=>tg("answerCallbackQuery", {
    callback_query_id: id,
    text: testo
  });
// ─────────────────────────── formattazione ───────────────────────────
const eur = (n)=>"€ " + Number(n ?? 0).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
const eurI = (n)=>"€ " + Math.round(Number(n ?? 0)).toLocaleString("it-IT");
const usdt = (n)=>Number(n ?? 0).toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + " USDT";
const pct = (n)=>(Number(n) >= 0 ? "+" : "") + Number(n ?? 0).toFixed(2).replace(".", ",") + "%";
const MESI = [
  "gen",
  "feb",
  "mar",
  "apr",
  "mag",
  "giu",
  "lug",
  "ago",
  "set",
  "ott",
  "nov",
  "dic"
];
function dataBreve(d) {
  if (!d) return "—";
  const x = new Date(d);
  return x.getDate() + " " + MESI[x.getMonth()];
}
function dataIt(d) {
  if (!d) return "—";
  const x = new Date(d);
  return String(x.getDate()).padStart(2, "0") + "/" + String(x.getMonth() + 1).padStart(2, "0") + "/" + x.getFullYear();
}
function durataTesto(ms) {
  const h = Math.floor(ms / 3600000);
  if (h < 1) return Math.max(1, Math.round(ms / 60000)) + " minuti";
  if (h < 24) return h + (h === 1 ? " ora" : " ore");
  const g = Math.floor(h / 24), r = h % 24;
  return g + (g === 1 ? " giorno" : " giorni") + (r >= 2 ? " e " + r + (r === 1 ? " ora" : " ore") : "");
}
function durata(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h " + m % 60 + "m";
  return Math.floor(h / 24) + "g " + h % 24 + "h";
}
function numero(t) {
  if (t == null) return NaN;
  const s = String(t).replace(/[€$\s]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}
// ─────────────────────────── impostazioni ───────────────────────────
let _imp = null;
async function imp(chiave, def = "") {
  if (!_imp) {
    const { data } = await sb.from(T_IM).select("chiave, valore");
    _imp = Object.fromEntries((data ?? []).map((x)=>[
        x.chiave,
        x.valore
      ]));
  }
  return _imp[chiave] ?? def;
}
async function setImp(chiave, valore) {
  await sb.from(T_IM).upsert({
    chiave,
    valore: String(valore),
    aggiornato_il: new Date().toISOString()
  });
  if (_imp) _imp[chiave] = String(valore);
}
// ─────────────────────────── stato conversazione ───────────────────────────
async function stato(chat) {
  const { data } = await sb.from(T_ST).select("step, dati").eq("chat_id", chat).maybeSingle();
  return {
    step: data?.step ?? null,
    dati: data?.dati ?? {}
  };
}
async function setStato(chat, step, dati = {}) {
  await sb.from(T_ST).upsert({
    chat_id: chat,
    step,
    dati,
    aggiornato_il: new Date().toISOString()
  });
}
// ─────────────────────────── ruoli ───────────────────────────
let _admins = null;
async function isAdmin(id) {
  if (!id) return false;
  if (!_admins) {
    const { data } = await sb.from(T_AD).select("telegram_user_id");
    _admins = new Set((data ?? []).map((x)=>Number(x.telegram_user_id)));
  }
  return _admins.has(Number(id));
}
const perGruppo = async (chat)=>(await sb.from(T_UT).select("*").eq("gruppo_utente_id", chat).maybeSingle()).data;
const perFornitori = async (chat)=>(await sb.from(T_UT).select("*").eq("gruppo_fornitori_id", chat).maybeSingle()).data;
const perCodice = async (cod)=>(await sb.from(T_UT).select("*").eq("codice", String(cod).toUpperCase()).maybeSingle()).data;
const fresco = async (id)=>(await sb.from(T_UT).select("*").eq("id", id).maybeSingle()).data;
const T_PT = "bvb_partner";
const T_PA_ADM = "bvb_partner_admins";
async function partnerDi(id) {
  if (!id) return null;
  const { data } = await sb.from(T_PT).select("*").eq("telegram_id", id).eq("attivo", true).maybeSingle();
  if (data) return {
    ...data,
    ruolo: "capo"
  };
  const { data: a } = await sb.from(T_PA_ADM).select("*, p:partner_id(*)").eq("telegram_id", id).eq("attivo", true).maybeSingle();
  if (a?.p) return {
    ...a.p,
    ruolo: a.ruolo,
    admin_nome: a.nome
  };
  return null;
}
async function prossimoCodice(p) {
  const pre = p?.prefisso || "C";
  const { data } = await sb.from(T_UT).select("codice").like("codice", pre + "%");
  const usati = (data ?? []).map((x)=>parseInt(String(x.codice).slice(pre.length), 10)).filter((n)=>!isNaN(n));
  let n = 1;
  while(usati.includes(n))n++;
  return pre + n;
}
async function clientiDi(p) {
  const col = p.tipo === "fornitore" ? "fornitore_id" : "affiliato_id";
  let q = sb.from(T_UT).select("*").order("codice");
  if (p.tipo === "fornitore") q = q.eq("fornitore_id", p.id);
  else {
    const { data: a } = await sb.from("bvb_affiliati").select("id").ilike("nome", p.nome).maybeSingle();
    q = q.eq("affiliato_id", a?.id ?? "00000000-0000-0000-0000-000000000000");
  }
  const { data } = await q;
  return data ?? [];
}
async function ruolo(chat, from, tipoChat) {
  if (tipoChat === "private") {
    if (await isAdmin(from)) return {
      r: "admin"
    };
    const { data: c } = await sb.from(T_UT).select("*").eq("telegram_id", from).maybeSingle();
    const p = await partnerDi(from);
    if (c && p) return {
      r: "misto",
      u: c,
      p
    };
    if (c) return {
      r: "cliente_privato",
      u: c
    };
    if (p) return {
      r: "partner",
      p
    };
    return {
      r: "lead"
    };
  }
  const cli = await perGruppo(chat);
  if (cli) return {
    r: "cliente",
    u: cli
  };
  const forn = await perFornitori(chat);
  if (forn) return {
    r: "fornitori",
    u: forn
  };
  return {
    r: "ignoto"
  };
}
// ─────────────────────────── tastiere ───────────────────────────
const kbBase = (righe)=>({
    keyboard: righe,
    resize_keyboard: true,
    one_time_keyboard: false,
    selective: false
  });
const AGG = {
  text: "🔄 Aggiorna"
};
const KB_PRONTO = kbBase([
  [
    {
      text: "🚀 Inizia nuovo ciclo"
    }
  ],
  [
    {
      text: "📊 Dashboard"
    },
    {
      text: "⚙️ Impostazioni"
    }
  ],
  [
    {
      text: "📚 Guida"
    },
    AGG
  ]
]);
const CODA = [
  [
    {
      text: "📊 Dashboard"
    },
    {
      text: "⚙️ Impostazioni"
    }
  ],
  [
    {
      text: "📚 Guida"
    },
    {
      text: "🔄 Aggiorna"
    }
  ]
];
const kbFase = (righe)=>kbBase([
    ...righe,
    ...CODA
  ]);
// Telegram accetta le Mini App solo in chat privata: nei gruppi servono link
function appKb(chat, voci) {
  const priv = Number(chat) > 0;
  const righe = voci.map(([t, u])=>[
      priv ? {
        text: t,
        web_app: {
          url: u
        }
      } : {
        text: t,
        url: u
      }
    ]);
  if (!priv) righe.push([
    {
      text: "💬 Apri nel bot",
      url: "https://t.me/cashly_bvb_bot?start=dash"
    }
  ]);
  return righe;
}
const nomeB = (d)=>d?.brokerNome ?? (d?.brokerB === "mnx" || d?.brokerB === "monaxa" ? "Monaxa" : "Roboforex");
const kbCiclo = (d)=>kbFase([
    [
      {
        text: "🟢 Vinto su TotalFX"
      }
    ],
    [
      {
        text: "🔵 Vinto su " + nomeB(d)
      }
    ]
  ]);
const contoB = (u, d)=>(d?.brokerB === "monaxa" ? u.login_c : u.login_b) ?? u.login_b;
const KB_CICLO = kbCiclo(null);
const KB_STEP2 = kbFase([
  [
    {
      text: "🔄 Richiedi reset NBP"
    }
  ],
  [
    {
      text: "🎁 Richiedi bonus 30%"
    }
  ]
]);
const KB_BONUS2 = kbFase([
  [
    {
      text: "✅ Bonus arrivato"
    }
  ]
]);
const KB_SOLO_BONUS = kbFase([
  [
    {
      text: "🎁 Richiedi bonus 30%"
    }
  ]
]);
const KB_SOLO_RESET = kbFase([
  [
    {
      text: "🔄 Richiedi reset NBP"
    }
  ]
]);
const KB_RESET = kbBase([
  [
    {
      text: "🔄 Reset conto TotalFX"
    }
  ],
  [
    {
      text: "❌ Annulla"
    },
    AGG
  ]
]);
const KB_SOLOBONUS = kbBase([
  [
    {
      text: "🎁 Richiedi bonus 30%"
    }
  ],
  [
    {
      text: "❌ Annulla"
    },
    AGG
  ]
]);
const KB_BONUS = kbBase([
  [
    {
      text: "✅ Bonus arrivato"
    }
  ],
  [
    {
      text: "🔄 Reset conto TotalFX"
    }
  ],
  [
    {
      text: "❌ Annulla"
    },
    AGG
  ]
]);
const KB_S2 = kbFase([
  [
    {
      text: "📊 Chiudi 2° step"
    }
  ]
]);
const KB_PAGA = kbFase([
  [
    {
      text: "💸 Ho pagato"
    }
  ]
]);
const KB_ATTESA = kbBase([
  [
    {
      text: "📊 Dashboard"
    },
    {
      text: "⚙️ Impostazioni"
    }
  ],
  [
    {
      text: "📚 Guida"
    },
    AGG
  ]
]);
const KB_IMPO = kbBase([
  [
    {
      text: "💳 Pagamenti fee"
    }
  ],
  [
    {
      text: "🖥 Gestione VPS"
    }
  ],
  [
    {
      text: "⚙️ Conti broker"
    }
  ],
  [
    {
      text: "📥 Carica storico"
    }
  ],
  [
    {
      text: "⬅️ Indietro"
    }
  ]
]);
const KB_GUIDA = kbBase([
  [
    {
      text: "📘 La strategia"
    }
  ],
  [
    {
      text: "🔄 Come si gestisce un ciclo"
    }
  ],
  [
    {
      text: "⬅️ Indietro"
    },
    AGG
  ]
]);
const KB_ANNULLA = kbBase([
  [
    {
      text: "⬅️ Indietro"
    },
    {
      text: "❌ Annulla tutto"
    }
  ]
]);
// da quale passo si torna indietro
const INDIETRO = {
  budget: "screen",
  conferma_avvio: "screen",
  c1_r: "c1_t",
  c2_res: "c2_r",
  s2_r: "s2_t",
  screen_c: null,
  hash: "paga"
};
async function tastiera(u, st) {
  const p = st?.step ?? "", d = st?.dati ?? {};
  if (u.sospeso || u.bannato) return {
    kb: kbBase([
      [
        AGG
      ]
    ]),
    nota: "Servizio sospeso"
  };
  if (u.attesa_tipo) return {
    kb: KB_ATTESA,
    nota: "In attesa · " + u.attesa_tipo + (u.attesa_dal ? " · da " + durata(Date.now() - new Date(u.attesa_dal).getTime()) : "") + "\nTi avviso appena confermano."
  };
  if (p === "paga") return {
    kb: KB_PAGA,
    nota: "Fee da versare"
  };
  if (p === "step2_pronto") return {
    kb: KB_S2,
    nota: " 2° step in corso"
  };
  if (p === "attesa_reset") return {
    kb: KB_ATTESA,
    nota: "🔄 Reset richiesto · in attesa dei fornitori"
  };
  if (p === "attesa_bonus") return {
    kb: KB_BONUS2,
    nota: "🎁 Bonus richiesto"
  };
  if (p === "attesa_step2") return {
    kb: KB_ATTESA,
    nota: "⏳ In attesa dei fornitori"
  };
  if (p === "step2") {
    if (d.reset) return {
      kb: KB_SOLO_BONUS,
      nota: "🎁 Ora richiedi il bonus"
    };
    if (d.s1_t != null && d.s1_t < 0) return {
      kb: KB_SOLO_RESET,
      nota: "🔵 Total FX in negativo · serve il reset"
    };
    if (d.s1_t != null) return {
      kb: KB_SOLO_BONUS,
      nota: "🔵 Total FX in positivo · richiedi il bonus"
    };
    return {
      kb: KB_STEP2,
      nota: "🔵 Step 2 · reset o bonus"
    };
  }
  if (u.ciclo_attivo) return {
    kb: kbCiclo(d),
    nota: "Ciclo attivo · " + eurI(u.budget_ciclo ?? 0)
  };
  return {
    kb: KB_PRONTO,
    nota: "Pronto per un nuovo ciclo"
  };
}
// ─────────────────────────── attese e fornitori ───────────────────────────
async function apriAttesa(u, tipo) {
  await sb.from(T_UT).update({
    attesa_tipo: tipo,
    attesa_dal: new Date().toISOString(),
    sollecito_n: 0,
    sollecito_ultimo: null
  }).eq("id", u.id);
}
async function chiudiAttesa(id) {
  await sb.from(T_UT).update({
    attesa_tipo: null,
    attesa_dal: null,
    sollecito_n: 0,
    sollecito_ultimo: null
  }).eq("id", id);
}
async function adAvvisa(testo, extra = {}) {
  const { data } = await sb.from(T_AD).select("telegram_user_id");
  for (const a of data ?? [])await send(a.telegram_user_id, testo, extra);
}
async function tagForn(u) {
  const out = new Set();
  const fissi = await imp("tag_fornitori_default", "");
  for (const t of String(fissi).split(/\s+/).filter(Boolean))out.add(t.startsWith("@") ? t : "@" + t);
  if (u.tag_fornitori) for (const t of String(u.tag_fornitori).split(/\s+/).filter(Boolean))out.add(t.startsWith("@") ? t : "@" + t);
  if (!out.size && u.gruppo_fornitori_id) {
    const r = await tg("getChatAdministrators", {
      chat_id: u.gruppo_fornitori_id
    });
    for (const a of r?.result ?? []){
      if (a.user?.is_bot) continue;
      out.add(a.user?.username ? "@" + a.user.username : '<a href="tg://user?id=' + a.user?.id + '">' + (a.user?.first_name ?? "staff") + "</a>");
    }
  }
  return [
    ...out
  ].join(" ");
}
// la parola che i fornitori devono scrivere per confermare
function parolaPer(attesa) {
  const t = String(attesa ?? "").toLowerCase();
  return t.includes("avvio") ? "in corso" : null;
}
async function fornSerie(u, blocchi, attesa) {
  if (!u.gruppo_fornitori_id) return null;
  for (const b of blocchi)await send(u.gruppo_fornitori_id, b);
  const tag = await tagForn(u);
  let coda = "";
  const pw = attesa ? parolaPer(attesa) : null;
  if (pw) coda += "Rispondete con: <code>" + pw + "</code>";
  if (tag) coda += (coda ? "\n\n" : "") + tag;
  if (coda) await send(u.gruppo_fornitori_id, coda);
  return true;
}
async function dicituraForn(u, righe) {
  if (!u.gruppo_fornitori_id) return null;
  const html = /https?:\/\//.test(righe) ? righe : "<b>" + righe.toUpperCase() + "</b>";
  await send(u.gruppo_fornitori_id, html);
  const tag = await tagForn(u);
  if (tag) await send(u.gruppo_fornitori_id, tag);
  return true;
}
async function aiFornitori(u, testo, dicitura, attesa) {
  if (!u.gruppo_fornitori_id) return null;
  const tag = await tagForn(u);
  let m = "<b>" + u.codice + " · " + u.nome + "</b>\n\n" + testo;
  if (dicitura) m += "\n\n<code>" + dicitura + "</code>";
  const pw2 = attesa ? parolaPer(attesa) : null;
  if (pw2) m += "\n\nRispondete con: <code>" + pw2 + "</code>";
  if (tag) m += "\n\n" + tag;
  return await send(u.gruppo_fornitori_id, m);
}
// ─────────────────────────── cambio EUR/USDT ───────────────────────────
let _cambio = null, _cambioAt = 0;
async function tokenApp(u) {
  if (u.app_token) return u.app_token;
  const t = crypto.randomUUID();
  await sb.from(T_UT).update({
    app_token: t
  }).eq("id", u.id);
  return t;
}
async function collegaPrivato(u, tgId) {
  if (!tgId) return false;
  if (!u.telegram_id) await sb.from(T_UT).update({
    telegram_id: tgId
  }).eq("id", u.id);
  const t = await tokenApp(u);
  const r = await tg("setChatMenuButton", {
    chat_id: tgId,
    menu_button: {
      type: "web_app",
      text: "Dashboard",
      web_app: {
        web_app: {
          url: APP_DASH + "?v=" + APP_VER + "&t=" + t
        }
      }
    }
  });
  return !!r?.ok;
}
async function walletFee(u) {
  if (u.wallet_fee && String(u.wallet_fee).trim()) return String(u.wallet_fee).trim();
  if (u.affiliato_id) {
    const { data: a } = await sb.from("bvb_affiliati").select("wallet_fee").eq("id", u.affiliato_id).maybeSingle();
    if (a?.wallet_fee && String(a.wallet_fee).trim()) return String(a.wallet_fee).trim();
  }
  return await imp("wallet_usdt", "");
}
async function cambio() {
  if (_cambio && Date.now() - _cambioAt < 600000) return _cambio;
  try {
    const r = await fetch("https://api.coinbase.com/v2/exchange-rates?currency=EUR");
    const d = await r.json();
    const v = parseFloat(d?.data?.rates?.USDT ?? d?.data?.rates?.USD);
    if (v > 0) {
      _cambio = v;
      _cambioAt = Date.now();
      return v;
    }
  } catch (_) {}
  return parseFloat(await imp("cambio_fallback", "1.16"));
}
// ─────────────────────────── entrata ───────────────────────────
Deno.serve(async (req)=>{
  const url = new URL(req.url);
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS"
  };
  if (req.method === "OPTIONS") return new Response("ok", {
    headers: cors
  });
  if (url.pathname.endsWith("/api/pubblico")) {
    _imp = null;
    const { data: ci } = await sb.from(T_CI).select("saldo_ini_a, profitto_eur, chiuso_il, utente_id, avviato_il").in("stato", [
      "pagato",
      "chiuso"
    ]);
    const c = (ci ?? []).filter((x)=>x.chiuso_il);
    const clienti = new Set(c.map((x)=>x.utente_id)).size;
    const lordo = c.reduce((a, x)=>a + Number(x.profitto_eur ?? 0), 0);
    const durate = c.filter((x)=>x.avviato_il && x.chiuso_il).map((x)=>new Date(x.chiuso_il).getTime() - new Date(x.avviato_il).getTime()).filter((x)=>x > 3600000);
    const oreMedie = durate.length ? durate.reduce((a, b)=>a + b, 0) / durate.length / 3600000 : 0;
    const date = c.map((x)=>String(x.chiuso_il).slice(0, 10)).sort();
    return new Response(JSON.stringify({
      cicli: c.length,
      lordo: Math.round(lordo),
      clienti,
      giorni: oreMedie ? Math.max(1, Math.round(oreMedie / 24)) : null,
      ore: oreMedie ? Math.round(oreMedie) : null,
      dal: date[0] ?? null,
      ultimo: date[date.length - 1] ?? null
    }), {
      headers: {
        ...cors,
        "content-type": "application/json",
        "cache-control": "public, max-age=300"
      }
    });
  }
  if (url.pathname.endsWith("/api/share")) {
    if (req.method === "OPTIONS") return new Response(null, {
      headers: cors
    });
    _imp = null;
    try {
      const body = await req.json();
      const t = String(body.t ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(t)) return new Response(JSON.stringify({
        error: "auth"
      }), {
        status: 401,
        headers: {
          ...cors,
          "content-type": "application/json"
        }
      });
      let dove = null, nome = "", didascalia = String(body.testo ?? "");
      const { data: u } = await sb.from(T_UT).select("*").eq("app_token", t).maybeSingle();
      if (u) {
        dove = u.telegram_id ?? u.gruppo_utente_id;
        nome = u.nome ?? "";
      } else {
        const { data: p } = await sb.from(T_PT).select("*").eq("app_token", t).maybeSingle();
        if (p?.telegram_id) {
          dove = p.telegram_id;
          nome = p.nome ?? "";
        }
      }
      if (!dove && await imp("admin_token", "")) {
        const { data: ad } = await sb.from("bvb_admins").select("telegram_user_id").limit(1).maybeSingle();
        if (ad?.telegram_user_id) dove = ad.telegram_user_id;
      }
      if (!dove) return new Response(JSON.stringify({
        error: "nessuna chat collegata"
      }), {
        status: 404,
        headers: {
          ...cors,
          "content-type": "application/json"
        }
      });
      const b64 = String(body.img ?? "").split(",").pop() ?? "";
      const bin = Uint8Array.from(atob(b64), (c)=>c.charCodeAt(0));
      const fd = new FormData();
      fd.append("chat_id", String(dove));
      fd.append("caption", didascalia.slice(0, 900));
      fd.append("parse_mode", "HTML");
      fd.append("photo", new Blob([
        bin
      ], {
        type: "image/png"
      }), "cashly.png");
      const r = await fetch("https://api.telegram.org/bot" + TOKEN + "/sendPhoto", {
        method: "POST",
        body: fd
      });
      const j = await r.json();
      return new Response(JSON.stringify({
        ok: !!j.ok
      }), {
        headers: {
          ...cors,
          "content-type": "application/json"
        }
      });
    } catch (e) {
      return new Response(JSON.stringify({
        error: String(e)
      }), {
        status: 500,
        headers: {
          ...cors,
          "content-type": "application/json"
        }
      });
    }
  }
  if (url.pathname.endsWith("/api/admin")) {
    _imp = null;
    const t = url.searchParams.get("t") ?? "";
    const atteso = await imp("admin_token", "");
    if (!atteso || t !== atteso) return new Response(JSON.stringify({
      error: "auth"
    }), {
      status: 401,
      headers: {
        ...cors,
        "content-type": "application/json"
      }
    });
    const { data: cl } = await sb.from(T_UT).select("*").order("codice");
    const tuttiCl = cl ?? [];
    const clienti = tuttiCl.filter((x)=>!x.proprio);
    const miei = tuttiCl.filter((x)=>x.proprio);
    const ids = clienti.map((x)=>x.id);
    const { data: ci } = ids.length ? await sb.from(T_CI).select("utente_id, saldo_ini_a, profitto_eur, fee_eur, fee_usdt, chiuso_il").in("utente_id", ids).in("stato", [
      "pagato",
      "chiuso"
    ]).order("chiuso_il") : {
      data: []
    };
    const { data: pts } = await sb.from(T_PT).select("*");
    const { data: afs } = await sb.from("bvb_affiliati").select("*");
    const qf = parseFloat(await imp("quota_fornitori", "35")) / 100;
    const cbm = await cambio();
    const nomeAff = {};
    for (const a of afs ?? [])nomeAff[a.id] = a.nome;
    const percByNome = {};
    for (const p of pts ?? [])percByNome[p.nome] = {
      perc: Number(p.percentuale ?? 0) / 100,
      tipo: p.tipo
    };
    const byId = Object.fromEntries(clienti.map((x)=>[
        x.id,
        x
      ]));
    const cicli = (ci ?? []).filter((x)=>x.chiuso_il && !byId[x.utente_id]?.proprio).map((x)=>{
      const u = byId[x.utente_id] ?? {};
      const rete = u.affiliato_id ? nomeAff[u.affiliato_id] ?? "—" : "Diretti";
      const info = percByNome[rete] ?? {
        perc: 0
      };
      const prof = Number(x.profitto_eur ?? 0), feeU = Number(x.fee_usdt ?? 0);
      const qAff = rete === "Diretti" ? 0 : prof * info.perc * cbm;
      const qForn = prof * qf * cbm;
      const pz = String(u.nome ?? "").trim().split(/\s+/);
      return {
        codice: u.codice ?? "",
        cliente: pz.length > 1 ? pz[0] + " " + pz[pz.length - 1][0].toUpperCase() + "." : pz[0] ?? "",
        rete,
        data: String(x.chiuso_il).slice(0, 10),
        capitale: Number(x.saldo_ini_a ?? 0),
        profitto: prof,
        feeU,
        qAff: Math.round(qAff * 100) / 100,
        qForn: Math.round(qForn * 100) / 100,
        mio: Math.round((feeU - qForn - qAff) * 100) / 100
      };
    });
    const reti = {};
    for (const c of cicli){
      const r = reti[c.rete] ?? {
        nome: c.rete,
        cicli: 0,
        profitto: 0,
        feeU: 0,
        quota: 0,
        mio: 0,
        clienti: new Set()
      };
      r.cicli++;
      r.profitto += c.profitto;
      r.feeU += c.feeU;
      r.quota += c.qAff;
      r.mio += c.mio;
      r.clienti.add(c.codice);
      reti[c.rete] = r;
    }
    const listaReti = Object.values(reti).map((r)=>({
        nome: r.nome,
        cicli: r.cicli,
        profitto: Math.round(r.profitto * 100) / 100,
        feeU: Math.round(r.feeU * 100) / 100,
        quota: Math.round(r.quota * 100) / 100,
        mio: Math.round(r.mio * 100) / 100,
        clienti: r.clienti.size
      })).sort((a, b)=>b.mio - a.mio);
    let capTot = 0, inCorso = 0;
    const capMax = {};
    for (const c of cicli)capMax[c.codice] = Math.max(capMax[c.codice] ?? 0, c.capitale);
    for (const u of clienti){
      const r = Number(u.budget_ciclo ?? 0) > 0 ? Number(u.budget_ciclo) : capMax[u.codice] ?? 0;
      if (!u.bannato && !u.sospeso && u.onboarding_ok) capTot += r;
      if (u.ciclo_attivo) inCorso += Number(u.budget_ciclo ?? 0);
    }
    const listaClienti = clienti.map((u)=>{
      const suoi = cicli.filter((c)=>c.codice === u.codice);
      const pz = String(u.nome ?? "").trim().split(/\s+/);
      return {
        codice: u.codice,
        nome: pz.length > 1 ? pz[0] + " " + pz[pz.length - 1][0].toUpperCase() + "." : pz[0] ?? "",
        rete: u.proprio ? "Tuo conto" : u.affiliato_id ? nomeAff[u.affiliato_id] ?? "—" : "Diretti",
        stato: u.bannato ? "bannato" : u.sospeso ? "sospeso" : !u.onboarding_ok ? "setup" : u.attesa_tipo ? "attesa" : u.ciclo_attivo ? "attivo" : "pronto",
        capitale: Number(u.budget_ciclo ?? 0) > 0 ? Number(u.budget_ciclo) : capMax[u.codice] ?? 0,
        cicli: suoi.length,
        profitto: Math.round(suoi.reduce((a, c)=>a + c.profitto, 0) * 100) / 100,
        mio: Math.round(suoi.reduce((a, c)=>a + c.mio, 0) * 100) / 100,
        ultimo: suoi.length ? suoi[suoi.length - 1].data : null
      };
    });
    let pProf = 0, pFee = 0, pN = 0, pCap = 0;
    if (miei.length) {
      const idsM = miei.map((x)=>x.id);
      const { data: cm } = await sb.from(T_CI).select("saldo_ini_a, profitto_eur, fee_eur, chiuso_il").in("utente_id", idsM).in("stato", [
        "pagato",
        "chiuso"
      ]);
      for (const x of cm ?? []){
        if (!x.chiuso_il) continue;
        pN++;
        pProf += Number(x.profitto_eur ?? 0);
        pFee += Number(x.fee_eur ?? 0);
        pCap = Math.max(pCap, Number(x.saldo_ini_a ?? 0));
      }
    }
    const personale = {
      cicli: pN,
      capitale: pCap,
      lordo: Math.round(pProf * 100) / 100,
      fee: Math.round(pFee * 100) / 100,
      netto: Math.round((pProf - pFee) * 100) / 100
    };
    return new Response(JSON.stringify({
      capitale: {
        totale: capTot,
        inCorso,
        personale: pCap
      },
      cicli,
      reti: listaReti,
      clienti: listaClienti,
      personale,
      cambio: cbm
    }), {
      headers: {
        ...cors,
        "content-type": "application/json"
      }
    });
  }
  if (url.pathname.endsWith("/api/partner")) {
    _imp = null;
    const t = url.searchParams.get("t") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(t)) return new Response(JSON.stringify({
      error: "auth"
    }), {
      status: 401,
      headers: {
        ...cors,
        "content-type": "application/json"
      }
    });
    const { data: p } = await sb.from(T_PT).select("*").eq("app_token", t).maybeSingle();
    if (!p) return new Response(JSON.stringify({
      error: "auth"
    }), {
      status: 401,
      headers: {
        ...cors,
        "content-type": "application/json"
      }
    });
    const cl = await clientiDi(p);
    const ids = cl.map((x)=>x.id);
    const qf = parseFloat(await imp("quota_fornitori", "35")) / 100;
    const cbp = await cambio();
    const perc = Number(p.percentuale ?? 0) / 100;
    const { data: ci } = ids.length ? await sb.from(T_CI).select("utente_id, numero, saldo_ini_a, profitto_eur, fee_eur, fee_usdt, chiuso_il").in("utente_id", ids).in("stato", [
      "pagato",
      "chiuso"
    ]).order("chiuso_il") : {
      data: []
    };
    const byId = Object.fromEntries(cl.map((x)=>[
        x.id,
        x
      ]));
    const cicli = (ci ?? []).filter((x)=>x.chiuso_il).map((x)=>{
      const fee = Number(x.fee_eur ?? 0), feeU = Number(x.fee_usdt ?? 0);
      const prof = Number(x.profitto_eur ?? 0);
      const quota = p.tipo === "fornitore" ? prof * qf * cbp : prof * perc * cbp;
      const u = byId[x.utente_id] ?? {};
      const pz = String(u.nome ?? "").trim().split(/\s+/);
      return {
        cliente: pz.length > 1 ? pz[0] + " " + pz[pz.length - 1][0].toUpperCase() + "." : pz[0] ?? "",
        codice: u.codice ?? "",
        n: x.numero,
        data: String(x.chiuso_il).slice(0, 10),
        capitale: Number(x.saldo_ini_a ?? 0),
        profitto: prof,
        fee,
        quota: Math.round(quota * 100) / 100
      };
    });
    const clienti = cl.map((u)=>{
      const suoi = cicli.filter((c)=>c.codice === u.codice);
      const pz = String(u.nome ?? "").trim().split(/\s+/);
      return {
        codice: u.codice,
        nome: pz.length > 1 ? pz[0] + " " + pz[pz.length - 1][0].toUpperCase() + "." : pz[0] ?? "",
        stato: u.bannato ? "bannato" : u.sospeso ? "sospeso" : !u.onboarding_ok ? "setup" : u.ciclo_attivo ? "attivo" : "pronto",
        cicli: suoi.length,
        profitto: Math.round(suoi.reduce((a, c)=>a + c.profitto, 0) * 100) / 100,
        quota: Math.round(suoi.reduce((a, c)=>a + c.quota, 0) * 100) / 100,
        ultimo: suoi.length ? suoi[suoi.length - 1].data : null,
        dal: u.onboarding_fine ? String(u.onboarding_fine).slice(0, 10) : null
      };
    });
    return new Response(JSON.stringify({
      partner: {
        nome: p.nome,
        tipo: p.tipo,
        percentuale: Number(p.percentuale ?? 0)
      },
      cicli,
      clienti
    }), {
      headers: {
        ...cors,
        "content-type": "application/json"
      }
    });
  }
  if (url.pathname.endsWith("/api/cicli")) {
    _imp = null;
    const t = url.searchParams.get("t") ?? "";
    let u = null;
    if (/^[0-9a-f-]{36}$/i.test(t)) {
      const { data } = await sb.from(T_UT).select("*").eq("app_token", t).maybeSingle();
      u = data;
    }
    if (!u) return new Response(JSON.stringify({
      error: "auth"
    }), {
      status: 401,
      headers: {
        ...cors,
        "content-type": "application/json"
      }
    });
    let brand = "Cashly";
    if (u.affiliato_id) {
      const { data: af } = await sb.from("bvb_affiliati").select("nome").eq("id", u.affiliato_id).maybeSingle();
      if (af?.nome) brand = af.nome;
    }
    const pz = String(u.nome ?? "").trim().split(/\s+/);
    const nomeBreve = pz.length > 1 ? pz[0] + " " + pz[pz.length - 1][0].toUpperCase() + "." : pz[0] ?? "";
    const { data: ci } = await sb.from(T_CI).select("numero, saldo_ini_a, profitto_eur, fee_eur, chiuso_il, avviato_il").eq("utente_id", u.id).in("stato", [
      "pagato",
      "chiuso"
    ]).order("chiuso_il");
    const cicli = (ci ?? []).filter((x)=>x.chiuso_il).map((x)=>({
        n: x.numero,
        capitale: Number(x.saldo_ini_a ?? 0),
        data: String(x.chiuso_il).slice(0, 10),
        avvio: x.avviato_il ?? null,
        lordo: Number(x.profitto_eur ?? 0),
        fee: Number(x.fee_eur ?? 0)
      }));
    return new Response(JSON.stringify({
      cliente: {
        codice: u.codice,
        nome: nomeBreve,
        brand
      },
      cicli
    }), {
      headers: {
        ...cors,
        "content-type": "application/json"
      }
    });
  }
  if (url.pathname.endsWith("/cron")) {
    if (url.searchParams.get("k") !== SECRET) return new Response("no", {
      status: 401
    });
    _imp = null;
    const n = await controlloVps();
    const f = await controlloFermi();
    return new Response(JSON.stringify({
      ok: true,
      avvisati: n,
      fermi: f
    }), {
      headers: {
        "content-type": "application/json"
      }
    });
  }
  if (req.headers.get("x-telegram-bot-api-secret-token") !== SECRET) {
    return new Response("no", {
      status: 401
    });
  }
  let up;
  try {
    up = await req.json();
  } catch (_) {
    return new Response("ok");
  }
  try {
    _imp = null;
    if (up.message) await onMessaggio(up.message);
    else if (up.channel_post) await onCanale(up.channel_post);
    else if (up.callback_query) await onBottone(up.callback_query);
    else if (up.my_chat_member) await onAggiunto(up.my_chat_member);
  } catch (e) {
    console.error("ERRORE", String(e), e?.stack ?? "");
  }
  return new Response("ok");
});
async function controlloFermi() {
  const soglia = parseInt(await imp("ore_ferme", "8"), 10);
  const { data } = await sb.from(T_UT).select("*").not("attesa_tipo", "is", null);
  const fermi = [];
  for (const u of data ?? []){
    if (!u.attesa_dal) continue;
    const ore = (Date.now() - new Date(u.attesa_dal).getTime()) / 3600000;
    if (ore >= soglia) fermi.push({
      u,
      ore
    });
  }
  if (!fermi.length) return 0;
  let m = "⚠️ <b>FERMI DA TROPPO</b>\n━━━━━━━━━━━━━━\n";
  for (const f of fermi)m += "\n<b>" + f.u.codice + " · " + f.u.nome + "</b>\n<i>" + f.u.attesa_tipo + " · da " + Math.round(f.ore) + " ore</i>\n";
  await adAvvisa(m);
  return fermi.length;
}
async function controlloVps() {
  const giorno = parseInt(await imp("vps_giorno", "21"), 10);
  const oggi = new Date();
  const oggiS = oggi.toISOString().slice(0, 10);
  const { data } = await sb.from(T_UT).select("*");
  let n = 0;
  for (const u of data ?? []){
    if (!u.gruppo_utente_id || u.bannato) continue;
    if (!u.onboarding_ok && u.onboarding_step !== "attesa_sblocco") continue;
    const scad = u.vps_prossimo_pagamento ?? u.vps_copre_fino;
    if (!scad) continue;
    const s = new Date(scad + "T12:00:00");
    const giorniA = Math.round((s - oggi) / 86400000);
    // promemoria il giorno prima
    if (giorniA === 1 && u.vps_alert_inviato !== oggiS) {
      const d = await vpsDovuto(u);
      const w = await imp("wallet_vps", await imp("wallet_usdt", ""));
      await send(u.gruppo_utente_id, "<b>PROMEMORIA · VPS E GESTIONE</b>\n\nDomani <b>" + dataIt(s) + "</b> scade la copertura.\n\n<b>" + eur(d.eur > 0 ? d.eur : parseFloat(await imp("vps_eur", "25"))) + "</b> ≈ <b>" + usdt(d.usdt > 0 ? d.usdt : 28) + "</b>\nOppure <b>" + usdt(d.trim) + "</b> per 3 mesi\n\nSolo rete <b>BEP20</b>.\n\n<code>" + w + "</code>\n\n<i>Chi non è in regola resta fermo fino al pagamento: meglio non aspettare l'ultimo giorno.</i>", {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Ho pagato",
                callback_data: "i:vps_pag"
              }
            ]
          ]
        }
      });
      await sb.from(T_UT).update({
        vps_alert_inviato: oggiS
      }).eq("id", u.id);
      n++;
      continue;
    }
    // scaduto: sospendo
    if (giorniA < 0 && u.vps_stato !== "scaduto") {
      await sb.from(T_UT).update({
        vps_stato: "scaduto"
      }).eq("id", u.id);
      await send(u.gruppo_utente_id, "<b>COPERTURA SCADUTA</b>\n\nIl servizio resta fermo fino alla regolarizzazione.\n\nAppena registriamo il pagamento riparti da dove eri.", {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Ho pagato",
                callback_data: "i:vps_pag"
              }
            ]
          ]
        }
      });
      await adAvvisa("<b>" + u.codice + " · " + u.nome + "</b>\nVPS scaduto il " + dataIt(s) + " — sospeso.");
      n++;
    }
  }
  return n;
}
async function onAggiunto(ev) {
  const st = ev.new_chat_member?.status;
  const chat = ev.chat.id;
  if (ev.chat.type === "private") return;
  if (st !== "administrator" && st !== "member") return;
  if (!await isAdmin(ev.from?.id)) return;
  // canali: servono solo a leggere i segnali, niente domande
  if (ev.chat.type === "channel") {
    if (st === "administrator") await adAvvisa("📡 <b>" + (ev.chat.title ?? "canale") + "</b>\n\nCollegato: leggo i segnali che arrivano qui e li smisto sul cliente giusto.");
    return;
  }
  // aggiunto come membro semplice: chiedo i permessi
  const titolo = ev.chat.title ?? "gruppo";
  if (st === "member") {
    await adAvvisa("Sono stato aggiunto a <b>" + titolo + "</b> ma solo come membro.\n\nPromuovimi ad <b>amministratore</b> (elimina messaggi · fissa messaggi · invita utenti) e ti chiedo io il resto.");
    return;
  }
  const r = await ruolo(chat, ev.from?.id, ev.chat.type);
  if (r.r === "fornitori") {
    await adAvvisa("Sono admin nel gruppo fornitori di <b>" + r.u.codice + " · " + r.u.nome + "</b>.");
    return;
  }
  if (r.r === "cliente") {
    await send(chat, "<b>Sono amministratore.</b>");
    const { kb, nota } = await tastiera(r.u, await stato(chat));
    await send(chat, nota, {
      reply_markup: kb
    });
    return;
  }
  const kbSetup = {
    inline_keyboard: [
      [
        {
          text: "Gruppo cliente",
          callback_data: "sp:cli:" + chat
        }
      ],
      [
        {
          text: "Gruppo fornitori",
          callback_data: "sp:for:" + chat
        }
      ]
    ]
  };
  const chi = ev.from?.id;
  const pAdm = await partnerDi(chi);
  if (pAdm) {
    await send(chi, "<b>Nuovo gruppo</b>\n<b>" + titolo + "</b>\n\nChe gruppo è?", {
      reply_markup: kbSetup
    });
    await adAvvisa("🆕 <b>" + (pAdm.admin_nome ?? pAdm.nome) + "</b> ha aggiunto il bot a <b>" + titolo + "</b>\n<i>rete " + pAdm.nome + "</i>");
    return;
  }
  await adAvvisa("<b>Nuovo gruppo</b>\n<b>" + titolo + "</b>\n\nChe gruppo è?", {
    reply_markup: kbSetup
  });
}
// ═══════════════════════════ MESSAGGI ═══════════════════════════
function pulisci(t) {
  return String(t ?? "").replace(/[\u{1F000}-\u{1FAFF}\u{2190}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2600}-\u{26FF}\u{20E3}]/gu, "").replace(/\s+/g, " ").trim();
}
async function onMessaggio(m) {
  const chat = m.chat.id, from = m.from?.id;
  const testoRaw = (m.text ?? "").trim();
  const testo = testoRaw.startsWith("/") ? testoRaw : pulisci(testoRaw) || testoRaw;
  const r = await ruolo(chat, from, m.chat.type);
  // comandi admin, ovunque
  if (testo.startsWith("/") && await isAdmin(from)) {
    if (await comandiAdmin(chat, testo, from, m)) return;
  }
  if (r.r === "ignoto" && m.chat.type !== "private") {
    // i canali servono solo a leggere i segnali: non si collegano a nessuno
    if (m.chat.type === "channel") return;
    // gruppo dei segnali: se il messaggio è un segnale, lo elaboro e non chiedo nulla
    const segG = leggiSegnale(testo);
    if (segG) {
      let noto = false;
      if (segG.conto) {
        const { data } = await sb.from(T_UT).select("id").or("login_a.eq." + segG.conto + ",login_b.eq." + segG.conto + ",login_c.eq." + segG.conto).limit(1);
        noto = !!(data ?? []).length;
      }
      if (!noto && segG.nome) {
        const { data: cl } = await sb.from(T_UT).select("nome");
        const cerca = String(segG.nome).toLowerCase().replace(/\s+/g, " ").trim();
        noto = (cl ?? []).some((x)=>String(x.nome ?? "").toLowerCase().replace(/\s+/g, " ").trim() === cerca);
      }
      if (noto) {
        const { data: ad } = await sb.from(T_AD).select("telegram_user_id").limit(1).maybeSingle();
        if (ad?.telegram_user_id) await daSegnale(ad.telegram_user_id, segG, ad.telegram_user_id);
      }
      return;
    }
    // gruppo non collegato: avviso te in privato, senza scrivere nel gruppo
    const k = "avvisato_" + m.chat.id;
    const { data: gia } = await sb.from("bvb_impostazioni").select("chiave").eq("chiave", k).maybeSingle();
    if (!gia) {
      await sb.from("bvb_impostazioni").insert({
        chiave: k,
        valore: new Date().toISOString()
      }).then(()=>{}, ()=>{});
      const { data: cl } = await sb.from(T_UT).select("codice, nome, gruppo_fornitori_id").order("codice");
      const kb = (cl ?? []).map((x)=>[
          {
            text: (x.gruppo_fornitori_id ? "🔁 " : "") + x.codice + " · " + x.nome,
            callback_data: "gf:" + m.chat.id + ":" + x.codice
          }
        ]);
      kb.push([
        {
          text: "👤 È un gruppo cliente",
          callback_data: "sp:cli:" + m.chat.id
        }
      ]);
      await adAvvisa("🔎 <b>Gruppo non collegato</b>\n<b>" + (m.chat.title ?? "senza nome") + "</b>\n<code>" + m.chat.id + "</code>\n\nDi chi sono i fornitori?", {
        reply_markup: {
          inline_keyboard: kb
        }
      });
    }
    return;
  }
  if (r.r === "cliente_privato") {
    const ok = await collegaPrivato(r.u, from);
    const t = await tokenApp(r.u);
    await send(chat, "📊 <b>LA TUA DASHBOARD</b>\n\nGuadagni, andamento dei cicli e storico completo.", {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Apri dashboard",
              ...Number(chat) > 0 ? {
                web_app: {
                  url: APP_DASH + "?v=" + APP_VER + "&t=" + t
                }
              } : {
                url: APP_DASH + "?v=" + APP_VER + "&t=" + t
              }
            }
          ],
          [
            {
              text: "Ultimo ciclo",
              ...Number(chat) > 0 ? {
                web_app: {
                  url: APP_CICLO + "?v=" + APP_VER + "&t=" + t
                }
              } : {
                url: APP_CICLO + "?v=" + APP_VER + "&t=" + t
              }
            }
          ]
        ]
      }
    });
    if (ok) await send(chat, "<i>Trovi la dashboard anche nel bottone qui sotto, accanto al campo di testo.</i>");
    return;
  }
  if (r.r === "cliente") return await areaCliente(chat, r.u, testo, m, from);
  if (r.r === "fornitori") return await areaFornitori(chat, r.u, testo, m, from);
  if (r.r === "misto") return await areaMista(chat, r.u, r.p, testo, from);
  if (r.r === "partner") return await areaPartner(chat, r.p, testo, from);
  if (r.r === "admin") {
    const s = await stato(chat);
    {
      const seg = leggiSegnale(testo);
      if (seg && await daSegnale(chat, seg, from)) return;
    }
    if (m?.photo?.length) {
      const f = m.photo[m.photo.length - 1].file_id;
      await setStato(chat, "prova_conf", {
        file_id: f
      });
      await send(chat, "🖼 <b>Foto ricevuta.</b>\n\nLa uso come prova nel percorso di vendita?", {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "✅ Sì, aggiungila",
                callback_data: "pv:add"
              }
            ],
            [
              {
                text: "🗑 No",
                callback_data: "pv:no"
              }
            ],
            [
              {
                text: "📋 Vedi quelle attuali",
                callback_data: "pv:lista"
              }
            ]
          ]
        }
      });
      return;
    }
    if (s.step && s.step.startsWith("ad_") && testo) {
      const parti = s.step.split("_"), az = parti[1], cod = parti[2];
      if (testo === "Indietro") {
        await setStato(chat, null, {});
        await send(chat, "⬅️", {
          reply_markup: KB_ADMIN
        });
        return await schedaCliente(chat, cod);
      }
      if (testo === "Annulla" || testo === "Annulla tutto") {
        await setStato(chat, null, {});
        await send(chat, "Annullato.", {
          reply_markup: KB_ADMIN
        });
        return;
      }
      const u = await perCodice(cod);
      if (!u) {
        await setStato(chat, null, {});
        return;
      }
      if (az === "fee") {
        const n = numero(testo);
        if (isNaN(n) || n < 0 || n > 100) {
          await send(chat, "Scrivi un numero tra 0 e 100.");
          return;
        }
        await sb.from(T_UT).update({
          fee_percent: n
        }).eq("id", u.id);
        await setStato(chat, null, {});
        await send(chat, "✅ Fee di <b>" + cod + "</b> al <b>" + n + "%</b>.");
        return await schedaCliente(chat, cod);
      }
      if (az === "wallet") {
        const v = testo.trim();
        if (/^auto$/i.test(v)) await sb.from(T_UT).update({
          wallet_fee: null
        }).eq("id", u.id);
        else if (!/^0x[a-fA-F0-9]{40}$/.test(v)) {
          await send(chat, "Wallet non valido. Deve iniziare per <code>0x</code>, oppure scrivi <code>auto</code>.");
          return;
        } else await sb.from(T_UT).update({
          wallet_fee: v
        }).eq("id", u.id);
        await setStato(chat, null, {});
        await send(chat, "✅ Wallet aggiornato.");
        return await schedaCliente(chat, cod);
      }
      if (az === "conti") {
        const righe = testo.split("\n").map((x)=>x.trim()).filter(Boolean);
        if (righe.length < 2) {
          await send(chat, "Servono <b>due righe</b>, una per broker.");
          return;
        }
        const a = righe[0].split(/\s+/), b = righe[1].split(/\s+/);
        if (!/^\d{4,}$/.test(a[0]) || !/^\d{4,}$/.test(b[0])) {
          await send(chat, "Ogni riga deve iniziare col <b>numero di conto</b>.");
          return;
        }
        await sb.from(T_UT).update({
          login_a: a[0],
          tfx_server: a[1] ?? null,
          tfx_email: a[2] ?? null,
          tfx_pass: a[3] ?? null,
          login_b: b[0],
          rbx_server: b[1] ?? null,
          rbx_pass: b[2] ?? null,
          onboarding_ok: true,
          onboarding_step: "completo",
          depositi_ok: true,
          tfx_setup_ok: true,
          rbx_verificato: true
        }).eq("id", u.id);
        await setStato(chat, null, {});
        await send(chat, "✅ Conti registrati. <b>" + cod + "</b> è operativo.");
        const f = await fresco(u.id);
        if (f?.gruppo_utente_id) await send(f.gruppo_utente_id, "✅ <b>Conti registrati.</b>\nSei operativo: quando i saldi sono bilanciati premi <b>Inizia nuovo ciclo</b>.", {
          reply_markup: KB_PRONTO
        });
        return await schedaCliente(chat, cod);
      }
      if (az === "vpsdata") {
        const dm = testo.trim().replace(/[-.]/g, "/").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if (!dm) {
          await send(chat, "Formato non valido. Scrivi <code>20/08/26</code>");
          return;
        }
        const anno = dm[3].length === 2 ? "20" + dm[3] : dm[3];
        const dt = new Date(anno + "-" + dm[2].padStart(2, "0") + "-" + dm[1].padStart(2, "0") + "T12:00:00Z");
        if (isNaN(dt.getTime())) {
          await send(chat, "Data non valida.");
          return;
        }
        await setStato(chat, null, {});
        return await attivaVps(chat, u, dt);
      }
      return;
    }
    if (s.step === "padm_nome" && testo && !testo.startsWith("/")) {
      const nome = testo.trim();
      if (nome.split(/\s+/).filter(Boolean).length < 2) {
        await send(chat, "Scrivi <b>nome e cognome</b>.");
        return;
      }
      await sb.from(T_PA_ADM).update({
        nome
      }).eq("id", s.dati?.admin);
      const { data: cl } = await sb.from(T_UT).select("id, nome, telegram_id");
      const cerca = nome.toLowerCase().replace(/\s+/g, " ").trim();
      const suo = (cl ?? []).find((x)=>String(x.nome ?? "").toLowerCase().replace(/\s+/g, " ").trim() === cerca && !x.telegram_id);
      if (suo) await sb.from(T_UT).update({
        telegram_id: chat
      }).eq("id", suo.id);
      await setStato(chat, null, {});
      await send(chat, "✅ <b>Piacere " + nome.split(" ")[0] + ".</b>\nEcco la tua area.");
      await adAvvisa("👥 <b>" + nome + "</b> si è registrato come admin.");
      return;
    }
    if (s.step && s.step.startsWith("br_") && testo && !testo.startsWith("/")) {
      const campo = s.step.slice(3), v = testo.trim();
      if (campo === "nome" && !s.dati?.pre) {
        const slug = v.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "b" + Date.now() % 9999;
        const { count } = await sb.from(T_BR).select("*", {
          count: "exact",
          head: true
        });
        const r = await sb.from(T_BR).insert({
          nome: v,
          slug,
          ruolo: "secondario",
          ordine: (count ?? 0) + 1
        }).select().single();
        await setStato(chat, null, {});
        if (r.error) {
          await send(chat, "❌ " + r.error.message, {
            reply_markup: KB_ADMIN
          });
          return;
        }
        await send(chat, "✅ <b>" + v + "</b> aggiunto ai broker.", {
          reply_markup: KB_ADMIN
        });
        return await schedaBroker(chat, r.data.id.slice(0, 8));
      }
      const bs = await brokers(false);
      const b = bs.find((x)=>x.id.startsWith(String(s.dati?.pre ?? "")));
      if (!b) {
        await setStato(chat, null, {});
        return;
      }
      const col = campo === "nome" ? "nome" : campo === "link" ? "link_iscrizione" : "istruzioni";
      await sb.from(T_BR).update({
        [col]: v
      }).eq("id", b.id);
      await setStato(chat, null, {});
      await send(chat, "✅ <b>Aggiornato.</b>", {
        reply_markup: KB_ADMIN
      });
      return await schedaBroker(chat, b.id.slice(0, 8));
    }
    if (s.step && s.step.startsWith("padm_") && testo) {
      const [, pre, ruolo] = s.step.split("_");
      if (testo === "Indietro" || testo === "Annulla") {
        await setStato(chat, null, {});
        await send(chat, "⬅️", {
          reply_markup: KB_ADMIN
        });
        return await pannelloAdminPartner(chat, pre);
      }
      const { data: pts } = await sb.from(T_PT).select("*");
      const p = (pts ?? []).find((x)=>x.id.startsWith(pre));
      if (!p) {
        await setStato(chat, null, {});
        return;
      }
      const { data: nuovo } = await sb.from(T_PA_ADM).insert({
        partner_id: p.id,
        nome: testo.trim(),
        ruolo
      }).select().single();
      await setStato(chat, null, {});
      await send(chat, "✅ <b>" + testo.trim() + "</b> aggiunto come admin di " + p.nome + ".\n\nMandagli questo link:\n<code>https://t.me/cashly_bvb_bot?start=a_" + nuovo.id.slice(0, 8) + "</code>\n\n<i>Lo apre e si collega da solo.</i>", {
        reply_markup: KB_ADMIN
      });
      return;
    }
    if (s.step && s.step.startsWith("np_") && testo && !testo.startsWith("/")) {
      if (testo === "Indietro") {
        const i = parseInt(s.step.split("_")[1], 10);
        if (!isNaN(i) && i > 1) return await nuovoPartner(chat, i - 1, s.dati);
        await setStato(chat, null, {});
        await send(chat, "⬅️", {
          reply_markup: KB_ADMIN
        });
        return await pannelloAffiliati(chat);
      }
      if (testo === "Annulla" || testo === "Annulla tutto") {
        await setStato(chat, null, {});
        await send(chat, "Annullato.", {
          reply_markup: KB_ADMIN
        });
        return;
      }
      if (s.step === "np_ok") return;
      return await inputPartner(chat, s, testo);
    }
    if (s.step === "com_testo" && testo && !testo.startsWith("/")) {
      if (testo === "Indietro") {
        await setStato(chat, null, {});
        await send(chat, "⬅️", {
          reply_markup: KB_ADMIN
        });
        return await avviaComunicazione(chat);
      }
      if (testo === "Annulla" || testo === "Annulla tutto") {
        await setStato(chat, null, {});
        await send(chat, "Annullato.", {
          reply_markup: KB_ADMIN
        });
        return;
      }
      const dest = await destinatari(s.dati?.scope ?? "all");
      await setStato(chat, "com_ok", {
        ...s.dati,
        testo
      });
      await send(chat, "📢 <b>ANTEPRIMA</b>\n━━━━━━━━━━━━━━\n\n" + testo + "\n\n━━━━━━━━━━━━━━\n<i>Arriverà a " + dest.length + (dest.length === 1 ? " gruppo" : " gruppi") + ":</i>\n" + dest.map((x)=>x.codice + " · " + x.nome).join("\n"), {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "📤 Invia ora",
                callback_data: "com_go"
              }
            ],
            [
              {
                text: "✏️ Riscrivi",
                callback_data: "com:" + (s.dati?.scope ?? "all")
              },
              {
                text: "❌ Annulla",
                callback_data: "com:no"
              }
            ]
          ]
        }
      });
      return;
    }
    if (s.step === "setup_nome" && testo && !testo.startsWith("/")) return await creaCliente(chat, testo);
    return await areaAdmin(chat, testo, from);
  }
  if (r.r === "lead") {
    if (String(testo ?? "").startsWith("/start")) return await areaLead(chat, testo, m, from);
    const l = await lead(from, m, null);
    return await funnel(chat, l, testo);
  }
}
// ═══════════════════════════ CLIENTE ═══════════════════════════
async function areaCliente(chat, u, testo, m, from) {
  const st = await stato(chat);
  {
    const seg = leggiSegnale(testo);
    if (seg && await daSegnale(chat, seg, from)) return;
  }
  // gruppo unico: cliente e fornitori nella stessa chat
  if (String(u.gruppo_fornitori_id ?? "") === String(chat) && testo && !testo.startsWith("/")) {
    const w = testo.toLowerCase().replace(/[.!?,;:]+$/, "").replace(/\s+/g, " ").trim();
    const hit = FRASI.find(([re])=>re.test(w));
    const cc = testo.trim().split(/[\s\n]+/).filter(Boolean);
    const nuovoConto = cc.length === 2 && /^\d{5,10}$/.test(cc[0]) && cc[1].length >= 4 && !/^\d+$/.test(cc[1]);
    if (hit || nuovoConto) {
      await areaFornitori(chat, u, testo, m, from);
      return;
    }
  }
  // parole che riportano sempre la tastiera, comunque siano scritte
  if (/^\/?(aggiorna|menu|men[uù]|tastiera|start|help|aiuto|comandi)$/i.test(String(testo ?? "").trim())) {
    const { kb, nota } = await tastiera(u, st);
    await send(chat, nota, {
      reply_markup: kb
    });
    const rip0 = ripresa(u, st);
    if (rip0) await send(chat, "<b>Sei qui:</b> " + rip0.tit, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: rip0.btn,
              callback_data: rip0.cb
            }
          ]
        ]
      }
    });
    return;
  }
  if (testo === "Aggiorna") {
    const { kb, nota } = await tastiera(u, st);
    await send(chat, " " + nota, {
      reply_markup: kb
    });
    const rip = ripresa(u, st);
    if (rip) await send(chat, "<b>Sei qui:</b> " + rip.tit, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: rip.btn,
              callback_data: rip.cb
            }
          ]
        ]
      }
    });
    return;
  }
  if (u.bannato) return;
  if (u.sospeso) return;
  if (!u.onboarding_ok) {
    if (testo === "Indietro" && st.step && st.step.startsWith("br_")) {
      const [, b, idx] = st.step.split("_");
      const i = parseInt(idx, 10);
      if (i > 0) return await chiediCampo(chat, b, i - 1, st.dati);
      await setStato(chat, null, st.dati);
      await send(chat, "Torniamo al passo precedente.", {
        reply_markup: KB_ISCR
      });
      return;
    }
    if (testo === "Annulla tutto") {
      await setStato(chat, null, {});
      await send(chat, "Ok, riprendiamo quando vuoi.", {
        reply_markup: KB_ISCR
      });
      return;
    }
    if (st.step === "budget_chiusura" && testo && !testo.startsWith("/")) {
      const v = parseFloat(String(testo).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", "."));
      if (!(v > 0)) {
        await send(chat, "Scrivi solo il numero, es. <code>4000</code>");
        return;
      }
      const d3 = {
        ...st.dati,
        budget: v
      };
      await setStato(chat, null, d3);
      return await conteggio(chat, u, d3);
    }
    if (st.step && st.step.startsWith("br_") && testo && !testo.startsWith("/")) return await inputBroker(chat, u, st, testo);
    if (st.step === "vps_hash" && testo && !testo.startsWith("/")) return await vpsHash(chat, u, testo);
    if (testo === "Continua" || testo === "Inizia") return await avviaIscrizione(chat, u);
    if (testo === "Guida") return await send(chat, "<b>GUIDA</b>", {
      reply_markup: KB_GUIDA
    });
    if (testo === "La strategia") return await guida(chat, "S", 0);
    if (testo === "Come si gestisce un ciclo") return await guida(chat, "C", 0);
    if (!st.step) return await avviaIscrizione(chat, u);
    return;
  }
  // foto: screenshot dei saldi
  if (m.document && st.step === "sto_att") {
    try {
      const info = await tg("getFile", {
        file_id: m.document.file_id
      });
      const path = info?.result?.file_path;
      if (!path) {
        await send(chat, "Non riesco a leggere il file.");
        return;
      }
      const r = await fetch("https://api.telegram.org/file/bot" + TOKEN + "/" + path);
      await anteprimaStorico(chat, u, await r.text());
    } catch (_) {
      await send(chat, "Il file non è leggibile. Deve essere un <b>CSV</b> (da Excel: Salva con nome → CSV).");
    }
    return;
  }
  if (m.photo && st.step === "conferma_auto") {
    const f = m.photo[m.photo.length - 1].file_id;
    const d = {
      ...st.dati,
      screen_fine: f
    };
    const vT2 = d.s2_t ?? d.fin_t, vR2 = d.s2_r ?? d.fin_r;
    // senza saldi il conto verrebbe sbagliato: li chiedo
    if (vT2 == null && vR2 == null) {
      await setStato(chat, "c1_t", d);
      await send(chat, "Saldo <b>finale Total FX</b>?", {
        reply_markup: KB_ANNULLA
      });
      return;
    }
    await setStato(chat, null, d);
    return await conteggio(chat, u, d);
  }
  if (m.photo && st.step === "screen_c2") {
    const f = m.photo[m.photo.length - 1].file_id;
    await setStato(chat, "step2", {
      ...st.dati,
      screen_c2: f,
      caso: 2
    });
    await send(chat, "Se il saldo su <b>Total FX</b> è negativo, richiedi prima il <b>reset</b>.", {
      reply_markup: KB_STEP2
    });
    return;
  }
  if (m.photo && st.step === "screen_c") {
    const f = m.photo[m.photo.length - 1].file_id;
    const d = st.dati, dopo = d.dopo ?? "c1_t";
    await setStato(chat, dopo, {
      ...d,
      screen_fine: f
    });
    await send(chat, "<b>Screenshot ricevuto.</b>\n\n" + DOMANDE[dopo], {
      reply_markup: KB_ANNULLA
    });
    return;
  }
  if (m.photo && st.step === "screen") {
    const f = m.photo[m.photo.length - 1].file_id;
    await setStato(chat, "budget", {
      ...st.dati,
      screen: f
    });
    await send(chat, "<b>Screenshot ricevuto.</b>\n\n" + DOMANDE.budget, {
      reply_markup: KB_ANNULLA
    });
    return;
  }
  if (testo === "Annulla tutto") return await annullaCiclo(chat, u);
  if (testo === "Indietro" && st.step && st.step.startsWith("stou_")) {
    const p = st.step.split("_")[1];
    const i = parseInt(p, 10);
    if (!isNaN(i) && i > 0) return await chiediPassoSto(chat, i - 1, st.dati, u);
    if (st.step === "stou_hash") return await chiediPassoSto(chat, PASSI_STO.length - 1, st.dati, u);
    await setStato(chat, null, {});
    return await avviaStorico(chat, u);
  }
  if (testo === "Indietro") {
    const p = st.step;
    const dietro = INDIETRO[p];
    if (p === "screen_c") {
      await setStato(chat, null, st.dati);
      const { kb, nota } = await tastiera(u, {
        step: null,
        dati: st.dati
      });
      await send(chat, nota, {
        reply_markup: kb
      });
      return;
    }
    if (dietro && DOMANDE[dietro]) {
      await setStato(chat, dietro, st.dati);
      await send(chat, DOMANDE[dietro], {
        reply_markup: KB_ANNULLA
      });
      return;
    }
    await setStato(chat, null, st.dati);
    const { kb, nota } = await tastiera(u, {
      step: null,
      dati: st.dati
    });
    await send(chat, nota, {
      reply_markup: kb
    });
    return;
  }
  if (st.step && st.step.startsWith("mod_") && testo && !testo.startsWith("/")) {
    const [, br, campo] = st.step.split("_");
    const col = CAMPI_MOD[campo]?.[br];
    if (!col) {
      await setStato(chat, null, {});
      return;
    }
    const val = testo.trim();
    if (campo === "conto" && !/^\d{4,}$/.test(val)) {
      await send(chat, "Il numero di conto è fatto solo di cifre.");
      return;
    }
    if (campo === "email" && !/@/.test(val)) {
      await send(chat, "Non sembra un'email valida.");
      return;
    }
    await sb.from(T_UT).update({
      [col]: val
    }).eq("id", u.id);
    await setStato(chat, null, {});
    const f = await fresco(u.id);
    await send(chat, "✅ <b>" + CAMPI_MOD[campo].lbl + " aggiornato.</b>");
    await adAvvisa("✏️ <b>" + u.codice + " · " + u.nome + "</b>\nha modificato " + CAMPI_MOD[campo].lbl.toLowerCase() + " di " + (NOME_BR[br] ?? br) + "\n<code>" + val + "</code>");
    if (f.gruppo_fornitori_id) {
      await send(f.gruppo_fornitori_id, "<b>" + (br === "tfx" ? "TOTAL FX" : "ROBOFOREX") + " AGGIORNATO</b>\n<code>" + (br === "tfx" ? f.login_a : f.login_b) + "</code>\n<code>" + (br === "tfx" ? f.tfx_pass ?? "" : f.rbx_pass ?? "") + "</code>");
      const tgf = await tagForn(f);
      if (tgf) await send(f.gruppo_fornitori_id, tgf);
    }
    return await contiBroker(chat, f);
  }
  if (st.step === "hash" && testo && !testo.startsWith("/")) return await riceviHash(chat, u, st, testo);
  if (st.step && st.step.startsWith("stou_") && testo && !testo.startsWith("/")) {
    if (st.step === "stou_hash") {
      const v = testo.trim();
      const mm = v.match(/0x[a-fA-F0-9]{64}/);
      if (!mm && !/^(no|n|-)$/i.test(v)) {
        await send(chat, "Incolla il link BscScan oppure scrivi <code>no</code>.");
        return;
      }
      return await riepilogoUno(chat, u, {
        ...st.dati,
        hash: mm ? mm[0] : null
      });
    }
    if (st.step === "stou_ok") return;
    return await inputStorico(chat, u, st, testo);
  }
  if (st.step === "sto_att" && testo && !testo.startsWith("/")) return await anteprimaStorico(chat, u, testo);
  // input numerici del flusso
  if (st.step && PASSI[st.step] && testo && !testo.startsWith("/")) {
    const n = numero(testo);
    const negOk = st.step === "c2_res";
    if (isNaN(n) || !negOk && n < 0) {
      await send(chat, "Scrivi solo il numero, es. <code>4250.30</code>");
      return;
    }
    if (st.step === "budget" && (n < 2000 || n > 30000)) {
      await send(chat, "Il budget deve stare tra <b>2.000</b> e <b>30.000</b>.");
      return;
    }
    const p = PASSI[st.step];
    await setStato(chat, st.step, {
      ...st.dati,
      [p.campo]: n
    });
    // il budget ha già il suo riepilogo col confronto: niente doppia conferma
    if (st.step === "budget") {
      const d0 = {
        ...st.dati,
        budget: n
      };
      await setStato(chat, "conferma_avvio", d0);
      await send(chat, "<b>Budget " + eurI(n) + "</b>\n" + eurI(n / 2) + " per conto.\n\nTutto giusto?", {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "✅ Confermo",
                callback_data: "avvia"
              }
            ],
            [
              {
                text: "✏️ Riscrivi",
                callback_data: "back"
              },
              {
                text: "❌ Annulla",
                callback_data: "annulla"
              }
            ]
          ]
        }
      });
      return;
    }
    await send(chat, p.etichetta + ": <b>" + eur(n) + "</b> — confermi?", {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Conferma",
              callback_data: "num_ok"
            },
            {
              text: "Riscrivi",
              callback_data: "num_no"
            }
          ],
          [
            {
              text: "Indietro",
              callback_data: "back"
            }
          ]
        ]
      }
    });
    return;
  }
  switch(testo){
    case "Inizia nuovo ciclo":
      return await iniziaCiclo(chat, u);
    case "Vinto su TotalFX":
      return await chiudiCaso1(chat, u, st);
    case "Vinto su Roboforex":
    case "Vinto su Monaxa":
      return await chiudiCaso2(chat, u, st);
    case "Richiedi reset NBP":
      return await chiediReset(chat, u);
    case "Richiedi bonus 30%":
      return await chiediBonus(chat, u, st);
    case "Bonus arrivato":
      return await bonusArrivato(chat, u, st);
    case "Chiudi 2° step":
      return await chiudiStep2(chat, u, st);
    case "Ho pagato":
      return await hoPagato(chat, u, st);
    case "Annulla":
      return await annullaCiclo(chat, u);
    case "Dashboard":
      {
        const t = await tokenApp(u);
        return await send(chat, "📊 <b>LA TUA DASHBOARD</b>\n\nProfitto accumulato, andamento dei cicli e registro completo.", {
          reply_markup: {
            inline_keyboard: appKb(chat, [
              [
                "Apri dashboard",
                APP_DASH + "?v=" + APP_VER + "&t=" + t
              ],
              [
                "🏆 Ultimo ciclo",
                APP_CICLO + "?v=" + APP_VER + "&t=" + t
              ]
            ])
          }
        });
      }
    case "Menu":
      {
        const { kb, nota } = await tastiera(u, st);
        return await send(chat, nota, {
          reply_markup: kb
        });
      }
    case "Impostazioni":
      return await send(chat, "<b>IMPOSTAZIONI</b>", {
        reply_markup: KB_IMPO
      });
    case "Conti broker":
      return await contiBroker(chat, u);
    case "Gestione VPS":
      return await schedaVps(chat, u);
    case "Pagamenti fee":
      return await storicoPagamenti(chat, u);
    case "Carica storico":
      return await avviaStorico(chat, u);
    case "Guida":
      return await send(chat, "<b>GUIDA</b>\n\nTutto quello che serve sapere, in due minuti.", {
        reply_markup: KB_GUIDA
      });
    case "La strategia":
      return await guida(chat, "S", 0);
    case "Come si gestisce un ciclo":
      return await guida(chat, "C", 0);
    case "Indietro":
      {
        const { kb, nota } = await tastiera(u, st);
        return await send(chat, " " + nota, {
          reply_markup: kb
        });
      }
  }
}
// passi di inserimento numerico
const PASSI = {
  budget: {
    campo: "budget",
    etichetta: "Capitale totale",
    dopo: null
  },
  c1_t: {
    campo: "fin_t",
    etichetta: "Saldo finale TotalFX",
    dopo: "c1_r"
  },
  c1_r: {
    campo: "fin_r",
    etichetta: "Saldo finale Roboforex",
    dopo: null
  },
  c2_r: {
    campo: "fin_r",
    etichetta: "Saldo finale Roboforex",
    dopo: "c2_res"
  },
  c2_res: {
    campo: "res_t",
    etichetta: "Residuo su TotalFX",
    dopo: null
  },
  s2_t: {
    campo: "s2_t",
    etichetta: "Saldo finale TotalFX",
    dopo: "s2_r"
  },
  s2_r: {
    campo: "s2_r",
    etichetta: "Saldo finale Roboforex",
    dopo: null
  }
};
const DOMANDE = {
  budget: "<b>Capitale totale</b> sui due conti?\n<i>Es.</i> <code>6000</code>",
  screen: "Manda lo <b>screenshot</b> dei conti bilanciati.\n<i>Poi inserisci il capitale totale.</i>",
  c1_t: "Saldo <b>finale TotalFX</b>?\n<i>Il conto dove è andato il profitto.</i>",
  c1_r: "Saldo <b>finale</b> sul secondo conto?",
  c2_r: "Saldo <b>finale</b> sul secondo conto?\n<i>Quello dove è andato il profitto.</i>",
  c2_res: "Residuo su <b>TotalFX</b>?\n\n<i>Se il conto è a zero o in negativo scrivi</i> <code>0</code>",
  s2_t: "Saldo <b>finale TotalFX</b>?\n<i>Se il profitto è finito sull'altro conto scrivi</i> <code>0</code>",
  s2_r: "Saldo <b>finale</b> sul secondo conto?"
};
async function iniziaCiclo(chat, u) {
  if (u.ciclo_attivo) {
    await send(chat, "Hai già un ciclo attivo da " + eurI(u.budget_ciclo ?? 0) + ".");
    return;
  }
  if (!u.onboarding_ok) {
    await send(chat, "Prima bisogna completare la registrazione dei conti.");
    return;
  }
  await setStato(chat, "screen", {});
  await send(chat, DOMANDE.screen, {
    reply_markup: KB_ANNULLA
  });
}
async function chiudiCaso1(chat, u, st) {
  if (!u.ciclo_attivo) {
    await send(chat, "Nessun ciclo attivo.");
    return;
  }
  await setStato(chat, "screen_c", {
    ...st.dati,
    caso: 1,
    dopo: "c1_t"
  });
  await send(chat, "<b>Vinto su TotalFX</b>\n\nManda uno <b>screenshot</b> con i saldi finali dei due conti.", {
    reply_markup: KB_ANNULLA
  });
}
async function chiudiCaso2(chat, u, st) {
  if (!u.ciclo_attivo) {
    await send(chat, "Nessun ciclo attivo.");
    return;
  }
  await setStato(chat, "screen_c2", {
    ...st.dati,
    caso: 2
  });
  await setStato(chat, "step2", {
    ...st?.dati ?? {},
    caso: 2
  });
  await send(chat, "🔵 <b>Vinto su " + nomeB(st?.dati) + "</b>\n\nSe il saldo su <b>Total FX</b> è negativo, richiedi prima il <b>reset</b>.", {
    reply_markup: KB_STEP2
  });
}
async function chiudiStep2(chat, u, st) {
  await setStato(chat, "s2_dove", {
    ...st.dati
  });
  await send(chat, "<b>CHIUSURA 2° STEP</b>", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "TotalFX",
            callback_data: "s2:t"
          }
        ],
        [
          {
            text: nomeB((await stato(chat))?.dati),
            callback_data: "s2:r"
          }
        ]
      ]
    }
  });
}
async function annullaCiclo(chat, u) {
  await send(chat, "<b>Annullare?</b>\n\nCancello quanto fatto finora e riparti da zero.\n<i>Non tocca i conti reali, solo lo stato qui dentro.</i>", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Sì, annulla",
            callback_data: "ann_si"
          },
          {
            text: "No",
            callback_data: "ann_no"
          }
        ]
      ]
    }
  });
}
// ─────────────────────── reset · bonus · sollecito ───────────────────────
async function chiediReset(chat, u) {
  if (!u.login_a) {
    await send(chat, "Numero di conto TotalFX non registrato. Avvisa lo staff.");
    return;
  }
  await dicituraForn(u, "NBP " + u.login_a);
  await sb.from(T_UT).update({
    reset_richiesto_il: new Date().toISOString()
  }).eq("id", u.id);
  const s0 = await stato(chat);
  await setStato(chat, "step2", {
    ...s0.dati ?? {},
    reset: true
  });
  await send(chat, "🔄 <b>Reset richiesto.</b>", {
    reply_markup: KB_SOLO_BONUS
  });
}
async function chiediBonus(chat, u, st) {
  if (!u.login_a) {
    await send(chat, "Numero di conto TotalFX non registrato.");
    return;
  }
  const d0 = st.dati ?? {};
  const base = Number(u.budget_ciclo ?? 0) > 0 ? Number(u.budget_ciclo) / 2 : Number(d0.budget ?? 0) / 2;
  const b = Math.round(base * 0.30);
  if (!(b > 0)) {
    await send(chat, "Non riesco a calcolare il bonus: manca il capitale del ciclo.");
    return;
  }
  await dicituraForn(u, u.login_a + "\n" + b + "€\nADD BONUS");
  await sb.from(T_UT).update({
    bonus_richiesto_il: new Date().toISOString()
  }).eq("id", u.id);
  await setStato(chat, "attesa_bonus", {
    ...d0,
    bonus: b
  });
  await send(chat, "🎁 <b>Bonus richiesto: " + eurI(b) + "</b>\n\nAppena lo vedi sul conto premi <b>Bonus arrivato</b>.", {
    reply_markup: KB_BONUS2
  });
}
async function bonusArrivato(chat, u, st) {
  await dicituraForn(u, "BONUS ARRIVATO. PRONTO A PARTIRE");
  await setStato(chat, "attesa_step2", {
    ...st.dati ?? {},
    step2: true
  });
  await send(chat, "✅ <b>Avvisati i fornitori.</b>\nTi avviso appena aprono le posizioni.", {
    reply_markup: kbBase([
      [
        {
          text: "📋 Menu"
        }
      ]
    ])
  });
}
async function conteggio(chat, u, d) {
  let budget = Number(d.budget ?? u.budget_ciclo ?? 0);
  if (!(budget > 0)) {
    // recupero il capitale dal ciclo aperto: senza, il profitto sarebbe tutto il saldo
    const { data: ca } = await sb.from(T_CI).select("saldo_ini_a").eq("utente_id", u.id).in("stato", [
      "aperto",
      "in_corso"
    ]).order("numero", {
      ascending: false
    }).limit(1).maybeSingle();
    budget = Number(ca?.saldo_ini_a ?? 0);
  }
  if (!(budget > 0)) {
    await setStato(chat, "budget_chiusura", d);
    await send(chat, "Mi manca il <b>capitale di partenza</b> di questo ciclo.\n\nQuant'era il totale sui due conti?\n<i>Es.</i> <code>4000</code>", {
      reply_markup: KB_ANNULLA
    });
    return;
  }
  // i saldi possono stare nei campi del caso 1 o in quelli del 2° step
  const vT = d.s2_t ?? d.fin_t, vR = d.s2_r ?? d.fin_r;
  const finT = Math.max(0, Number(vT ?? 0));
  const finR = Number(vR ?? 0);
  if (budget > 0 && vT == null && vR == null) {
    {
      const dz = {
        ...d
      };
      delete dz.s2_t;
      delete dz.s2_r;
      delete dz.s2_dove;
      delete dz.fin_t;
      delete dz.fin_r;
      await setStato(chat, "c1_t", dz);
    }
    await send(chat, "Mi mancano i <b>saldi finali</b>.\n\nSaldo <b>finale Total FX</b>?", {
      reply_markup: KB_ANNULLA
    });
    return;
  }
  // il profitto si arrotonda all'euro superiore
  const profittoReale = finT + finR - budget;
  const profitto = profittoReale > 0 ? Math.ceil(profittoReale) : Math.round(profittoReale * 100) / 100;
  const perc = (u.fee_percent != null ? Number(u.fee_percent) : parseFloat(await imp("fee_percent", "50"))) / 100;
  const fee = profitto > 0 ? Math.round(profitto * perc * 100) / 100 : 0;
  const cb1 = await cambio();
  const feeU = Math.round(fee * cb1 * 100) / 100;
  const { data: ultimo } = await sb.from(T_CI).select("numero").eq("utente_id", u.id).order("numero", {
    ascending: false
  }).limit(1).maybeSingle();
  const num = (ultimo?.numero ?? 0) + 1;
  const { data: ciclo } = await sb.from(T_CI).insert({
    utente_id: u.id,
    numero: num,
    saldo_ini_a: budget,
    saldo_fin_a: finT,
    saldo_fin_b: finR,
    profitto_eur: profitto,
    fee_eur: fee,
    cambio_usdt: cb1,
    fee_usdt: feeU,
    stato: profitto > 0 ? "conteggio" : "chiuso",
    avviato_il: d.avviato ?? new Date().toISOString(),
    chiuso_il: new Date().toISOString()
  }).select().single();
  // al cliente: tre messaggi
  await send(chat, "📈 <b>Profitto " + eur(profitto) + "</b>");
  if (fee > 0) {
    await send(chat, "💸 <b>Commissione " + Math.round(perc * 100) + "% · " + eur(fee) + "</b>");
    await send(chat, "💰 <b>Da pagare " + usdt(feeU) + "</b>", {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "✅ Confermo",
              callback_data: "cfr:" + ciclo.id
            }
          ]
        ]
      }
    });
  }
  // ai fornitori: screenshot e stessi numeri
  if (u.gruppo_fornitori_id) {
    if (d.screen_fine) await tg("sendPhoto", {
      chat_id: u.gruppo_fornitori_id,
      photo: d.screen_fine
    });
    await send(u.gruppo_fornitori_id, "📈 <b>Profitto " + eur(profitto) + "</b>");
    if (fee > 0) {
      await send(u.gruppo_fornitori_id, "💸 <b>Fee " + Math.round(perc * 100) + "% · " + eur(fee) + "</b>");
      await send(u.gruppo_fornitori_id, "💰 <b>Da ricevere " + usdt(feeU) + "</b>");
    }
    const tg2 = await tagForn(u);
    if (tg2) await send(u.gruppo_fornitori_id, tg2);
  }
  if (fee <= 0) {
    await sb.from(T_UT).update({
      ciclo_attivo: false,
      budget_ciclo: null
    }).eq("id", u.id);
    await setStato(chat, null, {});
    await send(chat, "⚪ <b>Ciclo #" + num + " chiuso in pari.</b>\nNessuna commissione. Ribilancia e riparti.", {
      reply_markup: KB_PRONTO
    });
    return;
  }
  await setStato(chat, "attesa_conferma", {
    ...d,
    ciclo_id: ciclo.id,
    fee_usdt: feeU
  });
}
async function chiediPagamento(chat, u, cicloId) {
  const { data: c } = await sb.from(T_CI).select("*").eq("id", cicloId).maybeSingle();
  if (!c) return;
  if (Number(c.fee_eur ?? 0) <= 0) {
    await sb.from(T_CI).update({
      stato: "chiuso"
    }).eq("id", c.id);
    await sb.from(T_UT).update({
      ciclo_attivo: false,
      budget_ciclo: null
    }).eq("id", u.id);
    await setStato(chat, null, {});
    await send(chat, "<b>Ciclo #" + c.numero + "chiuso in pari.</b>\nNessuna commissione. Puoi ripartire quando vuoi.", {
      reply_markup: KB_PRONTO
    });
    return;
  }
  const w = await walletFee(u);
  await sb.from(T_CI).update({
    stato: "da_pagare"
  }).eq("id", c.id);
  await setStato(chat, "paga", {
    ciclo_id: c.id,
    fee_usdt: Number(c.fee_usdt)
  });
  await send(chat, "<b>COMMISSIONE DA VERSARE</b>\n\n<b>" + usdt(Number(c.fee_usdt)) + "</b>\n\nSolo rete <b>BEP20 (BSC)</b>. Su altre reti i fondi si perdono.");
  await send(chat, "<code>" + w + "</code>", {
    reply_markup: KB_PAGA
  });
}
async function hoPagato(chat, u, st) {
  if (st.step !== "paga") {
    return;
  }
  await setStato(chat, "hash", st.dati);
  await send(chat, "Incolla il <b>link BscScan</b> della transazione.\n<i>Esempio: bscscan.com/tx/0x...</i>", {
    reply_markup: KB_ANNULLA
  });
}
// ─────────────────────── verifica on-chain ───────────────────────
const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";
const TOPIC_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
async function verificaTx(hash, wallet, attesi) {
  try {
    const rpc = await imp("bsc_rpc", "https://bsc-dataseed.binance.org");
    const r = await fetch(rpc, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getTransactionReceipt",
        params: [
          hash
        ]
      })
    });
    const d = await r.json();
    const rec = d?.result;
    if (!rec) return {
      ok: false,
      motivo: "Transazione non trovata sulla blockchain."
    };
    if (rec.status !== "0x1") return {
      ok: false,
      motivo: "La transazione risulta fallita."
    };
    const dest = String(wallet).toLowerCase().replace("0x", "");
    for (const log of rec.logs ?? []){
      if (String(log.address).toLowerCase() !== USDT_BSC.toLowerCase()) continue;
      if (String(log.topics?.[0]).toLowerCase() !== TOPIC_TRANSFER) continue;
      const a = String(log.topics?.[2] ?? "").toLowerCase();
      if (!a.endsWith(dest)) continue;
      const val = Number(BigInt(log.data)) / 1e18;
      const scarto = Math.abs(val - attesi) / (attesi || 1);
      if (scarto <= 0.02) return {
        ok: true,
        importo: val
      };
      return {
        ok: false,
        motivo: "Importo diverso: ricevuti " + usdt(val) + ", attesi " + usdt(attesi) + ".",
        importo: val
      };
    }
    return {
      ok: false,
      motivo: "Nessun trasferimento USDT verso il nostro wallet in questa transazione."
    };
  } catch (e) {
    return {
      ok: false,
      motivo: "Non riesco a leggere la blockchain in questo momento.",
      errore: String(e)
    };
  }
}
async function riceviHash(chat, u, st, testo) {
  const m = String(testo).match(/0x[a-fA-F0-9]{64}/);
  if (!m) {
    await send(chat, "Non trovo l'hash. Incolla il link completo di BscScan.");
    return;
  }
  const hash = m[0];
  const { data: gia } = await sb.from(T_PA).select("id").eq("tx_hash", hash).maybeSingle();
  if (gia) {
    await send(chat, "Questa transazione risulta già registrata.");
    return;
  }
  const w = await walletFee(u);
  const attesi = Number(st.dati.fee_usdt ?? 0);
  await send(chat, "Verifico sulla blockchain…");
  const es = await verificaTx(hash, w, attesi);
  const cb1 = await cambio();
  await sb.from(T_PA).insert({
    ciclo_id: st.dati.ciclo_id,
    utente_id: u.id,
    tipo: "fee",
    tx_hash: hash,
    importo_usdt: es.importo ?? attesi,
    cambio_eur: cb1,
    wallet_destinatario: w,
    stato: es.ok ? "verificato" : "in_verifica",
    verificato_at: new Date().toISOString()
  });
  if (!es.ok) {
    await send(chat, "<b>Verifica non riuscita</b>\n" + es.motivo + "\n\nLo staff controlla a mano e ti avvisa.");
    if (u.gruppo_fornitori_id) {
      await send(u.gruppo_fornitori_id, "<b>FEE PAGATA</b>");
      await send(u.gruppo_fornitori_id, "https://bscscan.com/tx/" + hash);
      const tgf = await tagForn(u);
      if (tgf) await send(u.gruppo_fornitori_id, tgf);
    }
    await adAvvisa("💰 <b>Pagamento da approvare</b>\n" + u.codice + " · " + u.nome + "\n" + usdt(es.importo ?? attesi) + (es.ok ? " · verificato on-chain" : " · <b>da controllare</b>") + "\n\nhttps://bscscan.com/tx/" + hash, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "✅ Approva e chiudi",
              callback_data: "a:pagamento:" + u.codice
            }
          ]
        ]
      }
    });
    await apriAttesa(u, "verifica pagamento");
    await setStato(chat, "attesa_pagamento", st.dati);
    return;
  }
  await send(chat, "<b>Pagamento verificato sulla blockchain.</b>\n" + usdt(es.importo) + "ricevuti.");
  await dicituraForn(u, "Pagato Fees : https://bscscan.com/tx/" + hash);
  // verificato on-chain: si chiude subito, senza aspettare conferme
  await adAvvisa("✅ <b>" + u.codice + " · " + u.nome + "</b>\n" + usdt(es.importo) + " verificati · ciclo chiuso");
  return await chiudiCiclo(chat, u, st.dati?.ciclo_id);
}
async function chiudiCiclo(chat, u, cicloId) {
  const { data: c } = await sb.from(T_CI).select("*").eq("id", cicloId).maybeSingle();
  await sb.from(T_CI).update({
    stato: "pagato"
  }).eq("id", cicloId);
  await sb.from(T_UT).update({
    ciclo_attivo: false,
    budget_ciclo: null
  }).eq("id", u.id);
  await chiudiAttesa(u.id);
  await setStato(chat, null, {});
  if (!c) return;
  const netto = Number(c.profitto_eur ?? 0) - Number(c.fee_eur ?? 0);
  const budget = Number(c.saldo_ini_a ?? 0);
  const p = budget > 0 ? netto / budget * 100 : 0;
  const ms = c.avviato_il && c.chiuso_il ? new Date(c.chiuso_il).getTime() - new Date(c.avviato_il).getTime() : null;
  const quanto = ms && ms > 0 ? durataTesto(ms) : null;
  const { data: tutti } = await sb.from(T_CI).select("profitto_eur, fee_eur").eq("utente_id", u.id).in("stato", [
    "pagato",
    "chiuso"
  ]);
  const tot = (tutti ?? []).reduce((a, x)=>a + Number(x.profitto_eur ?? 0) - Number(x.fee_eur ?? 0), 0);
  let m = "🏆 <b>CICLO CONCLUSO</b>\n\n💰 <b>Hai guadagnato " + eur(netto) + "</b>";
  if (quanto) m += "\n⏱ Durata <b>" + quanto + "</b>";
  if (p > 0) m += "\n📈 Rendimento <b>" + pct(p) + "</b>";
  if (tot > 0) m += "\n🏆 Totale <b>" + eur(tot) + "</b>";
  m += "\n\n<b>Ribilancia i conti e riparti!</b>";
  const share = encodeURIComponent("Ho guadagnato " + eur(netto) + (quanto ? " in " + quanto : "") + " con la strategia di hedging Broker vs Broker." + (p > 0 ? "\n\nRendimento " + pct(p) : ""));
  const tkc = await tokenApp(u);
  await send(chat, m, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "🏆 Vedi il certificato",
            ...Number(chat) > 0 ? {
              web_app: {
                url: APP_CICLO + "?v=" + APP_VER + "&t=" + tkc
              }
            } : {
              url: APP_CICLO + "?v=" + APP_VER + "&t=" + tkc
            }
          }
        ]
      ]
    }
  });
  await send(chat, "Pronto per un nuovo ciclo.", {
    reply_markup: KB_PRONTO
  });
}
// ═══════════════════════════ FORNITORI ═══════════════════════════
const FRASI = [
  [
    /^(in corso|trade in corso|partito|partiti|aperto|aperti|avviato|avviati|posizioni aperte)$/,
    "avvio"
  ],
  [
    /^(ok|okk|fatto|done)$/,
    "auto"
  ]
];
// segnali MT5 incollati a mano: riconosce conto e importo
// i segnali MT5 usano il formato inglese: 1500.00 e 1,500.00
function numeroMT5(x) {
  let g = String(x ?? "").trim().replace(/\s/g, "");
  if (/,\d{1,2}$/.test(g) && !/\.\d/.test(g)) g = g.replace(/\./g, "").replace(",", ".");
  else g = g.replace(/,/g, "");
  const v = parseFloat(g);
  return isNaN(v) ? 0 : v;
}
function leggiSegnale(t) {
  if (!t) return null;
  const conto = t.match(/Account:\s*(?:SLAVE|MASTER)?\s*(\d{5,10})/i) || t.match(/Slave\s*\((\d{5,10})\)/i) || t.match(/Master\s*\((\d{5,10})\)/i);
  const nome = t.match(/([A-ZÀ-Ü][A-ZÀ-Ü'.\s]{3,50}?)\s*:\s*(?:Cycle closed|Step\s*\d+\s*closed)/i);
  if (!conto && !nome) return null;
  const rif = conto ? {
    conto: conto[1]
  } : {
    nome: nome[1].trim()
  };
  if (!conto) {
    if (/Cycle closed/i.test(t)) {
      const pl = t.match(/Cycle P\/L:\s*(-?[\d.,]+)/i);
      const mt = t.match(/(?:Balance\s+)?Master\s*(?:\(\d+\))?:\s*(-?[\d.,]+)/i);
      const sl = t.match(/(?:Balance\s+)?Slave\s*(?:\(\d+\))?:\s*(-?[\d.,]+)/i);
      return {
        tipo: "chiuso",
        ...rif,
        valore: pl ? numeroMT5(pl[1]) : null,
        master: mt ? numeroMT5(mt[1]) : null,
        slave: sl ? numeroMT5(sl[1]) : null
      };
    }
    if (/Step \d+ closed/i.test(t)) {
      const pl = t.match(/Cycle P\/L:\s*(-?[\d.,]+)/i);
      const mt = t.match(/(?:Balance\s+)?Master\s*(?:\(\d+\))?:\s*(-?[\d.,]+)/i);
      const sl = t.match(/(?:Balance\s+)?Slave\s*(?:\(\d+\))?:\s*(-?[\d.,]+)/i);
      return {
        tipo: "step1",
        ...rif,
        valore: pl ? numeroMT5(pl[1]) : null,
        master: mt ? numeroMT5(mt[1]) : null,
        slave: sl ? numeroMT5(sl[1]) : null
      };
    }
    return null;
  }
  const bonus = t.match(/New bonus:\s*([\d.,]+)/i);
  if (bonus) {
    const v = numeroMT5(bonus[1]);
    return {
      tipo: v > 0 ? "bonus" : "reset",
      conto: conto[1],
      valore: v
    };
  }
  if (/Cycle closed/i.test(t)) {
    const pl = t.match(/Cycle P\/L:\s*(-?[\d.,]+)/i);
    return {
      tipo: "chiuso",
      conto: conto[1],
      valore: pl ? numeroMT5(pl[1]) : null
    };
  }
  if (/Step 1 closed/i.test(t)) {
    const pl = t.match(/Cycle P\/L:\s*(-?[\d.,]+)/i);
    return {
      tipo: "step1",
      conto: conto[1],
      valore: pl ? numeroMT5(pl[1]) : null
    };
  }
  return null;
}
async function daSegnale(chat, seg, chi) {
  let u = null;
  if (seg.conto) {
    const { data: cl } = await sb.from(T_UT).select("*").or("login_a.eq." + seg.conto + ",login_b.eq." + seg.conto);
    u = (cl ?? [])[0] ?? null;
  }
  if (!u && seg.nome) {
    const { data: cl } = await sb.from(T_UT).select("*");
    const cerca = seg.nome.toLowerCase().replace(/\s+/g, " ").trim();
    u = (cl ?? []).find((x)=>String(x.nome ?? "").toLowerCase().replace(/\s+/g, " ").trim() === cerca) ?? null;
  }
  if (!u) {
    await send(chat, "Non trovo il cliente per " + (seg.conto ? "il conto <code>" + seg.conto + "</code>" : "<b>" + seg.nome + "</b>") + ".\n<i>Registra i conti dalla sua scheda.</i>");
    return true;
  }
  // chi altro va avvisato: gli admin della rete a cui appartiene
  const altri = [];
  if (u.affiliato_id || u.fornitore_id) {
    let pid = u.fornitore_id;
    if (!pid && u.affiliato_id) {
      const { data: af } = await sb.from("bvb_affiliati").select("nome").eq("id", u.affiliato_id).maybeSingle();
      if (af?.nome) {
        const { data: pt } = await sb.from(T_PT).select("id, telegram_id").ilike("nome", af.nome).maybeSingle();
        if (pt) {
          pid = pt.id;
          if (pt.telegram_id) altri.push(pt.telegram_id);
        }
      }
    }
    if (pid) {
      const { data: adm } = await sb.from(T_PA_ADM).select("telegram_id").eq("partner_id", pid).eq("attivo", true);
      for (const a of adm ?? [])if (a.telegram_id && !altri.includes(a.telegram_id)) altri.push(a.telegram_id);
    }
  }
  const avvisaTutti = async (testo, extra)=>{
    await send(chat, testo, extra);
    for (const id of altri){
      if (String(id) !== String(chat)) await send(id, testo, extra).catch(()=>{});
    }
  };
  const gu = u.gruppo_utente_id;
  const st = gu ? await stato(gu) : {
    step: null,
    dati: {}
  };
  if (seg.tipo === "bonus") {
    let m = "🎁 <b>BONUS ACCREDITATO</b>\n" + u.codice + " · " + u.nome + "\n<b>" + eurI(seg.valore) + "</b> sul conto " + seg.conto;
    if (gu) {
      await setStato(gu, "attesa_step2", {
        ...st.dati ?? {},
        step2: true
      });
      await dicituraForn(u, "BONUS ARRIVATO. PRONTO A PARTIRE");
      await send(gu, "✅ <b>Avvisati i fornitori.</b>\nTi avviso appena aprono le posizioni.", {
        reply_markup: kbBase([
          [
            {
              text: "📋 Menu"
            }
          ]
        ])
      });
      m += "\n\n<i>Fornitori avvisati, cliente informato.</i>";
    }
    await avvisaTutti(m);
    return true;
  }
  if (seg.tipo === "reset") {
    const inCorso = st.step === "step2" || st.step === "attesa_reset" || st.step === "attesa_bonus" || st.step === "attesa_step2" || st.dati?.caso === 2;
    if (gu && inCorso) {
      // reset dentro lo step 2: chiedo il bonus da solo
      const base = Number(u.budget_ciclo ?? 0) > 0 ? Number(u.budget_ciclo) / 2 : Number(st.dati?.budget ?? 0) / 2;
      const b = Math.round(base * 0.30);
      if (b > 0 && u.login_a) {
        await dicituraForn(u, u.login_a + "\n" + b + "€\nADD BONUS");
        await sb.from(T_UT).update({
          bonus_richiesto_il: new Date().toISOString()
        }).eq("id", u.id);
        await setStato(gu, "attesa_bonus", {
          ...st.dati ?? {},
          caso: 2,
          reset: true,
          bonus: b
        });
        await send(gu, "🔄 <b>Conto Total FX resettato.</b>\n\n🎁 <b>Bonus richiesto: " + eurI(b) + "</b>\n\nAppena lo vedi sul conto premi <b>Bonus arrivato</b>.", {
          reply_markup: KB_BONUS2
        });
        await avvisaTutti("🔄 <b>CONTO RESETTATO</b>\n" + u.codice + " · " + u.nome + "\nconto " + seg.conto + "\n\n🎁 <i>Bonus di " + eurI(b) + " richiesto ai fornitori.</i>");
        return true;
      }
      await setStato(gu, "step2", {
        ...st.dati ?? {},
        caso: 2,
        reset: true
      });
      await send(gu, "🔄 <b>Conto Total FX resettato.</b>", {
        reply_markup: KB_SOLO_BONUS
      });
      await avvisaTutti("🔄 <b>CONTO RESETTATO</b>\n" + u.codice + " · " + u.nome + "\nconto " + seg.conto);
      return true;
    }
    // reset a ciclo chiuso: si ribilancia e si riparte
    await avvisaTutti("🔄 <b>CONTO RESETTATO</b>\n" + u.codice + " · " + u.nome + "\nconto " + seg.conto);
    if (gu) {
      await send(gu, "🔄 <b>Conto Total FX resettato.</b>\n\nQuando i saldi sono bilanciati puoi aprire un nuovo ciclo.", {
        reply_markup: KB_PRONTO
      });
      if (u.gruppo_fornitori_id) {
        await send(u.gruppo_fornitori_id, "<b>CONTO RESETTATO</b>");
        const tgf = await tagForn(u);
        if (tgf) await send(u.gruppo_fornitori_id, tgf);
      }
    }
    return true;
  }
  if (seg.tipo === "step1") {
    let m = "⚠️ <b>1° STEP CHIUSO</b>\n" + u.codice + " · " + u.nome;
    if (seg.valore != null) m += "\nP/L " + eur(seg.valore);
    if (seg.master != null) m += "\nMaster " + eur(seg.master);
    if (seg.slave != null) m += "\nSlave " + eur(seg.slave);
    m += "\n\n<i>Serve il secondo step.</i>";
    await avvisaTutti(m);
    if (gu) {
      const d2 = {
        ...st.dati ?? {},
        caso: 2
      };
      if (seg.master != null) d2.s1_r = seg.master;
      if (seg.slave != null) d2.s1_t = seg.slave;
      if (seg.slave == null) {
        await setStato(gu, "step2", d2);
        await send(gu, "🔵 <b>Primo step chiuso.</b>\n\nSe il saldo su <b>Total FX</b> è negativo, richiedi prima il <b>reset</b>.", {
          reply_markup: KB_STEP2
        });
        return true;
      }
      const tfxNeg = seg.slave < 0;
      let mm = "🔵 <b>Primo step chiuso.</b>\n\nSaldo <b>Total FX</b>: " + eur(seg.slave) + "\n\n";
      if (tfxNeg) {
        // conto in negativo: chiedo io il reset
        await dicituraForn(u, "NBP " + (u.login_a ?? ""));
        await sb.from(T_UT).update({
          reset_richiesto_il: new Date().toISOString()
        }).eq("id", u.id);
        await setStato(gu, "attesa_reset", {
          ...d2,
          auto: true
        });
        mm += "🔄 <b>Reset richiesto ai fornitori.</b>\nTi avviso appena il conto è azzerato.";
        await send(gu, mm, {
          reply_markup: KB_ATTESA
        });
        await avvisaTutti("🔄 <b>RESET RICHIESTO</b>\n" + u.codice + " · " + u.nome + "\nTotal FX " + eur(seg.slave));
        return true;
      }
      // conto in positivo: chiedo io il bonus
      const base0 = Number(u.budget_ciclo ?? d2.budget ?? 0) / 2;
      const b0 = Math.round(base0 * 0.30);
      if (b0 > 0 && u.login_a) {
        await dicituraForn(u, u.login_a + "\n" + b0 + "€\nADD BONUS");
        await sb.from(T_UT).update({
          bonus_richiesto_il: new Date().toISOString()
        }).eq("id", u.id);
        await setStato(gu, "attesa_bonus", {
          ...d2,
          bonus: b0
        });
        mm += "🎁 <b>Bonus di " + eurI(b0) + " richiesto ai fornitori.</b>\nTi avviso appena arriva.";
        await send(gu, mm, {
          reply_markup: KB_ATTESA
        });
        await avvisaTutti("🎁 <b>BONUS RICHIESTO</b>\n" + u.codice + " · " + u.nome + "\n" + eurI(b0) + " · Total FX " + eur(seg.slave));
        return true;
      }
      await setStato(gu, "step2", d2);
      mm += "È positivo: richiedi il <b>bonus</b>.";
      await send(gu, mm, {
        reply_markup: KB_SOLO_BONUS
      });
    }
    return true;
  }
  if (seg.tipo === "chiuso") {
    let m = "✅ <b>CICLO CHIUSO</b>\n" + u.codice + " · " + u.nome;
    if (seg.valore != null) m += "\nP/L <b>" + eur(seg.valore) + "</b>";
    if (seg.master != null) m += "\nMaster " + eur(seg.master);
    if (seg.slave != null) m += "\nSlave " + eur(seg.slave);
    await avvisaTutti(m);
    if (gu) {
      const d2 = {
        ...st.dati ?? {}
      };
      if (seg.master != null) d2.fin_r = seg.master;
      if (seg.slave != null) d2.fin_t = Math.max(0, seg.slave);
      const inStep2 = st.step === "attesa_step2" || st.step === "step2_pronto" || d2.caso === 2;
      if (inStep2) {
        d2.s2_dove = "auto";
        d2.s2_r = seg.master ?? 0;
        d2.s2_t = Math.max(0, seg.slave ?? 0);
      }
      await setStato(gu, inStep2 ? "conferma_auto" : "conferma_auto", d2);
      await send(gu, "Manda uno <b>screenshot</b> con i saldi finali dei due conti.", {
        reply_markup: KB_ANNULLA
      });
    }
    return true;
  }
  return false;
}
async function areaFornitori(chat, u, testo, m, from) {
  {
    const seg = leggiSegnale(testo);
    if (seg && await daSegnale(chat, seg, from)) return;
  }
  if (!testo || testo.startsWith("/")) return;
  // il fornitore rimanda il conto predisposto per il bonus
  const cc = testo.trim().split(/[\s\n]+/).filter(Boolean);
  if (cc.length === 2 && /^\d{5,10}$/.test(cc[0]) && cc[1].length >= 4 && !/^\d+$/.test(cc[1])) {
    await sb.from(T_UT).update({
      login_a: cc[0],
      tfx_pass: cc[1],
      tfx_setup_ok: true
    }).eq("id", u.id);
    await chiudiAttesa(u.id);
    const f = await fresco(u.id);
    if (f?.gruppo_utente_id) {
      await send(f.gruppo_utente_id, "<b>CONTO TOTAL FX PRONTO</b>\n\nIl conto è stato predisposto per il bonus. <b>Da ora usa questo</b>, non quello che avevi aperto:\n\n<code>" + cc[0] + "</code>\n<code>" + cc[1] + "</code>\n" + (f.tfx_server ?? "OnamTrading-Live") + "\n\nAccedi da MetaTrader 5 e <b>versa su questo conto</b> la tua metà del capitale.");
    }
    await adAvvisa("<b>" + u.codice + " · " + u.nome + "</b>\nConto Total FX aggiornato dai fornitori: <code>" + cc[0] + "</code>");
    return;
  }
  const w = testo.toLowerCase().replace(/[.!?,;:]+$/, "").replace(/\s+/g, " ").trim();
  const hit = FRASI.find(([re])=>re.test(w));
  if (!hit) return; // chat libera: il bot non interviene
  let azione = hit[1];
  const at = String(u.attesa_tipo ?? "").toLowerCase();
  if (azione === "auto") {
    if (at.includes("reset")) azione = "reset";
    else if (at.includes("bonus")) azione = "bonus";
    else if (at.includes("vps")) azione = "vps";
    else if (at.includes("setup") || at.includes("conti")) azione = "setup";
    else if (at.includes("conteggio")) azione = "conteggio";
    else if (at.includes("incasso") || at.includes("pagamento")) azione = "pagamento";
    else if (at.includes("avvio")) azione = "avvio";
    else return;
  }
  await eseguiConferma(chat, u, azione, from);
}
async function eseguiConferma(chat, u, azione, from) {
  const gu = u.gruppo_utente_id;
  const st = gu ? await stato(gu) : {
    step: null,
    dati: {}
  };
  await chiudiAttesa(u.id);
  if (azione === "avvio") {
    const inStep2 = st.step === "attesa_bonus" || st.step === "attesa_step2" || st.step === "step2_pronto" || st.step === "step2" || st.dati?.caso === 2;
    if (inStep2) {
      await setStato(gu, "step2_pronto", {
        ...st.dati ?? {},
        step2: true
      });
      await send(gu, "🚀 <b>2° STEP IN CORSO</b>\n\nQuando è finito premi <b>Chiudi 2° step</b>.", {
        reply_markup: KB_S2
      });
    } else {
      await sb.from(T_UT).update({
        ciclo_attivo: true,
        budget_ciclo: st.dati?.budget ?? null
      }).eq("id", u.id);
      await setStato(gu, null, {
        ...st.dati ?? {},
        avviato: new Date().toISOString()
      });
      await send(gu, "🚀 <b>IN CORSO</b>", {
        reply_markup: kbCiclo(st?.dati)
      });
    }
    return;
  }
  if (azione === "reset") {
    await send(gu, "<b>Reset eseguito.</b>\nIl conto TotalFX è azzerato.\n\nOra richiedi il <b>bonus</b>.", {
      reply_markup: KB_SOLOBONUS
    });
    return;
  }
  if (azione === "bonus") {
    const s = await stato(gu);
    await send(gu, "<b>Bonus accreditato!</b>\n\nControlla il conto TotalFX e premi <b> Bonus arrivato</b> per far ripartire il ciclo.", {
      reply_markup: KB_BONUS
    });
    await setStato(gu, "attesa_bonus", s.dati);
    return;
  }
  if (azione === "setup") {
    await send(gu, "<b>Conti collegati.</b>\nTutto pronto dal lato tecnico.");
    return;
  }
  if (azione === "conteggio") {
    const s = await stato(gu);
    if (!s.dati?.ciclo_id) {
      return;
    }
    const uf = await fresco(u.id);
    await send(gu, "<b>Conteggio confermato.</b>");
    if (s.dati?.s2_dove && uf.login_a) {
      await dicituraForn(uf, "NBP " + uf.login_a);
      await send(gu, "Reset del conto TotalFX richiesto ai fornitori.");
    }
    await chiediPagamento(gu, uf, s.dati.ciclo_id);
    return;
  }
  if (azione === "pagamento") {
    const s = await stato(gu);
    if (!s.dati?.ciclo_id) {
      await send(chat, "Nessun pagamento in sospeso.");
      return;
    }
    await sb.from(T_PA).update({
      stato: "verificato"
    }).eq("ciclo_id", s.dati.ciclo_id);
    const uf = await fresco(u.id);
    await chiudiCiclo(gu, uf, s.dati.ciclo_id);
    return;
  }
  if (azione === "vps") {
    const oggi = new Date();
    const fino = new Date(oggi.getTime() + 30 * 86400000);
    await sb.from(T_UT).update({
      vps_stato: "attivo",
      vps_pagato_il: oggi.toISOString(),
      vps_copre_fino: fino.toISOString().slice(0, 10)
    }).eq("id", u.id);
    await send(gu, "<b>VPS attivo</b> fino al " + dataIt(fino) + ".");
    return;
  }
}
// ═══════════════════════════ BOTTONI ═══════════════════════════
// post nei canali dei segnali
async function onCanale(post) {
  const testo = post.text ?? post.caption ?? "";
  if (!testo) return;
  const seg = leggiSegnale(testo);
  if (!seg) return;
  // se il cliente non è nel sistema, il segnale non mi riguarda: nessun messaggio
  let noto = false;
  if (seg.conto) {
    const { data } = await sb.from(T_UT).select("id").or("login_a.eq." + seg.conto + ",login_b.eq." + seg.conto + ",login_c.eq." + seg.conto).limit(1);
    noto = !!(data ?? []).length;
  }
  if (!noto && seg.nome) {
    const { data: cl } = await sb.from(T_UT).select("nome");
    const cerca = String(seg.nome).toLowerCase().replace(/\s+/g, " ").trim();
    noto = (cl ?? []).some((x)=>String(x.nome ?? "").toLowerCase().replace(/\s+/g, " ").trim() === cerca);
  }
  if (!noto) return;
  const { data: ad } = await sb.from(T_AD).select("telegram_user_id").limit(1).maybeSingle();
  const dove = ad?.telegram_user_id;
  if (!dove) return;
  await daSegnale(dove, seg, dove);
}
async function onBottone(cb1) {
  const chat = cb1.message?.chat?.id, mid = cb1.message?.message_id, d = cb1.data ?? "", from = cb1.from?.id;
  await rispondi(cb1.id);
  if (d === "noop") return;
  if (d.startsWith("letta:")) {
    const pre = d.slice(6);
    const { data: com } = await sb.from("bvb_comunicazioni2").select("id, inviata_a").order("creata_il", {
      ascending: false
    }).limit(20);
    const c = (com ?? []).find((x)=>x.id.startsWith(pre));
    if (!c) {
      await rispondi(cb1.id, "Non trovata");
      return;
    }
    const nome = [
      cb1.from?.first_name,
      cb1.from?.last_name
    ].filter(Boolean).join(" ") || "utente";
    await sb.from("bvb_letture").upsert({
      com_id: c.id,
      telegram_id: cb1.from?.id,
      nome
    }, {
      onConflict: "com_id,telegram_id"
    });
    const { data: l } = await sb.from("bvb_letture").select("id").eq("com_id", c.id);
    const n = (l ?? []).length;
    await editKb(chat, mid, {
      inline_keyboard: [
        [
          {
            text: "✅ Letta",
            callback_data: "noop"
          }
        ]
      ]
    });
    await rispondi(cb1.id, "Grazie!");
    return;
  }
  const r = await ruolo(chat, from, cb1.message?.chat?.type);
  if (/^(sp|spn|spf|spfx):/.test(d)) {
    if (!await isAdmin(from)) {
      await rispondi(cb1.id, "Solo admin");
      return;
    }
    return await setupGruppo(chat, mid, d, from);
  }
  if (r.r === "cliente") {
    if (d === "i:disc" && (r.u.sospeso || !r.u.disclaimer_ok)) {
      await sb.from(T_UT).update({
        sospeso: false,
        sospeso_dal: null,
        nota_admin: null
      }).eq("id", r.u.id);
      await editKb(chat, mid);
      return await mostraDisclaimer(chat);
    }
    return await bottoniCliente(chat, mid, d, r.u, from);
  }
  if (r.r === "admin") return await bottoniAdmin(chat, mid, d, from);
  if (r.r === "lead" && d.startsWith("fn:")) {
    const l = await lead(from, {
      from: cb1.from
    }, null);
    const p = d.split(":");
    await editKb(chat, mid);
    if (p[1] === "cap") return await chiediCapitale(chat, l);
    if (p[1] === "prove") return await proveReali(chat);
    if (p[1] && p[1][0] === "p") return await punto(chat, parseInt(p[1].slice(1), 10));
    if (p[1] === "c") {
      const et = {
        sotto: "meno di 2.000 €",
        "2-5": "2.000 – 5.000 €",
        "5-10": "5.000 – 10.000 €",
        "10+": "oltre 10.000 €"
      }[p[2]] ?? p[2];
      await sb.from("bvb_lead").update({
        capitale: et
      }).eq("id", l.id);
      if (p[2] === "sotto") {
        await sb.from("bvb_lead").update({
          stato: "sotto_soglia"
        }).eq("id", l.id);
        await send(chat, "Con meno di <b>2.000 €</b> il sistema non regge: il bonus sarebbe troppo piccolo e le commissioni si mangerebbero il profitto.\n\nTi lascio il contatto: quando sei pronto scrivi qui e ripartiamo.");
        await avvisaNuovoLead({
          ...l,
          capitale: et,
          esperienza: "—"
        });
        return;
      }
      return await chiediEsperienza(chat, {
        ...l,
        capitale: et
      });
    }
    if (p[1] === "e") {
      const et = {
        zero: "mai fatto trading",
        poco: "ha provato qualcosa",
        si: "opera già"
      }[p[2]] ?? p[2];
      await sb.from("bvb_lead").update({
        esperienza: et,
        stato: "nome"
      }).eq("id", l.id);
      await send(chat, "Ultima cosa: come ti chiami?\n<i>Nome e cognome.</i>");
      return;
    }
    return;
  }
  if (r.r === "misto" || r.r === "partner") {
    const pp = r.p;
    if (d.startsWith("a:")) {
      const [, az, cod] = d.split(":");
      const u = await perCodice(cod);
      const suoi = await clientiDi(pp);
      if (!u || !suoi.some((x)=>x.codice === cod)) {
        await rispondi(cb1.id, "Non autorizzato");
        return;
      }
      await editKb(chat, mid, {
        inline_keyboard: [
          [
            {
              text: "☑️ Confermato",
              callback_data: "noop"
            }
          ]
        ]
      });
      await eseguiConferma(chat, u, az, from);
      return;
    }
    if (d === "mie:fee") {
      const { data: u } = await sb.from(T_UT).select("*").eq("telegram_id", from).maybeSingle();
      await editKb(chat, mid);
      if (!u) return;
      return await storicoPagamenti(chat, u);
    }
    if (d.startsWith("pr:")) {
      await editKb(chat, mid);
      return await reportPartner(chat, pp, d.slice(3));
    }
    if (d.startsWith("ld:")) {
      const [, az, tg] = d.split(":");
      const { data: l } = await sb.from("bvb_lead").select("partner_id").eq("telegram_id", Number(tg)).maybeSingle();
      if (!l || String(l.partner_id) !== String(pp.id)) {
        await rispondi(cb1.id, "Non è un tuo contatto");
        return;
      }
      await editKb(chat, mid, {
        inline_keyboard: [
          [
            {
              text: az === "ok" ? "☑️ Attivato" : "☑️ Scartato",
              callback_data: "noop"
            }
          ]
        ]
      });
      if (az === "no") {
        await sb.from("bvb_lead").update({
          stato: "scartato"
        }).eq("telegram_id", Number(tg));
        return;
      }
      return await attivaLead(chat, tg, from);
    }
    return;
  }
  if (r.r === "fornitori") {
    const az = d.startsWith("f:") ? d.slice(2) : null;
    if (az) await eseguiConferma(chat, r.u, az, from);
    return;
  }
}
async function bottoniCliente(chat, mid, d, u, from) {
  const st = await stato(chat);
  if (d === "num_ok") {
    await editKb(chat, mid, {
      inline_keyboard: [
        [
          {
            text: "Confermato",
            callback_data: "noop"
          }
        ]
      ]
    });
    const p = PASSI[st.step];
    if (!p) return;
    if (p.dopo) {
      await setStato(chat, p.dopo, st.dati);
      await send(chat, DOMANDE[p.dopo], {
        reply_markup: KB_ANNULLA
      });
      return;
    }
    if (st.step === "budget") {
      await setStato(chat, "conferma_avvio", st.dati);
      await send(chat, "<b>Budget " + eurI(st.dati.budget) + "</b>\n" + eurI(st.dati.budget / 2) + " per conto.\n\nTutto giusto?", {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "✅ Confermo",
                callback_data: "avvia"
              }
            ],
            [
              {
                text: "✏️ Riscrivi",
                callback_data: "back"
              },
              {
                text: "❌ Annulla",
                callback_data: "annulla"
              }
            ]
          ]
        }
      });
      return;
    }
    // fine di un percorso
    if (st.step === "c1_r") {
      // percorso del caso 1: i valori del 2° step non c'entrano
      const d1 = {
        ...st.dati
      };
      delete d1.s2_t;
      delete d1.s2_r;
      delete d1.s2_dove;
      return await conteggio(chat, u, d1);
    }
    if (st.step === "s2_r") {
      // percorso del 2° step: ignoro i valori del caso 1
      const d2 = {
        ...st.dati
      };
      delete d2.fin_t;
      delete d2.fin_r;
      return await conteggio(chat, u, d2);
    }
    if (st.step === "c2_res") {
      const res = Number(st.dati.res_t ?? 0);
      const tot = Number(st.dati.fin_r ?? 0) + Math.max(0, res);
      const delta = tot - Number(st.dati.budget ?? u.budget_ciclo ?? 0);
      await setStato(chat, "step2", {
        ...st.dati,
        res_t: res
      });
      let m = "<b>Registrato</b>\n\nRoboforex " + eur(st.dati.fin_r) + "\nSaldo TotalFX " + eur(res) + "\n<b>Totale in conto " + eur(tot) + "</b>\n";
      m += delta < 0 ? "\nSotto il capitale di <b>" + eur(-delta) + "</b> — normale a questo punto: il bonus recupera.\n" : "\nSopra il capitale di <b>" + eur(delta) + "</b>\n";
      if (res > 0) {
        m += "\nIl conto TotalFX è in positivo: <b>vai diretto al bonus</b>.";
        await send(chat, m, {
          reply_markup: KB_SOLOBONUS
        });
      } else {
        m += "\nIl conto TotalFX è " + (res < 0 ? "in negativo" : "a zero") + ": serve <b>prima il reset</b>.\nDopo il reset potrai chiedere il bonus.";
        await send(chat, m, {
          reply_markup: KB_RESET
        });
      }
      return;
    }
    return;
  }
  if (d === "back") {
    await editKb(chat, mid);
    const dietro = INDIETRO[st.step];
    if (st.step && st.step.startsWith("br_")) {
      const [, b, idx] = st.step.split("_");
      const i = parseInt(idx, 10);
      if (i > 0) return await chiediCampo(chat, b, i - 1, st.dati);
    }
    if (dietro && DOMANDE[dietro]) {
      await setStato(chat, dietro, st.dati);
      await send(chat, DOMANDE[dietro], {
        reply_markup: KB_ANNULLA
      });
      return;
    }
    await setStato(chat, null, st.dati);
    const { kb, nota } = await tastiera(u, {
      step: null,
      dati: st.dati
    });
    await send(chat, nota, {
      reply_markup: kb
    });
    return;
  }
  if (d.startsWith("sto:")) {
    const a = d.slice(4);
    await editKb(chat, mid);
    if (a === "uno") return await chiediPassoSto(chat, 0, {}, u);
    if (a === "bulk") return await storicoBulk(chat, u);
    if (a === "save") {
      const s0 = await stato(chat);
      return await salvaUno(chat, u, s0.dati ?? {});
    }
    if (a === "no" || a === "fine") {
      await setStato(chat, null, {});
      await send(chat, a === "fine" ? "✅ <b>Storico aggiornato.</b>" : "Annullato.", {
        reply_markup: KB_IMPO
      });
      return;
    }
    return;
  }
  if (d === "sto_no") {
    await editKb(chat, mid);
    await setStato(chat, null, {});
    await send(chat, "Import annullato.", {
      reply_markup: KB_PRONTO
    });
    return;
  }
  if (d === "sto_go") {
    await editKb(chat, mid, {
      inline_keyboard: [
        [
          {
            text: "Importato",
            callback_data: "noop"
          }
        ]
      ]
    });
    const sc = await stato(chat);
    const righe = sc.dati?.righe ?? [];
    if (righe.length) await importaStorico(chat, u, righe);
    return;
  }
  if (d.startsWith("cfr:")) {
    await editKb(chat, mid, {
      inline_keyboard: [
        [
          {
            text: "☑️ Confermato",
            callback_data: "noop"
          }
        ]
      ]
    });
    const cid = d.slice(4);
    const w = await walletFee(u);
    const s0 = await stato(chat);
    await sb.from(T_CI).update({
      stato: "da_pagare"
    }).eq("id", cid);
    await setStato(chat, "paga", {
      ...s0.dati,
      ciclo_id: cid
    });
    await send(chat, "Versa in <b>USDT</b> sulla rete <b>BEP20 (BSC)</b>.\n⚠️ Su altre reti i fondi si perdono.");
    await send(chat, "<code>" + w + "</code>", {
      reply_markup: KB_PAGA
    });
    return;
  }
  if (d === "num_no") {
    await editKb(chat, mid);
    await send(chat, DOMANDE[st.step] ?? "Riscrivi il valore.", {
      reply_markup: KB_ANNULLA
    });
    return;
  }
  if (d.startsWith("brk:")) {
    const slug = d.slice(4);
    const bs0 = await brokers(false);
    const br = bs0.find((x)=>x.slug === slug);
    const s0 = await stato(chat);
    await editKb(chat, mid, {
      inline_keyboard: [
        [
          {
            text: "☑️ " + (br?.nome ?? slug),
            callback_data: "noop"
          }
        ]
      ]
    });
    const d2 = {
      ...s0.dati ?? {},
      brokerB: slug,
      brokerNome: br?.nome ?? slug
    };
    const b = Number(d2.budget ?? 0);
    await apriAttesa(u, "avvio del ciclo");
    await sb.from(T_UT).update({
      budget_ciclo: b > 0 ? b : null
    }).eq("id", u.id);
    if (d2.screen && u.gruppo_fornitori_id) await tg("sendPhoto", {
      chat_id: u.gruppo_fornitori_id,
      photo: d2.screen
    });
    await dicituraForn(u, "CONTI BILANCIATI. PRONTO A PARTIRE" + (slug !== "rbx" ? "\nBroker: " + String(br?.nome ?? slug).toUpperCase() : ""));
    await setStato(chat, null, d2);
    const f2 = await fresco(u.id);
    await send(chat, "<b>Inviato ai fornitori.</b>\n<i>Ciclo su " + (br?.nome ?? slug) + "</i>\nTi avviso appena aprono le posizioni.", {
      reply_markup: (await tastiera(f2, {
        step: null,
        dati: d2
      })).kb
    });
    return;
  }
  if (d === "avvia") {
    const s0 = await stato(chat);
    if (!s0.dati?.brokerB) {
      await editKb(chat, mid, {
        inline_keyboard: [
          [
            {
              text: "☑️ Confermato",
              callback_data: "noop"
            }
          ]
        ]
      });
      const bsx = (await brokers()).filter((x)=>x.ruolo !== "primario");
      if (bsx.length > 1) {
        await send(chat, "Su quale broker gira questo ciclo?", {
          reply_markup: {
            inline_keyboard: bsx.map((b)=>[
                {
                  text: "🔵 " + b.nome,
                  callback_data: "brk:" + b.slug
                }
              ])
          }
        });
        return;
      }
    }
  }
  if (d === "avvia") {
    await editKb(chat, mid, {
      inline_keyboard: [
        [
          {
            text: "Inviato ai fornitori",
            callback_data: "noop"
          }
        ]
      ]
    });
    const b = Number(st.dati.budget ?? 0);
    await apriAttesa(u, "avvio del ciclo");
    await sb.from(T_UT).update({
      budget_ciclo: b > 0 ? b : null
    }).eq("id", u.id);
    if (st.dati.screen && u.gruppo_fornitori_id) {
      await tg("sendPhoto", {
        chat_id: u.gruppo_fornitori_id,
        photo: st.dati.screen
      });
    }
    await dicituraForn(u, "CONTI BILANCIATI. PRONTO A PARTIRE");
    await setStato(chat, null, st.dati);
    const f = await fresco(u.id);
    await send(chat, "<b>Inviato ai fornitori.</b>\nTi avviso appena aprono le posizioni.", {
      reply_markup: (await tastiera(f, {
        step: null,
        dati: {}
      })).kb
    });
    return;
  }
  if (d === "annulla" || d === "ann_si") {
    await editKb(chat, mid);
    await setStato(chat, null, {});
    await sb.from(T_UT).update({
      ciclo_attivo: false,
      budget_ciclo: null
    }).eq("id", u.id);
    await chiudiAttesa(u.id);
    await send(chat, "<b>Annullato.</b>\nPremi <b> Inizia nuovo ciclo</b> per ripartire.", {
      reply_markup: KB_PRONTO
    });
    return;
  }
  if (d === "ann_no") {
    await editKb(chat, mid);
    return;
  }
  if (d.startsWith("g:")) {
    const [, tipo, i] = d.split(":");
    await editKb(chat, mid);
    return await guida(chat, tipo, parseInt(i, 10) || 0);
  }
  if (d.startsWith("s2:")) {
    await editKb(chat, mid);
    const dove = d.slice(3);
    const s0 = await stato(chat);
    await setStato(chat, "screen_c", {
      ...s0.dati,
      s2_dove: dove,
      dopo: "s2_t"
    });
    await send(chat, (dove === "t" ? "<b>Vinto su TotalFX</b>" : "<b>Vinto su " + nomeB(st?.dati) + "</b>") + "\n\nManda uno <b>screenshot</b> con i saldi finali.", {
      reply_markup: KB_ANNULLA
    });
    return;
  }
  if (d.startsWith("mod:")) {
    const p = d.split(":"), br = p[1];
    if (p.length === 2) {
      await editKb(chat, mid);
      await send(chat, (br === "tfx" ? "💼 <b>TOTAL FX</b>" : "💼 <b>ROBOFOREX</b>") + "\n\nCosa vuoi modificare?", {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Numero di conto",
                callback_data: "mod:" + br + ":conto"
              }
            ],
            [
              {
                text: "Password",
                callback_data: "mod:" + br + ":pass"
              }
            ],
            [
              {
                text: "Server",
                callback_data: "mod:" + br + ":server"
              }
            ],
            [
              {
                text: "Email",
                callback_data: "mod:" + br + ":email"
              }
            ]
          ]
        }
      });
      return;
    }
    const campo = p[2];
    await editKb(chat, mid);
    await setStato(chat, "mod_" + br + "_" + campo, {});
    await send(chat, CAMPI_MOD[campo].dom + "\n<i>Scrivi il nuovo valore.</i>", {
      reply_markup: KB_ANNULLA
    });
    return;
  }
  if (d.startsWith("i:")) return await bottoniIscrizione(chat, mid, d.slice(2), u);
  if (d.startsWith("cic:")) {
    await editKb(chat, mid);
    return await mieiCicli(chat, u, d.slice(4));
  }
  if (d.startsWith("rip:")) {
    await editKb(chat, mid);
    const s = await stato(chat);
    if (DOMANDE[s.step]) {
      await send(chat, DOMANDE[s.step], {
        reply_markup: KB_ANNULLA
      });
      return;
    }
    const { kb, nota } = await tastiera(u, s);
    await send(chat, " " + nota, {
      reply_markup: kb
    });
    return;
  }
}
function ripresa(u, st) {
  const p = st?.step ?? "";
  const ETI = {
    budget: "Inserisci il capitale del ciclo",
    screen: "Manda lo screenshot dei saldi",
    conferma_avvio: "Conferma e avvia il ciclo",
    c1_t: "Inserisci il saldo finale TotalFX",
    c1_r: "Inserisci il saldo finale Roboforex",
    c2_r: "Inserisci il saldo finale Roboforex",
    c2_res: "Inserisci il residuo su TotalFX",
    s2_t: "Inserisci il saldo finale TotalFX (2° step)",
    s2_r: "Inserisci il saldo finale Roboforex (2° step)",
    step2: "Chiedi reset o bonus",
    attesa_bonus: "Attendi il bonus, poi conferma",
    step2_pronto: "Chiudi il 2° step quando è finito",
    paga: "Versa la commissione",
    hash: "Incolla il link BscScan"
  };
  if (p && ETI[p]) return {
    tit: ETI[p],
    btn: "Riprendi da qui",
    cb: "rip:" + p
  };
  if (u.attesa_tipo) return null;
  if (u.ciclo_attivo) return {
    tit: "Ciclo attivo · " + eurI(u.budget_ciclo ?? 0),
    btn: "Chiudi il ciclo",
    cb: "rip:chiudi"
  };
  return null;
}
// ═══════════════════════════ SCHERMATE CLIENTE ═══════════════════════════
async function mieiCicli(chat, u, vista = "riepilogo") {
  const { data } = await sb.from(T_CI).select("numero, saldo_ini_a, profitto_eur, fee_eur, fee_usdt, chiuso_il, avviato_il").eq("utente_id", u.id).in("stato", [
    "pagato",
    "chiuso"
  ]).order("chiuso_il");
  const c = (data ?? []).filter((x)=>x.chiuso_il);
  if (!c.length) {
    await send(chat, "<b>I MIEI CICLI</b>\n\nNessun ciclo chiuso.\nIl primo comparirà qui.", {
      reply_markup: KB_PRONTO
    });
    return;
  }
  const netto = c.reduce((a, x)=>a + Number(x.profitto_eur ?? 0) - Number(x.fee_eur ?? 0), 0);
  const lordo = c.reduce((a, x)=>a + Number(x.profitto_eur ?? 0), 0);
  const fee = c.reduce((a, x)=>a + Number(x.fee_eur ?? 0), 0);
  const feeU = c.reduce((a, x)=>a + Number(x.fee_usdt ?? 0), 0);
  const capMax = Math.max(...c.map((x)=>Number(x.saldo_ini_a ?? 0)));
  const durate = c.filter((x)=>x.avviato_il).map((x)=>(new Date(x.chiuso_il) - new Date(x.avviato_il)) / 86400000).filter((x)=>x > 0);
  const dm = durate.length ? durate.reduce((a, b)=>a + b, 0) / durate.length : null;
  const best = c.reduce((a, x)=>{
    const n = Number(x.profitto_eur ?? 0) - Number(x.fee_eur ?? 0);
    return n > (a?.n ?? -1e9) ? {
      n,
      x
    } : a;
  }, null);
  const tk = await tokenApp(u);
  const nav = {
    inline_keyboard: [
      [
        {
          text: "📊 Apri dashboard",
          url: "https://t.me/cashly_bvb_bot?start=dash"
        }
      ],
      [
        {
          text: "📅 Giorno",
          callback_data: "cic:giorno"
        },
        {
          text: "📆 Settimana",
          callback_data: "cic:settimana"
        }
      ],
      [
        {
          text: "🗓 Mese",
          callback_data: "cic:mese"
        },
        {
          text: "📊 Anno",
          callback_data: "cic:anno"
        }
      ],
      [
        {
          text: "🔁 Tutti",
          callback_data: "cic:tutti"
        },
        {
          text: "🏦 Per capitale",
          callback_data: "cic:capitale"
        }
      ],
      [
        {
          text: "📈 Totale",
          callback_data: "cic:riepilogo"
        }
      ]
    ]
  };
  if (vista === "tutti") {
    const lista = [
      ...c
    ].reverse();
    await send(chat, "<b>TUTTI I CICLI</b> · " + lista.length);
    for (const x of lista.slice(0, 40)){
      const lordo = Number(x.profitto_eur ?? 0), fee = Number(x.fee_eur ?? 0);
      const nt = lordo - fee, cp = Number(x.saldo_ini_a ?? 0);
      const dur = x.avviato_il && x.chiuso_il ? new Date(x.chiuso_il).getTime() - new Date(x.avviato_il).getTime() : 0;
      let t = (nt > 0 ? "🟢" : "⚪") + " <b>CICLO #" + x.numero + "</b> · " + dataIt(x.chiuso_il) + "\n\n";
      t += "🏦 Capitale <b>" + eurI(cp) + "</b>\n";
      t += "📈 Gain lordo <b>" + eur(lordo) + "</b>\n";
      t += "💸 Commissione <b>" + eur(fee) + "</b>" + (Number(x.fee_usdt) > 0 ? " = <b>" + usdt(Number(x.fee_usdt)) + "</b>" : "") + "\n";
      t += nt > 0 ? "💰 <b>Netto " + eur(nt) + "</b> · <b>" + pct(cp ? nt / cp * 100 : 0) + "</b>" : "⚪ <b>Chiuso in pari</b>";
      if (dur > 0) t += "\n⏱ Durata " + durataTesto(dur);
      await send(chat, t);
    }
    if (lista.length > 40) await send(chat, "<i>Mostrati gli ultimi 40 cicli.</i>");
    await send(chat, "Cambia vista:", {
      reply_markup: nav
    });
    return;
  }
  if (vista === "capitale") {
    const f = new Map();
    c.forEach((x)=>{
      const k = Number(x.saldo_ini_a ?? 0);
      const o = f.get(k) ?? {
        n: 0,
        netto: 0
      };
      o.n++;
      o.netto += Number(x.profitto_eur ?? 0) - Number(x.fee_eur ?? 0);
      f.set(k, o);
    });
    let m = "🏦 <b>RENDIMENTO PER CAPITALE</b>\n";
    [
      ...f.entries()
    ].sort((a, b)=>a[0] - b[0]).forEach(([cap, v])=>{
      m += "\n<b>" + eurI(cap) + "</b> · " + v.n + (v.n === 1 ? "ciclo" : "cicli") + "\n" + eur(v.netto) + " · <b>" + pct(v.netto / v.n / cap * 100) + "</b> per ciclo\n";
    });
    await send(chat, m, {
      reply_markup: nav
    });
    return;
  }
  if ([
    "giorno",
    "settimana",
    "mese",
    "anno"
  ].includes(vista)) {
    const ETI = {
      giorno: "GIORNALIERO",
      settimana: "SETTIMANALE",
      mese: "MENSILE",
      anno: "ANNUALE"
    };
    const MM2 = [
      "gennaio",
      "febbraio",
      "marzo",
      "aprile",
      "maggio",
      "giugno",
      "luglio",
      "agosto",
      "settembre",
      "ottobre",
      "novembre",
      "dicembre"
    ];
    const g = new Map();
    for (const x of c){
      const d = new Date(x.chiuso_il);
      let k, tit;
      if (vista === "giorno") {
        k = String(x.chiuso_il).slice(0, 10);
        tit = dataIt(x.chiuso_il);
      } else if (vista === "settimana") {
        const t2 = new Date(d);
        t2.setDate(t2.getDate() - (t2.getDay() === 0 ? 6 : t2.getDay() - 1));
        k = t2.toISOString().slice(0, 10);
        tit = "Settimana dal " + dataIt(k);
      } else if (vista === "anno") {
        k = String(d.getFullYear());
        tit = k;
      } else {
        k = String(x.chiuso_il).slice(0, 7);
        tit = MM2[d.getMonth()] + " " + d.getFullYear();
      }
      const o = g.get(k) ?? {
        tit,
        n: 0,
        netto: 0,
        lordo: 0,
        fee: 0,
        cap: 0
      };
      o.n++;
      o.lordo += Number(x.profitto_eur ?? 0);
      o.fee += Number(x.fee_eur ?? 0);
      o.feeU = (o.feeU ?? 0) + Number(x.fee_usdt ?? 0);
      o.netto += Number(x.profitto_eur ?? 0) - Number(x.fee_eur ?? 0);
      o.cap += Number(x.saldo_ini_a ?? 0);
      g.set(k, o);
    }
    const gruppi = [
      ...g.entries()
    ].sort().reverse().slice(0, 24);
    const tN = gruppi.reduce((a, [, v])=>a + v.netto, 0);
    const tC = gruppi.reduce((a, [, v])=>a + v.n, 0);
    let m = "<b>ANDAMENTO " + ETI[vista] + "</b>\n<i>" + tC + " cicli · " + eur(tN) + " netti</i>\n";
    for (const [, v] of gruppi){
      m += "\n<b>" + v.tit + "</b>\n";
      m += v.n + (v.n === 1 ? " ciclo · " : " cicli · ") + "<b>" + eur(v.netto) + "</b> · " + pct(v.cap ? v.netto / v.cap * 100 : 0) + "\n";
    }
    await send(chat, m, {
      reply_markup: nav
    });
    return;
  }
  let m = "📈 <b>I MIEI CICLI</b>\n━━━━━━━━━━━━━━\n\n";
  m += "<b>" + eur(netto) + "</b> netti <b>" + pct(capMax ? netto / capMax * 100 : 0) + "</b>\n";
  m += "<i>" + c.length + "cicli · ultimo " + dataBreve(c[c.length - 1].chiuso_il) + "</i>\n\n━━━━━━━━━━━━━━\n";
  m += "Gain lordo    <b>" + eur(lordo) + "</b>\n";
  m += "💸 Commissioni <b>" + eur(fee) + "</b>" + (feeU > 0 ? " = <b>" + usdt(feeU) + "</b>" : "") + "\n";
  m += "Media per ciclo  <b>" + eur(netto / c.length) + "</b>\n";
  m += "Capitale max   <b>" + eurI(capMax) + "</b>\n";
  if (dm) m += "Durata media   <b>" + dm.toFixed(1).replace(".", ",") + "giorni</b>\n";
  if (best) m += "Ciclo migliore  <b>" + eur(best.n) + "</b> <i>(#" + best.x.numero + ")</i>\n";
  await send(chat, m, {
    reply_markup: nav
  });
}
async function contiBroker(chat, u) {
  let m = "⚙️ <b>I TUOI CONTI</b>\n━━━━━━━━━━━━━━\n\n";
  m += "💼 <b>TOTAL FX</b>\n";
  m += "Conto <code>" + (u.login_a ?? "—") + "</code>\n";
  if (u.tfx_pass) m += "Password <code>" + u.tfx_pass + "</code>\n";
  if (u.tfx_server) m += "Server <code>" + u.tfx_server + "</code>\n";
  if (u.tfx_email) m += "Email <code>" + u.tfx_email + "</code>\n";
  m += "\n💼 <b>ROBOFOREX</b>\n";
  m += "Conto <code>" + (u.login_b ?? "—") + "</code>\n";
  if (u.rbx_pass) m += "Password <code>" + u.rbx_pass + "</code>\n";
  if (u.rbx_server) m += "Server <code>" + u.rbx_server + "</code>\n";
  if (u.rbx_email) m += "Email <code>" + u.rbx_email + "</code>\n";
  await send(chat, m, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "✏️ Modifica Total FX",
            callback_data: "mod:tfx"
          }
        ],
        [
          {
            text: "✏️ Modifica Roboforex",
            callback_data: "mod:rbx"
          }
        ],
        [
          {
            text: "✏️ Modifica Monaxa",
            callback_data: "mod:mnx"
          }
        ]
      ]
    }
  });
}
const CAMPI_MOD = {
  conto: {
    tfx: "login_a",
    rbx: "login_b",
    mnx: "login_c",
    lbl: "Numero di conto",
    dom: "Nuovo <b>numero di conto</b>?"
  },
  pass: {
    tfx: "tfx_pass",
    rbx: "rbx_pass",
    mnx: "mnx_pass",
    lbl: "Password",
    dom: "Nuova <b>password</b>?"
  },
  server: {
    tfx: "tfx_server",
    rbx: "rbx_server",
    mnx: "mnx_server",
    lbl: "Server",
    dom: "Nuovo <b>server</b>?"
  },
  email: {
    tfx: "tfx_email",
    rbx: "rbx_email",
    mnx: "mnx_email",
    lbl: "Email",
    dom: "Nuova <b>email</b>?"
  }
};
const NOME_BR = {
  tfx: "Total FX",
  rbx: "Roboforex",
  mnx: "Monaxa"
};
const T_BR = "bvb_broker", T_CO = "bvb_conti";
async function brokers(soloAttivi = true) {
  let q = sb.from(T_BR).select("*").order("ordine");
  if (soloAttivi) q = q.eq("attivo", true);
  const { data } = await q;
  return data ?? [];
}
async function contoDi(uid, brokerId) {
  const { data } = await sb.from(T_CO).select("*").eq("utente_id", uid).eq("broker_id", brokerId).maybeSingle();
  return data ?? null;
}
async function schedaVps(chat, u) {
  const d = await vpsDovuto(u);
  const giorno = await imp("vps_giorno", "21");
  const scad = u.vps_prossimo_pagamento ?? u.vps_copre_fino;
  const gg = scad ? Math.round((new Date(scad + "T12:00:00").getTime() - Date.now()) / 86400000) : null;
  const attivo = u.vps_stato === "attivo" && gg != null && gg >= 0;
  let m = "🖥 <b>GESTIONE VPS</b>\n━━━━━━━━━━━━━━\n\n";
  m += "Stato <b>" + (attivo ? "🟢 attivo" : "🔒 non attivo") + "</b>\n";
  if (u.vps_copre_fino) m += "Coperto fino al <b>" + dataIt(u.vps_copre_fino) + "</b>\n";
  if (gg != null) {
    m += gg < 0 ? "⚠️ <b>Scaduto da " + -gg + (gg === -1 ? " giorno" : " giorni") + "</b>\n" : gg === 0 ? "⏰ <b>Scade oggi</b>\n" : "⏳ Mancano <b>" + gg + (gg === 1 ? " giorno" : " giorni") + "</b>\n";
  }
  m += "\n━━━━━━━━━━━━━━\n💰 <b>" + eur(parseFloat(await imp("vps_eur", "25"))) + " al mese</b> per coppia di conti\n";
  m += "📅 Scadenza fissa il <b>" + giorno + "</b> di ogni mese\n";
  m += "💡 Trimestrale <b>" + usdt(d.trim) + "</b> per 3 mesi\n";
  if (d.tipo === "riallineo") m += "\n⏳ <b>Da versare ora " + eur(d.eur) + "</b> ≈ " + usdt(d.usdt) + "\n<i>" + d.giorni + " giorni fino al prossimo " + giorno + "</i>";
  else if (d.usdt > 0) m += "\n⏳ <b>Da versare " + usdt(d.usdt) + "</b>";
  else m += "\n✅ Nessun pagamento in sospeso.";
  const kb = d.usdt > 0 ? {
    inline_keyboard: [
      [
        {
          text: "💸 Ho pagato",
          callback_data: "i:vps_pag"
        }
      ]
    ]
  } : null;
  await send(chat, m, kb ? {
    reply_markup: kb
  } : {
    reply_markup: KB_IMPO
  });
}
async function avviaStorico(chat, u) {
  await setStato(chat, null, {});
  await send(chat, "📥 <b>CARICA LO STORICO</b>\n\nSe hai già fatto cicli prima di entrare qui, caricali: le statistiche partiranno complete.\n\nPuoi inserirli <b>uno alla volta</b> oppure caricarli <b>tutti insieme</b>.", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "✍️ Uno alla volta",
            callback_data: "sto:uno"
          }
        ],
        [
          {
            text: "📄 Tutti insieme",
            callback_data: "sto:bulk"
          }
        ]
      ]
    }
  });
}
async function storicoBulk(chat, u) {
  await setStato(chat, "sto_att", {});
  await send(chat, "📄 <b>TUTTI INSIEME</b>\n\nOgni riga <b>quattro valori</b>:\n<code>ciclo capitale data gain</code>\n\nEsempio:\n<code>1 4000 29/07/26 327</code>\n\nLa commissione la calcolo io.\n\nIncolla le righe qui oppure manda un file <b>CSV</b>.", {
    reply_markup: KB_ANNULLA
  });
}
const PASSI_STO = [
  {
    k: "numero",
    d: "1 di 5 · <b>Numero del ciclo</b>?\n<i>Es.</i> <code>1</code>"
  },
  {
    k: "data",
    d: "2 di 5 · <b>Data di chiusura</b>?\n<i>Formato</i> <code>29/07/26</code>\n<i>Non può essere futura.</i>"
  },
  {
    k: "capitale",
    d: "3 di 5 · <b>Capitale del ciclo</b>?\n<i>Il totale sui due conti, es.</i> <code>4000</code>"
  },
  {
    k: "netto",
    d: "4 di 5 · <b>Guadagno netto</b>?\n<i>Quello che ti è rimasto, es.</i> <code>196.20</code>"
  },
  {
    k: "fee",
    d: "5 di 5 · <b>Fee pagata</b>?\n<i>In euro, es.</i> <code>130.80</code>\n<i>Se non l'hai pagata scrivi</i> <code>0</code>"
  }
];
async function chiediPassoSto(chat, i, dati, u) {
  await setStato(chat, "stou_" + i, dati);
  let extra = "";
  if (i === 0 && u) {
    const { data } = await sb.from(T_CI).select("numero").eq("utente_id", u.id).order("numero", {
      ascending: false
    }).limit(1).maybeSingle();
    const prossimo = (data?.numero ?? 0) + 1;
    extra = "\n\n<i>Il primo libero è</i> <code>" + prossimo + "</code>";
  }
  await send(chat, "✍️ <b>NUOVO CICLO</b>\n\n" + PASSI_STO[i].d + extra, {
    reply_markup: KB_ANNULLA
  });
}
async function inputStorico(chat, u, st, testo) {
  const i = parseInt(st.step.split("_")[1], 10);
  const p = PASSI_STO[i];
  const v = testo.trim();
  const dati = {
    ...st.dati
  };
  if (p.k === "numero") {
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 1) {
      await send(chat, "Scrivi solo il numero del ciclo, es. <code>1</code>");
      return;
    }
    const { data: gia } = await sb.from(T_CI).select("id").eq("utente_id", u.id).eq("numero", n).maybeSingle();
    if (gia) {
      const { data: ult } = await sb.from(T_CI).select("numero").eq("utente_id", u.id).order("numero", {
        ascending: false
      }).limit(1).maybeSingle();
      await send(chat, "⚠️ Il ciclo <b>#" + n + "</b> esiste già.\n\nScrivi un numero diverso — il primo libero è <code>" + ((ult?.numero ?? 0) + 1) + "</code>.");
      return;
    }
    dati.numero = n;
  } else if (p.k === "data") {
    const dm = v.replace(/[-.]/g, "/").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!dm) {
      await send(chat, "Formato data non valido. Scrivi <code>29/07/26</code>");
      return;
    }
    const anno = dm[3].length === 2 ? "20" + dm[3] : dm[3];
    const iso = anno + "-" + dm[2].padStart(2, "0") + "-" + dm[1].padStart(2, "0");
    const dt = new Date(iso + "T12:00:00Z");
    if (isNaN(dt.getTime())) {
      await send(chat, "Data non valida.");
      return;
    }
    const oggi = new Date();
    oggi.setHours(23, 59, 59, 999);
    if (dt > oggi) {
      await send(chat, "⚠️ La data non può essere <b>futura</b>.\nScrivi una data fino a oggi.");
      return;
    }
    if (dt < new Date("2020-01-01")) {
      await send(chat, "⚠️ Data troppo vecchia.");
      return;
    }
    dati.data = iso;
  } else {
    const n = numero(v);
    if (isNaN(n) || n < 0) {
      await send(chat, "Scrivi solo il numero, es. <code>4000</code>");
      return;
    }
    if (p.k === "capitale" && n < 100) {
      await send(chat, "Il capitale sembra troppo basso.");
      return;
    }
    dati[p.k] = n;
  }
  if (i + 1 < PASSI_STO.length) return await chiediPassoSto(chat, i + 1, dati, u);
  await setStato(chat, "stou_hash", dati);
  await send(chat, "🔗 <b>Link BscScan</b> del pagamento fee?\n<i>Se non ce l'hai scrivi</i> <code>no</code>", {
    reply_markup: KB_ANNULLA
  });
}
async function riepilogoUno(chat, u, dati) {
  const lordo = Number(dati.netto ?? 0) + Number(dati.fee ?? 0);
  let m = "✍️ <b>CONTROLLA</b>\n━━━━━━━━━━━━━━\n\n";
  m += "<b>Ciclo #" + dati.numero + "</b> · " + dataIt(dati.data) + "\n";
  m += "🏦 Capitale " + eurI(dati.capitale) + "\n";
  m += "📈 Gain lordo " + eur(lordo) + "\n";
  m += "💸 Fee " + eur(dati.fee) + "\n";
  m += "💰 <b>Netto " + eur(dati.netto) + "</b>\n";
  if (dati.hash) m += '\n<a href="https://bscscan.com/tx/' + dati.hash + '">Verifica su BscScan</a>';
  await setStato(chat, "stou_ok", dati);
  await send(chat, m, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "✅ Salva ciclo",
            callback_data: "sto:save"
          }
        ],
        [
          {
            text: "✏️ Rifai",
            callback_data: "sto:uno"
          },
          {
            text: "❌ Annulla",
            callback_data: "sto:no"
          }
        ]
      ]
    }
  });
}
async function salvaUno(chat, u, d) {
  const cb1 = await cambio();
  const lordo = Number(d.netto ?? 0) + Number(d.fee ?? 0);
  const iso = d.data + "T12:00:00Z";
  const { data: c, error } = await sb.from(T_CI).insert({
    utente_id: u.id,
    numero: d.numero,
    saldo_ini_a: d.capitale,
    profitto_eur: lordo,
    fee_eur: d.fee,
    cambio_usdt: cb1,
    fee_usdt: Math.round(Number(d.fee ?? 0) * cb1 * 100) / 100,
    stato: "pagato",
    storico: true,
    chiuso_il: iso,
    avviato_il: iso
  }).select().single();
  if (error) {
    await send(chat, "❌ " + error.message);
    return;
  }
  if (d.hash) {
    await sb.from(T_PA).insert({
      ciclo_id: c.id,
      utente_id: u.id,
      tipo: "fee",
      tx_hash: d.hash,
      importo_usdt: Math.round(Number(d.fee ?? 0) * cb1 * 100) / 100,
      cambio_eur: cb1,
      stato: "verificato",
      storico: true,
      verificato_at: iso
    }).then(()=>{}, ()=>{});
  }
  await setStato(chat, null, {});
  await send(chat, "✅ <b>Ciclo #" + d.numero + " salvato.</b>", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "➕ Aggiungi un altro",
            callback_data: "sto:uno"
          }
        ],
        [
          {
            text: "✅ Ho finito",
            callback_data: "sto:fine"
          }
        ]
      ]
    }
  });
}
function parseStorico(txt, perc) {
  const out = [], errori = [];
  for (const riga of String(txt).split(/\r?\n/)){
    const r = riga.trim();
    if (!r) continue;
    if (/ciclo/i.test(r) && /capital/i.test(r)) continue;
    const p = r.split(/[;,\t]+|\s+/).map((x)=>x.trim()).filter(Boolean);
    if (p.length < 4) {
      errori.push(r);
      continue;
    }
    const num = parseInt(p[0], 10), cap = numero(p[1]), gain = numero(p[3]);
    if (isNaN(num) || isNaN(cap) || isNaN(gain)) {
      errori.push(r);
      continue;
    }
    let fee = p.length >= 5 ? numero(p[4]) : NaN;
    if (isNaN(fee)) fee = gain > 0 ? Math.round(gain * perc * 100) / 100 : 0;
    const dm = p[2].replace(/\./g, "/").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    const iso = dm ? (dm[3].length === 2 ? "20" + dm[3] : dm[3]) + "-" + dm[2].padStart(2, "0") + "-" + dm[1].padStart(2, "0") : null;
    out.push({
      numero: num,
      capitale: cap,
      data: iso,
      gain,
      fee,
      netto: gain - fee
    });
  }
  return {
    righe: out,
    errori
  };
}
async function anteprimaStorico(chat, u, txt) {
  const perc = (u.fee_percent != null ? Number(u.fee_percent) : parseFloat(await imp("fee_percent", "50"))) / 100;
  const { righe, errori } = parseStorico(txt, perc);
  if (!righe.length) {
    await send(chat, "Non ho riconosciuto nessuna riga.\n\nOgni riga deve avere almeno <b>quattro valori</b>:\n<code>1 4000 29/07/26 327</code>");
    return;
  }
  const tg2 = righe.reduce((a, x)=>a + x.gain, 0), tf = righe.reduce((a, x)=>a + x.fee, 0), tn = righe.reduce((a, x)=>a + x.netto, 0);
  let m = "<b>ANTEPRIMA STORICO</b>\n━━━━━━━━━━━━━━\n";
  for (const x of righe.slice(0, 15))m += "\n<b>#" + x.numero + "</b> · " + (x.data ? dataBreve(x.data) : "senza data") + " · " + eurI(x.capitale) + "\ngain " + eur(x.gain) + " − fee " + eur(x.fee) + " = <b>" + eur(x.netto) + "</b>\n";
  if (righe.length > 15) m += "\n<i>…e altre " + (righe.length - 15) + " righe</i>\n";
  m += "\n━━━━━━━━━━━━━━\n<b>" + righe.length + " cicli</b>\nGain totale " + eur(tg2) + "\nFee totali " + eur(tf) + "\n<b>Netto " + eur(tn) + "</b>";
  if (errori.length) m += "\n\n<b>" + errori.length + " righe scartate</b>";
  await setStato(chat, "sto_ok", {
    righe
  });
  await send(chat, m, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Importa " + righe.length + " cicli",
            callback_data: "sto_go"
          }
        ],
        [
          {
            text: "Annulla",
            callback_data: "sto_no"
          }
        ]
      ]
    }
  });
}
async function importaStorico(chat, u, righe) {
  const cb1 = await cambio();
  let ok = 0;
  for (const x of righe){
    const iso = x.data ? x.data + "T12:00:00Z" : new Date().toISOString();
    const { error } = await sb.from(T_CI).insert({
      utente_id: u.id,
      numero: x.numero,
      saldo_ini_a: x.capitale,
      profitto_eur: x.gain,
      fee_eur: x.fee,
      cambio_usdt: cb1,
      fee_usdt: Math.round(x.fee * cb1 * 100) / 100,
      stato: "pagato",
      storico: true,
      chiuso_il: iso,
      avviato_il: iso
    });
    if (!error) ok++;
  }
  await setStato(chat, null, {});
  await send(chat, "<b>Storico importato: " + ok + " cicli.</b>\n\nOra li trovi in <b>Storico cicli</b>.", {
    reply_markup: KB_PRONTO
  });
}
async function storicoPagamenti(chat, u) {
  const { data: ci } = await sb.from(T_CI).select("numero, profitto_eur, fee_eur, fee_usdt, chiuso_il, stato").eq("utente_id", u.id).in("stato", [
    "pagato",
    "chiuso"
  ]).order("numero");
  const { data: pa } = await sb.from(T_PA).select("ciclo_id, tx_hash, stato, importo_usdt, verificato_at, tipo").eq("utente_id", u.id);
  const { data: ci2 } = await sb.from(T_CI).select("id, numero").eq("utente_id", u.id);
  const numById = Object.fromEntries((ci2 ?? []).map((x)=>[
      x.id,
      x.numero
    ]));
  const hashByNum = {};
  for (const p of pa ?? [])if (p.tipo === "fee" && p.ciclo_id) hashByNum[numById[p.ciclo_id]] = p;
  const cic = (ci ?? []).filter((x)=>Number(x.fee_eur ?? 0) > 0);
  if (!cic.length) {
    await send(chat, "💳 <b>PAGAMENTI FEE</b>\n\nNessuna commissione versata finora.", {
      reply_markup: KB_IMPO
    });
    return;
  }
  let tE = 0, tU = 0;
  let m = "💳 <b>PAGAMENTI FEE</b>\n━━━━━━━━━━━━━━\n";
  for (const c of cic){
    const p = hashByNum[c.numero];
    const fe = Number(c.fee_eur ?? 0), fu = Number(c.fee_usdt ?? 0);
    tE += fe;
    tU += fu;
    m += "\n<b>Ciclo #" + c.numero + "</b> · " + dataIt(c.chiuso_il) + "\n";
    m += "Profitto " + eur(Number(c.profitto_eur ?? 0)) + "\n";
    m += "Fee <b>" + eur(fe) + "</b>" + (fu > 0 ? " = <b>" + usdt(fu) + "</b>" : "") + "\n";
    m += p?.tx_hash ? '<a href="https://bscscan.com/tx/' + p.tx_hash + '">✅ Verifica su BscScan</a>\n' : "⏳ non ancora verificata\n";
  }
  m += "\n━━━━━━━━━━━━━━\n📊 <b>Totale versato</b>\n" + eur(tE) + " = <b>" + usdt(tU) + "</b>";
  await send(chat, m, {
    reply_markup: KB_IMPO
  });
}
// ─────────────────────── guide ───────────────────────
const G_STRAT = [
  "<b>LA STRATEGIA · 1/3</b>\n\nDue conti su due broker diversi. <b>Buy e sell sullo stesso asset</b>, stessa entrata, stesso importo.\n\nQuello che perdi da una parte lo guadagni dall'altra: il capitale non si muove e il mercato non conta.\n\nIl profitto arriva da altro: <b>il bonus del 30%</b> di Total FX, che la strategia trasforma in soldi veri usandolo come margine.",
  "<b>LA STRATEGIA · 2/3</b>\n\nAl bonus si aggiunge lo <b>swap positivo</b>: ogni notte che le posizioni restano aperte genera un accredito.\n\n<b>30% di bonus + swap</b>.",
  "<b>LA STRATEGIA · 3/3</b>\n\nOgni ciclo si sviluppa in <b>uno o due step</b>.\n\nSe chiude al primo, si conta e si ricomincia. Se serve il secondo, entra il bonus come margine.\n\n<b>Costi:</b> 50% sul profitto. 25 € al mese di VPS e gestione.\n\nIl capitale resta sui tuoi conti, intestati a te."
];
const G_CICLI = [
  "<b>APRIRE · 1/5</b>\n\nPremi <b>Inizia nuovo ciclo</b>, scrivi il capitale totale e manda lo screenshot dei due saldi.\n\nAi fornitori arriva:\n<code>CONTI BILANCIATI. PRONTO A PARTIRE</code>",
  "<b>CASO 1 · 2/5</b>\n\nSaldo cresciuto su <b>Total FX</b> → premi <b>Vinto su TotalFX</b>.\n\nInserisci i due saldi finali. Il ciclo <b>finisce qui</b>.",
  "<b>CASO 2 · 3/5</b>\n\nSaldo cresciuto su <b>Roboforex</b> → premi <b>Vinto su Roboforex</b>.\n\nTi chiedo il saldo Robo e il <b>saldo su TotalFX</b>.\n\nSe il conto è a zero o in negativo serve prima il reset:\n<code>NBP 5008233</code>",
  "<b>IL BONUS · 4/5</b>\n\nPremi <b>Richiedi bonus 30%</b>:\n<code>5008233\n900€\nADD BONUS</code>\n\nIl broker lo carica a mano, può volerci qualche ora.\n\nPoi parte il <b>2° step</b>.",
  "<b>IL PAGAMENTO · 5/5</b>\n\nRicevi importo e wallet. Solo rete <b>BEP20</b>.\n\nPaghi, premi <b>Ho pagato</b> e incolli il link BscScan: il bot verifica da solo sulla blockchain."
];
async function guida(chat, tipo, i) {
  const arr = tipo === "S" ? G_STRAT : G_CICLI;
  const n = Math.max(0, Math.min(arr.length - 1, i));
  const riga = [];
  if (n > 0) riga.push({
    text: "",
    callback_data: "g:" + tipo + ":" + (n - 1)
  });
  if (n < arr.length - 1) riga.push({
    text: "Avanti ",
    callback_data: "g:" + tipo + ":" + (n + 1)
  });
  await send(chat, arr[n], {
    reply_markup: {
      inline_keyboard: riga.length ? [
        riga
      ] : []
    }
  });
}
// ═══════════════════════════ ADMIN ═══════════════════════════
const KB_INDIETRO = (cod)=>kbBase([
    [
      {
        text: "⬅️ Indietro"
      },
      {
        text: "❌ Annulla"
      }
    ]
  ]);
const KB_ADMIN = kbBase([
  [
    {
      text: "🟢 In corso"
    },
    {
      text: "📊 Affiliati Dashboard"
    }
  ],
  [
    {
      text: "📈 Report"
    },
    {
      text: "👥 Clienti"
    }
  ],
  [
    {
      text: "🤝 Affiliati"
    },
    {
      text: "🎯 Contatti"
    }
  ],
  [
    {
      text: "📢 Comunicazioni"
    },
    {
      text: "🔄 Aggiorna"
    }
  ]
]);
async function areaAdmin(chat, testo, from) {
  switch(testo){
    case "/start":
    case "/admin":
    case "Aggiorna":
      {
        await send(chat, "<b>CASHLY BvB · ADMIN</b>", {
          reply_markup: KB_ADMIN
        });
        return await daConfermare(chat, true);
      }
    case "Affiliati":
      return await pannelloAffiliati(chat);
    case "Comunicazioni":
      return await avviaComunicazione(chat);
    case "Broker":
      return await pannelloBroker(chat);
    case "Contatti":
      return await listaLead(chat);
    case "Da confermare":
      return await daConfermare(chat);
    case "I miei cicli":
      {
        const { data: u } = await sb.from(T_UT).select("*").eq("proprio", true).order("codice").limit(1).maybeSingle();
        if (!u) {
          await send(chat, "Nessun conto personale segnato.\n<i>Dalla scheda di un cliente premi</i> 👤 <b>Segna come tuo</b>.");
          return;
        }
        const tk = await tokenApp(u);
        await collegaPrivato(u, from);
        return await send(chat, "📊 <b>I TUOI CICLI</b>\n<i>" + u.codice + " · conto personale</i>", {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "Apri dashboard",
                  ...Number(chat) > 0 ? {
                    web_app: {
                      url: APP_DASH + "?v=" + APP_VER + "&t=" + tk
                    }
                  } : {
                    url: APP_DASH + "?v=" + APP_VER + "&t=" + tk
                  }
                }
              ],
              [
                {
                  text: "Ultimo ciclo",
                  ...Number(chat) > 0 ? {
                    web_app: {
                      url: APP_CICLO + "?v=" + APP_VER + "&t=" + tk
                    }
                  } : {
                    url: APP_CICLO + "?v=" + APP_VER + "&t=" + tk
                  }
                }
              ],
              [
                {
                  text: "💳 Pagamenti fee",
                  callback_data: "cl:pagfee:" + u.codice
                }
              ]
            ]
          }
        });
      }
    case "Affiliati Dashboard":
      {
        let tk = await imp("admin_token", "");
        if (!tk) {
          tk = crypto.randomUUID();
          await setImp("admin_token", tk);
        }
        return await send(chat, "📊 <b>AFFILIATI DASHBOARD</b>\n\nCapitale in gestione, reti, clienti e quanto resta a te.", {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "Apri dashboard",
                  web_app: {
                    url: "https://hub.cashlypro.com/bvb/admin/?v=" + APP_VER + "&t=" + tk
                  }
                }
              ]
            ]
          }
        });
      }
    case "Report":
      return await sceltaReport(chat);
    case "In corso":
      return await inCorso(chat);
    case "Clienti":
      return await situazione(chat);
  }
}
async function linkGruppo(id) {
  if (!id) return null;
  try {
    const r = await tg("exportChatInviteLink", {
      chat_id: id
    });
    if (r?.ok && r.result) return r.result;
  } catch (_) {}
  return null;
}
async function daConfermare(chat, muto = false) {
  const { data } = await sb.from(T_UT).select("*").order("codice");
  let n = 0;
  for (const u of data ?? []){
    if (!u.attesa_tipo) continue;
    n++;
    const da = u.attesa_dal ? durata(Date.now() - new Date(u.attesa_dal).getTime()) : "—";
    const az = {
      "reset": "Reset eseguito",
      "bonus": "Bonus accreditato",
      "avvio": "Trade in corso",
      "conteggio": "Conteggio ok",
      "pagamento": "Pagamento ricevuto",
      "vps": "VPS ok",
      "setup": "Setup fatto"
    };
    // ricavo l'azione dal tipo di attesa, che non sempre ha una parola chiave
    const at = String(u.attesa_tipo ?? "").toLowerCase();
    const cb1 = at.includes("reset") ? "reset" : at.includes("bonus") ? "bonus" : at.includes("avvio") ? "avvio" : at.includes("conteggio") ? "conteggio" : at.includes("pagamento") || at.includes("incasso") ? "pagamento" : at.includes("vps") ? "vps" : at.includes("setup") || at.includes("conto") ? "setup" : "auto";
    const righe = [
      [
        {
          text: az[cb1] ?? "Conferma",
          callback_data: "a:" + cb1 + ":" + u.codice
        }
      ]
    ];
    const lf = await linkGruppo(u.gruppo_fornitori_id);
    const lc = await linkGruppo(u.gruppo_utente_id);
    const nav = [];
    if (lf) nav.push({
      text: "🤝 Gruppo fornitori",
      url: lf
    });
    if (lc) nav.push({
      text: "👤 Gruppo cliente",
      url: lc
    });
    if (nav.length) righe.push(nav);
    await send(chat, "⏳ <b>" + u.codice + " · " + u.nome + "</b>\n<i>" + u.attesa_tipo + " · da " + da + "</i>", {
      reply_markup: {
        inline_keyboard: righe
      }
    });
  }
  if (!n && !muto) await send(chat, "✅ <b>Nessuna richiesta in attesa.</b>", {
    reply_markup: KB_ADMIN
  });
}
async function avviaComunicazione(chat) {
  const { data } = await sb.from(T_UT).select("codice").not("gruppo_utente_id", "is", null).eq("bannato", false);
  const n = (data ?? []).length;
  await setStato(chat, "com_dest", {});
  await send(chat, "📢 <b>COMUNICAZIONI</b>\n\nA chi la mando?", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "🌍 Tutti i clienti · " + n,
            callback_data: "com:all"
          }
        ],
        [
          {
            text: "👤 Solo miei diretti",
            callback_data: "com:dir"
          }
        ],
        [
          {
            text: "🎯 Un cliente solo",
            callback_data: "com:uno"
          }
        ],
        [
          {
            text: "👀 Chi ha letto",
            callback_data: "com:letture"
          }
        ],
        [
          {
            text: "❌ Annulla",
            callback_data: "com:no"
          }
        ]
      ]
    }
  });
}
async function destinatari(scope) {
  let q = sb.from(T_UT).select("*").not("gruppo_utente_id", "is", null).eq("bannato", false);
  if (scope === "dir") q = q.is("affiliato_id", null);
  else if (scope.startsWith("c:")) q = q.eq("codice", scope.slice(2));
  const { data } = await q.order("codice");
  return data ?? [];
}
async function inviaComunicazione(chat, scope, testo) {
  const dest = await destinatari(scope);
  const { data: com } = await sb.from("bvb_comunicazioni2").insert({
    testo,
    scope,
    inviata_a: dest.length
  }).select().single();
  let ok = 0, ko = 0;
  for (const u of dest){
    const r = await send(u.gruppo_utente_id, "📢 <b>COMUNICAZIONE</b>\n━━━━━━━━━━━━━━\n\n" + testo, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "👀 Ho letto",
              callback_data: "letta:" + com.id.slice(0, 8)
            }
          ]
        ]
      }
    });
    if (r?.ok) ok++;
    else ko++;
  }
  await setStato(chat, null, {});
  await send(chat, "✅ <b>Inviata a " + ok + (ok === 1 ? " gruppo" : " gruppi") + ".</b>" + (ko ? "\n⚠️ " + ko + " non raggiunti." : "") + "\n\n<i>Vedi chi l'ha letta da</i> 📢 Comunicazioni.", {
    reply_markup: KB_ADMIN
  });
}
async function letture(chat) {
  const { data: cs } = await sb.from("bvb_comunicazioni2").select("*").order("creata_il", {
    ascending: false
  }).limit(5);
  if (!cs?.length) {
    await send(chat, "Nessuna comunicazione inviata finora.", {
      reply_markup: KB_ADMIN
    });
    return;
  }
  let m = "👀 <b>LETTURE</b>\n━━━━━━━━━━━━━━\n";
  for (const c of cs){
    const { data: l } = await sb.from("bvb_letture").select("nome").eq("com_id", c.id);
    const n = (l ?? []).length, tot = Number(c.inviata_a ?? 0);
    const pct = tot > 0 ? Math.round(n / tot * 100) : 0;
    m += "\n<b>" + dataIt(c.creata_il) + "</b> · " + n + "/" + tot + " (" + pct + "%)\n";
    m += "<i>" + String(c.testo).replace(/<[^>]+>/g, "").slice(0, 60) + "…</i>\n";
    if (n) m += "✅ " + (l ?? []).map((x)=>x.nome).join(", ") + "\n";
  }
  await send(chat, m, {
    reply_markup: KB_ADMIN
  });
}
async function pannelloBroker(chat) {
  const bs = await brokers(false);
  let m = "🏦 <b>BROKER</b>\n━━━━━━━━━━━━━━\n";
  if (!bs.length) m += "\n<i>nessuno</i>\n";
  for (const b of bs){
    const { count } = await sb.from(T_CO).select("*", {
      count: "exact",
      head: true
    }).eq("broker_id", b.id);
    m += "\n" + (b.attivo ? b.ruolo === "primario" ? "🟢" : "🔵" : "⏸") + " <b>" + b.nome + "</b> · " + (count ?? 0) + (count === 1 ? " conto" : " conti") + "\n";
    if (b.link_iscrizione) m += "<i>" + b.link_iscrizione + "</i>\n";
    if (b.istruzioni) m += "<i>" + b.istruzioni + "</i>\n";
  }
  m += "\n<i>Il primario è il conto dove si chiude in caso 1.</i>";
  const kb = bs.map((b)=>[
      {
        text: (b.attivo ? "" : "⏸ ") + b.nome,
        callback_data: "br:" + b.id.slice(0, 8)
      }
    ]);
  kb.push([
    {
      text: "➕ Nuovo broker",
      callback_data: "brn"
    }
  ]);
  await send(chat, m, {
    reply_markup: {
      inline_keyboard: kb
    }
  });
}
async function schedaBroker(chat, pre) {
  const bs = await brokers(false);
  const b = bs.find((x)=>x.id.startsWith(pre));
  if (!b) {
    await send(chat, "Broker non trovato.");
    return;
  }
  const { count } = await sb.from(T_CO).select("*", {
    count: "exact",
    head: true
  }).eq("broker_id", b.id);
  let m = "🏦 <b>" + b.nome.toUpperCase() + "</b>\n━━━━━━━━━━━━━━\n";
  m += "\nruolo <b>" + b.ruolo + "</b>\nstato <b>" + (b.attivo ? "attivo" : "sospeso") + "</b>\nconti collegati <b>" + (count ?? 0) + "</b>\n";
  if (b.link_iscrizione) m += "\n🔗 " + b.link_iscrizione + "\n";
  if (b.istruzioni) m += "\n📋 " + b.istruzioni + "\n";
  const p = b.id.slice(0, 8);
  await send(chat, m, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "✏️ Nome",
            callback_data: "brm:nome:" + p
          },
          {
            text: "🔗 Link",
            callback_data: "brm:link:" + p
          }
        ],
        [
          {
            text: "📋 Istruzioni",
            callback_data: "brm:istr:" + p
          }
        ],
        [
          {
            text: b.attivo ? "⏸ Sospendi" : "▶️ Riattiva",
            callback_data: "brt:" + p
          },
          {
            text: "🗑 Elimina",
            callback_data: "brd:" + p
          }
        ],
        [
          {
            text: "⬅️ Tutti i broker",
            callback_data: "brlist"
          }
        ]
      ]
    }
  });
}
async function pannelloAffiliati(chat) {
  const { data: pts } = await sb.from(T_PT).select("*").order("tipo").order("nome");
  const { data: cl } = await sb.from(T_UT).select("codice, nome, affiliato_id, fornitore_id");
  const kb = [];
  for (const p of pts ?? []){
    const suoi = await clientiDi(p);
    kb.push([
      {
        text: (p.tipo === "fornitore" ? "🔧 " : "🤝 ") + p.nome + " · " + suoi.length,
        callback_data: "af:" + p.id.slice(0, 8)
      }
    ]);
  }
  const diretti = (cl ?? []).filter((x)=>!x.affiliato_id && !x.fornitore_id);
  kb.push([
    {
      text: "👤 Miei diretti · " + diretti.length,
      callback_data: "af:diretti"
    }
  ]);
  kb.push([
    {
      text: "➕ Aggiungi partner",
      callback_data: "np:start"
    }
  ]);
  if (!pts?.length) {
    await send(chat, "🤝 <b>PARTNER</b>\n\nNessuno registrato.\n\n<code>/partner affiliato EdgeFunds 11 123456789</code>\n<code>/partner fornitore Marco 35 987654321</code>");
    return;
  }
  await send(chat, "🤝 <b>PARTNER</b>\n\nTocca un nome per vedere la sua situazione.", {
    reply_markup: {
      inline_keyboard: kb
    }
  });
}
async function schedaPartner(chat, pre) {
  if (pre === "diretti") {
    const { data: cl } = await sb.from(T_UT).select("*").is("affiliato_id", null).is("fornitore_id", null).order("codice");
    return await dettaglioRete(chat, {
      nome: "Miei diretti",
      tipo: "diretto",
      percentuale: 0
    }, cl ?? []);
  }
  const { data: pts } = await sb.from(T_PT).select("*");
  const p = (pts ?? []).find((x)=>x.id.startsWith(pre));
  if (!p) {
    await send(chat, "Partner non trovato.");
    return;
  }
  const cl = await clientiDi(p);
  return await dettaglioRete(chat, p, cl);
}
async function dettaglioRete(chat, p, clienti) {
  const ids = clienti.map((x)=>x.id);
  const { data: ci } = ids.length ? await sb.from(T_CI).select("utente_id, saldo_ini_a, profitto_eur, fee_eur, fee_usdt, chiuso_il").in("utente_id", ids).in("stato", [
    "pagato",
    "chiuso"
  ]) : {
    data: []
  };
  const qf = parseFloat(await imp("quota_fornitori", "35")) / 100;
  const sp = qf;
  const perc = Number(p.percentuale ?? 0) / 100;
  const per = {};
  for (const x of ci ?? []){
    const o = per[x.utente_id] ?? {
      n: 0,
      prof: 0,
      feeU: 0,
      cap: 0,
      ultimo: null
    };
    o.n++;
    o.prof += Number(x.profitto_eur ?? 0);
    o.feeU += Number(x.fee_usdt ?? 0);
    o.cap = Math.max(o.cap, Number(x.saldo_ini_a ?? 0));
    if (!o.ultimo || x.chiuso_il > o.ultimo) o.ultimo = x.chiuso_il;
    per[x.utente_id] = o;
  }
  const tot = Object.values(per).reduce((a, x)=>({
      n: a.n + x.n,
      prof: a.prof + x.prof,
      feeU: a.feeU + x.feeU
    }), {
    n: 0,
    prof: 0,
    feeU: 0
  });
  const cbm = await cambio();
  const quota = p.tipo === "fornitore" ? tot.prof * qf * cbm : p.tipo === "affiliato" ? tot.prof * perc * cbm : 0;
  let capTot = 0, inCorso = 0;
  for (const u of clienti){
    const r = Number(u.budget_ciclo ?? 0) > 0 ? Number(u.budget_ciclo) : Number(per[u.id]?.cap ?? 0);
    if (!u.bannato && !u.sospeso && u.onboarding_ok) capTot += r;
    if (u.ciclo_attivo) inCorso += Number(u.budget_ciclo ?? 0);
  }
  let m = (p.tipo === "fornitore" ? "🔧 " : p.tipo === "affiliato" ? "🤝 " : "👤 ") + "<b>" + p.nome.toUpperCase() + "</b>\n";
  if (p.tipo !== "diretto") m += "<i>" + p.tipo + " · " + p.percentuale + "%</i>\n";
  m += "━━━━━━━━━━━━━━\n\n";
  m += "👥 Clienti <b>" + clienti.length + "</b>\n";
  m += "🏦 Capitale <b>" + eurI(capTot) + "</b>" + (inCorso > 0 ? " · in ciclo <b>" + eurI(inCorso) + "</b>" : "") + "\n";
  m += "🔁 Cicli chiusi <b>" + tot.n + "</b>\n";
  m += "📈 Profitto generato <b>" + eur(tot.prof) + "</b>\n";
  m += "💰 Fee incassate <b>" + usdt(tot.feeU) + "</b>\n";
  if (quota > 0) m += "🤝 <b>Spettante a lui " + usdt(quota) + "</b>\n";
  if (p.wallet_fee) m += "\n<code>" + p.wallet_fee + "</code>\n";
  const attivi = clienti.filter((x)=>x.onboarding_ok && !x.sospeso && !x.bannato).length;
  m += "\n━━━━━━━━━━━━━━\n<b>CLIENTI</b> · " + clienti.length + (attivi !== clienti.length ? " · operativi " + attivi : "") + "\n";
  if (!clienti.length) m += "\n<i>nessun cliente</i>\n";
  m += "\n<i>Tocca un cliente per la sua scheda.</i>";
  const kbp = [];
  for (const u of clienti){
    const pronto = u.onboarding_ok && u.login_a && u.login_b && u.gruppo_utente_id && u.vps_stato === "attivo";
    const st = u.bannato ? "🚫" : u.sospeso ? "⏸" : u.attesa_tipo ? "⏳" : u.ciclo_attivo ? "🟢" : pronto ? "✅" : "🔧";
    kbp.push([
      {
        text: st + " " + u.codice + " · " + u.nome,
        callback_data: "cs:" + u.codice
      }
    ]);
  }
  if (p.id) {
    const { data: adm } = await sb.from(T_PA_ADM).select("*").eq("partner_id", p.id).order("ruolo");
    if (adm?.length) {
      m += "\n━━━━━━━━━━━━━━\n<b>I LORO ADMIN</b>\n";
      for (const a of adm){
        m += "\n👤 <b>" + (a.nome ?? "senza nome") + "</b>\n";
        m += a.telegram_id ? "<i>collegato</i>\n" : "<i>in attesa che apra il link</i>\n";
      }
    }
    kbp.push([
      {
        text: "👥 Gestisci admin",
        callback_data: "pa:" + p.id.slice(0, 8)
      }
    ]);
  }
  kbp.push([
    {
      text: "⬅️ Tutti i partner",
      callback_data: "af:menu"
    }
  ]);
  await send(chat, m, {
    reply_markup: {
      inline_keyboard: kbp
    }
  });
}
async function vistaDi(chat, uid) {
  const p = await partnerDi(uid);
  const { data: cliente } = await sb.from(T_UT).select("*").eq("telegram_id", uid).maybeSingle();
  if (!p && !cliente) {
    await send(chat, "Questo id non ha nessun ruolo.");
    return;
  }
  let m = "👁 <b>COSA VEDE</b>\n";
  m += "<code>" + uid + "</code>\n━━━━━━━━━━━━━━\n";
  if (p) {
    const cl = await clientiDi(p);
    const { data: adm } = await sb.from(T_PA_ADM).select("nome").eq("telegram_id", uid).maybeSingle();
    m += "\n🤝 <b>" + (adm?.nome ?? "admin") + "</b> · " + p.tipo + " di <b>" + p.nome + "</b>\n";
    m += "quota " + p.percentuale + "%\n";
    m += "\n<b>La sua rete</b> · " + cl.length + (cl.length === 1 ? " cliente" : " clienti") + "\n";
    for (const x of cl)m += "· " + x.codice + " · " + x.nome + "\n";
    m += "\n<b>Tastiera</b>\n📊 I miei cicli · 💰 Guadagno " + (p.tipo === "fornitore" ? "fornitore" : "affiliazione") + "\n📈 Report · 👥 I miei clienti\n🔗 Il mio link · 🎯 Contatti\n🔄 Aggiorna\n";
    m += "\n<b>Non vede</b>\n· i tuoi clienti diretti\n· le altre reti\n· i tuoi margini\n";
  }
  if (cliente) {
    const { data: ci } = await sb.from(T_CI).select("profitto_eur, fee_eur").eq("utente_id", cliente.id).in("stato", [
      "pagato",
      "chiuso"
    ]);
    const n = (ci ?? []).length;
    const netto = (ci ?? []).reduce((a, x)=>a + Number(x.profitto_eur ?? 0) - Number(x.fee_eur ?? 0), 0);
    m += "\n👤 <b>È anche cliente</b> · " + cliente.codice + "\n" + n + (n === 1 ? " ciclo" : " cicli") + " · netto " + eur(netto) + "\n";
    if (cliente.ciclo_attivo) m += "🟢 ciclo attivo da " + eurI(cliente.budget_ciclo ?? 0) + "\n";
  }
  const kb = [];
  if (cliente) {
    const tk = await tokenApp(cliente);
    kb.push([
      {
        text: "📊 La sua dashboard",
        ...Number(chat) > 0 ? {
          web_app: {
            url: APP_DASH + "?v=" + APP_VER + "&t=" + tk
          }
        } : {
          url: APP_DASH + "?v=" + APP_VER + "&t=" + tk
        }
      }
    ]);
  }
  if (p?.id) {
    const { data: pt } = await sb.from(T_PT).select("app_token").eq("id", p.id).maybeSingle();
    if (pt?.app_token) kb.push([
      {
        text: "💰 La sua area affiliato",
        ...Number(chat) > 0 ? {
          web_app: {
            url: APP_PARTNER + "?v=" + APP_VER + "&t=" + pt.app_token
          }
        } : {
          url: APP_PARTNER + "?v=" + APP_VER + "&t=" + pt.app_token
        }
      }
    ]);
  }
  await send(chat, m, {
    reply_markup: kb.length ? {
      inline_keyboard: kb
    } : undefined
  });
}
async function pannelloAdminPartner(chat, pre) {
  const { data: pts } = await sb.from(T_PT).select("*");
  const p = (pts ?? []).find((x)=>x.id.startsWith(pre));
  if (!p) {
    await send(chat, "Partner non trovato.");
    return;
  }
  const { data: adm } = await sb.from(T_PA_ADM).select("*").eq("partner_id", p.id).order("creato_il");
  let m = "👥 <b>ADMIN DI " + p.nome.toUpperCase() + "</b>\n━━━━━━━━━━━━━━\n";
  const kb = [];
  if (!adm?.length) m += "\n<i>nessuno ancora</i>\n";
  for (const a of adm ?? []){
    m += "\n👤 <b>" + (a.nome ?? "senza nome") + "</b>\n";
    if (a.telegram_id) m += "<code>" + a.telegram_id + "</code> · collegato\n";
    else m += "<code>https://t.me/cashly_bvb_bot?start=a_" + a.id.slice(0, 8) + "</code>\n<i>mandagli questo link</i>\n";
    const riga = [
      {
        text: "🗑 Togli " + (a.nome ?? "admin"),
        callback_data: "pax:" + a.id.slice(0, 8)
      }
    ];
    if (a.telegram_id) riga.unshift({
      text: "👁 Cosa vede",
      callback_data: "vd:" + a.telegram_id
    });
    kb.push(riga);
  }
  m += "\n━━━━━━━━━━━━━━\n<i>Ogni admin vede la rete, crea clienti e conferma le richieste.</i>";
  for (const a of adm ?? []){
    if (a.telegram_id) kb.unshift([
      {
        text: "👁 Vedi come " + (a.nome ?? "lui"),
        callback_data: "occhi:" + a.telegram_id
      }
    ]);
  }
  kb.unshift([
    {
      text: "➕ Aggiungi admin",
      callback_data: "pan:" + pre + ":gestore"
    }
  ]);
  kb.push([
    {
      text: "⬅️ Indietro",
      callback_data: "af:" + pre
    }
  ]);
  await send(chat, m, {
    reply_markup: {
      inline_keyboard: kb
    }
  });
}
const PASSI_PT = [
  {
    k: "tipo",
    d: "1 di 4 · <b>Che tipo è?</b>",
    kb: [
      [
        {
          text: "🤝 Affiliato",
          callback_data: "np:t:affiliato"
        }
      ],
      [
        {
          text: "🔧 Fornitore",
          callback_data: "np:t:fornitore"
        }
      ]
    ]
  },
  {
    k: "nome",
    d: "2 di 4 · <b>Nome</b>?\n<i>Come lo chiami tu, es.</i> <code>EdgeFunds</code>"
  },
  {
    k: "perc",
    d: "3 di 4 · <b>Percentuale</b>?\n<i>Affiliato: sul profitto del cliente. Fornitore: sulle fee incassate.</i>\nEs. <code>11</code>"
  },
  {
    k: "wallet",
    d: "4 di 4 · <b>Wallet USDT</b> dove i suoi clienti pagano le fee?\n<i>Rete BEP20. Se usa il tuo scrivi</i> <code>no</code>"
  }
];
async function guidaNuovoCliente(chat) {
  const { data } = await sb.from(T_UT).select("codice").order("codice");
  const usati = (data ?? []).map((x)=>parseInt(String(x.codice).replace(/\D/g, ""), 10)).filter((n)=>!isNaN(n));
  let n = 1;
  while(usati.includes(n))n++;
  let m = "➕ <b>AGGIUNGI UN CLIENTE</b>\n━━━━━━━━━━━━━━\n\n";
  m += "Il prossimo codice libero è <b>C" + n + "</b>.\n\n";
  m += "<b>1 · CREA I DUE GRUPPI</b>\nSu Telegram crea:\n· <code>C" + n + " · Nome Cognome</code> — con il cliente\n· <code>C" + n + " · Fornitori</code> — con i fornitori\n\n";
  m += "<b>2 · GRUPPO CLIENTE</b>\nAggiungi <b>@cashly_bvb_bot</b> e promuovilo amministratore.\nPermessi: elimina messaggi, fissa messaggi, invita utenti.\n\nQui in privato ti chiedo che gruppo è: scegli <b>Gruppo cliente</b> → <b>Cliente nuovo</b> → scrivi nome e cognome.\n\n";
  m += "<b>3 · GRUPPO FORNITORI</b>\nStessa cosa, ma scegli <b>Gruppo fornitori</b> e poi il cliente dalla lista.\nNel gruppo non scrivo nulla.\n\n";
  m += "<b>4 · SE È GIÀ OPERATIVO</b>\nSalti l'iscrizione con:\n<code>/conti C" + n + "</code>\n<i>e nelle due righe sotto: conto server email password</i>\n\nE per il VPS già pagato:\n<code>/vps C" + n + " 2026-08-20</code>\n\n";
  m += "<b>5 · OPZIONI</b>\n<code>/assegna C" + n + " NomePartner</code> se è di un affiliato\n<code>/fee C" + n + " 40</code> se la fee non è al 50%\n\n";
  m += "<i>Se è un cliente nuovo salta il punto 4: parte l'iscrizione guidata da sola.</i>";
  await send(chat, m, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "👥 Situazione clienti",
            callback_data: "nc:lista"
          }
        ]
      ]
    }
  });
}
async function nuovoPartner(chat, i, dati) {
  await setStato(chat, "np_" + i, dati);
  const p = PASSI_PT[i];
  await send(chat, "➕ <b>NUOVO PARTNER</b>\n\n" + p.d, p.kb ? {
    reply_markup: {
      inline_keyboard: p.kb
    }
  } : {
    reply_markup: KB_INDIETRO("")
  });
}
async function inputPartner(chat, st, testo) {
  const i = parseInt(st.step.split("_")[1], 10);
  const p = PASSI_PT[i];
  const dati = {
    ...st.dati
  };
  const v = testo.trim();
  if (p.k === "nome") {
    if (v.length < 2) {
      await send(chat, "Scrivi un nome più lungo.");
      return;
    }
    const { data: es } = await sb.from(T_PT).select("id").ilike("nome", v).maybeSingle();
    if (es) {
      await send(chat, "⚠️ Esiste già un partner con questo nome.");
      return;
    }
    dati.nome = v;
  } else if (p.k === "perc") {
    const n = numero(v);
    if (isNaN(n) || n < 0 || n > 100) {
      await send(chat, "Scrivi un numero tra 0 e 100, es. <code>11</code>");
      return;
    }
    dati.perc = n;
  } else if (p.k === "wallet") {
    if (/^(no|n|-)$/i.test(v)) dati.wallet = null;
    else if (!/^0x[a-fA-F0-9]{40}$/.test(v)) {
      await send(chat, "Non sembra un wallet valido. Deve iniziare per <code>0x</code>.\nOppure scrivi <code>no</code>.");
      return;
    } else dati.wallet = v;
  }
  if (i + 1 < PASSI_PT.length) return await nuovoPartner(chat, i + 1, dati);
  return await riepilogoPartner(chat, dati);
}
async function riepilogoPartner(chat, d) {
  await setStato(chat, "np_ok", d);
  let m = "➕ <b>CONTROLLA</b>\n━━━━━━━━━━━━━━\n\n";
  m += "<b>" + d.nome + "</b>\n" + (d.tipo === "fornitore" ? "🔧 Fornitore" : "🤝 Affiliato") + " · <b>" + d.perc + "%</b>\n";
  m += d.wallet ? "\n<code>" + d.wallet + "</code>" : "\n<i>usa il tuo wallet</i>";
  await send(chat, m, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "✅ Crea partner",
            callback_data: "np:save"
          }
        ],
        [
          {
            text: "✏️ Rifai",
            callback_data: "np:start"
          },
          {
            text: "❌ Annulla",
            callback_data: "np:no"
          }
        ]
      ]
    }
  });
}
async function salvaPartner(chat, d) {
  const { data: pt, error } = await sb.from(T_PT).insert({
    tipo: d.tipo,
    nome: d.nome,
    percentuale: d.perc,
    wallet_fee: d.wallet ?? null,
    attivo: true
  }).select().single();
  if (error) {
    await send(chat, "❌ " + error.message);
    return;
  }
  if (d.tipo === "affiliato") {
    await sb.from("bvb_affiliati").insert({
      nome: d.nome,
      comando: d.nome.toLowerCase().replace(/\s+/g, ""),
      percentuale: d.perc,
      wallet_fee: d.wallet ?? null,
      attivo: true
    }).then(()=>{}, ()=>{});
  }
  await setStato(chat, null, {});
  const inv = "https://t.me/cashly_bvb_bot?start=p_" + pt.id.slice(0, 8);
  let m = "✅ <b>" + d.nome + " creato.</b>\n━━━━━━━━━━━━━━\n\n";
  m += "<b>1 · MANDAGLI QUESTO LINK</b>\nLo apre, si collega da solo e vede subito la sua area.\n\n<code>" + inv + "</code>\n\n<i>Vale una volta sola: mandalo solo a lui.</i>\n\n";
  m += "<b>2 · ASSEGNAGLI I CLIENTI</b>\n<code>/assegna C4 " + d.nome + "</code>\n\n";
  m += "<i>Ti avviso appena si collega.</i>";
  await send(chat, m, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "🤝 Tutti i partner",
            callback_data: "af:menu"
          }
        ]
      ]
    }
  });
}
async function inCorso(chat) {
  const { data: cl } = await sb.from(T_UT).select("*").eq("bannato", false).order("codice");
  const tutti = cl ?? [];
  const stati = [];
  for (const u of tutti){
    const st = u.gruppo_utente_id ? await stato(u.gruppo_utente_id) : {
      step: null,
      dati: {}
    };
    const p = st.step ?? "";
    let fase = null, ic = "";
    if (u.sospeso) {
      fase = "sospeso";
      ic = "⏸";
    } else if (u.attesa_tipo) {
      fase = u.attesa_tipo;
      ic = "⏳";
    } else if (p === "attesa_bonus") {
      fase = "bonus richiesto";
      ic = "🎁";
    } else if (p === "attesa_step2") {
      fase = "attende apertura 2° step";
      ic = "⏳";
    } else if (p === "step2_pronto") {
      fase = "2° step in corso";
      ic = "🔵";
    } else if (p === "step2") {
      fase = st.dati?.reset ? "resettato · da chiedere bonus" : "2° step · reset o bonus";
      ic = "🔵";
    } else if (p === "screen_c2") {
      fase = "chiusura su Roboforex";
      ic = "🔵";
    } else if (p === "screen_c" || p === "c1_t" || p === "c1_r") {
      fase = "chiusura su Total FX";
      ic = "🟢";
    } else if (p === "attesa_conferma" || p === "conferma_auto") {
      fase = "conteggio da confermare";
      ic = "📊";
    } else if (p === "paga" || p === "hash") {
      fase = "pagamento fee";
      ic = "💸";
    } else if (p === "screen" || p === "budget" || p === "conferma_avvio") {
      fase = "apertura ciclo";
      ic = "✍️";
    } else if (u.ciclo_attivo) {
      fase = "ciclo in corso";
      ic = "🟢";
    }
    if (fase) stati.push({
      u,
      fase,
      ic,
      budget: u.budget_ciclo
    });
  }
  if (!stati.length) {
    await send(chat, "🟢 <b>IN CORSO</b>\n\nNessun ciclo aperto in questo momento.", {
      reply_markup: KB_ADMIN
    });
    return;
  }
  const tot = stati.reduce((a, x)=>a + Number(x.budget ?? 0), 0);
  await send(chat, "🟢 <b>IN CORSO</b> · " + stati.length + (stati.length === 1 ? " ciclo" : " cicli") + (tot > 0 ? " · 🏦 " + eurI(tot) : ""));
  for (const x of stati){
    const b = Number(x.budget ?? 0);
    let t = x.ic + " <b>" + x.u.codice + " · " + x.u.nome + "</b>\n<i>" + x.fase + "</i>";
    if (b > 0) t += " · " + eurI(b);
    if (x.u.attesa_dal) t += "\n<i>da " + durata(Date.now() - new Date(x.u.attesa_dal).getTime()) + "</i>";
    const righe = [];
    const az = {
      "reset": "Reset eseguito",
      "bonus": "Bonus accreditato",
      "avvio": "Trade in corso",
      "conteggio": "Conteggio ok",
      "pagamento": "Pagamento ricevuto",
      "vps": "VPS ok",
      "setup": "Setup fatto"
    };
    if (x.u.attesa_tipo) {
      const at = String(x.u.attesa_tipo).toLowerCase();
      const cb2 = at.includes("reset") ? "reset" : at.includes("bonus") ? "bonus" : at.includes("avvio") ? "avvio" : at.includes("conteggio") ? "conteggio" : at.includes("pagamento") || at.includes("incasso") ? "pagamento" : at.includes("vps") ? "vps" : "setup";
      righe.push([
        {
          text: az[cb2] ?? "Conferma",
          callback_data: "a:" + cb2 + ":" + x.u.codice
        }
      ]);
    }
    const nav = [];
    const lf = await linkGruppo(x.u.gruppo_fornitori_id);
    const lc = await linkGruppo(x.u.gruppo_utente_id);
    if (lc) nav.push({
      text: "👤 Gruppo cliente",
      url: lc
    });
    if (lf) nav.push({
      text: "🤝 Fornitori",
      url: lf
    });
    if (nav.length) righe.push(nav);
    righe.push([
      {
        text: "📋 Scheda",
        callback_data: "cs:" + x.u.codice
      }
    ]);
    await send(chat, t, {
      reply_markup: {
        inline_keyboard: righe
      }
    });
  }
}
async function situazione(chat) {
  const { data: cl } = await sb.from(T_UT).select("*").is("affiliato_id", null).is("fornitore_id", null).order("codice");
  const tutti = cl ?? [];
  const clienti = tutti.filter((x)=>!x.proprio);
  const miei = tutti.filter((x)=>x.proprio);
  const ids = tutti.map((x)=>x.id);
  const { data: ci } = ids.length ? await sb.from(T_CI).select("utente_id, saldo_ini_a, profitto_eur, fee_eur, fee_usdt, chiuso_il").in("utente_id", ids).in("stato", [
    "pagato",
    "chiuso"
  ]) : {
    data: []
  };
  const per = {};
  for (const x of ci ?? []){
    const o = per[x.utente_id] ?? {
      n: 0,
      prof: 0,
      fee: 0,
      feeU: 0,
      cap: 0
    };
    o.n++;
    o.prof += Number(x.profitto_eur ?? 0);
    o.fee += Number(x.fee_eur ?? 0);
    o.feeU += Number(x.fee_usdt ?? 0);
    o.cap = Math.max(o.cap, Number(x.saldo_ini_a ?? 0));
    per[x.utente_id] = o;
  }
  const propri = new Set(miei.map((x)=>x.id));
  const tot = Object.entries(per).reduce((a, [id, x])=>propri.has(id) ? a : {
      n: a.n + x.n,
      prof: a.prof + x.prof,
      feeU: a.feeU + x.feeU
    }, {
    n: 0,
    prof: 0,
    feeU: 0
  });
  const attivi = tutti.filter((x)=>x.onboarding_ok && !x.sospeso && !x.bannato).length;
  const inCiclo = tutti.filter((x)=>x.ciclo_attivo).length;
  const inAttesa = tutti.filter((x)=>x.attesa_tipo).length;
  let capTot = 0, inCorso = 0;
  for (const u of clienti){
    const r = Number(u.budget_ciclo ?? 0) > 0 ? Number(u.budget_ciclo) : Number(per[u.id]?.cap ?? 0);
    if (!u.bannato && !u.sospeso && u.onboarding_ok) capTot += r;
    if (u.ciclo_attivo) inCorso += Number(u.budget_ciclo ?? 0);
  }
  let m = "👥 <b>I MIEI CLIENTI DIRETTI</b>\n━━━━━━━━━━━━━━\n\n";
  m += "🏦 Capitale gestito <b>" + eurI(capTot) + "</b>\n";
  m += "🟢 In ciclo ora <b>" + eurI(inCorso) + "</b>\n\n";
  m += "👥 Clienti <b>" + clienti.length + "</b> · operativi <b>" + attivi + "</b>\n";
  m += "🟢 In ciclo <b>" + inCiclo + "</b> · ⏳ in attesa <b>" + inAttesa + "</b>\n";
  m += "🔁 Cicli chiusi <b>" + tot.n + "</b>\n";
  m += "📈 Profitto generato <b>" + eur(tot.prof) + "</b>\n";
  const qf = parseFloat(await imp("quota_fornitori", "35")) / 100;
  const cbm = await cambio();
  m += "💰 Fee incassate <b>" + usdt(tot.feeU) + "</b>\n";
  m += "💼 <b>Il tuo netto " + usdt(tot.feeU - tot.prof * qf * cbm) + "</b>\n";
  if (miei.length) {
    let pn = 0, pc = 0;
    for (const u of miei){
      const d = per[u.id];
      if (d) {
        pn += d.prof - (d.fee ?? 0);
        pc += d.n;
      }
    }
    m += "\n━━━━━━━━━━━━━━\n👤 <b>I TUOI CONTI</b>\n";
    m += pc + (pc === 1 ? " ciclo" : " cicli") + " · netto <b>" + eur(pn) + "</b>\n<i>fuori dalle statistiche di rete</i>\n";
  }
  const prontiN = tutti.filter((x)=>x.onboarding_ok && x.login_a && x.login_b && x.gruppo_utente_id && x.vps_stato === "attivo" && !x.sospeso && !x.bannato).length;
  const setupN = tutti.length - prontiN - tutti.filter((x)=>x.sospeso || x.bannato).length;
  m += "\n━━━━━━━━━━━━━━\n";
  m += "✅ <b>Operativi " + prontiN + "</b>";
  if (setupN > 0) m += " · 🔧 <b>in avvio " + setupN + "</b>";
  m += "\n\n<i>✅ pronto · 🟢 in ciclo · ⏳ in attesa · 🔧 da completare</i>\n";
  const { data: reti } = await sb.from(T_PT).select("id, nome, tipo").eq("attivo", true).order("nome");
  if (reti?.length) {
    m += "\n━━━━━━━━━━━━━━\n🤝 <b>RETI</b>\n";
    for (const p of reti){
      const suoi = await clientiDi(p);
      m += "\n" + (p.tipo === "fornitore" ? "🔧" : "🤝") + " <b>" + p.nome + "</b> · " + suoi.length + (suoi.length === 1 ? " cliente" : " clienti") + "\n";
    }
    m += "\n<i>I loro clienti si vedono da</i> 🤝 <b>Affiliati</b>.\n";
  }
  m += "\n<i>Tocca un cliente per la sua scheda.</i>";
  const kb = tutti.map((u)=>{
    const d = per[u.id] ?? {
      n: 0
    };
    const pronto = u.onboarding_ok && u.login_a && u.login_b && u.gruppo_utente_id && u.vps_stato === "attivo";
    const st = u.bannato ? "🚫" : u.sospeso ? "⏸" : u.attesa_tipo ? "⏳" : u.ciclo_attivo ? "🟢" : pronto ? "✅" : "🔧";
    return [
      {
        text: st + " " + u.codice + " · " + u.nome,
        callback_data: "cs:" + u.codice
      }
    ];
  });
  kb.push([
    {
      text: "➕ Aggiungi cliente",
      callback_data: "nc:start"
    }
  ]);
  await send(chat, m, {
    reply_markup: {
      inline_keyboard: kb
    }
  });
}
async function attivaVps(chat, u, quando) {
  const giorno = parseInt(await imp("vps_giorno", "21"), 10);
  const ciclo = parseInt(await imp("vps_giorni_ciclo", "30"), 10);
  const fino = new Date(quando.getTime() + ciclo * 86400000);
  const pross = prossimoGiorno(giorno, fino);
  await sb.from(T_UT).update({
    vps_stato: "attivo",
    vps_pagato_il: quando.toISOString(),
    vps_copre_fino: fino.toISOString().slice(0, 10),
    vps_prossimo_pagamento: pross.toISOString().slice(0, 10)
  }).eq("id", u.id);
  await send(chat, "✅ <b>VPS attivo</b>\nCoperto fino al <b>" + dataIt(fino) + "</b>\nProssimo rinnovo <b>" + dataIt(pross) + "</b>");
  return await schedaCliente(chat, u.codice);
}
async function schedaCliente(chat, cod) {
  const u = await perCodice(cod);
  if (!u) {
    await send(chat, "Cliente non trovato.");
    return;
  }
  const { data: ci } = await sb.from(T_CI).select("numero, saldo_ini_a, profitto_eur, fee_eur, fee_usdt, chiuso_il, avviato_il").eq("utente_id", u.id).in("stato", [
    "pagato",
    "chiuso"
  ]).order("chiuso_il");
  const c = (ci ?? []).filter((x)=>x.chiuso_il);
  const { data: pa } = await sb.from(T_PA).select("tipo, importo_usdt, tx_hash, stato, verificato_at").eq("utente_id", u.id).order("verificato_at", {
    ascending: false
  });
  const prof = c.reduce((a, x)=>a + Number(x.profitto_eur ?? 0), 0);
  const feeE = c.reduce((a, x)=>a + Number(x.fee_eur ?? 0), 0);
  const feeU = c.reduce((a, x)=>a + Number(x.fee_usdt ?? 0), 0);
  const capMax = c.length ? Math.max(...c.map((x)=>Number(x.saldo_ini_a ?? 0))) : 0;
  const capR = Number(u.budget_ciclo ?? 0) > 0 ? Number(u.budget_ciclo) : capMax;
  let rete = "Diretto";
  if (u.affiliato_id) {
    const { data: a } = await sb.from("bvb_affiliati").select("nome").eq("id", u.affiliato_id).maybeSingle();
    if (a?.nome) rete = a.nome;
  }
  const qf = parseFloat(await imp("quota_fornitori", "35")) / 100;
  const cb1 = feeE > 0 ? feeU / feeE : await cambio();
  const qForn = prof * qf * cb1;
  const { data: pt } = await sb.from(T_PT).select("percentuale").ilike("nome", rete).maybeSingle();
  const qAff = pt ? prof * (Number(pt.percentuale ?? 0) / 100) * cb1 : 0;
  const mio = u.proprio ? 0 : feeU - qForn - qAff;
  const manca = [];
  if (!u.gruppo_utente_id) manca.push("gruppo cliente");
  if (!u.gruppo_fornitori_id) manca.push("gruppo fornitori");
  if (!u.login_a) manca.push("conto Total FX");
  if (!u.login_b) manca.push("conto Roboforex");
  if (u.vps_stato !== "attivo") manca.push("VPS");
  if (!u.onboarding_ok) manca.push("iscrizione");
  const st = u.bannato ? "🚫 bannato" : u.sospeso ? "⏸ sospeso" : u.attesa_tipo ? "⏳ in attesa" : u.ciclo_attivo ? "🟢 ciclo attivo" : manca.length ? "🔧 in avvio" : "✅ pronto";
  const perc = u.fee_percent != null ? Number(u.fee_percent) : parseFloat(await imp("fee_percent", "50"));
  let m = "<b>" + u.codice + " · " + u.nome + "</b>\n<i>" + st + " · " + (u.proprio ? "conto personale" : "rete " + rete) + "</i>\n━━━━━━━━━━━━━━\n\n";
  m += "🏦 Capitale <b>" + eurI(capR) + "</b>" + (u.ciclo_attivo ? " <i>in ciclo</i>" : "") + "\n";
  m += "🔁 Cicli chiusi <b>" + c.length + "</b>\n";
  m += "📈 Profitto <b>" + eur(prof) + "</b>\n";
  if (u.proprio) {
    m += "💸 Fee pagate ai fornitori <b>" + eur(feeE) + "</b> = <b>" + usdt(feeU) + "</b>\n";
    m += "💰 <b>Netto tuo " + eur(prof - feeE) + "</b>\n";
  } else {
    m += "💸 Fee " + perc + "% <b>" + eur(feeE) + "</b> = <b>" + usdt(feeU) + "</b>\n";
    m += "🤝 Fornitori " + Math.round(qf * 100) + "% <b>" + usdt(qForn) + "</b>\n";
    if (qAff > 0) m += "🤝 A " + rete + " <b>" + usdt(qAff) + "</b>\n";
    m += "💼 <b>Il tuo netto " + usdt(mio) + "</b>\n";
  }
  if (u.attesa_tipo) m += "\n⏳ <b>" + u.attesa_tipo + "</b>" + (u.attesa_dal ? " · da " + durata(Date.now() - new Date(u.attesa_dal).getTime()) : "") + "\n";
  if (manca.length) m += "\n🔧 <b>Manca ancora</b>\n" + manca.map((x)=>"· " + x).join("\n") + "\n";
  m += "\n━━━━━━━━━━━━━━\n<b>CONTI</b>\n";
  m += "Total FX <code>" + (u.login_a ?? "—") + "</code>\n";
  m += "Roboforex <code>" + (u.login_b ?? "—") + "</code>\n";
  const scad = u.vps_prossimo_pagamento ?? u.vps_copre_fino;
  if (scad) {
    const gg = Math.round((new Date(scad + "T12:00:00").getTime() - Date.now()) / 86400000);
    m += "🖥 VPS " + (gg < 0 ? "<b>scaduto da " + -gg + "g</b>" : "fino al " + dataIt(scad) + " · " + gg + "g") + "\n";
  } else m += "🖥 VPS <i>non attivo</i>\n";
  if (c.length) {
    m += "\n━━━━━━━━━━━━━━\n<b>ULTIMI CICLI</b>\n";
    for (const x of [
      ...c
    ].reverse().slice(0, 5)){
      const nt = Number(x.profitto_eur ?? 0) - Number(x.fee_eur ?? 0);
      m += "\n<b>#" + x.numero + "</b> · " + dataIt(x.chiuso_il) + " · " + eurI(x.saldo_ini_a) + "\n";
      m += "lordo " + eur(x.profitto_eur) + " · netto <b>" + eur(nt) + "</b>\n";
    }
  }
  const ver = (pa ?? []).filter((x)=>x.tx_hash);
  if (ver.length) {
    m += "\n━━━━━━━━━━━━━━\n<b>PAGAMENTI</b> · " + ver.length + " verificati\n";
    const ult = ver[0];
    m += '\n' + dataIt(ult.verificato_at) + " · " + usdt(Number(ult.importo_usdt)) + '\n<a href="https://bscscan.com/tx/' + ult.tx_hash + '">Ultimo su BscScan</a>\n';
  }
  const tkc = await tokenApp(u);
  const kb = [
    [
      {
        text: "📊 Dashboard",
        ...Number(chat) > 0 ? {
          web_app: {
            url: APP_DASH + "?v=" + APP_VER + "&t=" + tkc
          }
        } : {
          url: APP_DASH + "?v=" + APP_VER + "&t=" + tkc
        }
      },
      {
        text: "🏆 Ultimo ciclo",
        ...Number(chat) > 0 ? {
          web_app: {
            url: APP_CICLO + "?v=" + APP_VER + "&t=" + tkc
          }
        } : {
          url: APP_CICLO + "?v=" + APP_VER + "&t=" + tkc
        }
      }
    ],
    [
      {
        text: "⚙️ Conti broker",
        callback_data: "cl:conti:" + cod
      },
      {
        text: "🖥 VPS",
        callback_data: "cl:vps:" + cod
      }
    ],
    [
      {
        text: "💸 Fee",
        callback_data: "cl:fee:" + cod
      },
      {
        text: "💰 Wallet",
        callback_data: "cl:wallet:" + cod
      }
    ],
    [
      {
        text: "🤝 Rete",
        callback_data: "cl:rete:" + cod
      },
      {
        text: u.proprio ? "👤 È tuo ✓" : "👤 Segna come tuo",
        callback_data: "cl:prop:" + cod
      }
    ],
    [
      {
        text: "🧹 Pulisci i due gruppi",
        callback_data: "cl:pulisci:" + cod
      }
    ],
    [
      {
        text: "⌨️ Togli tastiera vecchia",
        callback_data: "cl:tast:" + cod
      }
    ],
    [
      {
        text: u.sospeso ? "▶️ Riattiva" : "⏸ Sospendi",
        callback_data: "cl:susp:" + cod
      }
    ],
    [
      {
        text: "⬅️ Tutti i clienti",
        callback_data: "nc:lista"
      }
    ]
  ];
  const lc = await linkGruppo(u.gruppo_utente_id);
  const lf = await linkGruppo(u.gruppo_fornitori_id);
  const nav = [];
  if (lc) nav.push({
    text: "👤 Gruppo cliente",
    url: lc
  });
  if (lf) nav.push({
    text: "🤝 Fornitori",
    url: lf
  });
  if (nav.length) kb.unshift(nav);
  await send(chat, m, {
    reply_markup: {
      inline_keyboard: kb
    }
  });
}
async function listaClienti(chat) {
  const { data } = await sb.from(T_UT).select("*").order("codice");
  if (!data?.length) {
    await send(chat, "Nessun cliente registrato.");
    return;
  }
  let m = "<b>CLIENTI</b>\n";
  for (const u of data){
    const s = u.bannato ? "" : u.sospeso ? "" : !u.onboarding_ok ? "" : u.attesa_tipo ? "" : u.ciclo_attivo ? "" : "";
    m += "\n" + s + "<b>" + u.codice + "</b> " + u.nome;
    if (u.ciclo_attivo) m += " · " + eurI(u.budget_ciclo ?? 0);
    if (u.attesa_tipo) m += "\n <i>" + u.attesa_tipo + "</i>";
    m += "\n";
  }
  await send(chat, m, {
    reply_markup: KB_ADMIN
  });
}
function periodo(arg) {
  const oggi = new Date(), z = (d)=>d.toISOString().slice(0, 10);
  const a = String(arg ?? "oggi").toLowerCase();
  if (a === "ieri") {
    const d = new Date(oggi.getTime() - 86400000);
    return {
      da: z(d),
      a: z(d),
      tit: "Ieri"
    };
  }
  if (a === "settimana") {
    const d = new Date(oggi);
    d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
    return {
      da: z(d),
      a: z(oggi),
      tit: "Questa settimana"
    };
  }
  if (a === "mese") {
    const d = new Date(oggi.getFullYear(), oggi.getMonth(), 1);
    return {
      da: z(d),
      a: z(oggi),
      tit: "Questo mese"
    };
  }
  if (a === "anno") {
    const d = new Date(oggi.getFullYear(), 0, 1);
    return {
      da: z(d),
      a: z(oggi),
      tit: String(oggi.getFullYear())
    };
  }
  if (a === "tutto") return {
    da: "2000-01-01",
    a: z(oggi),
    tit: "Tutto"
  };
  return {
    da: z(oggi),
    a: z(oggi),
    tit: "Oggi"
  };
}
async function datiReport(p) {
  const { data } = await sb.from(T_PA).select("importo_usdt, cambio_eur, tx_hash, stato, tipo, verificato_at, utente_id, ciclo_id").gte("verificato_at", p.da + "T00:00:00Z").lte("verificato_at", p.a + "T23:59:59Z");
  const rows = (data ?? []).filter((x)=>x.tipo === "fee");
  const { data: cl } = await sb.from(T_UT).select("id, codice, nome, affiliato_id");
  const { data: af } = await sb.from("bvb_affiliati").select("id, nome, percentuale");
  const cli = Object.fromEntries((cl ?? []).map((x)=>[
      x.id,
      x
    ]));
  const aff = Object.fromEntries((af ?? []).map((x)=>[
      x.id,
      x
    ]));
  const ids = rows.map((x)=>x.ciclo_id).filter(Boolean);
  const { data: ci } = ids.length ? await sb.from(T_CI).select("id, numero, profitto_eur").in("id", ids) : {
    data: []
  };
  const cicli = Object.fromEntries((ci ?? []).map((x)=>[
      x.id,
      x
    ]));
  const qf = parseFloat(await imp("quota_fornitori", "35")) / 100;
  const sp = qf;
  const righe = rows.filter((x)=>!cli[x.utente_id]?.proprio).map((x)=>{
    const u = cli[x.utente_id] ?? {};
    const c = cicli[x.ciclo_id] ?? {};
    const a = u.affiliato_id ? aff[u.affiliato_id] : null;
    const usd = Number(x.importo_usdt ?? 0);
    const cb1 = Number(x.cambio_eur) > 0 ? Number(x.cambio_eur) : null;
    const e = cb1 ? usd / cb1 : 0;
    const prof = Number(c.profitto_eur ?? 0);
    const qForn = prof * qf * (cb1 ?? 1);
    const qAff = a ? prof * (Number(a.percentuale) / 100) * (cb1 ?? 1) : 0;
    return {
      u,
      c,
      a: a ? {
        ...a
      } : null,
      usd,
      eur: e,
      prof,
      qForn,
      qAff,
      mio: usd - qForn - qAff,
      hash: x.tx_hash,
      ok: x.tx_hash && x.stato === "verificato",
      data: x.verificato_at
    };
  });
  return {
    righe,
    sp
  };
}
async function sceltaReport(chat) {
  const { data: af } = await sb.from("bvb_affiliati").select("id, nome").eq("attivo", true).order("nome");
  const kb = [
    [
      {
        text: "🌍 Globale",
        callback_data: "rp:all"
      }
    ],
    [
      {
        text: "👤 Solo miei diretti",
        callback_data: "rp:dir"
      }
    ]
  ];
  for (const a of af ?? [])kb.push([
    {
      text: "🤝 " + a.nome,
      callback_data: "rp:a" + a.id.slice(0, 8)
    }
  ]);
  await send(chat, "📊 <b>REPORT</b>\n\nQuale vuoi?", {
    reply_markup: {
      inline_keyboard: kb
    }
  });
}
async function sceltaPeriodo(chat, scope) {
  await send(chat, "📅 <b>Periodo?</b>", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Oggi",
            callback_data: "rq:" + scope + ":oggi"
          },
          {
            text: "Ieri",
            callback_data: "rq:" + scope + ":ieri"
          }
        ],
        [
          {
            text: "Settimana",
            callback_data: "rq:" + scope + ":settimana"
          },
          {
            text: "Mese",
            callback_data: "rq:" + scope + ":mese"
          }
        ],
        [
          {
            text: "Anno",
            callback_data: "rq:" + scope + ":anno"
          },
          {
            text: "Tutto",
            callback_data: "rq:" + scope + ":tutto"
          }
        ],
        [
          {
            text: "⬅️ Cambia report",
            callback_data: "rp:menu"
          }
        ]
      ]
    }
  });
}
async function reportScope(chat, scope, arg) {
  const p = periodo(arg);
  const { righe, sp } = await datiReport(p);
  let sel = righe, tit = "GLOBALE";
  if (scope === "dir") {
    sel = righe.filter((x)=>!x.a);
    tit = "MIEI DIRETTI";
  } else if (scope.startsWith("a")) {
    const pre = scope.slice(1);
    sel = righe.filter((x)=>x.a && String(x.a.id ?? "").startsWith(pre));
    tit = sel[0]?.a?.nome ?? "AFFILIATO";
  }
  const nav = {
    inline_keyboard: [
      [
        {
          text: "📅 Cambia periodo",
          callback_data: "rp:" + scope
        }
      ],
      [
        {
          text: "📤 Invia report",
          callback_data: "rsend:" + scope + ":" + arg
        }
      ],
      [
        {
          text: "⬅️ Menu report",
          callback_data: "rp:menu"
        }
      ]
    ]
  };
  if (!sel.length) {
    await send(chat, "📊 <b>REPORT " + tit + " · " + p.tit + "</b>\n\nNessun incasso in questo periodo.", {
      reply_markup: nav
    });
    return;
  }
  const tot = sel.reduce((a, x)=>a + x.usd, 0);
  const totE = sel.reduce((a, x)=>a + x.eur, 0);
  const cert = sel.filter((x)=>x.ok).reduce((a, x)=>a + x.usd, 0);
  const forn = sel.reduce((a, x)=>a + x.qForn, 0);
  const affT = sel.reduce((a, x)=>a + x.qAff, 0);
  const mio = sel.reduce((a, x)=>a + x.mio, 0);
  let m = "📊 <b>REPORT " + tit + "</b>\n<i>" + p.tit + "</i>\n━━━━━━━━━━━━━━\n\n";
  m += "💳 Pagamenti <b>" + sel.length + "</b>\n";
  m += "💰 Incassato <b>" + eur(totE) + "</b> = <b>" + usdt(tot) + "</b>\n";
  m += "✅ Certificato <b>" + usdt(cert) + "</b>";
  if (cert < tot) m += "\n⏳ In attesa <b>" + usdt(tot - cert) + "</b>";
  m += "\n\n━━━━━━━━━━━━━━\n<b>RIPARTIZIONE</b>\n";
  m += "🤝 Fornitori " + Math.round(sp * 100) + "% del profitto <b>" + usdt(forn) + "</b>\n";
  if (affT > 0) m += "🤝 Affiliato <b>" + usdt(affT) + "</b>\n";
  m += "💼 <b>Resta a te " + usdt(mio) + "</b>\n";
  // giorno per giorno col cumulato
  const gg = new Map();
  for (const x of sel){
    const k = String(x.data).slice(0, 10);
    const o = gg.get(k) ?? {
      n: 0,
      usd: 0,
      eur: 0
    };
    o.n++;
    o.usd += x.usd;
    o.eur += x.eur;
    gg.set(k, o);
  }
  const gs = [
    ...gg.entries()
  ].sort();
  let cum = 0;
  m += "\n━━━━━━━━━━━━━━\n<b>GIORNO PER GIORNO</b>\n";
  for (const [k, v] of gs){
    cum += v.usd;
    m += "\n<b>" + dataIt(k) + "</b> · " + v.n + (v.n === 1 ? " pagamento" : " pagamenti") + "\n";
    m += eur(v.eur) + " = " + usdt(v.usd) + " · <b>cum " + usdt(cum) + "</b>\n";
  }
  m += "\n━━━━━━━━━━━━━━\n<b>DETTAGLIO</b>\n";
  for (const x of sel){
    m += "\n<b>" + (x.u.codice ?? "—") + " · " + (x.u.nome ?? "") + "</b>";
    if (x.a) m += " <i>(" + x.a.nome + ")</i>";
    m += "\n" + dataIt(x.data) + " · " + eur(x.eur) + " = " + usdt(x.usd) + "\n";
    m += x.ok ? '<a href="https://bscscan.com/tx/' + x.hash + '">✅ BscScan</a>\n' : "⏳ non certificato\n";
  }
  const r = await send(chat, m, {
    reply_markup: nav
  });
  if (r?.result?.message_id) await setStato(chat, "rep_last", {
    mid: r.result.message_id,
    testo: m.replace(/<[^>]+>/g, "")
  });
}
async function report(chat, arg) {
  const p = periodo(arg);
  const { righe, sp } = await datiReport(p);
  const nav = {
    inline_keyboard: [
      [
        {
          text: "Oggi",
          callback_data: "r:oggi"
        },
        {
          text: "Settimana",
          callback_data: "r:settimana"
        }
      ],
      [
        {
          text: "Mese",
          callback_data: "r:mese"
        },
        {
          text: "Tutto",
          callback_data: "r:tutto"
        }
      ],
      [
        {
          text: "Fornitori",
          callback_data: "rf:" + arg
        },
        {
          text: "Affiliati",
          callback_data: "ra:" + arg
        }
      ],
      [
        {
          text: "VPS",
          callback_data: "rv:" + arg
        }
      ]
    ]
  };
  if (!righe.length) {
    await send(chat, "<b>REPORT · " + p.tit + "</b>\n\nNessun incasso in questo periodo.", {
      reply_markup: nav
    });
    return;
  }
  const tot = righe.reduce((a, x)=>a + x.usd, 0);
  const totE = righe.reduce((a, x)=>a + x.eur, 0);
  const cert = righe.filter((x)=>x.ok).reduce((a, x)=>a + x.usd, 0);
  const forn = righe.reduce((a, x)=>a + x.qForn, 0);
  const affT = righe.reduce((a, x)=>a + x.qAff, 0);
  const mio = righe.reduce((a, x)=>a + x.mio, 0);
  let m = "<b>REPORT · " + p.tit + "</b>\n━━━━━━━━━━━━━━\n\n";
  m += "Pagamenti <b>" + righe.length + "</b>\n";
  m += "Incassato <b>" + eur(totE) + "</b> = <b>" + usdt(tot) + "</b>\n";
  m += "Certificato <b>" + usdt(cert) + "</b>";
  if (cert < tot) m += "\nIn attesa <b>" + usdt(tot - cert) + "</b>";
  m += "\n\n━━━━━━━━━━━━━━\n<b>RIPARTIZIONE</b>\n";
  m += "Fornitori " + Math.round(sp * 100) + "% <b>" + usdt(forn) + "</b>\n";
  if (affT > 0) m += "Affiliati <b>" + usdt(affT) + "</b>\n";
  m += "<b>Resta a te " + usdt(mio) + "</b>\n";
  m += "\n━━━━━━━━━━━━━━\n<b>DETTAGLIO</b>\n";
  for (const x of righe){
    m += "\n<b>" + (x.u.codice ?? "—") + " · " + (x.u.nome ?? "") + "</b>";
    if (x.a) m += " <i>(" + x.a.nome + ")</i>";
    m += "\n" + dataIt(x.data) + " · " + eur(x.eur) + " = " + usdt(x.usd) + "\n";
    m += x.ok ? '<a href="https://bscscan.com/tx/' + x.hash + '">BscScan</a>\n' : "non certificato\n";
  }
  await send(chat, m, {
    reply_markup: nav
  });
}
async function reportFornitori(chat, arg) {
  const p = periodo(arg);
  const { righe, sp } = await datiReport(p);
  const nav = {
    inline_keyboard: [
      [
        {
          text: "Oggi",
          callback_data: "rf:oggi"
        },
        {
          text: "Settimana",
          callback_data: "rf:settimana"
        }
      ],
      [
        {
          text: "Mese",
          callback_data: "rf:mese"
        },
        {
          text: "Tutto",
          callback_data: "rf:tutto"
        }
      ]
    ]
  };
  if (!righe.length) {
    await send(chat, "<b>REPORT FORNITORI · " + p.tit + "</b>\n\nNessun incasso.", {
      reply_markup: nav
    });
    return;
  }
  const forn = righe.reduce((a, x)=>a + x.qForn, 0);
  let m = "<b>REPORT FORNITORI · " + p.tit + "</b>\n━━━━━━━━━━━━━━\n\n";
  m += "Cicli chiusi <b>" + righe.length + "</b>\n<b>Spettante " + usdt(forn) + "</b>\n";
  m += "\n━━━━━━━━━━━━━━\n";
  for (const x of righe)m += "\n<b>" + (x.u.codice ?? "—") + " · " + (x.u.nome ?? "") + "</b>\n" + dataIt(x.data) + " · " + usdt(x.qForn) + "\n";
  await send(chat, m, {
    reply_markup: nav
  });
}
async function reportAffiliati(chat, arg) {
  const p = periodo(arg);
  const { righe } = await datiReport(p);
  const nav = {
    inline_keyboard: [
      [
        {
          text: "Oggi",
          callback_data: "ra:oggi"
        },
        {
          text: "Settimana",
          callback_data: "ra:settimana"
        }
      ],
      [
        {
          text: "Mese",
          callback_data: "ra:mese"
        },
        {
          text: "Tutto",
          callback_data: "ra:tutto"
        }
      ]
    ]
  };
  const conAff = righe.filter((x)=>x.a);
  if (!conAff.length) {
    await send(chat, "<b>REPORT AFFILIATI · " + p.tit + "</b>\n\nNessun cliente con affiliato in questo periodo.", {
      reply_markup: nav
    });
    return;
  }
  const per = new Map();
  for (const x of conAff){
    const k = x.a.nome;
    const o = per.get(k) ?? {
      q: 0,
      l: []
    };
    o.q += x.qAff;
    o.l.push(x);
    per.set(k, o);
  }
  let m = "<b>REPORT AFFILIATI · " + p.tit + "</b>\n━━━━━━━━━━━━━━\n";
  for (const [k, v] of per.entries()){
    m += "\n<b>" + k + "</b>\nSpettante <b>" + usdt(v.q) + "</b>\n";
    for (const x of v.l)m += "\n  " + (x.u.codice ?? "") + " · " + (x.u.nome ?? "") + "\n  " + dataIt(x.data) + " · " + usdt(x.qAff) + "\n";
    m += "\n━━━━━━━━━━━━━━\n";
  }
  await send(chat, m, {
    reply_markup: nav
  });
}
async function reportVps(chat) {
  const { data } = await sb.from(T_UT).select("*").order("codice");
  const oggi = new Date();
  let m = "<b>REPORT VPS</b>\n━━━━━━━━━━━━━━\n";
  let scaduti = 0, attivi = 0;
  for (const u of data ?? []){
    const scad = u.vps_prossimo_pagamento ?? u.vps_copre_fino;
    if (!scad) {
      m += "\n<b>" + u.codice + " · " + u.nome + "</b>\nmai attivato\n";
      continue;
    }
    const g = Math.round((new Date(scad + "T12:00:00") - oggi) / 86400000);
    if (g < 0) scaduti++;
    else attivi++;
    m += "\n<b>" + u.codice + " · " + u.nome + "</b>\n" + dataIt(scad) + " · " + (g < 0 ? "<b>scaduto da " + -g + "g</b>" : g === 0 ? "<b>scade oggi</b>" : "tra " + g + " giorni") + "\n";
  }
  m += "\n━━━━━━━━━━━━━━\nAttivi <b>" + attivi + "</b> · scaduti <b>" + scaduti + "</b>";
  const { data: pv } = await sb.from(T_PA).select("importo_usdt").eq("tipo", "vps").gte("verificato_at", new Date(oggi.getFullYear(), oggi.getMonth(), 1).toISOString());
  const inc = (pv ?? []).reduce((a, x)=>a + Number(x.importo_usdt ?? 0), 0);
  if (inc > 0) m += "\nIncassato questo mese <b>" + usdt(inc) + "</b>";
  await send(chat, m, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Torna al report",
            callback_data: "r:oggi"
          }
        ]
      ]
    }
  });
}
async function bottoniAdmin(chat, mid, d, from) {
  if (d.startsWith("rsend:")) {
    const st0 = await stato(chat);
    const txt = st0.dati?.testo;
    if (!txt) {
      await send(chat, "Rigenera il report e riprova.");
      return;
    }
    await send(chat, "📤 <b>Inoltra il report</b>\n\nTocca il bottone e scegli la chat dove mandarlo.", {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Scegli la chat",
              switch_inline_query: txt.slice(0, 250)
            }
          ]
        ]
      }
    });
    return;
  }
  if (d === "nc:start") {
    await editKb(chat, mid);
    return await guidaNuovoCliente(chat);
  }
  if (d.startsWith("cs:")) {
    await editKb(chat, mid);
    return await schedaCliente(chat, d.slice(3));
  }
  if (d.startsWith("gf:")) {
    const p = d.split(":");
    const gid = p[1], cod = p[2];
    await editKb(chat, mid);
    const u = await perCodice(cod);
    if (!u) {
      await send(chat, "Cliente non trovato.");
      return;
    }
    await sb.from(T_UT).update({
      gruppo_fornitori_id: Number(gid)
    }).eq("id", u.id);
    await sb.from("bvb_impostazioni").delete().eq("chiave", "avvisato_" + gid).then(()=>{}, ()=>{});
    await send(chat, "✅ <b>Gruppo fornitori collegato a " + u.codice + " · " + u.nome + ".</b>");
    return await schedaCliente(chat, cod);
  }
  if (d.startsWith("pul:")) {
    const p = d.split(":");
    await editKb(chat, mid);
    if (p[1] === "no") {
      await send(chat, "Lascio tutto com'è.");
      return;
    }
    const gid = p[1], quanti = parseInt(p[2] ?? "400", 10);
    const r = await tg("sendMessage", {
      chat_id: gid,
      text: "🧹"
    });
    const partenza = r?.result?.message_id;
    if (!partenza) {
      await send(chat, "Non riesco a scrivere in quel gruppo.");
      return;
    }
    await send(chat, "🧹 <b>Pulizia in corso…</b>\n<i>Rimuovo gli ultimi " + quanti + " messaggi. Ci vuole un minuto.</i>");
    await pulisciChat(gid, partenza, quanti, chat);
    return;
  }
  if (d.startsWith("cl:")) {
    const [, az, cod] = d.split(":");
    await editKb(chat, mid);
    const u = await perCodice(cod);
    if (!u) {
      await send(chat, "Cliente non trovato.");
      return;
    }
    if (az === "pagfee") return await storicoPagamenti(chat, u);
    if (az === "tast") {
      let fatti = 0;
      for (const gid of [
        u.gruppo_utente_id,
        u.gruppo_fornitori_id
      ]){
        if (!gid) continue;
        const r = await tg("sendMessage", {
          chat_id: gid,
          text: "⌨️",
          reply_markup: {
            remove_keyboard: true
          }
        });
        if (r?.ok) {
          fatti++;
          await new Promise((x)=>setTimeout(x, 400));
          await tg("deleteMessage", {
            chat_id: gid,
            message_id: r.result.message_id
          }).catch(()=>{});
        }
      }
      await send(chat, fatti ? "⌨️ <b>Tastiera vecchia rimossa</b> da " + fatti + (fatti === 1 ? " gruppo." : " gruppi.") + "\n\n<i>Se qualcuno la vede ancora, basta che tocchi l'icona della tastiera e la chiuda.</i>" : "Nessun gruppo collegato.");
      return await schedaCliente(chat, cod);
    }
    if (az === "pulisci") {
      const righe = [];
      if (u.gruppo_utente_id) righe.push([
        {
          text: "👤 Gruppo cliente · 400 msg",
          callback_data: "pul:" + u.gruppo_utente_id + ":400"
        }
      ]);
      if (u.gruppo_fornitori_id) righe.push([
        {
          text: "🤝 Gruppo fornitori · 400 msg",
          callback_data: "pul:" + u.gruppo_fornitori_id + ":400"
        }
      ]);
      if (u.gruppo_utente_id) righe.push([
        {
          text: "👤 Cliente · 1500 msg",
          callback_data: "pul:" + u.gruppo_utente_id + ":1500"
        }
      ]);
      if (!righe.length) {
        await send(chat, "Nessun gruppo collegato.");
        return;
      }
      righe.push([
        {
          text: "❌ Lascia stare",
          callback_data: "pul:no"
        }
      ]);
      await send(chat, "🧹 <b>PULIZIA GRUPPI</b>\n\n⚠️ Cancella <b>tutti</b> i messaggi recenti, non solo quelli del vecchio bot: Telegram non permette di distinguerli.\n\n<i>Non si può annullare.</i>", {
        reply_markup: {
          inline_keyboard: righe
        }
      });
      return;
    }
    if (az === "prop") {
      await sb.from(T_UT).update({
        proprio: !u.proprio
      }).eq("id", u.id);
      await send(chat, u.proprio ? "<b>" + cod + "</b> torna a contare negli incassi." : "👤 <b>" + cod + " è il tuo conto personale.</b>\nLe sue fee non entrano nei report: le paghi diretto ai fornitori.");
      return await schedaCliente(chat, cod);
    }
    if (az === "susp") {
      await sb.from(T_UT).update({
        sospeso: !u.sospeso,
        sospeso_dal: u.sospeso ? null : new Date().toISOString()
      }).eq("id", u.id);
      await send(chat, u.sospeso ? "▶️ <b>" + cod + " riattivato.</b>" : "⏸ <b>" + cod + " sospeso.</b>\nIl bot non risponde più nel suo gruppo.");
      return await schedaCliente(chat, cod);
    }
    if (az === "rete") {
      const { data: pts } = await sb.from(T_PT).select("id, nome, tipo").eq("attivo", true).order("nome");
      const kb = [
        [
          {
            text: "👤 Diretto (tuo)",
            callback_data: "cr:" + cod + ":dir"
          }
        ]
      ];
      for (const p of pts ?? [])kb.push([
        {
          text: (p.tipo === "fornitore" ? "🔧 " : "🤝 ") + p.nome,
          callback_data: "cr:" + cod + ":" + p.id.slice(0, 8)
        }
      ]);
      kb.push([
        {
          text: "⬅️ Indietro",
          callback_data: "cs:" + cod
        }
      ]);
      await send(chat, "🤝 <b>" + cod + " · a chi appartiene?</b>", {
        reply_markup: {
          inline_keyboard: kb
        }
      });
      return;
    }
    if (az === "vps") {
      const kb = [
        [
          {
            text: "✅ Attiva da oggi",
            callback_data: "cv:" + cod + ":oggi"
          }
        ],
        [
          {
            text: "📅 Attiva da una data",
            callback_data: "cv:" + cod + ":data"
          }
        ],
        [
          {
            text: "🔒 Disattiva",
            callback_data: "cv:" + cod + ":off"
          }
        ],
        [
          {
            text: "⬅️ Indietro",
            callback_data: "cs:" + cod
          }
        ]
      ];
      const scad = u.vps_prossimo_pagamento ?? u.vps_copre_fino;
      await send(chat, "🖥 <b>VPS di " + cod + "</b>\n\n" + (scad ? "Coperto fino al <b>" + dataIt(scad) + "</b>" : "<i>non attivo</i>"), {
        reply_markup: {
          inline_keyboard: kb
        }
      });
      return;
    }
    const dom = {
      conti: "⚙️ <b>CONTI DI " + cod + "</b>\n\nMandami <b>due righe</b>:\n<code>conto server email password</code>\n<code>conto server password</code>\n\nEsempio:\n<code>5008563 OnamTrading-Live mario@x.it Pass1\n27467343 RoboForex-Pro Pass2</code>",
      fee: "💸 <b>FEE DI " + cod + "</b>\n\nOra è al <b>" + (u.fee_percent ?? await imp("fee_percent", "50")) + "%</b>.\nScrivi la nuova percentuale, es. <code>40</code>",
      wallet: "💰 <b>WALLET DI " + cod + "</b>\n\nOra: <code>" + (u.wallet_fee || await walletFee(u)) + "</code>\n\nScrivi il nuovo wallet, oppure <code>auto</code> per usare quello della sua rete."
    };
    if (dom[az]) {
      await setStato(chat, "ad_" + az + "_" + cod, {});
      await send(chat, dom[az], {
        reply_markup: KB_INDIETRO(cod)
      });
      return;
    }
    return;
  }
  if (d.startsWith("cr:")) {
    const [, cod, pre] = d.split(":");
    await editKb(chat, mid);
    const u = await perCodice(cod);
    if (!u) return;
    if (pre === "dir") {
      await sb.from(T_UT).update({
        affiliato_id: null,
        fornitore_id: null
      }).eq("id", u.id);
      await send(chat, "✅ <b>" + cod + "</b> ora è un tuo diretto.");
    } else {
      const { data: pts } = await sb.from(T_PT).select("*");
      const p = (pts ?? []).find((x)=>x.id.startsWith(pre));
      if (!p) return;
      if (p.tipo === "fornitore") await sb.from(T_UT).update({
        fornitore_id: p.id,
        affiliato_id: null
      }).eq("id", u.id);
      else {
        let { data: a } = await sb.from("bvb_affiliati").select("id").ilike("nome", p.nome).maybeSingle();
        if (!a) {
          const r = await sb.from("bvb_affiliati").insert({
            nome: p.nome,
            comando: p.nome.toLowerCase().replace(/\s+/g, ""),
            percentuale: p.percentuale,
            wallet_fee: p.wallet_fee,
            attivo: true
          }).select().single();
          a = r.data;
        }
        await sb.from(T_UT).update({
          affiliato_id: a?.id ?? null,
          fornitore_id: null
        }).eq("id", u.id);
      }
      await send(chat, "✅ <b>" + cod + "</b> assegnato a <b>" + p.nome + "</b>.");
    }
    return await schedaCliente(chat, cod);
  }
  if (d.startsWith("cv:")) {
    const [, cod, az] = d.split(":");
    await editKb(chat, mid);
    const u = await perCodice(cod);
    if (!u) return;
    if (az === "off") {
      await sb.from(T_UT).update({
        vps_stato: null,
        vps_copre_fino: null,
        vps_prossimo_pagamento: null
      }).eq("id", u.id);
      await send(chat, "🔒 VPS di <b>" + cod + "</b> disattivato.");
      return await schedaCliente(chat, cod);
    }
    if (az === "oggi") return await attivaVps(chat, u, new Date());
    await setStato(chat, "ad_vpsdata_" + cod, {});
    await send(chat, "📅 Scrivi la data del pagamento\n<i>formato</i> <code>20/08/26</code>", {
      reply_markup: KB_INDIETRO(cod)
    });
    return;
  }
  if (d === "nc:lista") {
    await editKb(chat, mid);
    return await situazione(chat);
  }
  if (d.startsWith("np:")) {
    const a = d.slice(3);
    await editKb(chat, mid);
    if (a === "start") return await nuovoPartner(chat, 0, {});
    if (a === "no") {
      await setStato(chat, null, {});
      await send(chat, "Annullato.", {
        reply_markup: KB_ADMIN
      });
      return;
    }
    if (a.startsWith("t:")) {
      const s0 = await stato(chat);
      return await nuovoPartner(chat, 1, {
        ...s0.dati,
        tipo: a.slice(2)
      });
    }
    if (a === "save") {
      const s0 = await stato(chat);
      return await salvaPartner(chat, s0.dati ?? {});
    }
    return;
  }
  if (d.startsWith("pv:")) {
    const az = d.slice(3);
    await editKb(chat, mid);
    if (az === "add") {
      const s0 = await stato(chat);
      const f = s0.dati?.file_id;
      if (!f) {
        await send(chat, "Foto scaduta, rimandala.");
        return;
      }
      const { count } = await sb.from("bvb_prove").select("*", {
        count: "exact",
        head: true
      });
      await sb.from("bvb_prove").insert({
        file_id: f,
        ordine: (count ?? 0) + 1
      });
      await setStato(chat, null, {});
      await send(chat, "✅ <b>Aggiunta.</b>\nOra la vedono tutti i nuovi contatti in <b>🔍 Risultati</b>.", {
        reply_markup: KB_ADMIN
      });
      return;
    }
    if (az === "no") {
      await setStato(chat, null, {});
      await send(chat, "Scartata.", {
        reply_markup: KB_ADMIN
      });
      return;
    }
    if (az === "lista") {
      await setStato(chat, null, {});
      const { data: pr } = await sb.from("bvb_prove").select("*").order("ordine");
      if (!pr?.length) {
        await send(chat, "Nessuna prova caricata.\n\n<i>Mandami una foto e te lo chiedo io.</i>", {
          reply_markup: KB_ADMIN
        });
        return;
      }
      await send(chat, "🖼 <b>PROVE ATTIVE</b> · " + pr.filter((x)=>x.attivo).length);
      for (const p of pr){
        await tg("sendPhoto", {
          chat_id: chat,
          photo: p.file_id,
          caption: p.attivo ? "attiva" : "nascosta",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: p.attivo ? "🙈 Nascondi" : "👁 Mostra",
                  callback_data: "pvt:" + p.id.slice(0, 8)
                },
                {
                  text: "🗑 Elimina",
                  callback_data: "pvd:" + p.id.slice(0, 8)
                }
              ]
            ]
          }
        });
      }
      return;
    }
    return;
  }
  if (d.startsWith("pvt:") || d.startsWith("pvd:")) {
    const pre = d.slice(4), del = d.startsWith("pvd:");
    const { data: pr } = await sb.from("bvb_prove").select("*");
    const p = (pr ?? []).find((x)=>x.id.startsWith(pre));
    if (!p) return;
    if (del) {
      await sb.from("bvb_prove").delete().eq("id", p.id);
      await editKb(chat, mid, {
        inline_keyboard: [
          [
            {
              text: "🗑 Eliminata",
              callback_data: "noop"
            }
          ]
        ]
      });
    } else {
      await sb.from("bvb_prove").update({
        attivo: !p.attivo
      }).eq("id", p.id);
      await editKb(chat, mid, {
        inline_keyboard: [
          [
            {
              text: p.attivo ? "🙈 Nascosta" : "👁 Attiva",
              callback_data: "noop"
            }
          ]
        ]
      });
    }
    return;
  }
  if (d.startsWith("ld:")) {
    const [, az, tg] = d.split(":");
    await editKb(chat, mid, {
      inline_keyboard: [
        [
          {
            text: az === "ok" ? "☑️ Attivato" : "☑️ Scartato",
            callback_data: "noop"
          }
        ]
      ]
    });
    if (az === "no") {
      await sb.from("bvb_lead").update({
        stato: "scartato"
      }).eq("telegram_id", Number(tg));
      return;
    }
    return await attivaLead(chat, tg, from);
  }
  if (d === "af:menu") {
    await editKb(chat, mid);
    return await pannelloAffiliati(chat);
  }
  if (d.startsWith("occhi:")) {
    const id = Number(d.slice(6));
    await editKb(chat, mid);
    const { data: a } = await sb.from(T_PA_ADM).select("*, p:partner_id(*)").eq("telegram_id", id).maybeSingle();
    if (!a?.p) {
      await send(chat, "Admin non trovato.");
      return;
    }
    const p2 = {
      ...a.p,
      ruolo: a.ruolo
    };
    const cl = await clientiDi(p2);
    const { data: suo } = await sb.from(T_UT).select("codice, nome").eq("telegram_id", id).maybeSingle();
    let m = "👁 <b>QUELLO CHE VEDE " + String(a.nome ?? "").toUpperCase() + "</b>\n━━━━━━━━━━━━━━\n";
    m += "\n🤝 rete <b>" + p2.nome + "</b> · " + p2.percentuale + "%\n";
    m += "👥 <b>" + cl.length + (cl.length === 1 ? " cliente</b>" : " clienti</b>") + (cl.length ? "\n" + cl.map((x)=>"· " + x.codice + " · " + x.nome).join("\n") : "") + "\n";
    m += "\n📊 <b>I miei cicli</b> → " + (suo ? "dashboard di " + suo.codice : "<i>non è cliente, vede un avviso</i>") + "\n";
    m += "💰 <b>Guadagno affiliazione</b> → provvigioni della sua rete\n";
    m += "📈 <b>Report</b> · 👥 <b>I miei clienti</b> → solo i suoi\n";
    m += "🔗 <b>Il mio link</b> · 🎯 <b>Contatti</b> → i suoi contatti\n";
    m += "\n━━━━━━━━━━━━━━\n<b>NON vede</b>\n· i tuoi clienti diretti\n· le altre reti\n· i tuoi margini\n· i wallet che non sono suoi\n";
    m += "\n<i>Ultimo accesso: " + (a.primo_accesso ? dataIt(a.primo_accesso) : "mai entrato") + "</i>";
    await send(chat, m, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "💰 Apri la sua dashboard",
              ...Number(chat) > 0 ? {
                web_app: {
                  url: APP_PARTNER + "?v=" + APP_VER + "&t=" + await tokenPartner(p2)
                }
              } : {
                url: APP_PARTNER + "?v=" + APP_VER + "&t=" + await tokenPartner(p2)
              }
            }
          ],
          [
            {
              text: "⬅️ Indietro",
              callback_data: "pa:" + String(p2.id).slice(0, 8)
            }
          ]
        ]
      }
    });
    return;
  }
  if (d === "brlist") {
    await editKb(chat, mid);
    return await pannelloBroker(chat);
  }
  if (d.startsWith("br:")) {
    await editKb(chat, mid);
    return await schedaBroker(chat, d.slice(3));
  }
  if (d === "brn") {
    await editKb(chat, mid);
    await setStato(chat, "br_nome", {});
    await send(chat, "🏦 <b>Nuovo broker</b>\n\nCome si chiama?");
    return;
  }
  if (d.startsWith("brm:")) {
    const [, campo, pre] = d.split(":");
    await editKb(chat, mid);
    await setStato(chat, "br_" + campo, {
      pre
    });
    const dom = {
      nome: "Nuovo <b>nome</b>?",
      link: "Nuovo <b>link di iscrizione</b>?",
      istr: "<b>Istruzioni</b> di apertura conto?\n<i>es. Conto MT5 STANDARD · leva 1:500 · valuta EUR</i>"
    };
    await send(chat, dom[campo] ?? "Nuovo valore?");
    return;
  }
  if (d.startsWith("brt:")) {
    const pre = d.slice(4);
    const bs = await brokers(false);
    const b = bs.find((x)=>x.id.startsWith(pre));
    if (!b) return;
    await sb.from(T_BR).update({
      attivo: !b.attivo
    }).eq("id", b.id);
    await editKb(chat, mid);
    return await schedaBroker(chat, pre);
  }
  if (d.startsWith("brd:")) {
    const pre = d.slice(4);
    const bs = await brokers(false);
    const b = bs.find((x)=>x.id.startsWith(pre));
    if (!b) return;
    const { count } = await sb.from(T_CO).select("*", {
      count: "exact",
      head: true
    }).eq("broker_id", b.id);
    await editKb(chat, mid);
    await send(chat, "🗑 <b>Eliminare " + b.nome + "?</b>\n\n" + (count ? "Ci sono <b>" + count + "</b> conti collegati: verranno rimossi anche quelli." : "Nessun conto collegato.") + "\n\n<i>Non si torna indietro.</i>", {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🗑 Sì, elimina",
              callback_data: "brdd:" + pre
            }
          ],
          [
            {
              text: "❌ Lascia stare",
              callback_data: "br:" + pre
            }
          ]
        ]
      }
    });
    return;
  }
  if (d.startsWith("brdd:")) {
    const pre = d.slice(5);
    const bs = await brokers(false);
    const b = bs.find((x)=>x.id.startsWith(pre));
    if (!b) return;
    await sb.from(T_BR).delete().eq("id", b.id);
    await editKb(chat, mid);
    await send(chat, "🗑 <b>" + b.nome + " eliminato.</b>");
    return await pannelloBroker(chat);
  }
  if (d.startsWith("vd:")) {
    const uid = Number(d.slice(3));
    await editKb(chat, mid);
    return await vistaDi(chat, uid);
  }
  if (d.startsWith("pa:")) {
    await editKb(chat, mid);
    return await pannelloAdminPartner(chat, d.slice(3));
  }
  if (d.startsWith("panl:")) {
    const pre = d.slice(5);
    await editKb(chat, mid);
    const { data: pts } = await sb.from(T_PT).select("*");
    const p = (pts ?? []).find((x)=>x.id.startsWith(pre));
    if (!p) return;
    const { data: nuovo } = await sb.from(T_PA_ADM).insert({
      partner_id: p.id,
      nome: null,
      ruolo: "gestore"
    }).select().single();
    await send(chat, "🔗 <b>Link libero per " + p.nome + "</b>\n\nChi lo apre si collega e scrive lui stesso il proprio nome.\n\n<code>https://t.me/cashly_bvb_bot?start=a_" + nuovo.id.slice(0, 8) + "</code>\n\n<i>Vale una volta sola.</i>", {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "⬅️ Indietro",
              callback_data: "pa:" + pre
            }
          ]
        ]
      }
    });
    return;
  }
  if (d.startsWith("pan:")) {
    const [, pre, ruolo] = d.split(":");
    await editKb(chat, mid);
    await setStato(chat, "padm_" + pre + "_" + ruolo, {});
    await send(chat, "➕ <b>Nuovo admin</b>\n\nCome si chiama?", {
      reply_markup: KB_INDIETRO("")
    });
    return;
  }
  if (d.startsWith("pax:")) {
    const pre = d.slice(4);
    await editKb(chat, mid);
    const { data: adm } = await sb.from(T_PA_ADM).select("*").limit(200);
    const a = (adm ?? []).find((x)=>x.id.startsWith(pre));
    if (!a) return;
    await sb.from(T_PA_ADM).delete().eq("id", a.id);
    await send(chat, "🗑 <b>" + (a.nome ?? "admin") + "</b> rimosso.");
    const { data: pp } = await sb.from(T_PT).select("id").eq("id", a.partner_id).maybeSingle();
    return await pannelloAdminPartner(chat, String(pp?.id ?? "").slice(0, 8));
  }
  if (d.startsWith("af:")) {
    await editKb(chat, mid);
    return await schedaPartner(chat, d.slice(3));
  }
  if (d.startsWith("com:")) {
    const a = d.slice(4);
    await editKb(chat, mid);
    if (a === "no") {
      await setStato(chat, null, {});
      await send(chat, "Annullato.", {
        reply_markup: KB_ADMIN
      });
      return;
    }
    if (a === "letture") {
      await setStato(chat, null, {});
      return await letture(chat);
    }
    if (a === "uno") {
      const { data: cl } = await sb.from(T_UT).select("codice, nome").not("gruppo_utente_id", "is", null).order("codice");
      if (!cl?.length) {
        await send(chat, "Nessun gruppo collegato.");
        return;
      }
      await send(chat, "🎯 <b>Quale cliente?</b>", {
        reply_markup: {
          inline_keyboard: cl.map((x)=>[
              {
                text: x.codice + " · " + x.nome,
                callback_data: "com:c:" + x.codice
              }
            ])
        }
      });
      return;
    }
    const scope = a.startsWith("c:") ? a : a;
    const dest = await destinatari(scope);
    await setStato(chat, "com_testo", {
      scope
    });
    await send(chat, "✍️ <b>Scrivi la comunicazione.</b>\n\nArriverà a <b>" + dest.length + (dest.length === 1 ? " gruppo" : " gruppi") + "</b>.\n<i>Puoi usare grassetto e corsivo.</i>", {
      reply_markup: KB_ANNULLA
    });
    return;
  }
  if (d === "com_go") {
    const s0 = await stato(chat);
    await editKb(chat, mid, {
      inline_keyboard: [
        [
          {
            text: "☑️ Inviata",
            callback_data: "noop"
          }
        ]
      ]
    });
    return await inviaComunicazione(chat, s0.dati?.scope ?? "all", s0.dati?.testo ?? "");
  }
  if (d === "rp:menu") {
    await editKb(chat, mid);
    return await sceltaReport(chat);
  }
  if (d.startsWith("pr:")) {
    const p = await partnerDi(from);
    if (!p) return;
    await editKb(chat, mid);
    return await reportPartner(chat, p, d.slice(3));
  }
  if (d.startsWith("rp:")) {
    await editKb(chat, mid);
    return await sceltaPeriodo(chat, d.slice(3));
  }
  if (d.startsWith("rq:")) {
    const p = d.split(":");
    await editKb(chat, mid);
    return await reportScope(chat, p[1], p[2]);
  }
  if (d.startsWith("r:")) {
    await editKb(chat, mid);
    return await report(chat, d.slice(2));
  }
  if (d.startsWith("rf:")) {
    await editKb(chat, mid);
    return await reportFornitori(chat, d.slice(3));
  }
  if (d.startsWith("ra:")) {
    await editKb(chat, mid);
    return await reportAffiliati(chat, d.slice(3));
  }
  if (d.startsWith("rv:")) {
    await editKb(chat, mid);
    return await reportVps(chat);
  }
  if (d.startsWith("a:")) {
    const [, az, cod] = d.split(":");
    const u = await perCodice(cod);
    if (!u) {
      await send(chat, "Cliente non trovato.");
      return;
    }
    await editKb(chat, mid, {
      inline_keyboard: [
        [
          {
            text: "Confermato",
            callback_data: "noop"
          }
        ]
      ]
    });
    if (az === "sblocca") {
      await sb.from(T_UT).update({
        onboarding_ok: true,
        onboarding_step: "completo",
        depositi_ok: true,
        tfx_setup_ok: true,
        rbx_verificato: true,
        onboarding_fine: new Date().toISOString()
      }).eq("id", u.id);
      await chiudiAttesa(u.id);
      if (u.gruppo_utente_id) await send(u.gruppo_utente_id, "<b>SEI OPERATIVO!</b>\n\nI conti sono collegati e il sistema è attivo.\n\nQuando i due saldi sono bilanciati premi <b> Inizia nuovo ciclo</b>.", {
        reply_markup: KB_PRONTO
      });
      await send(chat, "<b>" + u.codice + "</b> sbloccato.");
      return;
    }
    await eseguiConferma(chat, u, az, from);
    return;
  }
}
// ─────────────────────── comandi admin ───────────────────────
async function comandiAdmin(chat, testo, from, m) {
  const [cmd, ...p] = testo.split(/\s+/);
  if (cmd === "/cliente") {
    const cod = (p.shift() ?? "").toUpperCase(), nome = p.join(" ");
    if (!/^C\d+$/.test(cod) || nome.split(/\s+/).length < 2) {
      await send(chat, "Formato:\n<code>/cliente C4 Mario Rossi</code>");
      return true;
    }
    const es = await perCodice(cod);
    const r = es ? await sb.from(T_UT).update({
      nome,
      gruppo_utente_id: chat
    }).eq("id", es.id).select().single() : await sb.from(T_UT).insert({
      codice: cod,
      nome,
      gruppo_utente_id: chat
    }).select().single();
    if (r.error) {
      await send(chat, " " + r.error.message);
      return true;
    }
    await send(chat, "<b>" + cod + " · " + nome + "</b> collegato a questo gruppo.", {
      reply_markup: KB_PRONTO
    });
    return true;
  }
  if (cmd === "/fornitori") {
    const cod = (p.shift() ?? "").toUpperCase();
    const u = await perCodice(cod);
    if (!u) {
      await send(chat, "Formato:\n<code>/fornitori C4</code>");
      return true;
    }
    await sb.from(T_UT).update({
      gruppo_fornitori_id: chat
    }).eq("id", u.id);
    await send(chat, "Gruppo fornitori di <b>" + u.codice + " · " + u.nome + "</b>.\n\nQui arrivano le richieste. Per confermare basta scrivere la parola indicata in ogni messaggio.");
    return true;
  }
  if (cmd === "/conti") {
    const righe = testo.split("\n").map((x)=>x.trim()).filter(Boolean);
    const cod = (righe[0].split(/\s+/)[1] ?? "").toUpperCase();
    if (!cod || righe.length < 3) {
      await send(chat, "Formato — tre righe:\n<code>/conti C4\n5008563 OnamTrading-Live email@x.it Password1\n27467343 RoboForex-Pro Password2</code>");
      return true;
    }
    const u = await perCodice(cod);
    if (!u) {
      await send(chat, "Cliente non trovato.");
      return true;
    }
    const a = righe[1].split(/\s+/), b = righe[2].split(/\s+/);
    await sb.from(T_UT).update({
      login_a: a[0],
      tfx_server: a[1] ?? null,
      tfx_email: a[2] ?? null,
      tfx_pass: a[3] ?? null,
      login_b: b[0],
      rbx_server: b[1] ?? null,
      rbx_pass: b[2] ?? null,
      onboarding_ok: true,
      onboarding_step: "completo",
      depositi_ok: true,
      tfx_setup_ok: true,
      rbx_verificato: true
    }).eq("id", u.id);
    await send(chat, "Conti registrati per <b>" + u.codice + "</b>. Il cliente è operativo.");
    const f = await fresco(u.id);
    if (f?.gruppo_utente_id) await send(f.gruppo_utente_id, "<b>Conti registrati.</b>\nSei operativo: quando i saldi sono bilanciati premi <b> Inizia nuovo ciclo</b>.", {
      reply_markup: KB_PRONTO
    });
    return true;
  }
  if (cmd === "/vps") {
    const cod = (p.shift() ?? "").toUpperCase(), d = p.shift();
    const u = await perCodice(cod);
    if (!u || !d) {
      await send(chat, "Formato:\n<code>/vps C4 2026-08-20</code>");
      return true;
    }
    const pagato = new Date(d + "T12:00:00Z");
    const fino = new Date(pagato.getTime() + 30 * 86400000);
    await sb.from(T_UT).update({
      vps_stato: "attivo",
      vps_pagato_il: pagato.toISOString(),
      vps_copre_fino: fino.toISOString().slice(0, 10)
    }).eq("id", u.id);
    await send(chat, "VPS di <b>" + u.codice + "</b> attivo fino al " + dataIt(fino) + ".");
    return true;
  }
  if (cmd === "/fee") {
    const cod = (p.shift() ?? "").toUpperCase(), v = p.shift();
    const u = await perCodice(cod);
    if (!u) {
      await send(chat, "Formato:\n<code>/fee C4 40</code>");
      return true;
    }
    if (!v) {
      await send(chat, "Fee di <b>" + u.codice + "</b>: <b>" + (u.fee_percent ?? await imp("fee_percent", "50")) + "%</b>");
      return true;
    }
    await sb.from(T_UT).update({
      fee_percent: /auto/i.test(v) ? null : numero(v)
    }).eq("id", u.id);
    await send(chat, "Fee aggiornata.");
    return true;
  }
  if (cmd === "/wallet") {
    const cod = (p.shift() ?? "").toUpperCase(), w = p.shift();
    if (!cod) {
      await send(chat, "Wallet globale:\n<code>" + await imp("wallet_usdt", "—") + "</code>\n\n<code>/wallet C4 0x...</code> per uno specifico");
      return true;
    }
    const u = await perCodice(cod);
    if (!u) {
      await send(chat, "Cliente non trovato.");
      return true;
    }
    if (!w) {
      await send(chat, "Wallet di <b>" + u.codice + "</b>:\n<code>" + (u.wallet_fee || await imp("wallet_usdt", "—")) + "</code>");
      return true;
    }
    await sb.from(T_UT).update({
      wallet_fee: /auto/i.test(w) ? null : w
    }).eq("id", u.id);
    await send(chat, "Wallet aggiornato.");
    return true;
  }
  if (cmd === "/report") {
    await report(chat, p[0] ?? "oggi");
    return true;
  }
  if (cmd === "/fornitorireport") {
    await reportFornitori(chat, p[0] ?? "oggi");
    return true;
  }
  if (cmd === "/assegna") {
    const cod = (p.shift() ?? "").toUpperCase(), nomeP = p.join(" ").trim();
    const u = await perCodice(cod);
    if (!u || !nomeP) {
      await send(chat, "Formato:\n<code>/assegna C4 Marco</code>");
      return true;
    }
    const { data: pt } = await sb.from(T_PT).select("*").ilike("nome", nomeP).maybeSingle();
    if (!pt) {
      await send(chat, "Partner non trovato. Crealo con <code>/partner</code>.");
      return true;
    }
    if (pt.tipo === "fornitore") await sb.from(T_UT).update({
      fornitore_id: pt.id
    }).eq("id", u.id);
    else {
      const { data: a } = await sb.from("bvb_affiliati").select("id").ilike("nome", pt.nome).maybeSingle();
      if (a) await sb.from(T_UT).update({
        affiliato_id: a.id
      }).eq("id", u.id);
    }
    await send(chat, "✅ <b>" + u.codice + "</b> assegnato a <b>" + pt.nome + "</b> (" + pt.tipo + ").");
    return true;
  }
  if (cmd === "/partners") {
    const { data: pts } = await sb.from(T_PT).select("*").order("tipo").order("nome");
    if (!pts?.length) {
      await send(chat, "Nessun partner.\n\n<code>/partner fornitore Marco 35 123456789</code>");
      return true;
    }
    let m = "🤝 <b>PARTNER</b>\n";
    for (const x of pts){
      const suoi = await clientiDi(x);
      m += "\n<b>" + x.nome + "</b> · " + x.tipo + " · " + x.percentuale + "%\n";
      m += x.telegram_id ? "<code>" + x.telegram_id + "</code>\n" : "<i>id non collegato</i>\n";
      m += suoi.length ? suoi.map((y)=>" " + y.codice + " · " + y.nome).join("\n") + "\n" : " <i>nessun cliente</i>\n";
    }
    await send(chat, m);
    return true;
  }
  if (cmd === "/stato") {
    await daConfermare(chat);
    return true;
  }
  if (cmd === "/chi") {
    const id = p[0];
    if (!id) {
      await send(chat, "<code>/chi 123456789</code>");
      return true;
    }
    if (await isAdmin(id)) {
      await send(chat, "È un <b>amministratore</b>.");
      return true;
    }
    const { data: c } = await sb.from(T_UT).select("codice, nome").eq("telegram_id", id).maybeSingle();
    await send(chat, c ? "<b>" + c.codice + " · " + c.nome + "</b>" : "🆕 Non risulta registrato: è un <b>lead</b>.");
    return true;
  }
  return false;
}
async function bottoniIscrizione(chat, mid, a, u) {
  if (a === "disc") {
    await editKb(chat, mid);
    return await mostraDisclaimer(chat);
  }
  if (a === "disc_ok") {
    await editKb(chat, mid, {
      inline_keyboard: [
        [
          {
            text: "Condizioni accettate",
            callback_data: "noop"
          }
        ]
      ]
    });
    await sb.from(T_UT).update({
      disclaimer_ok: true,
      disclaimer_il: new Date().toISOString(),
      onboarding_step: "tfx"
    }).eq("id", u.id);
    await sb.from("bvb_disclaimer").insert({
      utente_id: u.id,
      codice: u.codice,
      nome: u.nome,
      esito: "accettato",
      testo: DISCLAIMER,
      gruppo_id: chat
    }).then(()=>{}, ()=>{});
    const link = await imp("link_tfx", "https://secure.totalfx.com/Registration/Main/Account?dest=live&camp=255");
    await send(chat, "<b>PASSO 1 · TOTAL FX</b>\n\nÈ il conto dove arriverà il <b>bonus del 30%</b>.\n\nSu questo conto matura anche lo <b>swap positivo</b>: ogni notte che l'operazione resta aperta genera un accredito, quindi un guadagno in più oltre al bonus.\n\nHai già un conto Total FX?", {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🆕 Apri conto",
              callback_data: "i:tfx_new"
            }
          ],
          [
            {
              text: "Sì, ce l'ho già",
              callback_data: "i:tfx_gia"
            }
          ]
        ]
      }
    });
    return;
  }
  if (a === "disc_no") {
    await editKb(chat, mid, {
      inline_keyboard: [
        [
          {
            text: "Non accettato",
            callback_data: "noop"
          }
        ]
      ]
    });
    await sb.from(T_UT).update({
      sospeso: true,
      sospeso_dal: new Date().toISOString(),
      nota_admin: "Condizioni rifiutate"
    }).eq("id", u.id);
    await sb.from("bvb_disclaimer").insert({
      utente_id: u.id,
      codice: u.codice,
      nome: u.nome,
      esito: "rifiutato",
      testo: DISCLAIMER,
      gruppo_id: chat
    }).then(()=>{}, ()=>{});
    await send(chat, "<b>Non possiamo procedere.</b>\n\nSenza accettare le condizioni il servizio non può essere attivato.", {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Riparti",
              callback_data: "i:disc"
            }
          ]
        ]
      }
    });
    await adAvvisa("<b>" + u.codice + " · " + u.nome + "</b> ha rifiutato le condizioni.\nGruppo bloccato.\n\nPer riaprire: <code>/sblocca " + u.codice + "</code>");
    return;
  }
  if (a === "tfx_new") {
    await editKb(chat, mid);
    const link = await imp("link_tfx", "https://secure.totalfx.com/Registration/Main/Account?dest=live&camp=255");
    await send(chat, "<b>STEP 1 · APRI CONTO TOTAL FX</b>\n\nUsa <b>solo questo link</b>: è quello che collega il conto al servizio. Con un link diverso il bonus non viene riconosciuto.\n\n" + link);
    await send(chat, "<b>CARATTERISTICHE DEL CONTO</b>\n\nTipo: <b>MT5 Standard</b>\nLeva: <b>1:1000</b>\nValuta: <b>EUR</b>");
    await send(chat, "<b>NON DEPOSITARE SUBITO</b>\n\nSu Total FX serve prima il setup per il bonus. Comunica numero di conto, password ed email: appena arriva l'ok, controlla che lo <b>spread su XAGUSD</b> sia basso e solo allora deposita.\n\nQuando hai i dati di accesso premi il bottone.", {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Ho i dati del conto",
              callback_data: "i:tfx_dati"
            }
          ]
        ]
      }
    });
    return;
  }
  if (a === "tfx_gia") {
    await editKb(chat, mid);
    const mail = await imp("email_totalfx", "cz@totalfx.com");
    const link = await imp("link_tfx", "https://secure.totalfx.com/Registration/Main/Account?dest=live&camp=255");
    await send(chat, "<b>HAI GIÀ UN CONTO</b>\n\nVa benissimo, ma va <b>collegato a noi</b>: senza questo passaggio il broker non riconosce il bonus.\n\nManda una mail a <code>" + mail + "</code> <b>dall'indirizzo con cui hai registrato il conto</b>.\n\nOggetto:\n<code>Richiesta cambio IB</code>");
    await send(chat, "<code>Buongiorno,\n\ncon la presente richiedo il cambio di Introducing Broker per il mio conto di trading.\n\nNumero conto: [IL TUO NUMERO]\n\nChiedo il trasferimento sotto l'IB corrispondente a questo link:\n" + link + "\n\nConfermo che la richiesta è volontaria e autorizzo il cambio.\n\nCordiali saluti,\n[Nome e Cognome]</code>\n\n<i>Tocca il testo per copiarlo.</i>", {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Ho i dati del conto",
              callback_data: "i:tfx_dati"
            }
          ]
        ]
      }
    });
    return;
  }
  if (a === "tfx_dati") {
    await editKb(chat, mid);
    return await chiediCampo(chat, "tfx", 0, {});
  }
  if (a === "rbx_dati") {
    await editKb(chat, mid);
    const s = await stato(chat);
    return await chiediCampo(chat, "rbx", 0, s.dati);
  }
  if (a === "mnx_dati") {
    await editKb(chat, mid);
    const s = await stato(chat);
    return await chiediCampo(chat, "mnx", 0, s.dati);
  }
  if (a === "mnx_skip") {
    await editKb(chat, mid, {
      inline_keyboard: [
        [
          {
            text: "☑️ Lo apro dopo",
            callback_data: "noop"
          }
        ]
      ]
    });
    await sb.from(T_UT).update({
      onboarding_step: "vps"
    }).eq("id", u.id);
    await adAvvisa("⚠️ <b>" + u.codice + " · " + u.nome + "</b> ha rimandato l'apertura del conto Monaxa.");
    return await chiediVps(chat, await fresco(u.id));
  }
  if (a.startsWith("br_re:")) {
    const b = a.split(":")[1];
    await editKb(chat, mid);
    await send(chat, "Quale vuoi correggere?", {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Email",
              callback_data: "i:br_c:" + b + ":0"
            }
          ],
          [
            {
              text: "Numero di conto",
              callback_data: "i:br_c:" + b + ":1"
            }
          ],
          [
            {
              text: "Password",
              callback_data: "i:br_c:" + b + ":2"
            }
          ],
          [
            {
              text: "Server",
              callback_data: "i:br_c:" + b + ":3"
            }
          ]
        ]
      }
    });
    return;
  }
  if (a.startsWith("br_c:")) {
    const parti = a.split(":"), b = parti[1], i = parseInt(parti[2], 10);
    await editKb(chat, mid);
    const s = await stato(chat);
    await setStato(chat, "br_" + b + "_" + i, {
      ...s.dati,
      solo: i
    });
    await send(chat, (b === "tfx" ? "<b>TOTAL FX</b>" : "<b>ROBOFOREX</b>") + "\n\n" + CAMPI_BROKER[i].d, {
      reply_markup: KB_ANNULLA
    });
    return;
  }
  if (a.startsWith("br_ok:")) {
    const b = a.split(":")[1];
    await editKb(chat, mid, {
      inline_keyboard: [
        [
          {
            text: "Inviato",
            callback_data: "noop"
          }
        ]
      ]
    });
    const s = await stato(chat), dt = s.dati;
    if (b === "mnx") {
      await sb.from(T_UT).update({
        mnx_email: dt.mnx_email,
        login_c: dt.mnx_conto,
        mnx_pass: dt.mnx_pass,
        mnx_server: dt.mnx_server,
        mnx_verificato: true,
        onboarding_step: "vps"
      }).eq("id", u.id);
      const fm = await fresco(u.id);
      const { data: brM } = await sb.from(T_BR).select("id").eq("slug", "mnx").maybeSingle();
      if (brM) await sb.from(T_CO).upsert({
        utente_id: u.id,
        broker_id: brM.id,
        login: dt.mnx_conto,
        pass: dt.mnx_pass,
        server: dt.mnx_server,
        email: dt.mnx_email
      }, {
        onConflict: "utente_id,broker_id"
      });
      await fornSerie(fm, [
        "<b>" + fm.codice + " · " + fm.nome + "</b>\n\nmonaxa\n<code>" + dt.mnx_conto + "</code>\n<code>" + dt.mnx_pass + "</code>\n<code>" + dt.mnx_server + "</code>"
      ], null);
      await send(chat, "<b>Dati Monaxa inviati.</b>");
      return await chiediVps(chat, fm);
    }
    if (b === "tfx") {
      await sb.from(T_UT).update({
        tfx_email: dt.tfx_email,
        login_a: dt.tfx_conto,
        tfx_pass: dt.tfx_pass,
        tfx_server: dt.tfx_server,
        onboarding_step: "rbx"
      }).eq("id", u.id);
      const f = await fresco(u.id);
      await fornSerie(f, [
        "<b>" + f.codice + " · " + f.nome + "</b>\nconto TOTAL FX\n<code>" + dt.tfx_conto + "</code>\n<code>" + dt.tfx_pass + "</code>",
        "mail per apertura conto: " + dt.tfx_email
      ], null);
      await apriAttesa(f, "setup conto Total FX");
      const link = await imp("link_rbx", "https://rinfinity.com/a/krozt");
      await send(chat, "<b>Dati Total FX inviati.</b>\nI fornitori collegano il conto.");
      await send(chat, "<b>STEP 2 · APRI CONTO ROBOFOREX</b>\n\n" + link);
      await send(chat, "<b>CARATTERISTICHE DEL CONTO</b>\n\nTipo: <b>MT5 PRO</b>\nLeva: <b>1:2000</b>\nValuta: <b>EUR</b>\n<b>Swap Free</b>\n<b>Hedging System</b>\nCodice affiliato: <code>krozt</code>\n\nSu Roboforex <b>puoi depositare subito</b>, in USDT.");
      await send(chat, "Hai <b>già un conto Roboforex</b>?\n\nNon serve aprirne uno nuovo da zero: dall'area personale apri un <b>nuovo conto trading</b> con le caratteristiche qui sopra e inserisci il codice affiliato <code>krozt</code>.\n\nQuando hai i dati di accesso premi il bottone.", {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Ho i dati del conto",
                callback_data: "i:rbx_dati"
              }
            ]
          ]
        }
      });
      return;
    }
    await sb.from(T_UT).update({
      rbx_email: dt.rbx_email,
      login_b: dt.rbx_conto,
      rbx_pass: dt.rbx_pass,
      rbx_server: dt.rbx_server,
      onboarding_step: "mnx"
    }).eq("id", u.id);
    const f2 = await fresco(u.id);
    await fornSerie(f2, [
      "<b>" + f2.codice + " · " + f2.nome + "</b>\n\nroboforex\n<code>" + dt.rbx_conto + "</code>\n<code>" + dt.rbx_pass + "</code>\n<code>" + dt.rbx_server + "</code>"
    ], null);
    await send(chat, "<b>Dati Roboforex inviati.</b>");
    return await passoMonaxa(chat, f2);
  }
  if (a === "vps_pag" || a === "vps_pag3") {
    await editKb(chat, mid);
    const s0 = await stato(chat);
    const d = await vpsDovuto(u);
    await setStato(chat, "vps_hash", {
      ...s0.dati,
      importo: d.usdt,
      trim: false
    });
    await send(chat, "Incolla il <b>link BscScan</b> del pagamento.", {
      reply_markup: KB_ANNULLA
    });
    return;
  }
}
async function inputBroker(chat, u, st, testo) {
  const [, broker, idx] = st.step.split("_");
  const i = parseInt(idx, 10);
  if (isNaN(i)) return;
  const c = CAMPI_BROKER[i];
  const val = testo.trim();
  if (c.k === "conto" && !/^\d{4,}$/.test(val)) {
    await send(chat, "Il numero di conto è fatto solo di cifre.");
    return;
  }
  if (c.k === "email" && !/@/.test(val)) {
    await send(chat, "Non sembra un'email valida.");
    return;
  }
  const dati = {
    ...st.dati,
    [broker + "_" + c.k]: val
  };
  if (st.dati?.solo != null) {
    delete dati.solo;
    return await riepilogoBroker(chat, u, broker, dati);
  }
  if (i + 1 < CAMPI_BROKER.length) return await chiediCampo(chat, broker, i + 1, dati);
  return await riepilogoBroker(chat, u, broker, dati);
}
async function vpsHash(chat, u, testo) {
  const m = String(testo).match(/0x[a-fA-F0-9]{64}/);
  if (!m) {
    await send(chat, "Non trovo l'hash. Incolla il link completo di BscScan.");
    return;
  }
  const st0 = await stato(chat);
  const w = await imp("wallet_vps", await imp("wallet_usdt", ""));
  const d = await vpsDovuto(u);
  let trim = !!st0.dati?.trim;
  const atteso = trim ? d.trim : st0.dati?.importo ?? d.usdt;
  await send(chat, "Verifico sulla blockchain…");
  let es = await verificaTx(m[0], w, atteso);
  if (!es.ok && es.importo && Math.abs(es.importo - d.trim) / d.trim <= 0.05) {
    trim = true;
    es = {
      ok: true,
      importo: es.importo
    };
  }
  const cb1 = await cambio();
  const oggi = new Date();
  const giorno = parseInt(await imp("vps_giorno", "21"), 10);
  let fino = d.copreReale ?? d.fino;
  let prossima = prossimoGiorno(giorno, fino);
  if (trim) {
    fino = prossimoGiorno(giorno, oggi);
    fino.setMonth(fino.getMonth() + 3);
    prossima = fino;
  }
  await sb.from(T_PA).insert({
    utente_id: u.id,
    tipo: "vps",
    tx_hash: m[0],
    importo_usdt: es.importo ?? atteso,
    cambio_eur: cb1,
    wallet_destinatario: w,
    stato: es.ok ? "verificato" : "in_verifica",
    verificato_at: oggi.toISOString(),
    copre_dal: oggi.toISOString().slice(0, 10),
    copre_fino: fino.toISOString().slice(0, 10)
  });
  await sb.from(T_UT).update({
    vps_stato: "attivo",
    vps_pagato_il: oggi.toISOString(),
    vps_copre_fino: fino.toISOString().slice(0, 10),
    vps_prossimo_pagamento: prossima.toISOString().slice(0, 10),
    onboarding_step: "attesa_sblocco"
  }).eq("id", u.id);
  await setStato(chat, null, {});
  await dicituraForn(u, "VPS pagata : https://bscscan.com/tx/" + m[0]);
  await send(chat, es.ok ? "<b>Pagamento verificato sulla blockchain.</b>\n" + usdt(es.importo) + " ricevuti." : "<b>Pagamento registrato.</b>\nLo verifichiamo a mano e ti confermiamo a breve.");
  let m2 = "<b>VPS e gestione attivo</b>\nCoperto fino al <b>" + dataIt(fino) + "</b>";
  m2 += trim ? "\n<i>Trimestre pagato: nessun pensiero per 3 mesi.</i>" : "\nProssimo rinnovo: <b>" + dataIt(prossima) + "</b>" + (prossima > fino ? "\n<i>Al rinnovo pagherai solo i giorni scoperti.</i>" : "");
  await send(chat, m2);
  await send(chat, "<b>ISCRIZIONE COMPLETATA</b>\n\nHai fatto tutto:\nCondizioni accettate\nConto Total FX\nConto Roboforex\nVPS attivo");
  await adAvvisa("<b>" + u.codice + " · " + u.nome + "ha completato l'iscrizione</b>\n\nTotal FX <code>" + (u.login_a ?? "—") + "</code>\nRoboforex <code>" + (u.login_b ?? "—") + "</code>\nVPS " + (es.ok ? "verificato " : "da verificare ") + "\n\nQuando i fornitori hanno collegato tutto:", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Sblocca " + u.codice,
            callback_data: "a:sblocca:" + u.codice
          }
        ]
      ]
    }
  });
}
// ═══════════════════════════ SETUP GRUPPI ═══════════════════════════
async function pulisciChat(gid, daMid, quanti, avvisa) {
  await tg("unpinAllChatMessages", {
    chat_id: gid
  }).catch(()=>{});
  let tolti = 0, falliti = 0;
  for(let k = daMid; k > Math.max(1, daMid - quanti); k--){
    const r = await tg("deleteMessage", {
      chat_id: gid,
      message_id: k
    });
    if (r?.ok) tolti++;
    else falliti++;
    if (k % 25 === 0) await new Promise((r)=>setTimeout(r, 350));
  }
  if (avvisa) await send(avvisa, "🧹 <b>Pulizia finita.</b>\n" + tolti + " messaggi rimossi" + (falliti ? " · " + falliti + " non rimovibili" : "") + ".");
  return tolti;
}
async function setupGruppo(chat, mid, d, from) {
  const pAd = await partnerDi(from);
  const soloSuoi = !!pAd;
  const suoiCod = soloSuoi ? new Set((await clientiDi(pAd)).map((x)=>x.codice)) : null;
  if (d.startsWith("sp:cli")) {
    const gid = Number(d.split(":")[2] ?? chat);
    await editKb(chat, mid);
    const { data: tutti } = await sb.from(T_UT).select("codice, nome, gruppo_utente_id").order("codice");
    const senza = (tutti ?? []).filter((x)=>!x.gruppo_utente_id);
    const lista = soloSuoi ? (tutti ?? []).filter((x)=>suoiCod.has(x.codice)) : tutti ?? [];
    const kb = [
      [
        {
          text: "🆕 Cliente nuovo",
          callback_data: "spn:new:" + gid
        }
      ]
    ];
    for (const x of lista)kb.push([
      {
        text: (x.gruppo_utente_id ? " " : " ") + x.codice + " · " + x.nome,
        callback_data: "spn:" + x.codice + ":" + gid
      }
    ]);
    await send(chat, "<b>GRUPPO CLIENTE</b>\n\nÈ un cliente nuovo o uno che hai già?\n\n<i> = ha già un gruppo, verrà spostato qui</i>", {
      reply_markup: {
        inline_keyboard: kb
      }
    });
    return;
  }
  if (d.startsWith("spn:new")) {
    const gid = Number(d.split(":")[2] ?? chat);
    await editKb(chat, mid);
    {
      const { data: gia } = await sb.from(T_UT).select("codice, nome").eq("gruppo_utente_id", gid).maybeSingle();
      if (gia) {
        await send(chat, "⚠️ Questo gruppo è già collegato a <b>" + gia.codice + " · " + gia.nome + "</b>.\n\n<i>Se volevi collegare i fornitori, scegli</i> 🤝 <b>Gruppo fornitori</b>.");
        return;
      }
    }
    const cod = await prossimoCodice(soloSuoi ? pAd : null);
    await setStato(chat, "setup_nome", {
      cod,
      gid,
      rete: soloSuoi ? pAd.id : null
    });
    await send(chat, "🆕 <b>CLIENTE NUOVO</b>\n\nCodice assegnato: <b>" + cod + "</b>\n\nScrivi qui <b>nome e cognome</b>.");
    return;
  }
  if (d.startsWith("spn:")) {
    const parti = d.split(":"), cod = parti[1], gid = Number(parti[2] ?? chat);
    const u = await perCodice(cod);
    if (!u) {
      await send(chat, "Cliente non trovato.");
      return;
    }
    await editKb(chat, mid);
    await sb.from(T_UT).update({
      gruppo_utente_id: gid
    }).eq("id", u.id);
    const f = await fresco(u.id);
    const { kb, nota } = await tastiera(f, await stato(gid));
    await send(chat, "<b>" + u.codice + " · " + u.nome + "</b> collegato al gruppo.");
    await send(gid, "<b>Benvenuto su Cashly · Broker vs Broker</b>\n\n" + nota, {
      reply_markup: kb
    });
    return;
  }
  if (d.startsWith("sp:for")) {
    const gid = Number(d.split(":")[2] ?? chat);
    await editKb(chat, mid);
    const { data } = await sb.from(T_UT).select("codice, nome, gruppo_fornitori_id").order("codice");
    let cl = data ?? [];
    if (soloSuoi) cl = cl.filter((x)=>suoiCod.has(x.codice));
    if (!cl.length) {
      await send(chat, "Nessun cliente registrato.\n\nCollega prima il gruppo cliente, poi torna qui.");
      return;
    }
    await send(chat, "<b>GRUPPO FORNITORI</b>\n\nDi quale cliente è il gruppo che hai appena aperto?", {
      reply_markup: {
        inline_keyboard: cl.map((x)=>[
            {
              text: (x.gruppo_fornitori_id ? " " : " ") + x.codice + " · " + x.nome,
              callback_data: "spfx:" + x.codice + ":" + gid
            }
          ])
      }
    });
    return;
  }
  if (d.startsWith("spfx:")) {
    const parti = d.split(":"), cod = parti[1], gid = parti[2];
    const u = await perCodice(cod);
    if (!u) {
      await send(chat, "Cliente non trovato.");
      return;
    }
    await editKb(chat, mid, {
      inline_keyboard: [
        [
          {
            text: "Collegato",
            callback_data: "noop"
          }
        ]
      ]
    });
    await sb.from(T_UT).update({
      gruppo_fornitori_id: Number(gid)
    }).eq("id", u.id);
    await send(chat, "<b>" + u.codice + " · " + u.nome + "</b>\nGruppo fornitori collegato. Nel gruppo non ho scritto nulla.");
    return;
  }
  if (d.startsWith("spf:")) {
    const cod = d.slice(4);
    const u = await perCodice(cod);
    if (!u) {
      await send(chat, "Cliente non trovato.");
      return;
    }
    await tg("deleteMessage", {
      chat_id: chat,
      message_id: mid
    });
    await sb.from(T_UT).update({
      gruppo_fornitori_id: chat
    }).eq("id", u.id);
    await adAvvisa("<b>Gruppo fornitori collegato</b>\n" + u.codice + " · " + u.nome + "\n\nNel gruppo non ho scritto nulla.");
    return;
  }
}
async function creaCliente(chat, nome) {
  const s = await stato(chat);
  const cod = s.dati?.cod ?? "C1";
  if (nome.split(/\s+/).filter(Boolean).length < 2) {
    await send(chat, "Scrivi <b>nome e cognome</b>.");
    return;
  }
  const gid = s.dati?.gid ?? chat;
  const reteId = s.dati?.rete ?? null;
  const riga = {
    codice: cod,
    nome: nome.trim(),
    gruppo_utente_id: gid
  };
  let rete = null;
  if (reteId) {
    const { data: p } = await sb.from(T_PT).select("*").eq("id", reteId).maybeSingle();
    if (p) {
      rete = p;
      riga.creato_da = p.id;
      riga.fee_percent = 50;
      if (p.tipo === "fornitore") riga.fornitore_id = p.id;
      else {
        let { data: a } = await sb.from("bvb_affiliati").select("id").ilike("nome", p.nome).maybeSingle();
        if (!a) {
          const rr = await sb.from("bvb_affiliati").insert({
            nome: p.nome,
            comando: p.nome.toLowerCase().replace(/\s+/g, ""),
            percentuale: p.percentuale,
            wallet_fee: p.wallet_fee,
            attivo: true
          }).select().single();
          a = rr.data;
        }
        riga.affiliato_id = a?.id ?? null;
      }
    }
  }
  const r = await sb.from(T_UT).insert(riga).select().single();
  if (r.error) {
    const msg = String(r.error.message ?? "");
    if (msg.includes("gruppo_utente_id")) await send(chat, "⚠️ Questo gruppo risulta già collegato a un altro cliente.\n\n<i>Controlla in</i> 👥 <b>Clienti</b>.");
    else if (msg.includes("codice")) await send(chat, "⚠️ Il codice è già in uso. Riprova.");
    else await send(chat, "❌ Non sono riuscito a registrarlo.\n<i>" + msg.slice(0, 120) + "</i>");
    await setStato(chat, null, {});
    return;
  }
  await setStato(chat, null, {});
  await send(chat, "✅ <b>" + cod + " · " + nome.trim() + "</b> registrato e collegato al gruppo." + (rete ? "\n<i>rete " + rete.nome + " · fee 50%</i>" : ""));
  await send(gid, "<b>Benvenuto su Cashly · Broker vs Broker</b>\n\nDa qui gestisci i tuoi cicli.", {
    reply_markup: KB_PRONTO
  });
  const avviso = "🆕 <b>" + cod + " · " + nome.trim() + "</b> registrato" + (rete ? "\n<i>rete " + rete.nome + "</i>" : "") + "\n\nDa fare:\n• registrare i conti broker\n• attivare il VPS quando paga\n• collegare il gruppo fornitori";
  for (const a of (await sb.from(T_AD).select("telegram_user_id")).data ?? []){
    if (String(a.telegram_user_id) === String(chat)) continue;
    await send(a.telegram_user_id, avviso);
  }
}
// ═══════════════════════════ LEAD ═══════════════════════════
function kbPartner(p) {
  const t = p.tipo === "fornitore" ? "💰 Guadagno fornitore" : "💰 Guadagno affiliazione";
  return kbBase([
    [
      {
        text: "📊 I miei cicli"
      },
      {
        text: t
      }
    ],
    [
      {
        text: "📈 Report"
      },
      {
        text: "👥 I miei clienti"
      }
    ],
    [
      {
        text: "🔗 Il mio link"
      },
      {
        text: "🎯 Contatti"
      }
    ],
    [
      {
        text: "🔄 Aggiorna"
      }
    ]
  ]);
}
const KB_PARTNER = kbBase([
  [
    {
      text: "💰 Guadagno affiliazione"
    }
  ],
  [
    {
      text: "📈 Report"
    },
    {
      text: "👥 I miei clienti"
    }
  ],
  [
    {
      text: "🔄 Aggiorna"
    }
  ]
]);
async function tokenPartner(p) {
  if (p.app_token) return p.app_token;
  const t = crypto.randomUUID();
  await sb.from(T_PT).update({
    app_token: t
  }).eq("id", p.id);
  return t;
}
function kbMisto(p) {
  const t = p.tipo === "fornitore" ? "💰 Guadagno fornitore" : "💰 Guadagno affiliazione";
  return kbBase([
    [
      {
        text: "📊 I miei cicli"
      },
      {
        text: t
      }
    ],
    [
      {
        text: "📈 Report"
      },
      {
        text: "👥 I miei clienti"
      }
    ],
    [
      {
        text: "🔗 Il mio link"
      },
      {
        text: "🎯 Contatti"
      }
    ],
    [
      {
        text: "🔄 Aggiorna"
      }
    ]
  ]);
}
async function areaMista(chat, u, p, testoIn, from) {
  const testo = pulisci(testoIn);
  const tk = await tokenApp(u);
  const tp = await tokenPartner(p);
  if (testo === "I miei cicli" || testo === "La mia dashboard") {
    await send(chat, "📊 <b>I TUOI CICLI</b>\n<i>come cliente · " + u.codice + "</i>", {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Apri dashboard",
              ...Number(chat) > 0 ? {
                web_app: {
                  url: APP_DASH + "?v=" + APP_VER + "&t=" + tk
                }
              } : {
                url: APP_DASH + "?v=" + APP_VER + "&t=" + tk
              }
            }
          ],
          [
            {
              text: "Ultimo ciclo",
              ...Number(chat) > 0 ? {
                web_app: {
                  url: APP_CICLO + "?v=" + APP_VER + "&t=" + tk
                }
              } : {
                url: APP_CICLO + "?v=" + APP_VER + "&t=" + tk
              }
            }
          ],
          [
            {
              text: "💳 Le mie fee pagate",
              callback_data: "mie:fee"
            }
          ]
        ]
      }
    });
    return;
  }
  if (testo === "Guadagno affiliazione" || testo === "Guadagno fornitore" || testo === "Quadro rete" || testo === "Dashboard rete") {
    await send(chat, "💰 <b>GUADAGNO " + (p.tipo === "fornitore" ? "FORNITORE" : "AFFILIATO") + "</b>\n<i>i guadagni della tua rete</i>", {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Apri dashboard rete",
              ...Number(chat) > 0 ? {
                web_app: {
                  url: APP_PARTNER + "?v=" + APP_VER + "&t=" + tp
                }
              } : {
                url: APP_PARTNER + "?v=" + APP_VER + "&t=" + tp
              }
            }
          ]
        ]
      }
    });
    return;
  }
  if (testo === "/start" || testo === "Aggiorna" || testo === "/admin") {
    const cl = await clientiDi(p);
    let m = "<b>" + p.nome.toUpperCase() + "</b>\n<i>" + p.tipo + " · " + cl.length + (cl.length === 1 ? " cliente" : " clienti") + " in rete</i>";
    const { data: ci } = await sb.from(T_CI).select("profitto_eur, fee_eur").eq("utente_id", u.id).in("stato", [
      "pagato",
      "chiuso"
    ]);
    const n = (ci ?? []).length;
    if (n) {
      const netto = (ci ?? []).reduce((a, x)=>a + Number(x.profitto_eur ?? 0) - Number(x.fee_eur ?? 0), 0);
      m += "\n\n📊 <b>I tuoi cicli</b> · " + n + " chiusi · netto " + eur(netto);
    }
    if (u.ciclo_attivo) m += "\n🟢 <b>Ciclo attivo</b> da " + eurI(u.budget_ciclo ?? 0);
    await send(chat, m, {
      reply_markup: kbMisto(p)
    });
    await confermePartner(chat, cl, true);
    return;
  }
  return await areaPartner(chat, p, testoIn, from, kbMisto(p));
}
async function areaPartner(chat, p, testoIn, from, kbOverride) {
  // primo ingresso: te lo segnalo una volta sola
  try {
    const { data: a } = await sb.from(T_PA_ADM).select("id, nome, primo_accesso").eq("telegram_id", from).maybeSingle();
    if (a && !a.primo_accesso) {
      await sb.from(T_PA_ADM).update({
        primo_accesso: new Date().toISOString()
      }).eq("id", a.id);
      await adAvvisa("🚪 <b>" + (a.nome ?? "Un admin") + " è entrato</b>\n<i>" + p.nome + "</i>\nid <code>" + from + "</code>", {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "👁 Vedi cosa vede",
                callback_data: "vd:" + String(from)
              }
            ]
          ]
        }
      });
    }
  } catch (e) {}
  // primo accesso: te lo segnalo una volta sola
  try {
    const { data: a0 } = await sb.from(T_PA_ADM).select("id, nome, primo_accesso").eq("telegram_id", from).maybeSingle();
    if (a0 && !a0.primo_accesso) {
      await sb.from(T_PA_ADM).update({
        primo_accesso: new Date().toISOString()
      }).eq("id", a0.id);
      await adAvvisa("🔓 <b>" + (a0.nome ?? "Un admin") + " è entrato</b>\n<i>" + p.nome + " · primo accesso</i>\nid <code>" + from + "</code>");
    }
  } catch (e) {}
  const testo = pulisci(testoIn);
  const cl = await clientiDi(p);
  const KB = kbOverride ?? kbPartner(p);
  // primo accesso da link libero: si presenta
  const st0 = await stato(chat);
  if (st0.step === "padm_nome" && testo && !testo.startsWith("/")) {
    const nome = testo.trim();
    if (nome.split(/\s+/).filter(Boolean).length < 2) {
      await send(chat, "Scrivi <b>nome e cognome</b>.");
      return;
    }
    await sb.from(T_PA_ADM).update({
      nome
    }).eq("id", st0.dati?.admin);
    const { data: tuttiCl } = await sb.from(T_UT).select("id, nome, telegram_id");
    const cerca = nome.toLowerCase().replace(/\s+/g, " ").trim();
    const suo = (tuttiCl ?? []).find((x)=>String(x.nome ?? "").toLowerCase().replace(/\s+/g, " ").trim() === cerca && !x.telegram_id);
    if (suo) {
      await sb.from(T_UT).update({
        telegram_id: from
      }).eq("id", suo.id);
      await collegaPrivato(suo, from);
    }
    await setStato(chat, null, {});
    await send(chat, "✅ <b>Piacere " + nome.split(" ")[0] + ".</b>\n\nSei collegato a <b>" + p.nome + "</b>." + (suo ? "\nHo trovato anche il tuo profilo cliente." : ""), {
      reply_markup: KB
    });
    await adAvvisa("👥 <b>" + nome + "</b> si è registrato come admin di " + p.nome + ".");
    return;
  }
  if (testo === "/start" || testo === "Aggiorna" || testo === "/admin") {
    await send(chat, "<b>" + p.nome.toUpperCase() + "</b>\n<i>" + (p.tipo === "fornitore" ? "area fornitore" : "area affiliato") + " · " + cl.length + (cl.length === 1 ? " cliente" : " clienti") + "</i>", {
      reply_markup: KB
    });
    if (p.tipo === "fornitore") await confermePartner(chat, cl, true);
    return;
  }
  if (testo === "I miei clienti") {
    if (!cl.length) {
      await send(chat, "Nessun cliente assegnato.", {
        reply_markup: KB
      });
      return;
    }
    let m = "👥 <b>I MIEI CLIENTI</b>\n";
    for (const u of cl){
      const s = u.bannato ? "🚫" : u.sospeso ? "⏸" : !u.onboarding_ok ? "✍️" : u.attesa_tipo ? "⏳" : u.ciclo_attivo ? "🟢" : "✅";
      m += "\n" + s + " <b>" + u.codice + "</b> " + u.nome;
      if (u.ciclo_attivo) m += " · " + eurI(u.budget_ciclo ?? 0);
      if (u.attesa_tipo) m += "\n   <i>" + u.attesa_tipo + "</i>";
      m += "\n";
    }
    await send(chat, m, {
      reply_markup: KB
    });
    return;
  }
  if (testo === "Guadagno affiliazione" || testo === "Guadagno fornitore" || testo === "Quadro rete" || testo === "Dashboard" || testo === "Dashboard rete") {
    const tk = await tokenPartner(p);
    await send(chat, "💰 <b>" + (p.tipo === "fornitore" ? "GUADAGNO FORNITORE" : "GUADAGNO AFFILIAZIONE") + "</b>\n\nAndamento, incassi e schede dei tuoi clienti.", {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Apri",
              ...Number(chat) > 0 ? {
                web_app: {
                  url: APP_PARTNER + "?v=" + APP_VER + "&t=" + tk
                }
              } : {
                url: APP_PARTNER + "?v=" + APP_VER + "&t=" + tk
              }
            }
          ]
        ]
      }
    });
    return;
  }
  if (testo === "I miei cicli") {
    const { data: u } = await sb.from(T_UT).select("*").eq("telegram_id", from).maybeSingle();
    if (!u) {
      await send(chat, "📊 <b>I TUOI CICLI</b>\n\nNon risulti ancora registrato come cliente.\n\n<i>Quando apri i tuoi due conti e parti col primo ciclo, qui trovi la tua dashboard personale.</i>", {
        reply_markup: KB
      });
      return;
    }
    const tk = await tokenApp(u);
    await send(chat, "📊 <b>I TUOI CICLI</b>\n<i>come cliente · " + u.codice + "</i>", {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Apri dashboard",
              ...Number(chat) > 0 ? {
                web_app: {
                  url: APP_DASH + "?v=" + APP_VER + "&t=" + tk
                }
              } : {
                url: APP_DASH + "?v=" + APP_VER + "&t=" + tk
              }
            }
          ],
          [
            {
              text: "Ultimo ciclo",
              ...Number(chat) > 0 ? {
                web_app: {
                  url: APP_CICLO + "?v=" + APP_VER + "&t=" + tk
                }
              } : {
                url: APP_CICLO + "?v=" + APP_VER + "&t=" + tk
              }
            }
          ],
          [
            {
              text: "💳 Le mie fee pagate",
              callback_data: "mie:fee"
            }
          ]
        ]
      }
    });
    return;
  }
  if (testo === "Contatti") {
    const { data: ls } = await sb.from("bvb_lead").select("*").eq("partner_id", p.id).neq("stato", "attivato").order("creato_il", {
      ascending: false
    }).limit(15);
    if (!ls?.length) {
      await send(chat, "🎯 <b>CONTATTI</b>\n\nNessuno in attesa.", {
        reply_markup: kbPartner(p)
      });
      return;
    }
    await send(chat, "🎯 <b>CONTATTI IN ATTESA</b> · " + ls.length, {
      reply_markup: kbPartner(p)
    });
    for (const l of ls){
      const m = "<b>" + (l.nome ?? "—") + "</b>" + (l.username ? " · " + l.username : "") + "\n💰 " + (l.capitale ?? "—") + "\n📊 " + (l.esperienza ?? "—") + "\n<i>" + dataIt(l.creato_il) + " · " + l.stato + "</i>";
      await send(chat, m, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "✅ Attiva cliente",
                callback_data: "ld:ok:" + l.telegram_id
              }
            ],
            [
              {
                text: "💬 Scrivigli",
                url: "tg://user?id=" + l.telegram_id
              },
              {
                text: "🗑 Scarta",
                callback_data: "ld:no:" + l.telegram_id
              }
            ]
          ]
        }
      });
    }
    return;
  }
  if (testo === "Il mio link") {
    const codice = (p.prefisso || p.nome.toLowerCase().replace(/\s+/g, "")).toLowerCase();
    await send(chat, "🔗 <b>IL TUO LINK</b>\n\nChi lo apre entra nel percorso e resta assegnato a te.\n\n<code>https://t.me/cashly_bvb_bot?start=r_" + codice + "</code>\n\n<i>Mettilo nella bio o mandalo a chi ti chiede informazioni. Ti avviso appena qualcuno arriva in fondo.</i>", {
      reply_markup: kbPartner(p)
    });
    return;
  }
  if (testo === "Nuovo cliente") {
    const cod = await prossimoCodice(p);
    let m = "➕ <b>NUOVO CLIENTE</b>\n━━━━━━━━━━━━━━\n\nIl prossimo codice è <b>" + cod + "</b>.\n\n";
    m += "<b>1 · CREA I DUE GRUPPI</b>\n· <code>" + cod + " · Nome Cognome</code> — con il cliente\n· <code>" + cod + " · Fornitori</code> — con i fornitori\n\n";
    m += "<b>2 · AGGIUNGI IL BOT</b>\nMetti <b>@cashly_bvb_bot</b> in ogni gruppo e rendilo amministratore.\n<i>Permessi: elimina messaggi, fissa messaggi, invita utenti.</i>\n\n";
    m += "<b>3 · RISPONDI QUI</b>\nTi chiedo io che gruppo è: scegli <b>cliente</b> o <b>fornitori</b> e il resto lo faccio da solo.\n\n";
    m += "<i>Il cliente parte con la fee al 50% e viene assegnato a " + p.nome + ".</i>";
    await send(chat, m, {
      reply_markup: kbPartner(p)
    });
    return;
  }
  if (testo === "Report") return await reportPartner(chat, p, "mese");
  if (p.tipo === "fornitore") return await confermePartner(chat, cl, false);
}
async function confermePartner(chat, cl, muto) {
  let n = 0;
  for (const u of cl){
    if (!u.attesa_tipo) continue;
    n++;
    const da = u.attesa_dal ? durata(Date.now() - new Date(u.attesa_dal).getTime()) : "—";
    const k = parolaPer(u.attesa_tipo);
    const az = {
      "reset": "Reset eseguito",
      "bonus": "Bonus accreditato",
      "avvio": "Trade in corso",
      "conteggio": "Conteggio ok",
      "pagamento": "Pagamento ricevuto",
      "vps": "VPS ok",
      "setup": "Setup fatto"
    };
    const at = String(u.attesa_tipo).toLowerCase();
    const cb2 = at.includes("reset") ? "reset" : at.includes("bonus") ? "bonus" : at.includes("avvio") ? "avvio" : at.includes("conteggio") ? "conteggio" : at.includes("pagamento") || at.includes("incasso") ? "pagamento" : at.includes("vps") ? "vps" : "setup";
    await send(chat, "⏳ <b>" + u.codice + " · " + u.nome + "</b>\n<i>" + u.attesa_tipo + " · da " + da + "</i>", {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: az[cb2] ?? "Conferma",
              callback_data: "a:" + cb2 + ":" + u.codice
            }
          ]
        ]
      }
    });
  }
  if (!n && !muto) await send(chat, "✅ <b>Nessuna richiesta in attesa.</b>", {
    reply_markup: KB_PARTNER
  });
}
async function reportPartner(chat, p, arg) {
  const per = periodo(arg);
  const { righe, sp } = await datiReport(per);
  const cl = (await clientiDi(p)).filter((x)=>!x.proprio);
  const codici = new Set(cl.map((x)=>x.codice));
  const sel = righe.filter((x)=>codici.has(x.u.codice));
  const nav = {
    inline_keyboard: [
      [
        {
          text: "Oggi",
          callback_data: "pr:oggi"
        },
        {
          text: "Settimana",
          callback_data: "pr:settimana"
        }
      ],
      [
        {
          text: "Mese",
          callback_data: "pr:mese"
        },
        {
          text: "Tutto",
          callback_data: "pr:tutto"
        }
      ]
    ]
  };
  if (!sel.length) {
    await send(chat, "📊 <b>REPORT · " + per.tit + "</b>\n\nNessun incasso in questo periodo.", {
      reply_markup: nav
    });
    return;
  }
  const quota = p.tipo === "fornitore" ? sel.reduce((a, x)=>a + x.qForn, 0) : sel.reduce((a, x)=>a + x.qAff, 0);
  let m = "📊 <b>REPORT · " + per.tit + "</b>\n━━━━━━━━━━━━━━\n\n";
  m += "🔁 Cicli chiusi <b>" + sel.length + "</b>\n";
  m += "💰 <b>Spettante " + usdt(quota) + "</b>\n";
  const gg2 = new Map();
  for (const x of sel){
    const k = String(x.data).slice(0, 10);
    const q = p.tipo === "fornitore" ? x.qForn : x.qAff;
    const o = gg2.get(k) ?? {
      n: 0,
      q: 0
    };
    o.n++;
    o.q += q;
    gg2.set(k, o);
  }
  let cum2 = 0;
  m += "\n━━━━━━━━━━━━━━\n<b>GIORNO PER GIORNO</b>\n";
  for (const [k, v] of [
    ...gg2.entries()
  ].sort()){
    cum2 += v.q;
    m += "\n<b>" + dataIt(k) + "</b> · " + v.n + (v.n === 1 ? " ciclo" : " cicli") + "\n" + usdt(v.q) + " · <b>cum " + usdt(cum2) + "</b>\n";
  }
  m += "\n━━━━━━━━━━━━━━\n<b>DETTAGLIO</b>\n";
  for (const x of sel){
    const q = p.tipo === "fornitore" ? x.qForn : x.qAff;
    m += "\n<b>" + x.u.codice + " · " + x.u.nome + "</b>\n" + dataIt(x.data) + " · " + usdt(q) + "\n";
  }
  await send(chat, m, {
    reply_markup: nav
  });
}
async function areaLead(chat, testo, m, from) {
  const st = String(testo ?? "");
  if (/^\/start\s+dash/i.test(st)) {
    const { data: mio } = await sb.from(T_UT).select("*").eq("telegram_id", from).maybeSingle();
    if (mio) {
      const t2 = await tokenApp(mio);
      await collegaPrivato(mio, from);
      await send(chat, "📊 <b>LA TUA DASHBOARD</b>\n<i>" + mio.codice + "</i>", {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Apri dashboard",
                ...Number(chat) > 0 ? {
                  web_app: {
                    url: APP_DASH + "?v=" + APP_VER + "&t=" + t2
                  }
                } : {
                  url: APP_DASH + "?v=" + APP_VER + "&t=" + t2
                }
              }
            ],
            [
              {
                text: "🏆 Ultimo ciclo",
                ...Number(chat) > 0 ? {
                  web_app: {
                    url: APP_CICLO + "?v=" + APP_VER + "&t=" + t2
                  }
                } : {
                  url: APP_CICLO + "?v=" + APP_VER + "&t=" + t2
                }
              }
            ]
          ]
        }
      });
      return;
    }
  }
  const ma = st.match(/^\/start\s+a_([0-9a-f]{6,})/i);
  if (ma) {
    const { data: adm } = await sb.from(T_PA_ADM).select("*, p:partner_id(*)").limit(300);
    const a = (adm ?? []).find((x)=>x.id.startsWith(ma[1]));
    if (a) {
      if (a.telegram_id && String(a.telegram_id) !== String(from)) {
        await send(chat, "Questo link è già stato usato.");
        return;
      }
      await sb.from(T_PA_ADM).update({
        telegram_id: from,
        collegato_il: new Date().toISOString()
      }).eq("id", a.id);
      if (!a.nome) {
        const auto = [
          cb?.from?.first_name,
          cb?.from?.last_name
        ].filter(Boolean).join(" ") || null;
        await setStato(chat, "padm_nome", {
          admin: a.id
        });
        await send(chat, "👋 <b>Benvenuto</b>\n\nSei collegato a <b>" + p.nome + "</b>.\n\nCome ti chiami? Scrivi <b>nome e cognome</b>." + (auto ? "\n<i>Se va bene</i> <code>" + auto + "</code> <i>scrivilo pure.</i>" : ""));
        await adAvvisa("👥 <b>Nuovo admin di " + p.nome + "</b>\nid <code>" + from + "</code>\n<i>sta scrivendo il suo nome</i>");
        return;
      }
      // se è anche cliente, collego il suo profilo così vede i propri cicli
      if (a.nome) {
        const { data: cl } = await sb.from(T_UT).select("id, nome, telegram_id");
        const cerca = String(a.nome).toLowerCase().replace(/\s+/g, " ").trim();
        const suo = (cl ?? []).find((x)=>String(x.nome ?? "").toLowerCase().replace(/\s+/g, " ").trim() === cerca && !x.telegram_id);
        if (suo) await sb.from(T_UT).update({
          telegram_id: from
        }).eq("id", suo.id);
      }
      const p = a.p;
      const cl = await clientiDi(p);
      const { data: suo } = await sb.from(T_UT).select("*").eq("telegram_id", from).maybeSingle();
      if (suo) await collegaPrivato(suo, from);
      await send(chat, "✅ <b>Benvenuto " + (a.nome ?? "") + "</b>\n\nSei collegato a <b>" + p.nome + "</b>.\n" + cl.length + (cl.length === 1 ? " cliente" : " clienti") + " nella rete." + (suo ? "\n\n<i>Il bottone in basso apre la tua dashboard personale.</i>" : ""), {
        reply_markup: kbPartner({
          ...p,
          ruolo: a.ruolo
        })
      });
      await adAvvisa("👥 <b>" + (a.nome ?? "admin") + " si è collegato</b>\n<i>admin di " + p.nome + "</i>\nid <code>" + from + "</code>");
      return;
    }
  }
  const mm = st.match(/^\/start\s+p_([0-9a-f]{6,})/i);
  if (mm) {
    const { data: pts } = await sb.from(T_PT).select("*");
    const p = (pts ?? []).find((x)=>x.id.startsWith(mm[1]));
    if (p) {
      if (p.telegram_id && String(p.telegram_id) !== String(from)) {
        await send(chat, "Questo link è già stato usato. Chiedi allo staff un nuovo collegamento.");
        return;
      }
      await sb.from(T_PT).update({
        telegram_id: from
      }).eq("id", p.id);
      const cl = await clientiDi(p);
      await send(chat, "✅ <b>Benvenuto " + p.nome + "</b>\n\nSei collegato come <b>" + p.tipo + "</b> al " + p.percentuale + "%.\n" + cl.length + (cl.length === 1 ? " cliente" : " clienti") + " nella tua rete.", {
        reply_markup: KB_PARTNER
      });
      await adAvvisa("🤝 <b>" + p.nome + " si è collegato</b>\n<i>" + p.tipo + " · " + p.percentuale + "%</i>\nid <code>" + from + "</code>" + (cl.length ? "\n" + cl.length + (cl.length === 1 ? " cliente" : " clienti") : "\n\n<i>Non ha ancora clienti: assegnaglieli con</i> <code>/assegna C4 " + p.nome + "</code>"));
      return;
    }
  }
  await send(chat, "<b>Cashly · Broker vs Broker</b>\n\nIl percorso di attivazione arriva a breve.\n\nNel frattempo scrivi allo staff se hai domande.");
  const mr = st.match(/^\/start\s+r_([a-z0-9]{1,20})/i);
  let rete = null, fonte = null;
  if (mr) {
    const { data: pts } = await sb.from(T_PT).select("*").eq("attivo", true);
    rete = (pts ?? []).find((x)=>(x.prefisso ?? "").toLowerCase() === mr[1].toLowerCase() || x.nome.toLowerCase().replace(/\s+/g, "") === mr[1].toLowerCase() || x.id.startsWith(mr[1])) ?? null;
    if (!rete) fonte = mr[1].toLowerCase();
  }
  const l = await lead(from, m, rete, fonte);
  if (st.startsWith("/start") || !l.stato || l.stato === "nuovo") return await funnel(chat, l, "via");
  return await funnel(chat, l, null);
}
async function lead(tgId, m, rete, fonte) {
  const { data } = await sb.from("bvb_lead").select("*").eq("telegram_id", tgId).maybeSingle();
  if (data) {
    if (rete && !data.partner_id) await sb.from("bvb_lead").update({
      partner_id: rete.id
    }).eq("id", data.id);
    if (fonte && !data.note) await sb.from("bvb_lead").update({
      note: fonte
    }).eq("id", data.id);
    return {
      ...data,
      partner_id: data.partner_id ?? rete?.id ?? null
    };
  }
  const { data: n } = await sb.from("bvb_lead").insert({
    telegram_id: tgId,
    username: m?.from?.username ? "@" + m.from.username : null,
    nome: [
      m?.from?.first_name,
      m?.from?.last_name
    ].filter(Boolean).join(" ") || null,
    partner_id: rete?.id ?? null,
    note: fonte ?? null
  }).select().single();
  return n;
}
const KB_LEAD = kbBase([
  [
    {
      text: "📘 Come funziona"
    },
    {
      text: "🔍 Risultati"
    }
  ],
  [
    {
      text: "✅ Voglio iniziare"
    }
  ]
]);
const PUNTI = [
  [
    "1 · COS'È",
    "Due conti su due broker diversi. Si apre un <b>buy</b> su uno e un <b>sell</b> sull'altro.\n\nLe due posizioni si annullano: qualunque cosa faccia il prezzo, il saldo complessivo resta fermo.\n\n<b>Non devi prevedere niente.</b> Nessuna analisi, nessun segnale."
  ],
  [
    "2 · DOVE STA IL GUADAGNO",
    "In due cose che non dipendono dal mercato:\n\n• il <b>bonus tradabile</b> che il broker accredita a ogni ciclo\n• lo <b>swap positivo</b>, che matura ogni notte che il trade resta aperto\n\nSono accordi diretti coi broker. Senza, l'hedging viene rilevato e il conto bloccato: per questo non lo fanno tutti."
  ],
  [
    "3 · IL CICLO",
    "Si parte con i due conti <b>bilanciati</b>. Poi succede una di due cose.\n\n🟢 <b>Il profitto va sul primo conto</b>\nCiclo chiuso: prelevi, paghi la commissione, ribilanci. Pronto a ripartire.\n\n🔵 <b>Il profitto va sul secondo</b>\nTi ritrovi in perdita momentanea tra i due conti. È previsto: si chiede il bonus, si fa il secondo step e il ciclo si chiude.\n\n<i>Un ciclo dura uno o due giorni.</i>"
  ],
  [
    "4 · COSA SERVE",
    "<b>2.000 €</b> per iniziare e capire come funziona. Per numeri interessanti si parte da <b>4.000-6.000 €</b>, e si può salire a multipli di 500 fino a 30.000.\n\nApri i due conti a tuo nome, con documento come su qualsiasi broker. I soldi restano lì: <b>i prelievi li fai solo tu</b>.\n\nPer far girare i cicli servono le credenziali operative dei conti.\n\nUnica spesa fissa: <b>25 € al mese</b> di server, anche se stai fermo."
  ],
  [
    "5 · QUANTO RENDE",
    "In media <b>4-6% a ciclo</b> sul capitale. Varia col mercato e con quanto sei veloce a ribilanciare.\n\nNon è garantito e il capitale è a rischio.\n\nLa commissione si paga <b>solo se il ciclo va in profitto</b>, in USDT, a ciclo chiuso. Se non guadagni non paghi.\n\nNessun costo di ingresso, nessun vincolo: smetti quando vuoi."
  ]
];
async function proveReali(chat) {
  const { data: img } = await sb.from("bvb_prove").select("*").eq("attivo", true).order("ordine").limit(10);
  if (img?.length) {
    await send(chat, "🔍 <b>RISULTATI REALI</b>\n━━━━━━━━━━━━━━\n\nCicli <b>chiusi e pagati</b>. Numeri veri, nessun nome.");
    if (img.length === 1) {
      await tg("sendPhoto", {
        chat_id: chat,
        photo: img[0].file_id,
        caption: img[0].didascalia ?? ""
      });
    } else {
      for(let i = 0; i < img.length; i += 10){
        const gruppo = img.slice(i, i + 10).map((x, k)=>({
            type: "photo",
            media: x.file_id,
            caption: k === 0 && x.didascalia ? x.didascalia : undefined
          }));
        await tg("sendMediaGroup", {
          chat_id: chat,
          media: gruppo
        });
      }
    }
    await send(chat, "<i>Ogni commissione è tracciata sulla blockchain. Da cliente vedi i tuoi pagamenti verificabili uno per uno.</i>", {
      reply_markup: KB_LEAD
    });
    return;
  }
  return await proveTesto(chat);
}
async function proveTesto(chat) {
  const { data: pa } = await sb.from(T_PA).select("ciclo_id, tx_hash, verificato_at").eq("tipo", "fee").not("tx_hash", "is", null).order("verificato_at", {
    ascending: false
  }).limit(4);
  const ids = (pa ?? []).map((x)=>x.ciclo_id).filter(Boolean);
  if (!ids.length) {
    await send(chat, "I risultati arrivano a breve.", {
      reply_markup: KB_LEAD
    });
    return;
  }
  const { data: ci } = await sb.from(T_CI).select("id, saldo_ini_a, profitto_eur, fee_eur, chiuso_il, avviato_il, utente_id").in("id", ids);
  const { data: ut } = await sb.from(T_UT).select("id, codice");
  const cod = Object.fromEntries((ut ?? []).map((x)=>[
      x.id,
      x.codice
    ]));
  const byId = Object.fromEntries((ci ?? []).map((x)=>[
      x.id,
      x
    ]));
  let m = "🔍 <b>RISULTATI REALI</b>\n━━━━━━━━━━━━━━\n\nCicli <b>chiusi e pagati</b> negli ultimi giorni. Numeri veri, senza nomi.\n";
  let n = 0;
  for (const p of pa ?? []){
    const c = byId[p.ciclo_id];
    if (!c) continue;
    n++;
    const netto = Number(c.profitto_eur ?? 0) - Number(c.fee_eur ?? 0);
    const dur = c.avviato_il && c.chiuso_il ? durata(new Date(c.chiuso_il).getTime() - new Date(c.avviato_il).getTime()) : null;
    m += "\n<b>" + (cod[c.utente_id] ?? "—") + "</b> · " + dataIt(c.chiuso_il) + "\n";
    m += "capitale " + eurI(c.saldo_ini_a ?? 0) + " → netto <b>" + eur(netto) + "</b>" + (dur && dur !== "0h" ? " in " + dur : "") + "\n";
    m += "✅ <i>commissione pagata e verificata</i>\n";
  }
  if (!n) {
    await send(chat, "I risultati arrivano a breve.", {
      reply_markup: KB_LEAD
    });
    return;
  }
  m += "\n━━━━━━━━━━━━━━\n<i>Ogni commissione è tracciata sulla blockchain. Da cliente vedi i tuoi pagamenti verificabili uno per uno.</i>";
  await send(chat, m, {
    reply_markup: KB_LEAD
  });
}
async function funnel(chat, l, testo) {
  const t = pulisci(String(testo ?? ""));
  if (t === "via" || t === "/start" || t.startsWith("/start")) {
    await sb.from("bvb_lead").update({
      stato: "aperto"
    }).eq("id", l.id);
    const nome = String(l.nome ?? "").split(" ")[0];
    let m = nome ? "Ciao <b>" + nome + "</b>, grazie dell'interesse.\n\n" : "Ciao, grazie dell'interesse.\n\n";
    m += "<b>BROKER VS BROKER</b>\n━━━━━━━━━━━━━━\n\n";
    m += "Si opera su <b>due broker insieme</b>: <b>buy</b> su uno, <b>sell</b> sull'altro.\n\n";
    m += "Quello che perde un conto lo guadagna l'altro. <b>Il mercato non conta.</b>\n\n";
    m += "Il guadagno arriva dal <b>bonus tradabile</b> del broker e dallo <b>swap</b> che matura ogni notte.\n\n";
    m += "I conti sono tuoi e i soldi restano lì.\n\n";
    m += "<i>In cinque punti ti spiego tutto: due minuti.</i>";
    return;
  }
  if (t === "Come funziona") return await punto(chat, 0);
  if (t === "Risultati" || t === "Le prove") return await proveReali(chat);
  if (t === "Voglio iniziare") return await chiediCapitale(chat, l);
  if (l.stato === "nome" && t.length > 2) {
    if (t.split(/\s+/).filter(Boolean).length < 2) {
      await send(chat, "Scrivi <b>nome e cognome</b>.");
      return;
    }
    await sb.from("bvb_lead").update({
      nome: t,
      stato: "pronto"
    }).eq("id", l.id);
    const fresco = {
      ...l,
      nome: t
    };
    await send(chat, "✅ <b>Grazie " + t.split(/\s+/)[0] + ".</b>\n\nTi ricontattiamo a breve per aprire i conti e partire.\n\n<i>Nel frattempo, se hai domande scrivi pure qui.</i>");
    await avvisaNuovoLead(fresco);
    return;
  }
  await send(chat, "Da qui puoi partire quando vuoi.", {
    reply_markup: KB_LEAD
  });
}
async function punto(chat, i) {
  const p = PUNTI[i];
  if (!p) return await chiediCapitale(chat, await lead(chat, null, null));
  const ultimo = i === PUNTI.length - 1;
  const kb = ultimo ? [
    [
      {
        text: "✅ Voglio iniziare",
        callback_data: "fn:cap"
      }
    ],
    [
      {
        text: "🔍 Vedi i risultati",
        callback_data: "fn:prove"
      }
    ]
  ] : [
    [
      {
        text: "Avanti · " + (i + 2) + " di " + PUNTI.length,
        callback_data: "fn:p" + (i + 1)
      }
    ]
  ];
  await send(chat, "<b>" + p[0] + "</b>\n━━━━━━━━━━━━━━\n\n" + p[1], {
    reply_markup: {
      inline_keyboard: kb
    }
  });
}
async function chiediCapitale(chat, l) {
  await sb.from("bvb_lead").update({
    stato: "capitale"
  }).eq("id", l.id);
  const n1 = String(l.nome ?? "").split(" ")[0];
  await send(chat, (n1 ? "Bene <b>" + n1 + "</b>, tre domande veloci.\n\n" : "Tre domande veloci.\n\n") + "💰 <b>Il capitale</b>\n\nQuanto puoi mettere sui due conti?\n<i>Resta tuo, sui tuoi conti.</i>", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Meno di 2.000 €",
            callback_data: "fn:c:sotto"
          }
        ],
        [
          {
            text: "2.000 – 5.000 €",
            callback_data: "fn:c:2-5"
          }
        ],
        [
          {
            text: "5.000 – 10.000 €",
            callback_data: "fn:c:5-10"
          }
        ],
        [
          {
            text: "Oltre 10.000 €",
            callback_data: "fn:c:10+"
          }
        ]
      ]
    }
  });
}
async function chiediEsperienza(chat, l) {
  await sb.from("bvb_lead").update({
    stato: "esperienza"
  }).eq("id", l.id);
  await send(chat, "📊 <b>L'esperienza</b>\n\nHai già avuto a che fare col trading?", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Mai fatto niente",
            callback_data: "fn:e:zero"
          }
        ],
        [
          {
            text: "Ho provato qualcosa",
            callback_data: "fn:e:poco"
          }
        ],
        [
          {
            text: "Opero già",
            callback_data: "fn:e:si"
          }
        ]
      ]
    }
  });
}
async function listaLead(chat) {
  const { data: ls } = await sb.from("bvb_lead").select("*, p:partner_id(nome)").neq("stato", "attivato").order("creato_il", {
    ascending: false
  }).limit(20);
  if (!ls?.length) {
    await send(chat, "🎯 <b>CONTATTI</b>\n\nNessuno in attesa.", {
      reply_markup: KB_ADMIN
    });
    return;
  }
  const pronti = ls.filter((x)=>x.stato === "pronto").length;
  await send(chat, "🎯 <b>CONTATTI</b> · " + ls.length + " in lista" + (pronti ? " · <b>" + pronti + " pronti</b>" : ""), {
    reply_markup: KB_ADMIN
  });
  for (const l of ls){
    const m = "<b>" + (l.nome ?? "—") + "</b>" + (l.username ? " · " + l.username : "") + "\n💰 " + (l.capitale ?? "—") + "\n📊 " + (l.esperienza ?? "—") + (l.p?.nome ? "\n🤝 " + l.p.nome : "\n👤 diretto") + "\n<i>" + dataIt(l.creato_il) + " · " + l.stato + "</i>";
    await send(chat, m, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "✅ Attiva cliente",
              callback_data: "ld:ok:" + l.telegram_id
            }
          ],
          [
            {
              text: "💬 Scrivigli",
              url: "tg://user?id=" + l.telegram_id
            },
            {
              text: "🗑 Scarta",
              callback_data: "ld:no:" + l.telegram_id
            }
          ]
        ]
      }
    });
  }
}
async function attivaLead(chat, tgId, chiId) {
  const { data: l } = await sb.from("bvb_lead").select("*").eq("telegram_id", Number(tgId)).maybeSingle();
  if (!l) {
    await send(chat, "Contatto non trovato.");
    return;
  }
  if (l.utente_id) {
    await send(chat, "Questo contatto è già stato attivato.");
    return;
  }
  let p = null;
  if (l.partner_id) {
    const { data } = await sb.from(T_PT).select("*").eq("id", l.partner_id).maybeSingle();
    p = data;
  }
  const cod = await prossimoCodice(p);
  const riga = {
    codice: cod,
    nome: l.nome ?? "Cliente",
    telegram_id: l.telegram_id
  };
  if (p) {
    riga.creato_da = p.id;
    riga.fee_percent = 50;
    if (p.tipo === "fornitore") riga.fornitore_id = p.id;
    else {
      let { data: a } = await sb.from("bvb_affiliati").select("id").ilike("nome", p.nome).maybeSingle();
      if (!a) {
        const rr = await sb.from("bvb_affiliati").insert({
          nome: p.nome,
          comando: p.nome.toLowerCase().replace(/\s+/g, ""),
          percentuale: p.percentuale,
          wallet_fee: p.wallet_fee,
          attivo: true
        }).select().single();
        a = rr.data;
      }
      riga.affiliato_id = a?.id ?? null;
    }
  }
  const { data: u, error } = await sb.from(T_UT).insert(riga).select().single();
  if (error) {
    await send(chat, "❌ " + error.message);
    return;
  }
  await sb.from("bvb_lead").update({
    stato: "attivato",
    utente_id: u.id
  }).eq("id", l.id);
  await send(Number(tgId), "🎉 <b>Sei dentro, " + String(l.nome ?? "").split(" ")[0] + "</b>\n━━━━━━━━━━━━━━\n\nIl tuo codice è <b>" + cod + "</b>.\n\nTra poco ti aggiungiamo al tuo gruppo dedicato: da lì apri i conti, avvii i cicli e vedi i guadagni.\n\n<i>A breve ti scriviamo.</i>");
  let m = "✅ <b>" + cod + " · " + (l.nome ?? "") + " attivato</b>\n━━━━━━━━━━━━━━\n\n";
  m += "<b>Ora crea i due gruppi:</b>\n· <code>" + cod + " · " + (l.nome ?? "") + "</code> — col cliente\n· <code>" + cod + " · Fornitori</code> — coi fornitori\n\n";
  m += "Metti <b>@cashly_bvb_bot</b> in entrambi e rendilo amministratore.\nPoi ti chiedo io che gruppo è e scegli <b>" + cod + "</b> dalla lista.\n\n";
  m += "<i>Invita il cliente al gruppo: lo trovi come " + (l.username ?? "id " + l.telegram_id) + "</i>";
  await send(chat, m);
  if (String(chat) !== String((await sb.from(T_AD).select("telegram_user_id").limit(1).maybeSingle()).data?.telegram_user_id ?? "")) await adAvvisa("✅ <b>" + cod + " · " + (l.nome ?? "") + "</b> attivato" + (p ? " · rete " + p.nome : ""));
}
async function avvisaNuovoLead(l) {
  let rete = null;
  if (l.partner_id) {
    const { data } = await sb.from(T_PT).select("*").eq("id", l.partner_id).maybeSingle();
    rete = data;
  }
  const m = "🎯 <b>NUOVO CONTATTO</b>\n━━━━━━━━━━━━━━\n\n<b>" + (l.nome ?? "—") + "</b>" + (l.username ? " · " + l.username : "") + "\n💰 " + (l.capitale ?? "—") + "\n📊 " + (l.esperienza ?? "—") + (rete ? "\n🤝 rete <b>" + rete.nome + "</b>" : l.note ? "\n📍 da <b>" + l.note + "</b>" : "\n👤 diretto") + "\n\n<code>" + l.telegram_id + "</code>";
  const kb = {
    inline_keyboard: [
      [
        {
          text: "✅ Attiva cliente",
          callback_data: "ld:ok:" + String(l.telegram_id)
        }
      ],
      [
        {
          text: "💬 Scrivigli",
          url: "tg://user?id=" + l.telegram_id
        },
        {
          text: "🗑 Scarta",
          callback_data: "ld:no:" + String(l.telegram_id)
        }
      ]
    ]
  };
  if (rete) {
    const { data: adm } = await sb.from(T_PA_ADM).select("telegram_id").eq("partner_id", rete.id).eq("attivo", true);
    for (const a of adm ?? [])if (a.telegram_id) await send(a.telegram_id, m, {
      reply_markup: kb
    });
    if (rete.telegram_id) await send(rete.telegram_id, m, {
      reply_markup: kb
    });
  }
  await adAvvisa(m, {
    reply_markup: kb
  });
}
// ═══════════════════════════ ISCRIZIONE ═══════════════════════════
const KB_ISCR = kbBase([
  [
    {
      text: "▶️ Continua"
    }
  ],
  [
    {
      text: "📚 Guida"
    },
    AGG
  ]
]);
const DISCLAIMER = ` <b>CONDIZIONI DEL SERVIZIO</b>

Leggere con attenzione prima di procedere.

Cashly è uno strumento di condivisione e fa da tramite per il servizio in affiliazione: non gestisce capitali, non esegue operazioni e non è titolare del servizio.

<b>Il capitale resta al titolare.</b> I conti sono intestati al cliente e restano nella sua piena disponibilità, compresi accessi e prelievi.

<b>Nessuna garanzia di risultato.</b> La strategia riduce l'esposizione al mercato ma non elimina i rischi: spread, errori umani, imprevisti tecnici e variazioni delle condizioni applicate dai broker possono ridurre o azzerare il profitto di un ciclo.

Il rendimento varia da ciclo a ciclo.

<b>Commissione: 50% del profitto netto</b>, dovuta solo sui cicli chiusi in guadagno. In assenza di profitto non è dovuta alcuna commissione.

<b>VPS e gestione: 25 € al mese</b> (circa 28 USDT) per ogni coppia di conti, con scadenza il 21. Copre il server sincronizzato e l'assistenza operativa.

<b>Nessun vincolo di durata.</b> È possibile interrompere in qualsiasi momento e ritirare il capitale.

<b>Nessuna consulenza finanziaria.</b> Non vengono fornite raccomandazioni personalizzate né consulenza in materia di investimenti. Ogni decisione sul proprio capitale resta di esclusiva competenza del cliente.

Proseguendo si dichiara di aver letto e compreso quanto sopra.`;
async function avviaIscrizione(chat, u) {
  await setStato(chat, null, {});
  await send(chat, "<b>Benvenuto " + u.nome.split(" ")[0] + "</b>\n\nCon questo bot Cashly gestirai i cicli del servizio <b>Broker vs Broker</b>.\n\nPrima di partire ci sono tre passaggi:\n\n<b>1.</b> Le condizioni del servizio\n<b>2.</b> L'apertura dei due conti broker\n<b>3.</b> L'attivazione della VPS e gestione mensile\n\nCi vogliono una ventina di minuti in tutto.", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Cominciamo",
            callback_data: "i:disc"
          }
        ]
      ]
    }
  });
}
async function mostraDisclaimer(chat) {
  await send(chat, DISCLAIMER, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Accetto e proseguo",
            callback_data: "i:disc_ok"
          }
        ],
        [
          {
            text: "Non accetto",
            callback_data: "i:disc_no"
          }
        ]
      ]
    }
  });
}
const STEP_BROKER = {
  tfx_intro: {
    t: "<b>PASSO 1 · TOTAL FX</b>\n\nÈ il conto dove arriverà il <b>bonus del 30%</b>. Apri il conto da questo link — è importante usare proprio questo, altrimenti il bonus non viene riconosciuto.\n\n{LINK}\n\nQuando hai finito la registrazione e hai i dati di accesso, premi Avanti.",
    btn: "Conto aperto",
    next: "tfx_dati"
  },
  rbx_intro: {
    t: "<b>STEP 2 · APRI CONTO ROBOFOREX</b>\n\n{LINK}\n\nCodice affiliato: <code>krozt</code>\n\n━━━━━━━━━━━━━━\n<b>CARATTERISTICHE DEL CONTO</b>\n\n Tipo: <b>MT5 PRO</b>\n Leva: <b>1:2000</b>\n <b>Swap Free</b>\n <b>Hedging System</b>\n Valuta: <b>EUR</b>\n\n━━━━━━━━━━━━━━\nSu Roboforex <b>puoi depositare subito in USDT</b> la tua metà del capitale.\n\nQuando hai i dati di accesso premi il bottone.",
    btn: "Conto aperto",
    next: "rbx_dati"
  }
};
const CAMPI_BROKER = [
  {
    k: "email",
    d: "<b>Email</b> con cui hai registrato il conto?"
  },
  {
    k: "conto",
    d: "<b>Numero di conto</b>?\n<i>Lo trovi nella mail di conferma del broker.</i>"
  },
  {
    k: "pass",
    d: "<b>Password</b> del conto?\n<i>Serve ai fornitori per collegare il sistema.</i>"
  },
  {
    k: "server",
    d: "<b>Server</b>?\n<i>Es. OnamTrading-Live oppure RoboForex-Pro</i>"
  }
];
async function chiediCampo(chat, broker, i, dati) {
  const c = CAMPI_BROKER[i];
  await setStato(chat, "br_" + broker + "_" + i, dati);
  const NB = {
    tfx: "TOTAL FX",
    rbx: "ROBOFOREX",
    mnx: "MONAXA"
  };
  await send(chat, "<b>" + (NB[broker] ?? broker.toUpperCase()) + "</b> · " + (i + 1) + " di 4\n\n" + c.d, {
    reply_markup: KB_ANNULLA
  });
}
async function riepilogoBroker(chat, u, broker, dati) {
  const p = broker;
  const nome = {
    tfx: "TOTAL FX",
    rbx: "ROBOFOREX",
    mnx: "MONAXA"
  }[broker] ?? broker.toUpperCase();
  let m = "<b>" + nome + " · controlla</b>\n\n";
  m += " " + (dati[p + "_email"] ?? "—") + "\n" + (dati[p + "_conto"] ?? "—") + "\n" + (dati[p + "_pass"] ?? "—") + "\n" + (dati[p + "_server"] ?? "—");
  await setStato(chat, "br_" + broker + "_ok", dati);
  await send(chat, m, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Confermo, invia",
            callback_data: "i:br_ok:" + broker
          }
        ],
        [
          {
            text: "Modifica",
            callback_data: "i:br_re:" + broker
          }
        ]
      ]
    }
  });
}
function prossimoGiorno(g, da = new Date()) {
  const d = new Date(da.getFullYear(), da.getMonth(), g, 12, 0, 0);
  if (d <= da) d.setMonth(d.getMonth() + 1);
  return d;
}
async function vpsDovuto(u) {
  const eurMese = parseFloat(await imp("vps_eur", "25"));
  const giorno = parseInt(await imp("vps_giorno", "21"), 10);
  const ciclo = parseInt(await imp("vps_giorni_ciclo", "30"), 10);
  const trim = parseFloat(await imp("vps_trim_usdt", "84"));
  const cb1 = await cambio();
  const oggi = new Date();
  const prossimo = prossimoGiorno(giorno, oggi);
  // mai pagato: quota piena, copre 30 giorni · la scadenza si aggancia al giorno fisso
  if (!u.vps_copre_fino) {
    const trenta = new Date(oggi.getTime() + ciclo * 86400000);
    const fino = prossimoGiorno(giorno, trenta) > trenta ? prossimoGiorno(giorno, new Date(trenta.getTime() - 86400000)) : trenta;
    return {
      tipo: "pieno",
      eur: eurMese,
      usdt: Math.round(eurMese * cb1 * 100) / 100,
      fino,
      copreReale: trenta,
      trim,
      giorni: ciclo,
      prossimo
    };
  }
  const copre = new Date(u.vps_copre_fino + "T12:00:00");
  // copertura ancora oltre il prossimo 21: nulla da pagare
  if (copre >= prossimo) return {
    tipo: "coperto",
    eur: 0,
    usdt: 0,
    fino: copre,
    trim,
    giorni: 0,
    prossimo
  };
  // riallineamento: pago solo i giorni scoperti fino al prossimo 21
  const scoperti = Math.max(1, Math.ceil((prossimo - copre) / 86400000));
  if (scoperti < ciclo) {
    const q = Math.round(eurMese / ciclo * scoperti * 100) / 100;
    return {
      tipo: "riallineo",
      eur: q,
      usdt: Math.round(q * cb1 * 100) / 100,
      fino: prossimo,
      trim,
      giorni: scoperti,
      prossimo,
      alGiorno: Math.round(eurMese / ciclo * 100) / 100
    };
  }
  return {
    tipo: "mensile",
    eur: eurMese,
    usdt: Math.round(eurMese * cb1 * 100) / 100,
    fino: prossimo,
    trim,
    giorni: scoperti,
    prossimo
  };
}
async function passoMonaxa(chat, u) {
  const { data: br } = await sb.from(T_BR).select("*").eq("slug", "mnx").maybeSingle();
  if (!br || !br.attivo) return await chiediVps(chat, u);
  await apriAttesa(u, "setup conto " + br.nome).catch(()=>{});
  await chiudiAttesa(u.id);
  await send(chat, "<b>STEP 3 · APRI CONTO " + br.nome.toUpperCase() + "</b>\n\n" + (br.link_iscrizione ?? ""));
  await send(chat, "<b>CARATTERISTICHE DEL CONTO</b>\n\n" + (br.istruzioni ?? "Conto MT5 STANDARD · leva 1:500 · valuta EUR").split(" · ").map((x)=>"<b>" + x + "</b>").join("\n") + "\n\nServe per i cicli che giriamo su " + br.nome + " al posto di Roboforex.\nCompleta la verifica dei documenti e tieni il conto pronto.");
  await send(chat, "Quando hai i dati di accesso premi il bottone.", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Ho i dati del conto",
            callback_data: "i:mnx_dati"
          }
        ],
        [
          {
            text: "Lo apro dopo",
            callback_data: "i:mnx_skip"
          }
        ]
      ]
    }
  });
  return;
}
async function chiediVps(chat, u) {
  const w = await imp("wallet_vps", await imp("wallet_usdt", ""));
  const d = await vpsDovuto(u);
  const giorno = await imp("vps_giorno", "21");
  await setStato(chat, "vps_attesa", {
    importo: d.usdt,
    tipo: d.tipo
  });
  let m = "<b>VPS E GESTIONE</b>\n\n";
  if (d.tipo === "riallineo") {
    m += "La copertura arriva al <b>" + dataIt(u.vps_copre_fino) + "</b>.\nRestano <b>" + d.giorni + " giorni</b> fino al prossimo " + giorno + ".\n\n" + eur(d.alGiorno) + " al giorno × " + d.giorni + " giorni\n<b>= " + eur(d.eur) + "</b> ≈ <b>" + usdt(d.usdt) + "</b>\n\n";
  } else {
    m += "<b>" + eur(d.eur) + " al mese</b> ≈ " + usdt(d.usdt) + "\nper ogni coppia di conti\n\n";
  }
  m += "Scadenza fissa: <b>il " + giorno + " di ogni mese</b>.\nTrimestrale: <b>" + usdt(d.trim) + "</b> per 3 mesi.\n\nSolo rete <b>BEP20 (BSC)</b>. Su altre reti i fondi si perdono.";
  await send(chat, m);
  await send(chat, "<code>" + w + "</code>", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Ho pagato",
            callback_data: "i:vps_pag"
          }
        ]
      ]
    }
  });
}
