"""
Cashly · lettore conti MT5 simultaneo

Ogni conto ha il suo processo e il suo terminale MT5: i conti vengono letti
tutti nello stesso momento, non a turno.
Un coordinatore confronta master e slave di ogni cliente e manda i segnali
su Telegram nello stesso formato dei collaboratori.

    pip install MetaTrader5 requests
"""

import json
import os
import time
from datetime import datetime
from multiprocessing import Process, Manager

import requests

QUI = os.path.dirname(os.path.abspath(__file__))
CONFIG = os.path.join(QUI, "config.json")
STATO = os.path.join(QUI, "stato.json")


def leggi(p, default=None):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def scrivi(p, d):
    with open(p, "w", encoding="utf-8") as f:
        json.dump(d, f, indent=2, ensure_ascii=False)


def log(*a):
    print(datetime.now().strftime("%H:%M:%S"), *a, flush=True)


# ---------------------------------------------------------- un conto, un processo

def sorveglia(conto, lavagna, ogni):
    """Gira in un processo suo: apre il proprio terminale e non lo lascia mai."""
    import MetaTrader5 as mt5

    etichetta = f"{conto['cliente']}/{conto['ruolo']}"
    percorso = conto.get("terminale")

    ok = mt5.initialize(
        path=percorso,
        login=int(conto["login"]),
        password=conto["password"],
        server=conto["server"],
        portable=bool(conto.get("portable", True)),
    ) if percorso else mt5.initialize(
        login=int(conto["login"]), password=conto["password"], server=conto["server"]
    )

    if not ok:
        log(f"[{etichetta}] terminale non parte:", mt5.last_error())
        lavagna[conto["login"]] = {"errore": str(mt5.last_error())}
        return

    log(f"[{etichetta}] collegato al conto {conto['login']}")

    try:
        while True:
            info = mt5.account_info()
            if info is None:
                lavagna[conto["login"]] = {"errore": "nessun dato"}
            else:
                pos = mt5.positions_get()
                lavagna[conto["login"]] = {
                    "cliente": conto["cliente"],
                    "ruolo": conto["ruolo"],
                    "login": str(conto["login"]),
                    "server": conto["server"],
                    "saldo": round(info.balance, 2),
                    "equity": round(info.equity, 2),
                    "bonus": round(info.credit, 2),
                    "aperte": len(pos) if pos is not None else 0,
                    "letto": time.time(),
                }
            time.sleep(ogni)
    except KeyboardInterrupt:
        pass
    finally:
        mt5.shutdown()


# ---------------------------------------------------------------- telegram

def manda(cfg, testo):
    try:
        r = requests.post(
            f"https://api.telegram.org/bot{cfg['telegram']['token']}/sendMessage",
            json={"chat_id": cfg["telegram"]["chat_id"], "text": testo,
                  "disable_web_page_preview": True}, timeout=15)
        if not r.json().get("ok"):
            log("Telegram ha rifiutato:", r.text[:160])
            return False
        return True
    except Exception as e:
        log("Telegram non raggiungibile:", e)
        return False


def segnale_bonus(nome, login, server, bonus):
    return ("🎁 Bonus changed\n"
            f"User: {nome.upper()}\n"
            f"Account: SLAVE {login} @ {server}\n"
            f"New bonus: {bonus:.2f} EUR")


def segnale_chiusura(nome, tipo, master, slave, cap_m, cap_s, pl):
    icona = "✅" if tipo == "Cycle closed" else "⚠️"
    return (f"{icona} {nome.upper()}: {tipo}\n"
            f"Master ({master['login']}): {master['saldo']:.2f} ({cap_m:.2f})\n"
            f"Slave ({slave['login']}): {slave['saldo']:.2f} ({cap_s:.2f})\n"
            f"Cycle P/L: {pl:.2f}")


# ---------------------------------------------------------------- coordinatore

def coordina(cfg, lavagna):
    stato = leggi(STATO, {}) or {}
    ogni = float(cfg.get("controllo_secondi", 5))
    scaduto = float(cfg.get("dato_vecchio_secondi", 180))

    log("coordinatore avviato")
    while True:
        time.sleep(ogni)
        adesso = time.time()

        for c in cfg["clienti"]:
            if not c.get("attivo", True):
                continue
            nome = c["nome"]
            m = lavagna.get(str(c["master"]["login"])) or lavagna.get(c["master"]["login"])
            s = lavagna.get(str(c["slave"]["login"])) or lavagna.get(c["slave"]["login"])
            if not m or not s or "errore" in m or "errore" in s:
                continue
            if adesso - m.get("letto", 0) > scaduto or adesso - s.get("letto", 0) > scaduto:
                continue

            st = stato.setdefault(nome, {"bonus": None, "aperte": 0, "primo_fatto": False})

            # bonus cambiato sul conto slave
            if st["bonus"] is not None and s["bonus"] != st["bonus"]:
                if manda(cfg, segnale_bonus(nome, s["login"], s["server"], s["bonus"])):
                    log(f"{nome} · bonus {st['bonus']} → {s['bonus']}")
            st["bonus"] = s["bonus"]

            # posizioni chiuse su entrambi i conti
            aperte = m["aperte"] + s["aperte"]
            if st["aperte"] > 0 and aperte == 0:
                cap_m = float(c.get("capitale_master", 0))
                cap_s = float(c.get("capitale_slave", 0))
                pl = (m["saldo"] + s["saldo"]) - (cap_m + cap_s)
                tipo = "Step 1 closed" if (s["bonus"] == 0 and not st["primo_fatto"]) else "Cycle closed"
                if manda(cfg, segnale_chiusura(nome, tipo, m, s, cap_m, cap_s, pl)):
                    log(f"{nome} · {tipo} · P/L {pl:.2f}")
                st["primo_fatto"] = (tipo == "Step 1 closed")
            elif st["aperte"] == 0 and aperte > 0:
                log(f"{nome} · posizioni aperte ({aperte})")

            st["aperte"] = aperte
            scrivi(STATO, stato)


# ---------------------------------------------------------------- avvio

def conti_da(cfg):
    for c in cfg["clienti"]:
        if not c.get("attivo", True):
            continue
        for ruolo in ("master", "slave"):
            d = dict(c[ruolo])
            d["cliente"] = c["nome"]
            d["ruolo"] = ruolo
            yield d


def main():
    cfg = leggi(CONFIG)
    if cfg is None:
        print("Manca config.json — copia config.esempio.json e compilalo.")
        return

    conti = list(conti_da(cfg))
    if not conti:
        print("Nessun conto attivo in config.json")
        return

    ogni = float(cfg.get("lettura_secondi", 3))
    manager = Manager()
    lavagna = manager.dict()

    processi = []
    for conto in conti:
        p = Process(target=sorveglia, args=(conto, lavagna, ogni), daemon=True)
        p.start()
        processi.append(p)
        time.sleep(1.5)   # i terminali non partono tutti insieme

    log(f"{len(processi)} conti sorvegliati insieme · lettura ogni {ogni}s")

    try:
        coordina(cfg, lavagna)
    except KeyboardInterrupt:
        log("fermato a mano")
    finally:
        for p in processi:
            p.terminate()


if __name__ == "__main__":
    main()
