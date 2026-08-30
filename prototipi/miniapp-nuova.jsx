import React, { useState } from "react";

/* palette Cashly */
const C = {
  bg: "#131418", s0: "#191B20", s1: "#1F2128", s2: "#272A32", s3: "#333743",
  line: "#262932", line2: "#333845",
  tx: "#F6F7F9", dim: "#AAB0BB", mut: "#7B828F",
  acc: "#25CF6E", accD: "#1BB65D", on: "#04210F",
  amber: "#FFB43D", blue: "#4A8CFF", purple: "#A77BFF", coral: "#FF6154", teal: "#2AD3C2",
  sans: "'Inter',-apple-system,system-ui,sans-serif",
  display: "'Manrope',-apple-system,system-ui,sans-serif",
};
const R = 5;
const eur = (n) => "€ " + Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur0 = (n) => "€ " + Number(n).toLocaleString("it-IT", { maximumFractionDigits: 0 });

/* dati finti */
const CICLI = [
  { n: 12, data: "21/08", cap: 8000, lordo: 485, fee: 194, dur: "20h" },
  { n: 11, data: "20/08", cap: 8000, lordo: 517, fee: 206.8, dur: "1g 2h" },
  { n: 10, data: "19/08", cap: 8000, lordo: 756, fee: 302.4, dur: "18h" },
  { n: 9, data: "18/08", cap: 8000, lordo: 271, fee: 108.4, dur: "22h" },
  { n: 8, data: "14/08", cap: 8000, lordo: 494, fee: 197.6, dur: "1g 6h" },
  { n: 7, data: "13/08", cap: 8000, lordo: 821, fee: 328.4, dur: "19h" },
];
const TUTTI = [
  { cod: "C2", nome: "Daniele Giagnorio", cap: 10000, cicli: 13, netto: 3607, st: "ciclo", rete: null },
  { cod: "C3", nome: "Simone Bertozzi", cap: 4000, cicli: 3, netto: 440, st: "ok", rete: null },
  { cod: "C4", nome: "Marco Pittalis", cap: 6000, cicli: 8, netto: 1550, st: "ciclo", rete: null },
  { cod: "C5", nome: "Daniele Angellotti", cap: 2000, cicli: 0, netto: 0, st: "setup", rete: null },
  { cod: "E1", nome: "Cristian Cipriano", cap: 10000, cicli: 12, netto: 4098, st: "ciclo", rete: "EdgeFunds" },
  { cod: "E2", nome: "Luca Baroni", cap: 6000, cicli: 4, netto: 720, st: "ok", rete: "EdgeFunds" },
];
const PAG_IN = [
  { chi: "C2", cod: "#13", usdt: 302.26, data: "24/08", ok: true },
  { chi: "E1", cod: "#12", usdt: 347.5, data: "21/08", ok: true },
  { chi: "C4", cod: "#8", usdt: 212.4, data: "20/08", ok: true },
  { chi: "C3", cod: "#3", usdt: 156.0, data: "19/08", ok: false },
];
const PAG_OUT = [
  { chi: "Fornitori", nota: "quota 35%", usdt: 3307.5, data: "21/08" },
  { chi: "EdgeFunds", nota: "quota 11%", usdt: 1039.5, data: "in attesa" },
];

