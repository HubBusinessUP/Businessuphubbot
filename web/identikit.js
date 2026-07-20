// Cache-busting + auto-update dell'app.
// NB: il file si chiama ancora identikit.js DI PROPOSITO. Rinominarlo romperebbe gli utenti
// che hanno in cache una app.html vecchia dentro Telegram: perderebbero proprio il meccanismo
// che serve a sbloccarli. Il questionario (identikit/sondaggio) e' stato eliminato:
// qui resta SOLO il versionamento.
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
var APP_BUILD = "88";
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
