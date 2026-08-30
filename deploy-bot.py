#!/usr/bin/env python3
"""
Pubblica il bot su Supabase.

    export SB=il_tuo_token_supabase
    python deploy-bot.py

Controlla il codice, lo carica e stampa la versione.
"""

import json
import os
import subprocess
import sys
import urllib.request

REF = "jwpbopkoscqooovfvwqn"
SLUG = "bvb2"
FILE = "bot/index.ts"
SB = os.environ.get("SB")


def controlla():
    """Se deno è installato, verifica che il codice compili."""
    try:
        r = subprocess.run(["deno", "check", FILE], capture_output=True, text=True)
        if r.returncode != 0:
            print("Il codice ha errori:\n", r.stderr[-1500:])
            return False
        print("codice ok")
        return True
    except FileNotFoundError:
        print("deno non installato, salto il controllo")
        return True


def pubblica():
    with open(FILE, "rb") as f:
        codice = f.read()

    confine = "----cashly"
    corpo = []
    corpo.append(f"--{confine}\r\n".encode())
    corpo.append(b'Content-Disposition: form-data; name="metadata"\r\n\r\n')
    corpo.append(json.dumps({
        "entrypoint_path": "index.ts",
        "name": SLUG,
        "verify_jwt": False,
    }).encode() + b"\r\n")
    corpo.append(f"--{confine}\r\n".encode())
    corpo.append(b'Content-Disposition: form-data; name="file"; filename="index.ts"\r\n')
    corpo.append(b"Content-Type: application/typescript\r\n\r\n")
    corpo.append(codice + b"\r\n")
    corpo.append(f"--{confine}--\r\n".encode())

    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{REF}/functions/deploy?slug={SLUG}",
        data=b"".join(corpo),
        headers={
            "Authorization": "Bearer " + SB,
            "Content-Type": f"multipart/form-data; boundary={confine}",
        },
    )
    d = json.load(urllib.request.urlopen(req))
    print(f"pubblicato · versione {d.get('version')} · {d.get('status')}")


if __name__ == "__main__":
    if not SB:
        print("Manca il token: export SB=...")
        sys.exit(1)
    if not os.path.exists(FILE):
        print(f"Non trovo {FILE}")
        sys.exit(1)
    if controlla():
        pubblica()
