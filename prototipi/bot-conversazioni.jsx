import React, { useState, useRef, useEffect } from "react";

const T = {
  bg: "#0E1621", head: "#17212B", bubIn: "#182533", bubOut: "#2B5278",
  txt: "#E9EDF0", mut: "#7D8E9C", line: "#0B131B", kb: "#1B2836", kbTxt: "#E9EDF0",
  accent: "#0d9e88", link: "#62A0D6"
};

const RUOLI = {
  admin:   { nome: "Antonio (tu)",  sub: "amministratore" },
  cliente: { nome: "Mario R.", sub: "cliente, chat privata" },
  hub: { nome: "Cashly", sub: "chiede di entrare nell\'HUB" },
  nuovo: { nome: "Cashly BvB", sub: "contatto nuovo dal link" },
  fornitore: { nome: "Marco · fornitore", sub: "area personale" },
  affiliato: { nome: "EdgeFunds", sub: "area affiliato" },
  ignoto:  { nome: "Luca Bianchi",  sub: "non registrato" },
  gruppo:  { nome: "C4 · Mario Rossi", sub: "gruppo cliente" },
  forn:    { nome: "C4 · Fornitori", sub: "gruppo fornitori" }
};

function bolla(testo, kb) { return { testo, kb }; }

const SCENE = {
  admin: {
    msgs: [{ da: "bot", t: "🚪 <b>Richiesta di ingresso</b>\n<b>Luca Bianchi</b> · @lucab\n<code>7719340221</code>", inline: [["✅ Approva"], ["🚫 Rifiuta"]] },
      { da: "bot", t: "<b>CASHLY BvB · ADMIN</b>" }],
    kb: [["📊 Report", "👥 Clienti"], ["🤝 Affiliati", "📢 Comunicazioni"], ["🔄 Aggiorna"]],
    risposte: {
      "📊 Report": [{ da: "bot", t: "📊 <b>REPORT</b>\n\nQuale vuoi?", inline: [["🌍 Globale"], ["👤 Solo miei diretti"], ["🤝 EdgeFunds"]] }],
      "👥 Clienti": [{ da: "bot", t: "👥 <b>CLIENTI</b>\n\n✅ <b>C1</b> Antonio Mazzone\n🟢 <b>C2</b> Daniele Giagnorio · € 6.000\n   <i>avvio del ciclo</i>\n✍️ <b>C3</b> Simone Bertozzi" }],
      "🤝 Affiliati": [{ da: "bot", t: "🤝 <b>AFFILIATI</b>\n\n<b>EdgeFunds</b> · 11% del profitto\n<code>0x60f51a2F…52A03C9F35</code>\n C4 · Mario Rossi\n\n<b>Diretti</b>\n C1 · Antonio Mazzone\n C2 · Daniele Giagnorio" }],
      "📢 Comunicazioni": [{ da: "bot", t: "📢 <b>COMUNICAZIONI</b>\n\nA chi la mando?", inline: [["🌍 Tutti i clienti · 3"], ["👤 Solo miei diretti"], ["🎯 Un cliente solo"], ["👀 Chi ha letto"], ["❌ Annulla"]] }],
      "🔄 Aggiorna": [
        { da: "bot", t: "<b>CASHLY BvB · ADMIN</b>" },
        { da: "bot", t: "⏳ <b>C2 · Daniele Giagnorio</b>\n<i>avvio del ciclo · da 42m</i>", inline: [["Trade in corso"], ["🤝 Gruppo fornitori", "👤 Gruppo cliente"]] }
      ]
    }
  },
  cliente: {
    msgs: [{ da: "bot", t: "📊 <b>LA TUA DASHBOARD</b>\n\nGuadagni, andamento dei cicli e storico completo.", inline: [["Apri dashboard"], ["Ultimo ciclo"]] }],
    kb: null,
    menu: "Dashboard",
    risposte: {}
  },
  hub: {
    msgs: [{ da: "sys", t: "Luca trova il gruppo <b>HUB Cashly</b> e preme <b>Richiedi di entrare</b>" },
      { da: "sys", t: "→ Telegram avvisa il bot · Luca non ha ancora scritto nulla" },
      { da: "bot", t: "Ciao Luca, hai chiesto di entrare in <b>HUB Cashly</b>.\n\nDentro trovi <b>38 servizi analizzati</b> per guadagnare online: cosa funziona davvero, quanto costa e cosa non ti dicono.\n\nTi apro la porta subito. Intanto dimmi una cosa, così ti indico da dove partire:", inline: [["💰 Ho capitale da far lavorare"], ["🚀 Parto da zero"], ["👀 Sto solo guardando"]] },
      { da: "sys", t: "→ Intanto a te arriva la richiesta da approvare" }],
    kb: null,
    nota: "Il bot può scrivergli in privato <b>solo</b> perché ha chiesto di entrare: è l'unica finestra che Telegram concede.",
    risposte: {}
  },
  nuovo: {
    msgs: [{ da: "sys", t: "Luca apre <b>t.me/cashly_bvb_bot?start=r_edgefunds</b> e preme <b>AVVIA</b>" }],
    kb: [["▶️ AVVIA"]],
    nota: "Il percorso di un contatto nuovo, dal primo tocco all'attivazione.",
    risposte: {
      "▶️ AVVIA": [{ da: "me", t: "/start r_edgefunds" },
        { da: "bot", t: "<b>BROKER VS BROKER</b>\n━━━━━━━━━━━━━━\n\nUn sistema di <b>hedging</b> tra due broker: si aprono due posizioni opposte sullo stesso asset. Il mercato non conta e il capitale resta fermo.\n\nIl guadagno arriva dal <b>bonus del 30%</b> sul deposito e dallo swap positivo.\n\nI conti sono <b>tuoi</b>, intestati a te: nessuno tocca i tuoi soldi.", kb: [["📘 Come funziona", "🔍 Risultati"], ["✅ Voglio iniziare"]] }],
      "📘 Come funziona": [{ da: "bot", t: "<b>COME FUNZIONA</b>\n━━━━━━━━━━━━━━\n\n<b>1 · I due conti</b>\nApri due conti a tuo nome su due broker diversi e li finanzi tu. Restano tuoi, con le tue credenziali.\n\n<b>2 · Il ciclo</b>\nSui due conti vengono aperte posizioni opposte. Quello che perdi da una parte lo recuperi dall'altra.\n\n<b>3 · Il profitto</b>\nArriva dal bonus del 30% e dallo swap. Un ciclo dura in media <b>uno o due giorni</b>.\n\n<b>4 · Le commissioni</b>\nSi pagano <b>solo sul profitto</b>, a ciclo chiuso. Se non guadagni, non paghi.", inline: [["Ho capito, andiamo avanti"]] }],
      "🔍 Risultati": [{ da: "bot", t: "🔍 <b>RISULTATI REALI</b>\n━━━━━━━━━━━━━━\n\nCicli <b>chiusi e pagati</b>. Numeri veri, nessun nome." },
        { da: "bot", t: "🖼 <i>[foto dei certificati]</i>" },
        { da: "bot", t: "<i>Ogni commissione è tracciata sulla blockchain. Da cliente vedi i tuoi pagamenti verificabili uno per uno.</i>" }],
      "✅ Voglio iniziare": [{ da: "bot", t: "💰 <b>Il capitale</b>\n\nQuanto puoi mettere sui due conti?\n<i>Resta tuo, sui tuoi conti.</i>", inline: [["Meno di 2.000 €"], ["2.000 – 5.000 €"], ["5.000 – 10.000 €"], ["Oltre 10.000 €"]] }]
    }
  },
  fornitore: {
    msgs: [
      { da: "bot", t: "<b>MARCO</b>\n<i>area fornitore · 2 clienti</i>" },
      { da: "bot", t: "⏳ <b>C7 · Luca Verdi</b>\n<i>avvio del ciclo · da 18m</i>", inline: [["Trade in corso"]] }
    ],
    kb: [["📊 Report", "👥 I miei clienti"], ["🔄 Aggiorna"]],
    risposte: {
      "👥 I miei clienti": [{ da: "bot", t: "👥 <b>I MIEI CLIENTI</b>\n\n🟢 <b>C7</b> Luca Verdi · € 4.000\n   <i>avvio del ciclo</i>\n\n✅ <b>C9</b> Sara Neri\n" }],
      "📊 Report": [{ da: "bot", t: "📊 <b>REPORT · Questo mese</b>\n━━━━━━━━━━━━━━\n\n🔁 Cicli chiusi <b>6</b>\n💰 <b>Spettante 812,40 USDT</b>\n\n━━━━━━━━━━━━━━\n<b>DETTAGLIO</b>\n\n<b>C7 · Luca Verdi</b>\n19/08/2026 · 145,60 USDT\n\n<b>C9 · Sara Neri</b>\n21/08/2026 · 198,10 USDT", inline: [["Oggi", "Settimana"], ["Mese", "Tutto"]] }],
      "🔄 Aggiorna": [
        { da: "bot", t: "<b>MARCO</b>\n<i>area fornitore · 2 clienti</i>" },
        { da: "bot", t: "⏳ <b>C7 · Luca Verdi</b>\n<i>avvio del ciclo · da 18m</i>", inline: [["Trade in corso"]] }
      ]
    },
    nota: "Il fornitore vede <b>solo i suoi clienti</b> e la <b>sua quota</b>. Non ha accesso a report globali, affiliati o comunicazioni."
  },
  affiliato: {
    msgs: [{ da: "bot", t: "<b>EDGEFUNDS</b>\n<i>area affiliato · 1 cliente</i>" }],
    kb: [["📊 Report", "👥 I miei clienti"], ["🔄 Aggiorna"]],
    risposte: {
      "👥 I miei clienti": [{ da: "bot", t: "👥 <b>I MIEI CLIENTI</b>\n\n✅ <b>C4</b> Mario Rossi\n" }],
      "📊 Report": [{ da: "bot", t: "📊 <b>REPORT · Questo mese</b>\n━━━━━━━━━━━━━━\n\n🔁 Cicli chiusi <b>3</b>\n💰 <b>Spettante 112,80 USDT</b>\n\n━━━━━━━━━━━━━━\n<b>DETTAGLIO</b>\n\n<b>C4 · Mario Rossi</b>\n20/08/2026 · 41,20 USDT", inline: [["Oggi", "Settimana"], ["Mese", "Tutto"]] }],
      "🔄 Aggiorna": [{ da: "bot", t: "<b>EDGEFUNDS</b>\n<i>area affiliato · 1 cliente</i>" }]
    },
    nota: "L'affiliato vede i suoi clienti e la sua quota, ma <b>non conferma</b> le richieste operative."
  },
  ignoto: {
    msgs: [{ da: "bot", t: "<b>Cashly · Broker vs Broker</b>\n\nIl percorso di attivazione arriva a breve.\n\nNel frattempo scrivi allo staff se hai domande." }],
    kb: null,
    risposte: {}
  },
  gruppo: {
    msgs: [{ da: "bot", t: "✅ <b>Pronto per un nuovo ciclo</b>" }],
    kb: [["🚀 Inizia nuovo ciclo"], ["📊 Dashboard", "⚙️ Impostazioni"], ["📚 Guida", "🔄 Aggiorna"]],
    risposte: {
      "🚀 Inizia nuovo ciclo": [{ da: "bot", t: "Manda uno <b>screenshot</b> che mostri i saldi dei due conti.\n<i>Serve ai fornitori per verificare che siano bilanciati.</i>" }],
      "📊 Dashboard": [{ da: "bot", t: "📊 <b>LA TUA DASHBOARD</b>\n\nProfitto accumulato, andamento dei cicli e registro completo.", inline: [["Apri dashboard"]] }],
      "⚙️ Impostazioni": [{ da: "bot", t: "⚙️ <b>IMPOSTAZIONI</b>", kb: [["💳 Pagamenti fee"], ["🖥 Gestione VPS"], ["⚙️ Conti broker"], ["📥 Carica storico"], ["⬅️ Indietro"]] }],
      "💳 Pagamenti fee": [{ da: "bot", t: "💳 <b>PAGAMENTI FEE</b>\n━━━━━━━━━━━━━━\n\n<b>Ciclo #13</b> · 21/08/2026\nProfitto € 342,00\nFee <b>€ 171,00</b> = <b>199,95 USDT</b>\n<u>✅ Verifica su BscScan</u>\n\n━━━━━━━━━━━━━━\n📊 <b>Totale versato</b>\n€ 658,50 = <b>770,00 USDT</b>" }],
      "🖥 Gestione VPS": [{ da: "bot", t: "🖥 <b>GESTIONE VPS</b>\n━━━━━━━━━━━━━━\n\nStato <b>🟢 attivo</b>\nCoperto fino al <b>19/09/2026</b>\n⏳ Mancano <b>29 giorni</b>\n\n━━━━━━━━━━━━━━\n💰 <b>€ 25,00 al mese</b> per coppia di conti\n📅 Scadenza fissa il <b>21</b> di ogni mese\n💡 Trimestrale <b>84,00 USDT</b> per 3 mesi\n\n✅ Nessun pagamento in sospeso." }],
      "⚙️ Conti broker": [{ da: "bot", t: "⚙️ <b>I TUOI CONTI</b>\n━━━━━━━━━━━━━━\n\n💼 <b>TOTAL FX</b>\nConto <code>5008233</code>\nPassword <code>Pass1!</code>\nServer <code>OnamTrading-Live</code>\n\n💼 <b>ROBOFOREX</b>\nConto <code>27447042</code>\nPassword <code>Pass2!</code>\nServer <code>RoboForex-Pro</code>", inline: [["✏️ Modifica Total FX"], ["✏️ Modifica Roboforex"]] }],
      "📥 Carica storico": [{ da: "bot", t: "📥 <b>CARICA LO STORICO</b>\n\nSe hai già fatto cicli prima di entrare qui, caricali: le statistiche partiranno complete.\n\nPuoi inserirli <b>uno alla volta</b> oppure caricarli <b>tutti insieme</b>.", inline: [["✍️ Uno alla volta"], ["📄 Tutti insieme"]] }],
      "📚 Guida": [{ da: "bot", t: "📚 <b>GUIDA</b>\n\nTutto quello che serve sapere, in due minuti.", kb: [["📘 La strategia"], ["🔄 Come si gestisce un ciclo"], ["⬅️ Indietro"]] }],
      "📘 La strategia": [{ da: "bot", t: "<b>LA STRATEGIA · 1/3</b>\n\nDue conti su due broker diversi. <b>Buy e sell sullo stesso asset</b>, stessa entrata, stesso importo.\n\nQuello che perdi da una parte lo guadagni dall'altra: il capitale non si muove e il mercato non conta.\n\nIl profitto arriva da altro: <b>il bonus del 30%</b> di Total FX.", inline: [["Avanti ➡️"]] }],
      "⬅️ Indietro": [{ da: "bot", t: "✅ <b>Pronto per un nuovo ciclo</b>", kb: [["🚀 Inizia nuovo ciclo"], ["📊 Dashboard", "⚙️ Impostazioni"], ["📚 Guida", "🔄 Aggiorna"]] }],
      "🔄 Aggiorna": [{ da: "bot", t: "🔄 ✅ <b>Pronto per un nuovo ciclo</b>" },
        { da: "bot", t: "📢 <b>COMUNICAZIONE</b>\n━━━━━━━━━━━━━━\n\nDa settembre la fee VPS passa al <b>21 di ogni mese</b>.", inline: [["👀 Ho letto"]] }]
    }
  },
  forn: {
    msgs: [
      { da: "bot", t: "📎 <i>[screenshot dei due conti]</i>" },
      { da: "bot", t: "<b>CONTI BILANCIATI. PRONTO A PARTIRE</b>" },
      { da: "bot", t: "@cryptoX_25 @tonyj10x" }
    ],
    kb: null,
    nota: "Nel gruppo fornitori il bot non ha tastiera: rispondono scrivendo <b>in corso</b> oppure <b>ok</b>.",
    risposte: {}
  }
};

