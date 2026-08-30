#!/usr/bin/env python3
"""
Pubblica le pagine sul sito.

    export GH=il_tuo_token_github
    python pubblica.py                        tutte
    python pubblica.py web/bvb/index.html     una sola

Le pagine vivono gia' al percorso definitivo dentro il repository, quindi
locale e remoto coincidono. Per pubblicare un file da un percorso diverso:

    python pubblica.py "bozza.html=web/bvb/index.html"

A sinistra il file locale, a destra dove finisce nel repository.
"""

import base64
import json
import os
import sys
import urllib.request

REPO = "HubBusinessUP/Businessuphubbot"
BRANCH = "master"
GH = os.environ.get("GH")

PAGINE = [
    "web/bvb/index.html",             # dashboard cliente
    "web/bvb/ciclo/index.html",       # certificato del ciclo
    "web/bvb/totale/index.html",      # totale condivisibile
    "web/bvb/partner/index.html",     # area affiliato
    "web/bvb/admin/index.html",       # quadro delle reti
    "web/broker-vs-broker/index.html",  # landing
]

DESTINAZIONI = {p: p for p in PAGINE}


def chiama(metodo, percorso, corpo=None):
    req = urllib.request.Request(
        f"https://api.github.com/repos/{REPO}/contents/{percorso}",
        data=json.dumps(corpo).encode() if corpo else None,
        method=metodo,
        headers={
            "Authorization": "Bearer " + GH,
            "Accept": "application/vnd.github+json",
            "User-Agent": "cashly",
            "Content-Type": "application/json",
        },
    )
    try:
        return json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def pubblica(locale, remoto):
    with open(locale, "rb") as f:
        contenuto = f.read()
    attuale = chiama("GET", f"{remoto}?ref={BRANCH}")
    corpo = {
        "message": f"aggiorna {remoto}",
        "content": base64.b64encode(contenuto).decode(),
        "branch": BRANCH,
    }
    if attuale and attuale.get("sha"):
        corpo["sha"] = attuale["sha"]
    chiama("PUT", remoto, corpo)
    print(f"OK  {remoto:<36} {len(contenuto)} byte")


if __name__ == "__main__":
    if not GH:
        print("Manca il token: export GH=...")
        sys.exit(1)

    coppie = []
    for arg in sys.argv[1:]:
        if "=" in arg:
            a, b = arg.split("=", 1)
            coppie.append((a, b))
        elif arg in DESTINAZIONI:
            coppie.append((arg, DESTINAZIONI[arg]))

    if not coppie:
        print("Nessun file indicato. Pubblico tutte le pagine note.\n")
        coppie = [(a, b) for a, b in DESTINAZIONI.items() if os.path.exists(a)]

    for locale, remoto in coppie:
        pubblica(locale, remoto)
