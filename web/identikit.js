// Assessment di consapevolezza business + calcolo identikit e semaforo di compatibilità.
// Condiviso tra sondaggio.html (test), dashboard.html (pallini) e account.html (profilo).

const CONS_Q = [
  { key: "c1", q: "Perché vuoi fare business?", dim: "motivazione", opts: [
    { t: "Libertà economica", v: 3 }, { t: "Un reddito extra", v: 2 }, { t: "Cambiare vita e lavoro", v: 3 }, { t: "Solo per capire", v: 1 } ] },
  { key: "c2", q: "Entro quando vuoi i primi risultati concreti?", dim: "consapevolezza", opts: [
    { t: "Entro 1 mese", v: 0 }, { t: "3-6 mesi", v: 2 }, { t: "Entro un anno", v: 3 }, { t: "Non ho fretta", v: 3 } ] },
  { key: "c3", q: "Obiettivo di guadagno mensile?", dim: "motivazione", opts: [
    { t: "Qualche centinaio di €", v: 1 }, { t: "1.000-3.000 €", v: 2 }, { t: "3.000-10.000 €", v: 3 }, { t: "Oltre 10.000 €", v: 3 } ] },
  { key: "c4", q: "Quanto tempo puoi dedicare a settimana?", dim: "risorse", param: "tempo", opts: [
    { t: "Meno di 5 ore", v: 0, lvl: 1 }, { t: "5-10 ore", v: 1, lvl: 2 }, { t: "10-20 ore", v: 2, lvl: 3 }, { t: "Full time", v: 3, lvl: 4 } ] },
  { key: "c5", q: "Qual è il budget massimo che puoi investire?", type: "number", param: "budget", suffix: "€", placeholder: "es. 3000" },
  { key: "c6", q: "La tua entrata principale oggi?", dim: "risorse", opts: [
    { t: "Stipendio fisso", v: 3 }, { t: "Lavoro autonomo variabile", v: 2 }, { t: "Nessuna entrata stabile", v: 0 }, { t: "Rendite / altro", v: 3 } ] },
  { key: "c7", q: "Quanto è stabile la tua situazione economica?", dim: "risorse", opts: [
    { t: "Molto stabile", v: 3 }, { t: "Abbastanza", v: 2 }, { t: "Precaria", v: 1 }, { t: "In difficoltà", v: 0 } ] },
  { key: "c8", q: "Come reagisci al rischio di perdere i soldi investiti?", dim: "rischio", param: "rischio", opts: [
    { t: "Non investo se rischio", v: 0, lvl: 1 }, { t: "Accetto piccole perdite", v: 1, lvl: 2 }, { t: "Rischio calcolato per crescere", v: 2, lvl: 2 }, { t: "Rischio alto per grandi ritorni", v: 3, lvl: 3 } ] },
  { key: "c9", q: 'Un metodo con "guadagni garantiti e facili" per te è…', dim: "consapevolezza", opts: [
    { t: "Ci provo subito", v: 0 }, { t: "Curioso ma cauto", v: 1 }, { t: "Diffido", v: 2 }, { t: "Una bandiera rossa", v: 3 } ] },
  { key: "c10", q: "Davanti a un mese in perdita…", dim: "disciplina", opts: [
    { t: "Mollo", v: 0 }, { t: "Mi demoralizzo ma continuo", v: 1 }, { t: "Analizzo e correggo", v: 3 }, { t: "È parte del percorso", v: 3 } ] },
  { key: "c11", q: "Preferisci un guadagno…", dim: "rischio", opts: [
    { t: "Piccolo ma sicuro", v: 0 }, { t: "Medio e costante", v: 1 }, { t: "Variabile ma potenzialmente alto", v: 3 } ] },
  { key: "c12", q: "Che esperienza hai con business/investimenti?", dim: "competenze", param: "esperienza", opts: [
    { t: "Nessuna", v: 0, lvl: 1 }, { t: "Studiato ma mai fatto", v: 1, lvl: 2 }, { t: "Provato qualcosa", v: 2, lvl: 3 }, { t: "Ho già guadagnato online", v: 3, lvl: 4 } ] },
  { key: "c13", q: "Dimestichezza con app, siti, wallet?", dim: "competenze", opts: [
    { t: "Poca", v: 0 }, { t: "Il minimo", v: 1 }, { t: "Bene", v: 2 }, { t: "Molto bene", v: 3 } ] },
  { key: "c14", q: "Sai vendere o convincere le persone?", dim: "competenze", opts: [
    { t: "No, mi mette a disagio", v: 0 }, { t: "Se serve ci provo", v: 1 }, { t: "Me la cavo", v: 2 }, { t: "È il mio punto forte", v: 3 } ] },
  { key: "c15", q: "Quanta voglia hai di studiare e imparare?", dim: "competenze", opts: [
    { t: "Poco tempo per studiare", v: 0 }, { t: "Se è pratico sì", v: 1 }, { t: "Studio volentieri", v: 2 }, { t: "Imparo di continuo", v: 3 } ] },
  { key: "c16", q: "Quanto sei costante nel portare avanti le cose?", dim: "disciplina", opts: [
    { t: "Parto forte e mollo", v: 0 }, { t: "A fasi alterne", v: 1 }, { t: "Abbastanza costante", v: 2 }, { t: "Molto disciplinato", v: 3 } ] },
  { key: "c17", q: "Come gestisci il tuo tempo?", dim: "disciplina", opts: [
    { t: "Vado a istinto", v: 0 }, { t: "Ci provo ma mi disperdo", v: 1 }, { t: "Ho una routine", v: 2 }, { t: "Pianifico tutto", v: 3 } ] },
  { key: "c18", q: "Preferisci lavorare…", opts: [
    { t: "Da solo, in autonomia" }, { t: "Seguito passo-passo" }, { t: "In squadra / community" }, { t: "Indifferente" } ] },
  { key: "c19", q: "Quale attività ti attira di più?", opts: [
    { t: "Trading e mercati" }, { t: "Affiliazione / referral" }, { t: "Vendita prodotti o servizi" }, { t: "Ancora non lo so" } ] },
  { key: "c20", q: "Che tipo di reddito preferisci?", opts: [
    { t: "Attivo, in cambio del mio tempo" }, { t: "Semi-passivo con un sistema" }, { t: "Passivo il più possibile" } ] },
  { key: "c21", q: "Quanto conta per te avere guida e supporto?", opts: [
    { t: "Fondamentale" }, { t: "Utile ma non indispensabile" }, { t: "Faccio da solo" } ] },
  { key: "c22", q: "Come ti descriveresti oggi in ambito business?", dim: "consapevolezza", opts: [
    { t: "Principiante curioso", v: 1 }, { t: "In cerca della strada giusta", v: 1 }, { t: "Ho le idee ma non gli strumenti", v: 2 }, { t: "Pronto a partire sul serio", v: 3 } ] },
];