const CICLI = [
  { n: 1, d: "28/07", cap: 2000, lordo: 115, netto: 57.5 },
  { n: 2, d: "28/07", cap: 2000, lordo: 60, netto: 30 },
  { n: 3, d: "30/07", cap: 2000, lordo: 270, netto: 135 },
  { n: 4, d: "30/07", cap: 2000, lordo: 17, netto: 17 },
  { n: 5, d: "05/08", cap: 2000, lordo: 191, netto: 95.5 },
  { n: 6, d: "07/08", cap: 4000, lordo: 290, netto: 145 },
  { n: 7, d: "10/08", cap: 4000, lordo: 443, netto: 221.5 },
  { n: 8, d: "12/08", cap: 4000, lordo: 240, netto: 120 },
  { n: 9, d: "13/08", cap: 4000, lordo: 201, netto: 100.5 },
  { n: 10, d: "19/08", cap: 4000, lordo: 207, netto: 103.5 },
  { n: 11, d: "19/08", cap: 6000, lordo: 322, netto: 161 },
  { n: 12, d: "20/08", cap: 6000, lordo: 446, netto: 223 },
  { n: 13, d: "21/08", cap: 6000, lordo: 342, netto: 171 }
];
const EU = (n) => "€ " + n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const EU0 = (n) => "€ " + Math.round(n).toLocaleString("it-IT");

