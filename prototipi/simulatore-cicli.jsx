import React, { useState, useRef, useEffect } from "react";

const T = { bg:"#0E1621", head:"#17212B", bIn:"#182533", bOut:"#2B5278", txt:"#E9EDF0", mut:"#7D8E9C", line:"#0B131B", kb:"#1B2836", link:"#62A0D6", verde:"#0d9e88" };

const CHAT = {
  utente:    { nome:"C1 · Antonio Mazzone", sub:"gruppo cliente", col:"#2ecc4a" },
  fornitori: { nome:"C1 · Fornitori",       sub:"gruppo fornitori", col:"#f0a92c" },
  canale:    { nome:"Cashly Update Cicli",  sub:"canale segnali MT5", col:"#62A0D6" },
  admin:     { nome:"Cashly BvB",           sub:"la tua chat admin", col:"#0d9e88" },
};

const SEGNALI = {
  bonus: "🎁 Bonus changed\nUser: ANTONIO MAZZONE (Child Of: B.UP)\nAccount: SLAVE 5008233 @ OnamTrading-Live\nNew bonus: 900.00 EUR",
  reset: "🎁 Bonus changed\nUser: ANTONIO MAZZONE (Child Of: B.UP)\nAccount: SLAVE 5008233 @ OnamTrading-Live\nNew bonus: 0.00 EUR",
  step1: "⚠️ ANTONIO MAZZONE: Step 1 closed\nBalance Master: 7457.19 (3000.00)\nBalance Slave: 71.63 (3000.00)\nCycle P/L: -471.18",
  chiuso:"✅ ANTONIO MAZZONE: Cycle closed\nBalance Master: 6342.25 (3000.06)\nBalance Slave: -847.37 (3001.53)\nCycle P/L: 340.66",
};

