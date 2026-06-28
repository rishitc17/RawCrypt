"""FastAPI backend for RawCrypt.

Exposes:
  • Static files from ../frontend/  (the vanilla HTML/CSS/JS site)
  • REST endpoints for cipher playground, wiki, sim control
  • WebSocket /ws/sim that streams live sim events + state to the browser

Run with:
    uvicorn backend.api:app --reload --port 8000
or
    python -m backend.api
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from contextlib import asynccontextmanager
from typing import Any, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Path setup — make the simulation modules importable.
# ---------------------------------------------------------------------------
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(BACKEND_DIR)
SIM_DIR = os.path.join(BACKEND_DIR, "simulation")
FRONTEND_DIR = os.path.join(REPO_ROOT, "frontend")
for d in (BACKEND_DIR, SIM_DIR):
    if d not in sys.path:
        sys.path.insert(0, d)

from engine import Simulation            # noqa: E402
from cipher_meta import CIPHER_REGISTRY  # noqa: E402
from attack_meta import ATTACK_REGISTRY  # noqa: E402
import wiki as wiki_module               # noqa: E402


# ---------------------------------------------------------------------------
# Simulation manager — a single shared sim instance driven by a background
# asyncio task. WebSocket clients receive a snapshot on connect, then
# tick-level updates as the sim runs.
# ---------------------------------------------------------------------------

class SimManager:
    def __init__(self):
        self.sim: Simulation = Simulation(num_communicators=4, num_attackers=2,
                                          attacker_temperature=1.0, seed=42)
        self.running: bool = False       # start paused
        self.tick_interval: float = 0.9
        self._task: Optional[asyncio.Task] = None
        self._subscribers: list[WebSocket] = []

    async def start(self):
        if self._task is None or self._task.done():
            self.running = True
            self._task = asyncio.create_task(self._loop())

    async def pause(self):
        self.running = False

    async def reset(self, num_comms: int, num_atks: int,
                    attacker_temp: float, communicator_temp: float,
                    tick_interval: float, attack_budget: float,
                    seed: Optional[int]):
        was_running = self.running
        await self.pause()
        # Wait one tick for the loop to actually stop.
        await asyncio.sleep(0.05)
        self.sim = Simulation(num_communicators=num_comms,
                              num_attackers=num_atks,
                              attacker_temperature=attacker_temp,
                              communicator_temperature=communicator_temp,
                              attack_budget=attack_budget,
                              seed=seed)
        self.tick_interval = tick_interval
        if was_running:
            await self.start()
        # Notify subscribers of the reset.
        await self.broadcast(self._snapshot())

    async def _loop(self):
        import time as _time
        # Fixed minimum delay between ticks for safety (prevent CPU
        # spin). The sim runs as fast as the backend can compute.
        MIN_DELAY = 0.1
        while self.running:
            t0 = _time.monotonic()
            events = await asyncio.to_thread(self.sim.step)
            await self.broadcast({
                "type": "tick",
                "tick": self.sim.tick,
                "events": [_event_to_dict(e) for e in events],
                "stats": self._stats(),
            })
            # Sleep for the minimum delay, minus any time already spent
            # computing. If computation took longer than MIN_DELAY, just
            # yield once to the event loop.
            elapsed = _time.monotonic() - t0
            sleep_time = max(0.001, MIN_DELAY - elapsed)
            await asyncio.sleep(sleep_time)

    def _stats(self) -> dict:
        s = self.sim
        return {
            "tick": s.tick,
            "rsa_params": getattr(s, "rsa_params", None),
            "cipher_usage": [
                {"name": n, "used": s.cipher_usage.get(n, 0),
                 "broken": s.cipher_breaks.get(n, 0)}
                for n in CIPHER_REGISTRY
            ],
            "attack_usage": [
                {"name": n, "used": s.attack_usage.get(n, 0),
                 "success": s.attack_success.get(n, 0)}
                for n in ATTACK_REGISTRY
            ],
            "communicators": [
                {"name": c.name,
                 "sent": s.communicator_sent.get(c.name, 0),
                 "broken": s.communicator_broken.get(c.name, 0),
                 "top_actions": c.strategy.top_actions(k=20)}
                for c in s.communicators
            ],
            "attackers": [
                {"name": a.name,
                 "attempts": s.attacker_attempts.get(a.name, 0),
                 "success": s.attacker_success.get(a.name, 0),
                 "top_actions": a.strategy.top_actions(k=20)}
                for a in s.attackers
            ],
            "summary": s.environment_summary(),
        }

    def _snapshot(self) -> dict:
        s = self.sim
        return {
            "type": "snapshot",
            "running": self.running,
            "tick_interval": self.tick_interval,
            "config": {
                "num_communicators": len(s.communicators),
                "num_attackers": len(s.attackers),
                "attacker_temperature": s.attacker_temperature,
                "communicator_temperature": s.communicator_temperature,
                "attack_budget": s.attack_budget,
            },
            "recent_events": [_event_to_dict(e) for e in s.recent_events(50)],
            "stats": self._stats(),
        }

    async def subscribe(self, ws: WebSocket):
        await ws.accept()
        self._subscribers.append(ws)
        try:
            await ws.send_text(json.dumps(self._snapshot()))
            while True:
                # Keep the socket open; we don't expect incoming messages
                # but we read so we detect disconnects.
                await ws.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            if ws in self._subscribers:
                self._subscribers.remove(ws)

    async def broadcast(self, msg: dict):
        text = json.dumps(msg)
        dead = []
        for ws in self._subscribers:
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            if ws in self._subscribers:
                self._subscribers.remove(ws)

    def set_attacker_temperature(self, temp: float):
        self.sim.set_attacker_temperature(temp)

    def set_communicator_temperature(self, temp: float):
        self.sim.set_communicator_temperature(temp)

    def set_tick_interval(self, seconds: float):
        self.tick_interval = float(seconds)


def _event_to_dict(ev) -> dict:
    return {
        "tick": ev.tick,
        "kind": ev.kind,
        "sender": ev.sender,
        "target": ev.target,
        "cipher": ev.cipher,
        "attack": ev.attack,
        "attacker": ev.attacker,
        "message_preview": ev.message_preview,
        "security_level": ev.security_level,
        "notes": ev.notes,
    }


# ---------------------------------------------------------------------------
# Session store — each browser tab gets its own SimManager.
# ---------------------------------------------------------------------------

class SessionStore:
    """Maps session IDs to SimManager instances.

    Each WebSocket connection creates a new session (or reconnects to an
    existing one). REST endpoints look up the session by the X-Session-Id
    header. Sessions are cleaned up 60 seconds after their WebSocket
    disconnects.
    """

    def __init__(self):
        self._sessions: dict[str, SimManager] = {}
        self._cleanup_tasks: dict[str, asyncio.Task] = {}

    def get_or_create(self, session_id: str) -> SimManager:
        if session_id not in self._sessions:
            self._sessions[session_id] = SimManager()
        # Cancel any pending cleanup.
        if session_id in self._cleanup_tasks:
            self._cleanup_tasks[session_id].cancel()
            del self._cleanup_tasks[session_id]
        return self._sessions[session_id]

    def get(self, session_id: str) -> Optional[SimManager]:
        return self._sessions.get(session_id)

    def schedule_cleanup(self, session_id: str):
        """Schedule session destruction after 60s. Cancelled on reconnect."""
        async def _cleanup():
            await asyncio.sleep(60)
            mgr = self._sessions.pop(session_id, None)
            if mgr:
                await mgr.pause()
            self._cleanup_tasks.pop(session_id, None)
        if session_id in self._cleanup_tasks:
            self._cleanup_tasks[session_id].cancel()
        self._cleanup_tasks[session_id] = asyncio.create_task(_cleanup())


sessions = SessionStore()


# ---------------------------------------------------------------------------
# FastAPI app.
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Sessions are created on-demand when WebSocket clients connect.
    yield
    # On shutdown, pause all running sessions.
    for mgr in sessions._sessions.values():
        await mgr.pause()


app = FastAPI(title="RawCrypt API", lifespan=lifespan)

# CORS — allow GitHub Pages frontend to talk to the Render backend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://rishitc17.github.io",  # GitHub Pages frontend
        "http://localhost:8000",         # local dev
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/.well-known/appspecific/com.chrome.devtools.json")
async def chrome_devtools_wellknown():
    """Return a 404 silently for Chrome DevTools probe (harmless)."""
    return JSONResponse({"error": "not found"}, status_code=404)


# --- Static frontend ------------------------------------------------------
# Mount /css, /js, /assets as static dirs; serve HTML pages via explicit
# routes so we don't need extension-based routing on the root.

if os.path.isdir(FRONTEND_DIR):
    app.mount("/css", StaticFiles(directory=os.path.join(FRONTEND_DIR, "css")),
              name="css")
    app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")),
              name="js")
    if os.path.isdir(os.path.join(FRONTEND_DIR, "assets")):
        app.mount("/assets",
                  StaticFiles(directory=os.path.join(FRONTEND_DIR, "assets")),
                  name="assets")


@app.get("/", response_class=HTMLResponse)
async def index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


@app.get("/simulation", response_class=HTMLResponse)
async def simulation_page():
    return FileResponse(os.path.join(FRONTEND_DIR, "simulation.html"))


@app.get("/playground", response_class=HTMLResponse)
async def playground_page():
    return FileResponse(os.path.join(FRONTEND_DIR, "playground.html"))


@app.get("/wiki", response_class=HTMLResponse)
async def wiki_page():
    return FileResponse(os.path.join(FRONTEND_DIR, "wiki.html"))


# --- Sim control ----------------------------------------------------------

class SimConfig(BaseModel):
    num_communicators: int = 4
    num_attackers: int = 2
    attacker_temperature: float = 1.0
    communicator_temperature: float = 1.2
    attack_budget: float = 1.5
    tick_interval: float = 0.9
    seed: Optional[int] = None


class LiveTunable(BaseModel):
    attacker_temperature: Optional[float] = None
    communicator_temperature: Optional[float] = None
    tick_interval: Optional[float] = None


def _get_session(request: Request) -> SimManager:
    """Extract the session ID from the X-Session-Id header."""
    session_id = request.headers.get("X-Session-Id", "")
    mgr = sessions.get(session_id) if session_id else None
    if mgr is None:
        mgr = sessions.get_or_create(session_id or "default")
    return mgr


@app.post("/api/sim/start")
async def sim_start(request: Request):
    mgr = _get_session(request)
    await mgr.start()
    return {"running": True}


@app.post("/api/sim/pause")
async def sim_pause(request: Request):
    mgr = _get_session(request)
    await mgr.pause()
    return {"running": False}


@app.post("/api/sim/reset")
async def sim_reset(cfg: SimConfig, request: Request):
    mgr = _get_session(request)
    await mgr.reset(
        num_comms=cfg.num_communicators,
        num_atks=cfg.num_attackers,
        attacker_temp=cfg.attacker_temperature,
        communicator_temp=cfg.communicator_temperature,
        tick_interval=cfg.tick_interval,
        attack_budget=cfg.attack_budget,
        seed=cfg.seed,
    )
    return {"ok": True, "config": cfg.dict()}


@app.post("/api/sim/tune")
async def sim_tune(params: LiveTunable, request: Request):
    mgr = _get_session(request)
    if params.attacker_temperature is not None:
        mgr.set_attacker_temperature(params.attacker_temperature)
    if params.communicator_temperature is not None:
        mgr.set_communicator_temperature(params.communicator_temperature)
    if params.tick_interval is not None:
        mgr.set_tick_interval(params.tick_interval)
    return {"ok": True,
            "attacker_temperature": mgr.sim.attacker_temperature,
            "communicator_temperature": mgr.sim.communicator_temperature,
            "tick_interval": mgr.tick_interval}


@app.get("/api/sim/state")
async def sim_state(request: Request):
    mgr = _get_session(request)
    return mgr._snapshot()


@app.get("/api/sim/agent/{name}/chat")
async def agent_chat(name: str, request: Request):
    mgr = _get_session(request)
    return mgr.sim.communicator_chat_history(name)


@app.get("/api/sim/agent/{name}/attacks")
async def agent_attacks(name: str, request: Request):
    mgr = _get_session(request)
    return mgr.sim.attacker_observation_log(name)


# --- WebSocket ------------------------------------------------------------

@app.websocket("/ws/sim")
async def ws_sim(ws: WebSocket):
    # Session ID is passed as a query parameter: /ws/sim?session=ABC123
    session_id = ws.query_params.get("session", "")
    if not session_id:
        await ws.close(code=1008, reason="Missing session ID")
        return
    mgr = sessions.get_or_create(session_id)
    await mgr.subscribe(ws)
    # On disconnect, schedule cleanup.
    sessions.schedule_cleanup(session_id)


# --- Cipher playground ----------------------------------------------------

class CipherRequest(BaseModel):
    cipher: str
    text: str       # plaintext (for encrypt) or hex string (for decrypt)
    key: Any        # cipher-specific; we accept any JSON value


def _coerce_key(cipher_name: str, key: Any):
    """Coerce a JSON-decoded key into the type the cipher expects.

    The cipher modules' key types are heterogeneous (int, str, list, dict,
    tuple). The browser can only send JSON, so we convert here.
    """
    if cipher_name in ("shift", "rail_fence"):
        return int(key)
    if cipher_name in ("vigenere",):
        return str(key)
    if cipher_name in ("feistel", "aes"):
        return str(key)
    if cipher_name == "permutation":
        return [int(x) for x in key]
    if cipher_name == "substitution":
        return {str(k): str(v) for k, v in key.items()}
    if cipher_name == "stream":
        seed, taps = key
        return (str(seed), [int(t) for t in taps])
    if cipher_name == "rsa":
        # key can be None (use shared instance) or {"p":..,"q":..,"e":..}
        if key is None or key == "":
            return None
        if isinstance(key, dict):
            return (int(key["p"]), int(key["q"]), int(key["e"]))
        return None
    return key


CIPHER_KEY_HELP = {
    "shift": {
        "format": "integer 1-255",
        "placeholder": "7",
        "example": "7",
        "description": "The Caesar shift amount. Each byte of the plaintext "
                       "is shifted forward by this many positions mod 256.",
    },
    "rail_fence": {
        "format": "integer 2-8",
        "placeholder": "3",
        "example": "3",
        "description": "The number of rails in the zig-zag pattern.",
    },
    "permutation": {
        "format": "8 numbers 0-7, comma-separated",
        "placeholder": "2,0,5,1,7,3,6,4",
        "example": "2,0,5,1,7,3,6,4",
        "description": "A permutation of the indices 0..7. The 8 bytes of "
                       "each block are rearranged according to this map.",
    },
    "vigenere": {
        "format": "short text key (letters/digits)",
        "placeholder": "KEY",
        "example": "SECRET",
        "description": "A short word or phrase. The key is repeated to match "
                       "the message length, and each character shifts the "
                       "corresponding plaintext character.",
    },
    "substitution": {
        "format": "auto-generated random substitution map",
        "placeholder": "(auto-generated)",
        "example": "(auto-generated)",
        "description": "A full 95-byte permutation mapping every printable "
                       "ASCII byte to another. Click 'Generate random key' to "
                       "make one.",
    },
    "stream": {
        "format": "binary seed,comma-separated taps  e.g. 0001,2,1",
        "placeholder": "0001,2,1",
        "example": "0001,2,1",
        "description": "The LFSR seed (a binary string like '0001') and the "
                       "tap positions (which bits to XOR together). Taps must "
                       "be < seed length.",
    },
    "feistel": {
        "format": "8-bit binary string",
        "placeholder": "11001010",
        "example": "11001010",
        "description": "An 8-bit binary string. This is the master key; round "
                       "keys are derived by rotating it left.",
    },
    "aes": {
        "format": "16-bit binary string",
        "placeholder": "1100101011110000",
        "example": "1100101011110000",
        "description": "A 16-bit binary string. Round keys are derived by "
                       "rotating it left by 4 and 8 bits.",
    },
    "rsa": {
        "format": "three integers: p, q, e (all prime; p ≠ q; e coprime to (p-1)(q-1))",
        "placeholder": "11, 13, 7",
        "example": "11, 13, 7",
        "description": "Pick two distinct primes p and q, plus a public exponent e "
                       "that's coprime to (p-1)(q-1). The simulator computes n=p*q, "
                       "phi=(p-1)(q-1), and d = e^(-1) mod phi automatically. "
                       "For printable ASCII to encrypt cleanly, n must be > 127.",
    },
}


@app.get("/api/ciphers")
async def list_ciphers():
    """List all ciphers with metadata + key guidance for the playground."""
    return [
        {
            "name": name,
            "cost": meta.cost,
            "security": meta.security,
            "description": meta.description,
            "key_help": CIPHER_KEY_HELP[name],
        }
        for name, meta in CIPHER_REGISTRY.items()
    ]


@app.post("/api/cipher/encrypt")
async def cipher_encrypt(req: CipherRequest):
    if req.cipher not in CIPHER_REGISTRY:
        return JSONResponse({"error": f"unknown cipher: {req.cipher}"},
                            status_code=400)
    meta = CIPHER_REGISTRY[req.cipher]
    try:
        key = _coerce_key(req.cipher, req.key)
        ciphertext = meta.encrypt(req.text, key)
        return {"ciphertext": ciphertext, "cipher": req.cipher, "key": req.key}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


@app.post("/api/cipher/decrypt")
async def cipher_decrypt(req: CipherRequest):
    if req.cipher not in CIPHER_REGISTRY:
        return JSONResponse({"error": f"unknown cipher: {req.cipher}"},
                            status_code=400)
    meta = CIPHER_REGISTRY[req.cipher]
    try:
        key = _coerce_key(req.cipher, req.key)
        plaintext_hex = meta.decrypt(req.text, key)
        # Decode hex to readable text if possible.
        try:
            plaintext_bytes = [int(t, 16) for t in plaintext_hex.split()]
            plaintext_text = "".join(chr(b) if 32 <= b < 127 else "."
                                     for b in plaintext_bytes)
        except Exception:
            plaintext_text = plaintext_hex
        return {"plaintext_hex": plaintext_hex,
                "plaintext_text": plaintext_text,
                "cipher": req.cipher, "key": req.key}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=400)


@app.post("/api/cipher/generate-key")
async def cipher_generate_key(req: dict):
    """Generate a random valid key for the given cipher."""
    cipher_name = req.get("cipher")
    if cipher_name not in CIPHER_REGISTRY:
        return JSONResponse({"error": f"unknown cipher: {cipher_name}"},
                            status_code=400)
    meta = CIPHER_REGISTRY[cipher_name]
    key = meta.key_generator()
    # Make key JSON-serialisable.
    if cipher_name == "permutation":
        key_json = key  # already a list
    elif cipher_name == "substitution":
        key_json = key  # dict[str, str] — JSON-safe
    elif cipher_name == "stream":
        seed, taps = key
        key_json = {"seed": seed, "taps": taps}
    elif cipher_name == "rsa":
        # Generate random small primes for the playground.
        import random as _r
        sys.path.insert(0, os.path.join(BACKEND_DIR, "ciphers"))
        import rsa as _rsa_cipher_mod
        small_primes = [11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59,
                        61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109,
                        113, 127, 131, 137, 139, 149, 151, 157, 163, 167,
                        173, 179, 181, 191, 193, 197, 199]
        while True:
            p = _r.choice(small_primes)
            q = _r.choice(small_primes)
            if p == q or p * q <= 127:
                continue
            phi = (p - 1) * (q - 1)
            candidates = [e for e in (3, 5, 7, 11, 13, 17, 19, 23)
                          if _gcd(e, phi) == 1]
            if candidates:
                e = _r.choice(candidates)
                key_json = {"p": p, "q": q, "e": e}
                break
    else:
        key_json = key
    return {"cipher": cipher_name, "key": key_json}


def _gcd(a: int, b: int) -> int:
    while b:
        a, b = b, a % b
    return a


@app.post("/api/rsa/compute")
async def rsa_compute(req: dict):
    """Compute n, phi, d from p, q, e. Returns an error message in plain
    English if the inputs are invalid (not prime, not coprime, etc.).
    """
    sys.path.insert(0, os.path.join(BACKEND_DIR, "ciphers"))
    import rsa as _rsa_cipher_mod
    try:
        p = int(req.get("p", 0))
        q = int(req.get("q", 0))
        e = int(req.get("e", 0))
    except (ValueError, TypeError):
        return JSONResponse({"error": "p, q, and e must all be integers."},
                            status_code=400)
    try:
        instance = _rsa_cipher_mod.RSA(p=p, q=q, e=e)
    except ValueError as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)
    except Exception as exc:
        return JSONResponse(
            {"error": f"Could not build RSA with those parameters: {exc}"},
            status_code=400)
    return {
        "p": instance.p, "q": instance.q, "e": instance.e,
        "n": instance.n, "phi": instance.phi, "d": instance.d,
        "public_key": list(instance.public_key),
        "private_key": list(instance.private_key),
    }


@app.get("/api/sim/rsa-params")
async def sim_rsa_params():
    """Return the RSA parameters currently in use by the simulation."""
    return sim_manager.sim.rsa_params


# --- Wiki -----------------------------------------------------------------

@app.get("/api/wiki")
async def wiki_list():
    return {"terms": wiki_module.list_terms(),
            "categories": wiki_module.list_categories()}


@app.get("/api/wiki/{term}")
async def wiki_term(term: str):
    t = wiki_module.get_term(term)
    if t is None:
        return JSONResponse({"error": f"unknown term: {term}"}, status_code=404)
    return {"slug": term, **t}


# --- Attacks --------------------------------------------------------------

@app.get("/api/attacks")
async def list_attacks():
    return [
        {"name": name, "cost": meta.cost,
         "applicable_to": list(meta.applicable_to),
         "description": meta.description}
        for name, meta in ATTACK_REGISTRY.items()
    ]


# ---------------------------------------------------------------------------
# Direct-run entry point.
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.api:app", host="0.0.0.0", port=8000, reload=False)