function Certificato() {
  const u = CICLI[CICLI.length - 1];
  const roi = u.netto / u.cap * 100;
  return (
    <div style={{ padding: 16 }}>
      <div style={{ background: "#0F1417", border: "1px solid #0d9e88", borderRadius: 16, padding: "30px 20px", textAlign: "center" }}>
        <div style={{ fontFamily: "monospace", fontSize: 9, letterSpacing: 3, color: "#0d9e88", textTransform: "uppercase" }}>EdgeFunds · Broker vs Broker</div>
        <div style={{ height: 1, margin: "16px 0 28px", background: "#0d9e88", opacity: .5 }} />
        <div style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: 2.6, color: "#78818F", textTransform: "uppercase" }}>Guadagno ciclo #{u.n}</div>
        <div style={{ fontSize: 54, fontWeight: 700, color: "#14c9ac", letterSpacing: -2, lineHeight: 1, margin: "14px 0 12px" }}>{EU(u.netto)}</div>
        <div style={{ display: "inline-block", fontFamily: "monospace", fontSize: 14, padding: "6px 14px", borderRadius: 22, background: "rgba(20,201,172,.12)", color: "#14c9ac", border: "1px solid rgba(20,201,172,.3)" }}>+{roi.toFixed(2).replace(".", ",")}%</div>
        <div style={{ marginTop: 26, fontFamily: "monospace", fontSize: 11, color: "#78818F" }}>Mario R. · 21/08/2026</div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button style={{ flex: 1, background: "#0d9e88", color: "#04120F", border: 0, borderRadius: 10, padding: 13, fontSize: 14, fontWeight: 600 }}>Condividi</button>
      </div>
    </div>
  );
}