/* primitive */
const Occh = ({ children, style }) => (
  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: C.mut, textTransform: "uppercase", ...style }}>{children}</div>
);
const Sec = ({ t, a }) => (
  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "0 18px", margin: "24px 0 10px" }}>
    <Occh>{t}</Occh>
    {a && <div style={{ fontSize: 12.5, color: C.acc, fontWeight: 600 }}>{a}</div>}
  </div>
);
const Card = ({ children, b, style }) => (
  <div style={{ margin: "0 18px", background: C.s0, border: `1px solid ${b ?? C.line}`, borderRadius: R, padding: "16px 17px", ...style }}>{children}</div>
);
const Pill = ({ children, c = C.dim, pieno }) => (
  <span style={{ fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap",
    color: pieno ? C.on : c, background: pieno ? c : C.s1,
    border: `1px solid ${pieno ? c : C.line2}`, borderRadius: R, padding: "3px 8px" }}>{children}</span>
);
const Barre = ({ d, c = C.acc }) => {
  const m = Math.max(...d);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 40, marginTop: 15 }}>
      {d.map((v, i) => <div key={i} style={{ flex: 1, height: `${Math.max(7, (v / m) * 100)}%`, background: i === d.length - 1 ? c : c + "30", borderRadius: 2 }} />)}
    </div>
  );
};
const Voce = ({ badge, bc, t, s, d, dc, pill, freccia, mono }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: `1px solid ${C.line}` }}>
    {badge != null && (
      <div style={{ width: 32, height: 32, borderRadius: R, background: C.s1, border: `1px solid ${C.line2}`, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: bc ?? C.dim }}>{badge}</div>
    )}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>{t}</div>
      {s && <div style={{ fontSize: 11.5, color: C.mut, marginTop: 2, fontFamily: mono ? "ui-monospace,monospace" : C.sans }}>{s}</div>}
    </div>
    {d && <div style={{ fontSize: 13.5, fontWeight: 600, color: dc ?? C.tx, flexShrink: 0 }}>{d}</div>}
    {pill}
    {freccia && <span style={{ color: C.mut, fontSize: 16, marginLeft: 2 }}>›</span>}
  </div>
);
const Testa = ({ occh, n, u, pills, dati, c }) => (
  <div style={{ padding: "20px 18px 18px" }}>
    <Occh>{occh}</Occh>
    <div style={{ fontFamily: C.display, fontSize: 38, fontWeight: 800, letterSpacing: "-.03em", color: C.tx, marginTop: 5, lineHeight: 1.1 }}>
      {n}{u && <span style={{ fontSize: 15, color: C.mut, fontWeight: 600 }}> {u}</span>}
    </div>
    {pills && <div style={{ display: "flex", gap: 6, marginTop: 11, flexWrap: "wrap" }}>{pills}</div>}
    {dati && <Barre d={dati} c={c} />}
  </div>
);
const stPill = (st) => st === "ciclo" ? <Pill c={C.amber}>in ciclo</Pill> : st === "setup" ? <Pill c={C.coral}>in avvio</Pill> : <Pill c={C.acc}>pronto</Pill>;

/* schermate */
function Home({ admin }) {
  const netto = CICLI.reduce((a, x) => a + x.lordo - x.fee, 0);
  return admin ? (
    <>
      <Testa occh="Margine del mese" n="2.886" u="USDT"
        pills={<><Pill>{eur0(36001)} gestiti</Pill><Pill c={C.amber}>5 in ciclo</Pill><Pill c={C.blue}>6 clienti</Pill></>}
        dati={[220, 340, 410, 560, 700, 980, 1240, 1600, 2100, 2886]} />
      <Sec t="Da fare" />
      <Voce badge="!" bc={C.coral} t="C3 · fee non ricevuta" s="ciclo #3 · da 2 giorni" freccia />
      <Voce badge="!" bc={C.amber} t="EdgeFunds · 1.039,50 da girare" s="12 cicli maturati" freccia />
      <Voce badge="!" bc={C.mut} t="C5 · manca conto Total FX" s="in avvio da 3 giorni" freccia />
      <Sec t="Cicli aperti ora" a="Tutti" />
      {TUTTI.filter((x) => x.st === "ciclo").map((x) => (
        <Voce key={x.cod} badge={x.cod} bc={x.rete ? C.purple : C.acc} t={x.nome} s={`${eur0(x.cap)} · attesa fornitori`} pill={<Pill c={C.amber}>4h</Pill>} />
      ))}
      <div style={{ height: 16 }} />
    </>
  ) : (
    <>
      <Testa occh="Profitto netto" n={eur0(netto)}
        pills={<><Pill c={C.acc} pieno>+18,4%</Pill><Pill>{CICLI.length} cicli</Pill><Pill>media {eur0(netto / CICLI.length)}</Pill></>}
        dati={CICLI.slice().reverse().map((x) => x.lordo - x.fee)} />
      <Sec t="Ciclo in corso" />
      <Card b={C.amber + "50"}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>#13 · {eur0(8000)}</div>
            <div style={{ fontSize: 12, color: C.mut, marginTop: 3 }}>Roboforex · attesa fornitori</div>
          </div>
          <Pill c={C.amber}>da 4h</Pill>
        </div>
      </Card>
      <Sec t="Ultimo chiuso" a="Condividi" />
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontFamily: C.display, fontSize: 25, fontWeight: 800, color: C.acc, letterSpacing: "-.02em" }}>{eur(CICLI[0].lordo - CICLI[0].fee)}</div>
            <div style={{ fontSize: 12, color: C.mut, marginTop: 4 }}>#{CICLI[0].n} · {CICLI[0].data} · {CICLI[0].dur}</div>
          </div>
          <Pill c={C.acc} pieno>verificato</Pill>
        </div>
      </Card>
      <div style={{ height: 16 }} />
    </>
  );
}

