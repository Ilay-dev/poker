# POKER Online Multiplayer (Texas Hold'em + Browser-Host WebRTC)

Minimalistisches Online-Texas-Hold'em komplett in React (schwarzer Hintergrund, weißer Text, dezente Karten-Akzente) nach offiziellen Standardregeln — **ohne externen Spielserver**.

Der Spieler, der einen Room erstellt (**Host**), ist direkt im Browser der autoritative Spielserver. Andere Spieler verbinden sich per **WebRTC DataChannel (PeerJS)** über den Room-Code oder Invite-Link.

## Features

- **Standard No-Limit Texas Hold'em**: Dealer-Button, Small & Big Blind (inkl. Heads-Up-Regel), Preflop, Flop, Turn, River, Showdown.
- **Individuelles Startgeld**: Beim Erstellen einer Lobby und in der Lobby frei festlegbar (Presets + eigener Betrag, inkl. passender Blinds).
- **Vollständige Side-Pot- & Odd-Chip-Logik**: Korrekte Aufteilung bei mehreren All-Ins und Split Pots.
- **Bots**: Optional KI-Gegner direkt in der Lobby hinzufügen.

## Lokal starten

```bash
npm install
npm run dev
```

Öffne `http://localhost:5173`.

## Tests & Typecheck

```bash
npm test
npm run typecheck
npm run build
```