const CONS_DIM = {
  motivazione:   { label: "Motivazione",    color: "#e2574a" },
  risorse:       { label: "Risorse",        color: "#5aa9f0" },
  rischio:       { label: "Rischio",        color: "#e6b24c" },
  competenze:    { label: "Competenze",     color: "#25c366" },
  disciplina:    { label: "Disciplina",     color: "#9b6ef0" },
  consapevolezza:{ label: "Consapevolezza", color: "#38c6c6" },
};

// ans: { c1: indice_opzione, ..., c5: numero }. Ritorna scores 0-100, archetipo, forze, lacune e i parametri per il semaforo.
function computeIdentikit(ans) {
  const sum = {}, max = {};
  for (const q of CONS_Q) {
    if (!q.dim) continue;
    const idx = ans[q.key];
    const opt = (idx != null && q.opts) ? q.opts[idx] : null;
    const v = (opt && opt.v != null) ? opt.v : 0;
    sum[q.dim] = (sum[q.dim] || 0) + v;
    max[q.dim] = (max[q.dim] || 0) + 3;
  }
  const scores = {};
  for (const d in CONS_DIM) scores[d] = max[d] ? Math.round(sum[d] / max[d] * 100) : 0;

  const s = scores;
  let archetipo, descrizione;
  if (s.motivazione >= 60 && s.consapevolezza < 45) { archetipo = "Sognatore da educare"; descrizione = "Tanta spinta: ti servono più realismo e consapevolezza dei rischi."; }
  else if (s.competenze >= 60 && s.risorse >= 50) { archetipo = "Veterano selettivo"; descrizione = "Hai esperienza e mezzi: cerchi opportunità serie e selezionate."; }
  else if (s.disciplina >= 60 && s.risorse >= 40) { archetipo = "Costruttore disciplinato"; descrizione = "Metodico e costante: costruisci nel tempo, passo dopo passo."; }
  else if (s.risorse >= 60) { archetipo = "Operativo con risorse"; descrizione = "Hai mezzi ma poco tempo: cerchi sistemi efficienti."; }
  else if (s.rischio < 40) { archetipo = "Prudente cauto"; descrizione = "Preferisci la sicurezza: parti piccolo, con business a basso rischio."; }
  else { archetipo = "Esploratore curioso"; descrizione = "Sei all'inizio e motivato: ti serve un percorso guidato per partire."; }

  const ordered = Object.keys(CONS_DIM).sort((a, b) => s[b] - s[a]);
  const forze = ordered.slice(0, 2).map((d) => CONS_DIM[d].label);
  const lacune = ordered.slice(-2).map((d) => CONS_DIM[d].label);

  const paramOf = (key) => {
    const q = CONS_Q.find((x) => x.key === key);
    const idx = ans[key];
    return (idx != null && q.opts && q.opts[idx]) ? (q.opts[idx].lvl || 0) : 0;
  };
  const params = {
    budget: Number(ans.c5) || 0,
    tempo: paramOf("c4"),
    rischio: paramOf("c8"),
    esperienza: paramOf("c12"),
  };

  return { scores, archetipo, descrizione, forze, lacune, params };
}