function Dashboard() {
  const netto = CICLI.reduce((a, x) => a + x.netto, 0);
  const capMax = Math.max(...CICLI.map(x => x.cap));
  const roi = netto / capMax * 100;
  let cum = 0; const serie = CICLI.map(x => (cum += x.netto));
  const W = 340, H = 120, mx = Math.max(...serie);
  const X = (i) => i * W / (serie.length - 1), Y = (v) => H - (v / mx) * H;
  const dp = serie.map((v, i) => (i ? "L" : "M") + X(i).toFixed(0) + " " + Y(v).toFixed(0)).join(" ");
  const ap = "M0 " + H + " " + serie.map((v, i) => "L" + X(i).toFixed(0) + " " + Y(v).toFixed(0)).join(" ") + " L" + W + " " + H + " Z";
  const box = { background: "#0F1417", border: "1px solid #1B242A", borderRadius: 12, padding: 11 };
  return (
    <div style={{ padding: 14 }}>
      <div style={{ ...box, textAlign: "center", padding: "22px 12px", borderColor: "#0d9e88", marginBottom: 14 }}>
        <div style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: 2.6, color: "#78818F", textTransform: "uppercase" }}>Profitto netto accumulato</div>
        <div style={{ fontSize: 44, fontWeight: 700, color: "#14c9ac", letterSpacing: -2, margin: "12px 0 10px" }}>{EU0(netto)}</div>
        <div style={{ display: "inline-block", fontFamily: "monospace", fontSize: 13, padding: "5px 12px", borderRadius: 20, background: "rgba(20,201,172,.12)", color: "#14c9ac", border: "1px solid rgba(20,201,172,.3)" }}>+{roi.toFixed(2).replace(".", ",")}%</div>
        <div style={{ marginTop: 13, fontFamily: "monospace", fontSize: 11, color: "#78818F" }}>13 cicli · Ultimo: 21/08/26</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7, marginBottom: 14 }}>
        {[["CICLI TOTALI", "13"], ["MEDIA PROFITTO", EU0(netto / 13)], ["MEDIA TEMPO", "1 giorno"]].map(([a, b]) => (
          <div key={a} style={box}>
            <div style={{ fontFamily: "monospace", fontSize: 8, letterSpacing: .8, color: "#78818F" }}>{a}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#ECEFF3", marginTop: 5 }}>{b}</div>
          </div>
        ))}
      </div>
      <div style={{ ...box, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#ECEFF3", marginBottom: 10 }}>Andamento cicli</div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
          <path d={ap} fill="rgba(13,158,136,.12)" />
          <path d={dp} fill="none" stroke="#0d9e88" strokeWidth="2" />
        </svg>
      </div>
      <div style={box}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#ECEFF3", marginBottom: 10 }}>Registro cicli</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <tbody>
            {[...CICLI].reverse().slice(0, 6).map(x => (
              <tr key={x.n}>
                <td style={{ padding: "8px 4px", color: "#78818F", borderBottom: "1px solid rgba(27,36,42,.6)" }}>{x.n}</td>
                <td style={{ padding: "8px 4px", color: "#78818F", borderBottom: "1px solid rgba(27,36,42,.6)" }}>{x.d}/26</td>
                <td style={{ padding: "8px 4px", textAlign: "right", color: "#78818F", borderBottom: "1px solid rgba(27,36,42,.6)" }}>{EU0(x.cap)}</td>
                <td style={{ padding: "8px 4px", textAlign: "right", color: "#14c9ac", fontWeight: 600, borderBottom: "1px solid rgba(27,36,42,.6)" }}>{EU(x.netto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const INLINE = {
  "💰 Ho capitale da far lavorare": [{ da: "bot", t: "💰 <b>Con del capitale disponibile</b>\n━━━━━━━━━━━━━━\n\nI servizi che rendono di più sono quelli che richiedono soldi già pronti. Il più solido che seguiamo è <b>Broker vs Broker</b>: operatività di copertura tra due broker, su conti intestati a te.\n\nLe somme restano sui tuoi conti e la commissione si paga solo su risultato positivo.\n\n⚠️ Alto rischio: il capitale può essere perso interamente.", inline: [["Come funziona"], ["Parlane col bot"]] },
    { da: "sys", t: "→ A te arriva: 🎯 <b>Luca</b> · ha capitale" }],
  "🚀 Parto da zero": [{ da: "bot", t: "🚀 <b>Partendo da zero</b>\n━━━━━━━━━━━━━━\n\nNel catalogo trovi i servizi che non richiedono capitale iniziale, con costi e limiti scritti chiari.\n\nDentro il gruppo pubblichiamo le novità e gli aggiornamenti su quelli che vale la pena seguire.", inline: [["Apri il catalogo"]] },
    { da: "sys", t: "→ A te arriva: 🎯 <b>Luca</b> · parte da zero" }],
  "👀 Sto solo guardando": [{ da: "bot", t: "👀 <b>Nessun problema</b>\n━━━━━━━━━━━━━━\n\nGuarda con calma: nel gruppo non si vende niente, si analizzano servizi.\n\nSe a un certo punto ti serve qualcosa, scrivi pure qui.", inline: [["Apri il catalogo"]] },
    { da: "sys", t: "→ A te arriva: 🎯 <b>Luca</b> · sta guardando" }],
  "✅ Approva": [{ da: "sys", t: "→ Luca entra nel gruppo" },
    { da: "bot", t: "✅ <b>Sei dentro.</b>\nBenvenuto in HUB Cashly." }],
  "Parlane col bot": [{ da: "sys", t: "→ Si apre <b>@cashly_bvb_bot</b> con il percorso Broker vs Broker" }],
  "Ho capito, andiamo avanti": [{ da: "bot", t: "💰 <b>Il capitale</b>\n\nQuanto puoi mettere sui due conti?\n<i>Resta tuo, sui tuoi conti.</i>", inline: [["Meno di 2.000 €"], ["2.000 – 5.000 €"], ["5.000 – 10.000 €"], ["Oltre 10.000 €"]] }],
  "Meno di 2.000 €": [{ da: "bot", t: "Con meno di <b>2.000 €</b> il sistema non regge: il bonus sarebbe troppo piccolo e le commissioni si mangerebbero il profitto.\n\nTi lascio il contatto: quando sei pronto scrivi qui e ripartiamo." }],
  "2.000 – 5.000 €": [{ da: "bot", t: "📊 <b>L'esperienza</b>\n\nHai già avuto a che fare col trading?", inline: [["Mai fatto niente"], ["Ho provato qualcosa"], ["Opero già"]] }],
  "5.000 – 10.000 €": [{ da: "bot", t: "📊 <b>L'esperienza</b>\n\nHai già avuto a che fare col trading?", inline: [["Mai fatto niente"], ["Ho provato qualcosa"], ["Opero già"]] }],
  "Ho provato qualcosa": [{ da: "bot", t: "Ultima cosa: come ti chiami?\n<i>Nome e cognome.</i>" },
    { da: "me", t: "Luca Bianchi" },
    { da: "bot", t: "✅ <b>Grazie Luca.</b>\n\nTi ricontattiamo a breve per aprire i conti e partire.\n\n<i>Nel frattempo, se hai domande scrivi pure qui.</i>" },
    { da: "sys", t: "→ La scheda arriva a te e agli admin di EdgeFunds" },
    { da: "bot", t: "🎯 <b>NUOVO CONTATTO</b>\n━━━━━━━━━━━━━━\n\n<b>Luca Bianchi</b> · @lucab\n💰 2.000 – 5.000 €\n📊 ha provato qualcosa\n🤝 rete <b>EdgeFunds</b>", inline: [["✅ Attiva cliente"], ["💬 Scrivigli", "🗑 Scarta"]] }],
  "Mai fatto niente": [{ da: "bot", t: "Ultima cosa: come ti chiami?\n<i>Nome e cognome.</i>" }],
  "Opero già": [{ da: "bot", t: "Ultima cosa: come ti chiami?\n<i>Nome e cognome.</i>" }],
  "✅ Attiva cliente": [{ da: "sys", t: "→ Nasce il cliente <b>E1</b>, rete EdgeFunds, fee 50%" },
    { da: "bot", t: "🎉 <b>Sei dentro, Luca</b>\n━━━━━━━━━━━━━━\n\nIl tuo codice è <b>E1</b>.\n\nTra poco ti aggiungiamo al tuo gruppo dedicato: da lì apri i conti, avvii i cicli e vedi i guadagni.\n\n<i>A breve ti scriviamo.</i>" },
    { da: "sys", t: "→ Poi si crea il gruppo e parte l'iscrizione ai broker" }],
  "🌍 Tutti i clienti · 3": [{ da: "bot", t: "✍️ <b>Scrivi la comunicazione.</b>\n\nArriverà a <b>3 gruppi</b>.\n<i>Puoi usare grassetto e corsivo.</i>" },
    { da: "me", t: "Da settembre la fee VPS passa al <b>21 di ogni mese</b>." },
    { da: "bot", t: "📢 <b>ANTEPRIMA</b>\n━━━━━━━━━━━━━━\n\nDa settembre la fee VPS passa al <b>21 di ogni mese</b>.\n\n━━━━━━━━━━━━━━\n<i>Arriverà a 3 gruppi:</i>\nC1 · Antonio Mazzone\nC2 · Daniele Giagnorio\nC4 · Mario Rossi", inline: [["📤 Invia ora"], ["✏️ Riscrivi", "❌ Annulla"]] }],
  "📤 Invia ora": [{ da: "bot", t: "✅ <b>Inviata a 3 gruppi.</b>\n\n<i>Vedi chi l'ha letta da</i> 📢 Comunicazioni." }],
  "👀 Chi ha letto": [{ da: "bot", t: "👀 <b>LETTURE</b>\n━━━━━━━━━━━━━━\n\n<b>22/08/2026</b> · 2/3 (67%)\n<i>Da settembre la fee VPS passa al 21 di ogni…</i>\n✅ Antonio M., Daniele G.\n\n<b>14/08/2026</b> · 3/3 (100%)\n<i>Ricordate di controllare lo spread su XAGUSD…</i>\n✅ Antonio M., Daniele G., Mario R." }],
  "🌍 Globale": [{ da: "bot", t: "📅 <b>Periodo?</b>", inline: [["Oggi", "Ieri"], ["Settimana", "Mese"], ["Anno", "Tutto"]] }],
  "👤 Solo miei diretti": [{ da: "bot", t: "📅 <b>Periodo?</b>", inline: [["Oggi", "Ieri"], ["Settimana", "Mese"], ["Anno", "Tutto"]] }],
  "🤝 EdgeFunds": [{ da: "bot", t: "📅 <b>Periodo?</b>", inline: [["Oggi", "Ieri"], ["Settimana", "Mese"], ["Anno", "Tutto"]] }],
  "Mese": [{ da: "bot", t: "📊 <b>REPORT GLOBALE</b>\n<i>Questo mese</i>\n━━━━━━━━━━━━━━\n\n💳 Pagamenti <b>4</b>\n💰 Incassato <b>€ 658,50</b> = <b>770,00 USDT</b>\n✅ Certificato <b>770,00 USDT</b>\n\n━━━━━━━━━━━━━━\n<b>RIPARTIZIONE</b>\n🤝 Fornitori 70% <b>539,00 USDT</b>\n💼 <b>Resta a te 231,00 USDT</b>\n\n━━━━━━━━━━━━━━\n<b>DETTAGLIO</b>\n\n<b>C1 · Antonio Mazzone</b>\n21/08/2026 · € 171,00 = 199,95 USDT\n<u>✅ BscScan</u>", inline: [["📅 Cambia periodo"], ["📤 Invia report"], ["⬅️ Menu report"]] }],
  "Trade in corso": [{ da: "bot", t: "✅ <b>Confermato.</b>\nIl cliente è stato avvisato." }],
  "Oggi": [{ da: "bot", t: "📊 <b>REPORT · Oggi</b>\n\nNessun incasso in questo periodo." }],
  "❌ Annulla": [{ da: "bot", t: "Annullato." }],
  "👀 Ho letto": [{ da: "bot", t: "<i>✅ Letta</i>" }]
};

export default function App() {
  const [ruolo, setRuolo] = useState("hub");
  const [msgs, setMsgs] = useState(SCENE.hub.msgs);
  const [kb, setKb] = useState(SCENE.hub.kb);
  const [app, setApp] = useState(null);
  const fine = useRef(null);

  useEffect(() => { fine.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  function cambia(r) {
    setRuolo(r); setMsgs(SCENE[r].msgs); setKb(SCENE[r].kb);
  }

  function premi(txt) {
    const sc = SCENE[ruolo];
    const out = [{ da: "me", t: txt }];
    const r = sc.risposte[txt];
    if (r) { r.forEach(x => { out.push(x); if (x.kb) setKb(x.kb); }); }
    else out.push({ da: "bot", t: "<i>…</i>" });
    setMsgs(m => [...m, ...out]);
  }

  const info = RUOLI[ruolo];

  return (
    <div style={{ background: "#0B0F14", minHeight: "100vh", padding: 16, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ maxWidth: 430, margin: "0 auto" }}>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {Object.keys(RUOLI).map(r => (
            <button key={r} onClick={() => cambia(r)}
              style={{
                background: ruolo === r ? T.accent : "#16202B", color: ruolo === r ? "#04120F" : T.mut,
                border: "none", borderRadius: 8, padding: "7px 11px", fontSize: 12, fontWeight: 600, cursor: "pointer"
              }}>
              {({ hub: "① Entra nell'HUB", nuovo: "② Contatto BvB", admin: "Tu · admin", cliente: "Cliente privato", fornitore: "Fornitore", affiliato: "Affiliato", ignoto: "Sconosciuto", gruppo: "Gruppo cliente", forn: "Gruppo fornitori" })[r]}
            </button>
          ))}
        </div>

        <div style={{ background: T.bg, borderRadius: 14, overflow: "hidden", border: "1px solid #1C2732" }}>

          <div style={{ background: T.head, padding: "11px 14px", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#04120F", fontSize: 13 }}>
              {ruolo === "gruppo" || ruolo === "forn" ? "C4" : "CB"}
            </div>
            <div>
              <div style={{ color: T.txt, fontWeight: 600, fontSize: 14 }}>{info.nome}</div>
              <div style={{ color: T.mut, fontSize: 11 }}>{info.sub}</div>
            </div>
          </div>

          <div style={{ padding: 12, height: 420, overflowY: "auto", background: T.bg }}>
            {SCENE[ruolo].nota && (
              <div style={{ background: "#16202B", color: T.mut, fontSize: 11.5, padding: "8px 11px", borderRadius: 8, marginBottom: 10, lineHeight: 1.5 }}
                dangerouslySetInnerHTML={{ __html: SCENE[ruolo].nota }} />
            )}
            {msgs.map((m, i) => (
              m.da === "sys" ? (
                <div key={i} style={{ textAlign: "center", margin: "10px 0" }}>
                  <span style={{ background: "rgba(13,158,136,.12)", border: "1px solid rgba(13,158,136,.3)", color: "#0d9e88", fontSize: 11, padding: "5px 11px", borderRadius: 12, display: "inline-block", lineHeight: 1.5 }}
                    dangerouslySetInnerHTML={{ __html: m.t }} />
                </div>
              ) : (
              <div key={i} style={{ display: "flex", justifyContent: m.da === "me" ? "flex-end" : "flex-start", marginBottom: 7 }}>
                <div style={{
                  background: m.da === "me" ? T.bubOut : T.bubIn, color: T.txt,
                  padding: "8px 11px", borderRadius: 11, maxWidth: "86%", fontSize: 13.5, lineHeight: 1.5,
                  whiteSpace: "pre-wrap", wordBreak: "break-word"
                }}>
                  <span dangerouslySetInnerHTML={{ __html: m.t }} />
                  {m.inline && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      {m.inline.map((riga, ri) => (
                        <div key={ri} style={{ display: "flex", gap: 4 }}>
                          {riga.map((b, bi) => (
                            <div key={bi} onClick={() => {
                              if (b.includes("Ultimo ciclo") || b.includes("certificato")) setApp("ciclo");
                              else if (b.includes("dashboard") || b.includes("Dashboard")) setApp("dash");
                              else if (INLINE[b]) setMsgs(mm => [...mm, ...INLINE[b]]);
                            }} style={{
                              flex: 1, background: "#233A4D", color: T.link, textAlign: "center",
                              padding: "7px 6px", borderRadius: 7, fontSize: 12.5, cursor: "pointer"
                            }}>{b}</div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              )
            ))}
            <div ref={fine} />
          </div>

          <div style={{ background: T.head, padding: "9px 12px", display: "flex", alignItems: "center", gap: 9, borderTop: "1px solid " + T.line }}>
            {SCENE[ruolo].menu && (
              <div onClick={() => setApp("dash")} style={{ background: "#2B5278", color: "#fff", padding: "6px 11px", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                {SCENE[ruolo].menu}
              </div>
            )}
            <div style={{ flex: 1, color: T.mut, fontSize: 13.5 }}>Messaggio</div>
          </div>

          {kb && (
            <div style={{ background: T.line, padding: 7 }}>
              {kb.map((riga, ri) => (
                <div key={ri} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  {riga.map((b, bi) => (
                    <button key={bi} onClick={() => premi(b)} style={{
                      flex: 1, background: T.kb, color: T.kbTxt, border: "none", borderRadius: 8,
                      padding: "12px 6px", fontSize: 13, cursor: "pointer", fontWeight: 500
                    }}>{b}</button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {app && (
          <div onClick={() => setApp(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 14 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 400, maxHeight: "88vh", overflowY: "auto", background: "#080B0D", borderRadius: 14, border: "1px solid #1B242A" }}>
              <div style={{ background: "#0F1417", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #1B242A" }}>
                <span style={{ color: "#ECEFF3", fontSize: 13, fontWeight: 600 }}>Cashly BvB</span>
                <span onClick={() => setApp(null)} style={{ color: "#78818F", cursor: "pointer", fontSize: 18 }}>✕</span>
              </div>
              {app === "ciclo" ? <Certificato /> : <Dashboard />}
            </div>
          </div>
        )}

        <div style={{ color: T.mut, fontSize: 11.5, marginTop: 11, lineHeight: 1.6, textAlign: "center" }}>
          Tocca i bottoni per navigare. Cambia ruolo in alto per vedere cosa vede ciascuno.
        </div>
      </div>
    </div>
  );
}