// ————— i test, passo per passo —————
const TEST = [
  {
    id:"caso1", titolo:"Caso 1 · vince Total FX", desc:"Percorso manuale completo, dal ciclo al pagamento.",
    passi:[
      { chi:"utente", da:"me", t:"🚀 Inizia nuovo ciclo" },
      { chi:"utente", da:"bot", t:"Manda uno <b>screenshot</b> che mostri i saldi dei due conti." },
      { chi:"utente", da:"me", t:"📎 <i>[screenshot dei conti]</i>" },
      { chi:"utente", da:"bot", t:"<b>Screenshot ricevuto.</b>\n\nQual è il <b>capitale totale</b> del ciclo?\n<i>Scrivi solo il numero, es.</i> <code>6000</code>" },
      { chi:"utente", da:"me", t:"6000" },
      { chi:"utente", da:"bot", t:"<b>Budget € 6.000</b>\n€ 3.000 per conto.\n\nTutto giusto?", inline:[["✅ Confermo"],["✏️ Riscrivi","❌ Annulla"]] },
      { chi:"utente", da:"me", t:"✅ Confermo", tap:true },
      { chi:"fornitori", da:"bot", t:"📎 <i>[screenshot]</i>" },
      { chi:"fornitori", da:"bot", t:"<b>CONTI BILANCIATI. PRONTO A PARTIRE</b>" },
      { chi:"fornitori", da:"bot", t:"@cryptoX_25 @tonyj10x" },
      { chi:"utente", da:"bot", t:"<b>Inviato ai fornitori.</b>\nTi avviso appena aprono le posizioni." },
      { chi:"admin", da:"bot", t:"⏳ <b>C1 · Antonio Mazzone</b>\n<i>avvio del ciclo · da 2m</i>", inline:[["Trade in corso"],["🤝 Gruppo fornitori","👤 Gruppo cliente"]] },
      { chi:"fornitori", da:"loro", t:"in corso" },
      { chi:"utente", da:"bot", t:"🚀 <b>IN CORSO</b>", kb:[["🟢 Vinto su TotalFX"],["🔵 Vinto su Roboforex"],["📋 Menu"]] },
      { chi:"utente", da:"me", t:"🟢 Vinto su TotalFX" },
      { chi:"utente", da:"bot", t:"Manda uno <b>screenshot</b> con i saldi finali dei due conti." },
      { chi:"utente", da:"me", t:"📎 <i>[screenshot finale]</i>" },
      { chi:"utente", da:"bot", t:"Saldo finale su <b>Total FX</b>?" },
      { chi:"utente", da:"me", t:"6480" },
      { chi:"utente", da:"bot", t:"Saldo finale su <b>Roboforex</b>?" },
      { chi:"utente", da:"me", t:"120" },
      { chi:"utente", da:"bot", t:"📈 <b>Profitto € 600,00</b>" },
      { chi:"utente", da:"bot", t:"💸 <b>Commissione 50% · € 300,00</b>" },
      { chi:"utente", da:"bot", t:"💰 <b>Da pagare 351,00 USDT</b>", inline:[["✅ Confermo"]] },
      { chi:"fornitori", da:"bot", t:"📎 <i>[screenshot]</i>" },
      { chi:"fornitori", da:"bot", t:"📈 <b>Profitto € 600,00</b>" },
      { chi:"fornitori", da:"bot", t:"💸 <b>Fee 50% · € 300,00</b>" },
      { chi:"fornitori", da:"bot", t:"💰 <b>Da ricevere 351,00 USDT</b>" },
      { chi:"utente", da:"me", t:"✅ Confermo", tap:true },
      { chi:"utente", da:"bot", t:"Versa in <b>USDT</b> sulla rete <b>BEP20 (BSC)</b>.\n⚠️ Su altre reti i fondi si perdono." },
      { chi:"utente", da:"bot", t:"<code>0xBd7C510045977a96E78013B3859169AEA76AD2D8</code>", kb:[["💸 Ho pagato"],["📋 Menu"]] },
      { chi:"utente", da:"me", t:"💸 Ho pagato" },
      { chi:"utente", da:"bot", t:"Incolla il <b>link BscScan</b> della transazione." },
      { chi:"utente", da:"me", t:"https://bscscan.com/tx/0x96a4cf0a…" },
      { chi:"utente", da:"bot", t:"🔍 <i>Verifico sulla blockchain…</i>" },
      { chi:"fornitori", da:"bot", t:"<b>FEE PAGATA</b>" },
      { chi:"fornitori", da:"bot", t:"https://bscscan.com/tx/0x96a4cf0a…" },
      { chi:"admin", da:"bot", t:"💰 <b>Pagamento da approvare</b>\nC1 · Antonio Mazzone\n351,00 USDT · verificato on-chain", inline:[["✅ Approva e chiudi"]] },
      { chi:"fornitori", da:"loro", t:"ok" },
      { chi:"utente", da:"bot", t:"🏆 <b>CICLO CONCLUSO</b>\n\n💰 <b>Hai guadagnato € 300,00</b> in 18 ore\n📈 Rendimento <b>+5,00%</b>\n\n<b>Ribilancia i conti e riparti!</b>", inline:[["🏆 Vedi il certificato"]] },
    ]
  },
  {
    id:"caso2reset", titolo:"Caso 2 · con reset", desc:"Vince Roboforex, Total in negativo: reset, bonus automatico, step 2.",
    passi:[
      { chi:"utente", da:"me", t:"🔵 Vinto su Roboforex" },
      { chi:"utente", da:"bot", t:"🔵 <b>Vinto su Roboforex</b>\n\nManda uno <b>screenshot</b> con i saldi dei due conti." },
      { chi:"utente", da:"me", t:"📎 <i>[screenshot]</i>" },
      { chi:"utente", da:"bot", t:"Se il saldo su <b>Total FX</b> è negativo, richiedi prima il <b>reset</b>.", kb:[["🔄 Richiedi reset NBP"],["🎁 Richiedi bonus 30%"],["📋 Menu"]] },
      { chi:"utente", da:"me", t:"🔄 Richiedi reset NBP" },
      { chi:"fornitori", da:"bot", t:"<b>NBP 5008233</b>" },
      { chi:"fornitori", da:"bot", t:"@cryptoX_25 @tonyj10x" },
      { chi:"utente", da:"bot", t:"🔄 <b>Reset richiesto.</b>", kb:[["🎁 Richiedi bonus 30%"],["📋 Menu"]] },
      { chi:"canale", da:"mt5", t:SEGNALI.reset, seg:true },
      { chi:"admin", da:"bot", t:"🔄 <b>CONTO RESETTATO</b>\nC1 · Antonio Mazzone\nconto 5008233\n\n🎁 <i>Bonus di € 900 richiesto ai fornitori.</i>" },
      { chi:"fornitori", da:"bot", t:"<b>5008233</b>\n<b>900€</b>\n<b>ADD BONUS</b>" },
      { chi:"fornitori", da:"bot", t:"@cryptoX_25 @tonyj10x" },
      { chi:"utente", da:"bot", t:"🔄 <b>Conto Total FX resettato.</b>\n\n🎁 <b>Bonus richiesto: € 900</b>\n\nAppena lo vedi sul conto premi <b>Bonus arrivato</b>.", kb:[["✅ Bonus arrivato"],["📋 Menu"]] },
      { chi:"canale", da:"mt5", t:SEGNALI.bonus, seg:true },
      { chi:"admin", da:"bot", t:"🎁 <b>BONUS ACCREDITATO</b>\nC1 · Antonio Mazzone\n<b>€ 900</b> sul conto 5008233\n\n<i>Fornitori avvisati, cliente informato.</i>" },
      { chi:"fornitori", da:"bot", t:"<b>BONUS ARRIVATO. PRONTO A PARTIRE</b>" },
      { chi:"utente", da:"bot", t:"✅ <b>Avvisati i fornitori.</b>\nTi avviso appena aprono le posizioni.", kb:[["📋 Menu"]] },
      { chi:"fornitori", da:"loro", t:"in corso" },
      { chi:"utente", da:"bot", t:"🚀 <b>2° STEP IN CORSO</b>\n\nQuando è finito premi <b>Chiudi 2° step</b>.", kb:[["📊 Chiudi 2° step"],["📋 Menu"]] },
      { chi:"canale", da:"mt5", t:SEGNALI.chiuso, seg:true },
      { chi:"admin", da:"bot", t:"✅ <b>CICLO CHIUSO</b>\nC1 · Antonio Mazzone\nP/L <b>€ 340,66</b>\nMaster € 6.342,25\nSlave € -847,37" },
      { chi:"utente", da:"bot", t:"Manda uno <b>screenshot</b> con i saldi finali dei due conti." },
      { chi:"utente", da:"me", t:"📎 <i>[screenshot]</i>" },
      { chi:"utente", da:"bot", t:"📈 <b>Profitto € 342,25</b>" },
      { chi:"utente", da:"bot", t:"💸 <b>Commissione 50% · € 171,13</b>" },
      { chi:"utente", da:"bot", t:"💰 <b>Da pagare 200,22 USDT</b>", inline:[["✅ Confermo"]] },
    ]
  },
  {
    id:"caso2bonus", titolo:"Caso 2 · senza reset", desc:"Total resta positivo: bonus diretto, niente NBP.",
    passi:[
      { chi:"utente", da:"me", t:"🔵 Vinto su Roboforex" },
      { chi:"utente", da:"bot", t:"🔵 <b>Vinto su Roboforex</b>\n\nManda uno <b>screenshot</b> con i saldi dei due conti." },
      { chi:"utente", da:"me", t:"📎 <i>[screenshot]</i>" },
      { chi:"utente", da:"bot", t:"Se il saldo su <b>Total FX</b> è negativo, richiedi prima il <b>reset</b>.", kb:[["🔄 Richiedi reset NBP"],["🎁 Richiedi bonus 30%"],["📋 Menu"]] },
      { chi:"utente", da:"me", t:"🎁 Richiedi bonus 30%" },
      { chi:"fornitori", da:"bot", t:"<b>5008233</b>\n<b>900€</b>\n<b>ADD BONUS</b>" },
      { chi:"fornitori", da:"bot", t:"@cryptoX_25 @tonyj10x" },
      { chi:"utente", da:"bot", t:"🎁 <b>Bonus richiesto: € 900</b>\n\nAppena lo vedi sul conto premi <b>Bonus arrivato</b>.", kb:[["✅ Bonus arrivato"],["📋 Menu"]] },
      { chi:"canale", da:"mt5", t:SEGNALI.bonus, seg:true },
      { chi:"fornitori", da:"bot", t:"<b>BONUS ARRIVATO. PRONTO A PARTIRE</b>" },
      { chi:"utente", da:"bot", t:"✅ <b>Avvisati i fornitori.</b>\nTi avviso appena aprono le posizioni.", kb:[["📋 Menu"]] },
      { chi:"fornitori", da:"loro", t:"in corso" },
      { chi:"utente", da:"bot", t:"🚀 <b>2° STEP IN CORSO</b>\n\nQuando è finito premi <b>Chiudi 2° step</b>.", kb:[["📊 Chiudi 2° step"],["📋 Menu"]] },
      { chi:"utente", da:"me", t:"📊 Chiudi 2° step" },
      { chi:"utente", da:"bot", t:"Su quale conto hai vinto?", inline:[["🟢 TotalFX","🔵 Roboforex"]] },
      { chi:"utente", da:"me", t:"🟢 TotalFX", tap:true },
      { chi:"utente", da:"bot", t:"Manda uno <b>screenshot</b> con i saldi finali dei due conti." },
    ]
  },
  {
    id:"segnali", titolo:"Solo segnali", desc:"Cosa fa il bot per ogni tipo, senza toccare niente.",
    passi:[
      { chi:"canale", da:"mt5", t:SEGNALI.bonus, seg:true },
      { chi:"admin", da:"bot", t:"🎁 <b>BONUS ACCREDITATO</b>\nC1 · Antonio Mazzone\n<b>€ 900</b> sul conto 5008233\n\n<i>Fornitori avvisati, cliente informato.</i>" },
      { chi:"canale", da:"mt5", t:SEGNALI.reset, seg:true },
      { chi:"admin", da:"bot", t:"🔄 <b>CONTO RESETTATO</b>\nC1 · Antonio Mazzone\nconto 5008233" },
      { chi:"utente", da:"bot", t:"🔄 <b>Conto Total FX resettato.</b>\n\nQuando i saldi sono bilanciati puoi aprire un nuovo ciclo.", kb:[["🚀 Inizia nuovo ciclo"],["📊 Dashboard","⚙️ Impostazioni"]] },
      { chi:"fornitori", da:"bot", t:"<b>CONTO RESETTATO</b>" },
      { chi:"canale", da:"mt5", t:SEGNALI.step1, seg:true },
      { chi:"admin", da:"bot", t:"⚠️ <b>1° STEP CHIUSO</b>\nC1 · Antonio Mazzone\nP/L € -471,18\n\n<i>Serve il secondo step: reset o bonus.</i>" },
      { chi:"utente", da:"bot", t:"Se il saldo su <b>Total FX</b> è negativo, richiedi prima il <b>reset</b>.", kb:[["🔄 Richiedi reset NBP"],["🎁 Richiedi bonus 30%"],["📋 Menu"]] },
      { chi:"canale", da:"mt5", t:SEGNALI.chiuso, seg:true },
      { chi:"admin", da:"bot", t:"✅ <b>CICLO CHIUSO</b>\nC1 · Antonio Mazzone\nP/L <b>€ 340,66</b>\nMaster € 6.342,25\nSlave € -847,37" },
      { chi:"utente", da:"bot", t:"Manda uno <b>screenshot</b> con i saldi finali dei due conti." },
    ]
  },
  {
    id:"limiti", titolo:"Casi limite", desc:"Cosa succede quando qualcosa non va.",
    passi:[
      { chi:"utente", da:"me", t:"🚀 Inizia nuovo ciclo" },
      { chi:"utente", da:"bot", t:"🔒 <b>VPS NON ATTIVO</b>\n\nLa copertura è scaduta il <b>21/08/2026</b>.\n\nPer riprendere i cicli serve regolarizzare:\n<b>28,00 USDT</b> · rete <b>BEP20</b>" },
      { chi:"utente", da:"bot", t:"<code>0x8764e615480565a55D81006c35e02714d10700e3</code>", inline:[["💸 Ho pagato"]] },
      { chi:"nota", t:"VPS rimessa a posto · si riprova" },
      { chi:"utente", da:"me", t:"🚀 Inizia nuovo ciclo" },
      { chi:"utente", da:"bot", t:"Manda uno <b>screenshot</b> che mostri i saldi dei due conti." },
      { chi:"utente", da:"me", t:"📎 <i>[screenshot]</i>" },
      { chi:"utente", da:"bot", t:"<b>Screenshot ricevuto.</b>\n\nQual è il <b>capitale totale</b> del ciclo?" },
      { chi:"utente", da:"me", t:"800" },
      { chi:"utente", da:"bot", t:"Il capitale minimo è <b>€ 2.000</b>." },
      { chi:"nota", t:"Ciclo già attivo · prova ad aprirne un altro" },
      { chi:"utente", da:"me", t:"🚀 Inizia nuovo ciclo" },
      { chi:"utente", da:"bot", t:"Hai già un ciclo attivo da € 6.000." },
      { chi:"nota", t:"Segnale di un cliente senza conti registrati" },
      { chi:"canale", da:"mt5", t:"🎁 Bonus changed\nUser: MARIO ROSSI\nAccount: SLAVE 9999999 @ OnamTrading-Live\nNew bonus: 600.00 EUR", seg:true },
      { chi:"admin", da:"bot", t:"Non trovo il cliente per il conto <code>9999999</code>.\n<i>Registra i conti dalla sua scheda.</i>" },
    ]
  },
];

