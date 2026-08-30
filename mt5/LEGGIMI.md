# Lettore conti MT5 · simultaneo

Legge **tutti i conti nello stesso momento** e manda su Telegram gli stessi
segnali che oggi arrivano dai collaboratori. Il bot Cashly li riconosce
senza modifiche.

---

## Come fa a leggerli insieme

MetaTrader accetta **un solo accesso per terminale**. Per leggere dodici
conti insieme servono dodici terminali, ognuno con la sua cartella.

Il programma apre un processo per ogni conto, ciascuno collegato al suo
terminale, e li tiene aperti. Un coordinatore confronta di continuo master
e slave di ogni cliente e manda i segnali quando qualcosa cambia.

```
C1 · Total FX    terminale 1  ─┐
C1 · Roboforex   terminale 2  ─┤
C2 · Total FX    terminale 3  ─┼──  coordinatore  ──  Telegram
C2 · Roboforex   terminale 4  ─┤
…                             ─┘
```

---

## Preparare i terminali

Una volta sola, per ogni conto:

**1.** Scarica l'installer di MetaTrader 5

**2.** Installalo in una cartella dedicata, per esempio `C:\MT5\C1_totalfx`

**3.** Ripeti per ogni conto, cambiando cartella

⚠️ Serve una **installazione separata per conto**, non la stessa aperta più
volte: due terminali sulla stessa cartella si disturbano.

In alternativa copia la cartella di MT5 e rinominala: funziona lo stesso,
perché il programma li avvia in modalità portable.

---

## Installazione

```
pip install MetaTrader5 requests
```

Copia `config.esempio.json` in `config.json` e compilalo.

---

## La configurazione

**telegram.token** — il bot che manda i segnali

**telegram.chat_id** — il canale dove scrivere. Se usi quello che il bot
Cashly già legge, i segnali entrano nel sistema da soli

**lettura_secondi** — ogni quanto ogni terminale rilegge il suo conto

**controllo_secondi** — ogni quanto il coordinatore confronta i conti

Per ogni cliente:

```
slave        il conto Total FX, quello che riceve il bonus
master       l'altro broker
terminale    il percorso del terminale dedicato a quel conto
capitale_slave / capitale_master    quanto è depositato su ciascuno
```

⚠️ Usa la **password investitore**, non quella principale: permette di
leggere ma non di operare.

---

## Avvio

```
python segnali.py
```

All'avvio parte un terminale per conto, uno ogni secondo e mezzo. Con
dodici conti servono venti secondi prima che siano tutti pronti.

Da lì in poi i conti sono letti **tutti insieme ogni tre secondi**.

Per farlo partire da solo all'accensione, mettilo nelle Utilità di
pianificazione di Windows.

---

## Cosa manda

```
🎁 Bonus changed
User: DANIELE GIAGNORIO
Account: SLAVE 5008239 @ OnamTrading-Live
New bonus: 900.00 EUR
```

```
✅ DANIELE GIAGNORIO: Cycle closed
Master (27448952): 163.90 (5000.00)
Slave (5008239): 9971.53 (5000.00)
Cycle P/L: 135.43
```

---

## Quanto pesa

Ogni terminale occupa circa 300 MB di memoria. Con dodici conti servono
almeno 8 GB di RAM sulla macchina.

Se il PC mini non regge, riduci i conti attivi o usa un servizio in cloud
che si collega con le sole credenziali.

---

## Prova senza rischi

Metti `"attivo": false` su tutti tranne un cliente. Avvia e guarda cosa
scrive nel terminale: vedrai saldo, bonus e posizioni aggiornarsi.

Quando i numeri tornano, attiva gli altri.
