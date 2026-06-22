# RawCrypt

An educational cryptography playground for teenagers (13-17). Watch multi-agent
cipher battles unfold in real time, try the ciphers yourself, and look up
crypto terms in the wiki.

## What's inside

- **9 ciphers** implemented from scratch in Python: shift, rail_fence,
  permutation, vigenere, substitution, stream (LFSR), toy Feistel, toy AES,
  toy RSA.
- **4 attacks** implemented honestly: brute_force, frequency_analysis,
  known_plaintext, dictionary.
- **Multi-agent simulation**: 2-10 communicators send messages, 1-5 attackers
  try to break them. Both sides evolve their strategy based on empirical
  success rates and per-cipher cost/security.
- **Live TUI** (Textual) for terminal viewing and a **web app** (FastAPI +
  vanilla HTML/CSS/JS) for browser viewing.
- **Cipher playground**: encrypt/decrypt your own messages with guided key
  help for each cipher.
- **Wiki**: teen-friendly explanations of every crypto term used in the sim.

## Quick start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run the web app (serves frontend + API on http://localhost:8000)
python -m uvicorn backend.api:app --port 8000

# Or run the TUI instead
python backend/run_simulation.py
```

Then open http://localhost:8000 in your browser.

## Project layout

```
RawCrypt/
├── backend/
│   ├── ciphers/              # 9 cipher implementations
│   ├── attacks/              # 4 attack implementations
│   ├── simulation/           # engine, agents, TUI
│   ├── api.py                # FastAPI server
│   ├── wiki.py               # wiki content
│   └── run_simulation.py     # TUI entry point
├── frontend/
│   ├── index.html            # home (matrix-rain hero)
│   ├── simulation.html       # live sim view (canvas + controls)
│   ├── playground.html       # cipher playground
│   ├── wiki.html             # wiki
│   ├── css/styles.css        # themed shared styles
│   └── js/                   # common, matrix, sim, playground, wiki
├── requirements.txt
└── README.md
```

## Themes

- **Light mode**: off-white background + orange accent
- **Dark mode**: near-black background + neon-green accent
- Default: follows your system theme; click the moon/sun icon in the navbar to override.

## Controls (simulation page)

| Slider | What it does |
|--------|--------------|
| Communicators (2-10) | Number of agents sending messages (hit Reset to apply) |
| Attackers (1-5) | Number of agents trying to break messages (hit Reset to apply) |
| Attacker temperature (0.1-2.0) | Lower = more exploitative, higher = more explorative (live) |
| Communicator temperature (0.1-2.0) | Same, but for cipher selection (live) |
| Tick speed (0.2-3.0s) | Seconds between ticks (live) |

Click any agent on the canvas (or in the roster) to:
- **Communicators**: open their WhatsApp-style phone showing every encrypted
  message they've sent/received, with red banners on intercepted ones.
- **Attackers**: open their log of every attack attempt with success/failure.

## Tech stack

- **Backend**: Python 3.12, FastAPI, uvicorn, WebSockets
- **Frontend**: vanilla HTML, CSS, JS (no framework), FontAwesome icons,
  Google Fonts (Inter / Space Grotesk / JetBrains Mono)
- **TUI**: Textual