function Clienti({ admin }) {
  const [rete, setRete] = useState(null);
  const lista = admin ? (rete ? TUTTI.filter((x) => x.rete === rete) : TUTTI.filter((x) => !x.rete)) : TUTTI.filter((x) => x.rete === "EdgeFunds");
  return (
    <>
      <div style={{ padding: "18px 18px 14px" }}>
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 700, letterSpacing: "-.02em" }}>{rete ?? "Clienti"}</h1>
        <div style={{ fontSize: 12.5, color: C.mut, marginTop: 4 }}>
          {lista.length} · {eur0(lista.reduce((a, x) => a + x.cap, 0))} in gestione
        </div>
      </div>
      {admin && (
        <div style={{ display: "flex", gap: 6, padding: "0 18px 14px", overflowX: "auto" }}>
          <button onClick={() => setRete(null)} style={{ background: rete ? C.s1 : C.s2, color: rete ? C.mut : C.tx,
            border: `1px solid ${C.line2}`, borderRadius: R, padding: "7px 13px", fontSize: 12.5, fontWeight: 600, fontFamily: C.sans, cursor: "pointer" }}>Diretti</button>
          <button onClick={() => setRete("EdgeFunds")} style={{ background: rete ? C.s2 : C.s1, color: rete ? C.tx : C.mut,
            border: `1px solid ${C.line2}`, borderRadius: R, padding: "7px 13px", fontSize: 12.5, fontWeight: 600, fontFamily: C.sans, cursor: "pointer" }}>EdgeFunds</button>
        </div>
      )}
      {lista.map((x) => (
        <Voce key={x.cod} badge={x.cod} bc={x.rete ? C.purple : C.acc} t={x.nome}
          s={`${eur0(x.cap)} · ${x.cicli} cicli · ${eur0(x.netto)} netto`} pill={stPill(x.st)} />
      ))}
      <div style={{ height: 16 }} />
    </>
  );
}

function Pagamenti({ admin }) {
  return admin ? (
    <>
      <div style={{ display: "flex", gap: 10, padding: "18px 18px 4px" }}>
        <div style={{ flex: 1 }}>
          <Occh>Incassato</Occh>
          <div style={{ fontFamily: C.display, fontSize: 26, fontWeight: 800, marginTop: 5, letterSpacing: "-.02em" }}>4.725<span style={{ fontSize: 13, color: C.mut }}> USDT</span></div>
        </div>
        <div style={{ flex: 1 }}>
          <Occh>Da girare</Occh>
          <div style={{ fontFamily: C.display, fontSize: 26, fontWeight: 800, marginTop: 5, letterSpacing: "-.02em", color: C.amber }}>1.039<span style={{ fontSize: 13, color: C.mut }}> USDT</span></div>
        </div>
      </div>
      <Sec t="In entrata" a="Tutti" />
      {PAG_IN.map((p, i) => (
        <Voce key={i} badge={p.chi} bc={p.ok ? C.acc : C.coral} t={p.usdt.toFixed(2) + " USDT"} s={`ciclo ${p.cod} · ${p.data}`}
          pill={p.ok ? <Pill c={C.acc}>verificata</Pill> : <Pill c={C.coral}>manca</Pill>} />
      ))}
      <Sec t="In uscita" />
      {PAG_OUT.map((p, i) => (
        <Voce key={i} badge="↗" bc={C.blue} t={p.chi} s={p.nota} d={p.usdt.toFixed(2)}
          pill={p.data === "in attesa" ? <Pill c={C.amber}>da pagare</Pill> : <Pill c={C.mut}>{p.data}</Pill>} />
      ))}
      <div style={{ height: 16 }} />
    </>
  ) : (
    <>
      <Testa occh="Commissioni versate" n="1.337,20" u="USDT" pills={<Pill c={C.blue}>verificate on-chain</Pill>} />
      <Sec t="Per ciclo" />
      {CICLI.map((c) => (
        <Voce key={c.n} t={"Ciclo #" + c.n} s={c.data + " · verificata"} d={c.fee.toFixed(2)} />
      ))}
      <Sec t="Server di gestione" />
      <Card b={C.amber + "44"}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>Attivo fino al 21/09</div>
            <div style={{ fontSize: 12, color: C.mut, marginTop: 3 }}>25 € al mese</div>
          </div>
          <Pill c={C.acc}>in regola</Pill>
        </div>
      </Card>
      <div style={{ height: 16 }} />
    </>
  );
}