export default function App() {
  const [test, setTest] = useState(0);
  const [i, setI] = useState(1);
  const [auto, setAuto] = useState(false);
  const fine = useRef(null);
  const passi = TEST[test].passi;
  const visti = passi.slice(0, i);

  useEffect(() => { fine.current?.scrollIntoView({ behavior:"smooth", block:"end" }); }, [i]);
  useEffect(() => {
    if (!auto || i >= passi.length) return;
    const t = setTimeout(() => setI(x => x+1), 1100);
    return () => clearTimeout(t);
  }, [auto, i, passi.length]);

  function cambia(n) { setTest(n); setI(1); setAuto(false); }

  const ETICHETTA = {
    utente:    { txt:"GRUPPO CLIENTE",  col:"#2ecc4a" },
    fornitori: { txt:"GRUPPO FORNITORI",col:"#f0a92c" },
    canale:    { txt:"CANALE SEGNALI",  col:"#62A0D6" },
    admin:     { txt:"TUA CHAT ADMIN",  col:"#0d9e88" },
  };
  const CHIP = { me:"il cliente scrive", loro:"i fornitori scrivono", mt5:"segnale automatico", bot:"il bot risponde" };

  return (
    <div style={{ background:"#080B0D", minHeight:"100vh", padding:14, fontFamily:"system-ui,-apple-system,sans-serif" }}>
      <div style={{ maxWidth:560, margin:"0 auto" }}>

        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:11 }}>
          {TEST.map((t,n) => (
            <button key={t.id} onClick={() => cambia(n)} style={{
              background: test===n ? "#0d9e88" : "#16202B", color: test===n ? "#04120F" : "#7D8E9C",
              border:"none", borderRadius:8, padding:"8px 12px", fontSize:12, fontWeight:600, cursor:"pointer" }}>
              {t.titolo}
            </button>
          ))}
        </div>

        <div style={{ background:"#0F1417", border:"1px solid #1B242A", borderRadius:12, padding:"13px 15px", marginBottom:14 }}>
          <div style={{ color:"#E9EDF0", fontSize:14.5, fontWeight:600 }}>{TEST[test].titolo}</div>
          <div style={{ color:"#7D8E9C", fontSize:12.5, marginTop:3, lineHeight:1.5 }}>{TEST[test].desc}</div>
          <div style={{ display:"flex", gap:7, alignItems:"center", marginTop:13 }}>
            <button onClick={() => setI(x => Math.max(1, x-1))} style={btn(false)}>‹ Indietro</button>
            <button onClick={() => setI(x => Math.min(passi.length, x+1))} style={btn(true)}>Avanti ›</button>
            <button onClick={() => setAuto(a => !a)} style={btn(false)}>{auto ? "⏸ Pausa" : "▶ Vai"}</button>
            <button onClick={() => { setI(1); setAuto(false); }} style={btn(false)}>↺</button>
            <span style={{ marginLeft:"auto", color:"#7D8E9C", fontSize:11.5, fontFamily:"monospace" }}>{i}/{passi.length}</span>
          </div>
        </div>

        {visti.map((p,k) => {
          if (p.chi === "nota") return (
            <div key={k} style={{ textAlign:"center", margin:"18px 0" }}>
              <span style={{ background:"rgba(13,158,136,.12)", border:"1px solid rgba(13,158,136,.3)",
                color:"#0d9e88", fontSize:11.5, padding:"6px 13px", borderRadius:13 }}>{p.t}</span>
            </div>
          );
          const e = ETICHETTA[p.chi];
          const nuovaChat = k === 0 || visti[k-1].chi !== p.chi;
          const mio = p.da === "me" || p.da === "loro";
          return (
            <div key={k} style={{ marginBottom:9 }}>
              {nuovaChat && (
                <div style={{ display:"flex", alignItems:"center", gap:8, margin:"20px 0 9px" }}>
                  <span style={{ width:7, height:7, borderRadius:"50%", background:e.col }} />
                  <span style={{ color:e.col, fontSize:10, letterSpacing:2, fontWeight:700, fontFamily:"monospace" }}>{e.txt}</span>
                  <span style={{ flex:1, height:1, background:"#1B242A" }} />
                </div>
              )}
              <div style={{ display:"flex", justifyContent: mio ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth:"88%" }}>
                  <div style={{ fontSize:10, color:"#5C6672", marginBottom:3, textAlign: mio ? "right" : "left" }}>
                    {CHIP[p.da] ?? ""}
                  </div>
                  <div style={{
                    background: mio ? "#2B5278" : p.seg ? "#16241A" : "#182533",
                    color:"#E9EDF0", padding:"9px 12px", borderRadius:11, fontSize:13, lineHeight:1.55,
                    whiteSpace:"pre-wrap", wordBreak:"break-word",
                    border: p.seg ? "1px solid rgba(46,204,74,.35)" : "1px solid transparent" }}>
                    <span dangerouslySetInnerHTML={{ __html:p.t }} />
                    {p.inline && (
                      <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:4 }}>
                        {p.inline.map((riga,ri) => (
                          <div key={ri} style={{ display:"flex", gap:4 }}>
                            {riga.map((b,bi) => (
                              <div key={bi} style={{ flex:1, background:"#233A4D", color:"#62A0D6", textAlign:"center",
                                padding:"7px 6px", borderRadius:7, fontSize:12 }}>{b}</div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {p.kb && (
                    <div style={{ marginTop:7, background:"#0B131B", borderRadius:9, padding:5 }}>
                      <div style={{ fontSize:9.5, color:"#5C6672", padding:"2px 4px 5px", letterSpacing:1 }}>TASTIERA</div>
                      {p.kb.map((riga,ri) => (
                        <div key={ri} style={{ display:"flex", gap:4, marginBottom:4 }}>
                          {riga.map((b,bi) => (
                            <div key={bi} style={{ flex:1, background:"#1B2836", color:"#E9EDF0", borderRadius:6,
                              padding:"9px 4px", fontSize:11.5, textAlign:"center" }}>{b}</div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={fine} />

        {i >= passi.length && (
          <div style={{ textAlign:"center", margin:"26px 0 10px" }}>
            <span style={{ color:"#0d9e88", fontSize:12.5 }}>Fine · {TEST[test].titolo}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function btn(primario) {
  return { background: primario ? "#0d9e88" : "#16202B", color: primario ? "#04120F" : "#E9EDF0",
    border:"none", borderRadius:8, padding:"8px 14px", fontSize:12.5, fontWeight:600, cursor:"pointer" };
}