// Confronta i parametri dell'utente con i requisiti del business.
// Ritorna "verde" | "giallo" | "rosso" | null (null = niente dato, nessun pallino).
function computeSemaforo(params, req) {
  if (!params) return null;
  const checks = [];
  if (req.budget_minimo) {
    const u = params.budget;
    checks.push(u >= req.budget_minimo ? 0 : (u >= req.budget_minimo * 0.8 ? 1 : 2));
  }
  if (req.rischio_livello) {
    // rischio richiesto 1-3 vs soglia utente 1-3
    const need = req.rischio_livello, tol = params.rischio || 1;
    checks.push(need <= tol ? 0 : (need === tol + 1 ? 1 : 2));
  }
  if (req.tempo_richiesto) {
    const need = req.tempo_richiesto, have = params.tempo || 0;
    checks.push(have >= need ? 0 : (have === need - 1 ? 1 : 2));
  }
  if (req.esperienza_richiesta) {
    const need = req.esperienza_richiesta, have = params.esperienza || 0;
    checks.push(have >= need ? 0 : (have === need - 1 ? 1 : 2));
  }
  if (!checks.length) return null;
  const worst = Math.max(...checks);
  return worst === 0 ? "verde" : (worst === 1 ? "giallo" : "rosso");
}

// Percentuale di compatibilità 0-100 tra i parametri utente e i requisiti del business.
// Additiva: usa gli stessi req di computeSemaforo, non altera nulla di esistente.
function computeCompat(params, req) {
  if (!params) return null;
  let tot = 0, got = 0;
  if (req.budget_minimo) {                       // peso 35
    tot += 35;
    const u = params.budget || 0, need = req.budget_minimo;
    got += u >= need ? 35 : (u >= need * 0.8 ? 18 : 0);
  }
  if (req.rischio_livello) {                      // peso 30
    tot += 30;
    const d = req.rischio_livello - (params.rischio || 1);
    got += d <= 0 ? 30 : (d === 1 ? 15 : 3);
  }
  if (req.esperienza_richiesta) {                 // peso 20
    tot += 20;
    const d = req.esperienza_richiesta - (params.esperienza || 0);
    got += d <= 0 ? 20 : (d === 1 ? 10 : 2);
  }
  if (req.tempo_richiesto) {                      // peso 15
    tot += 15;
    const d = req.tempo_richiesto - (params.tempo || 0);
    got += d <= 0 ? 15 : (d === 1 ? 8 : 2);
  }
  if (!tot) return null;
  return Math.round(got / tot * 100);
}

if (typeof window !== "undefined") {
  window.CONS_Q = CONS_Q;
  window.CONS_DIM = CONS_DIM;
  window.computeIdentikit = computeIdentikit;
  window.computeSemaforo = computeSemaforo;
  window.computeCompat = computeCompat;
}

// Cache-busting: ogni click su un link interno a una pagina .html forza l'ultima versione.
// Così gli aggiornamenti arrivano subito, senza che l'utente svuoti la cache.
if (typeof document !== "undefined") {
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (/^https?:\/\//i.test(href) || /^(mailto:|tel:|javascript:|#)/i.test(href)) return;
    if (href.indexOf(".html") < 0 || href.indexOf("_=") >= 0) return;
    var hi = href.indexOf("#");
    var hash = hi >= 0 ? href.slice(hi) : "";
    var base = hi >= 0 ? href.slice(0, hi) : href;
    base += (base.indexOf("?") < 0 ? "?" : "&") + "_=" + Date.now();
    a.href = base + hash;
  }, true);
}

// Auto-update: se il server ha una build più nuova, l'app si ricarica DA SOLA (nessuna cache da svuotare,
// batte anche Telegram che tiene viva la webview). Controlla all'avvio e ogni volta che torna in primo piano.
var APP_BUILD = "14";
if (typeof document !== "undefined" && typeof fetch !== "undefined") {
  var checkBuild = function () {
    if (document.hidden) return;
    fetch("version.json?_=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.v || d.v === APP_BUILD) return;
        // Anti-loop robusto: marker nell'URL, sopravvive ai reload (non dipende da sessionStorage).
        if (location.href.indexOf("_v=" + d.v) >= 0) return;
        var q = location.search ? location.search + "&" : "?";
        location.replace(location.pathname + q + "_v=" + d.v + "&_=" + Date.now() + (location.hash || ""));
      })
      .catch(function () {});
  };
  // Primo check DOPO il rendering (non blocca il caricamento), poi a ogni ritorno in primo piano.
  setTimeout(checkBuild, 1500);
  document.addEventListener("visibilitychange", checkBuild);
}