function Cicli() {
  const netto = CICLI.reduce((a, x) => a + x.lordo - x.fee, 0);
  return (
    <>
      <div style={{ padding: "18px 18px 14px" }}>
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 700, letterSpacing: "-.02em" }}>Cicli</h1>
        <div style={{ fontSize: 12.5, color: C.mut, marginTop: 4 }}>{CICLI.length} chiusi · {eur0(netto)} netto</div>
      </div>
      {CICLI.map((c) => (
        <Voce key={c.n} badge={c.n} t={eur(c.lordo - c.fee)} s={`${c.data} · ${eur0(c.cap)} · ${c.dur}`} freccia />
      ))}
      <div style={{ padding: 18, textAlign: "center" }}>
        <button style={{ background: C.s1, color: C.dim, border: `1px solid ${C.line2}`, borderRadius: R,
          padding: "9px 16px", fontSize: 12.5, fontWeight: 600, fontFamily: C.sans, cursor: "pointer" }}>Condividi il totale</button>
      </div>
    </>
  );
}

export default function App() {
  const [admin, setAdmin] = useState(false);
  const [tab, setTab] = useState(0);
  const [marchio, setMarchio] = useState("Cashly");
  const NAV = ["Home", "Clienti", "Pagamenti", "Cicli"];
  const V = [Home, Clienti, Pagamenti, Cicli][tab];

  return (
    <div style={{ background: "#0A0B0E", minHeight: "100vh", padding: 12, fontFamily: C.sans }}>
      <div style={{ maxWidth: 420, margin: "0 auto" }}>

        <div style={{ display: "flex", gap: 5, marginBottom: 11 }}>
          {[["partner", false], ["admin", true]].map(([l, v]) => (
            <button key={l} onClick={() => { setAdmin(v); setTab(0); }}
              style={{ background: admin === v ? C.acc : C.s1, color: admin === v ? C.on : C.mut,
                border: `1px solid ${admin === v ? C.acc : C.line2}`, borderRadius: R, padding: "6px 13px",
                fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: C.sans }}>{l}</button>
          ))}
          <button onClick={() => setMarchio(marchio === "Cashly" ? "EdgeFunds" : "Cashly")}
            style={{ marginLeft: "auto", background: C.s1, color: C.dim, border: `1px solid ${C.line2}`,
              borderRadius: R, padding: "6px 13px", fontSize: 12, cursor: "pointer", fontFamily: C.sans }}>
            {marchio === "Cashly" ? "white label" : "Cashly"}
          </button>
        </div>

        <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 29, height: 29, borderRadius: R, background: C.acc, color: C.on,
              display: "flex", alignItems: "center", justifyContent: "center", fontFamily: C.display, fontWeight: 800, fontSize: 15 }}>{marchio[0]}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: C.display, fontSize: 14.5, fontWeight: 800, letterSpacing: "-.02em" }}>{marchio}</div>
              <div style={{ fontSize: 9.5, color: C.mut, letterSpacing: ".14em", textTransform: "uppercase", fontWeight: 700, marginTop: 1 }}>Broker vs Broker</div>
            </div>
            <Pill>{admin ? "admin" : "E1 · partner"}</Pill>
          </div>

          <div style={{ minHeight: 460, maxHeight: 540, overflowY: "auto" }}><V admin={admin} /></div>

          <div style={{ display: "flex", background: C.s0, borderTop: `1px solid ${C.line}`, padding: "8px 6px" }}>
            {NAV.map((l, i) => (
              <button key={l} onClick={() => setTab(i)}
                style={{ flex: 1, background: "none", border: "none", cursor: "pointer", padding: "3px 0",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 5, fontFamily: C.sans,
                  color: tab === i ? C.acc : C.mut }}>
                <div style={{ width: 16, height: 2, background: tab === i ? C.acc : C.line2, borderRadius: 1 }} />
                <span style={{ fontSize: 11, fontWeight: 600 }}>{l}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ color: C.mut, fontSize: 11, textAlign: "center", marginTop: 11, lineHeight: 1.7 }}>
          Stessa app · cambia solo cosa vedi
        </div>
      </div>
    </div>
  );
}
