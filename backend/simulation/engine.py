"""Simulation engine.

Drives one tick of the multi-agent cryptography simulation per call to
`step()`. Each tick:

  1. Every communicator picks a target, generates a message with a random
     security level, picks a cipher, encrypts, and broadcasts the
     ciphertext onto a shared channel.
  2. Every attacker observes the channel, picks a message to attack,
     picks an attack, and runs it.
  3. Outcomes are recorded and used to update each agent's strategy.
  4. The engine appends human-readable events to `self.events` for the
     TUI to display, and updates aggregate statistics.

The engine is decoupled from the TUI: it exposes `step()` and a set of
read-only views (`recent_events`, `cipher_usage_stats`, `agent_stats`,
`environment_summary`) that the TUI polls on a timer.
"""
from __future__ import annotations

import os
import sys
import random
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Optional

# Make sure the simulation directory itself is on the path so its modules
# can import each other.
SIM_DIR = os.path.dirname(os.path.abspath(__file__))
if SIM_DIR not in sys.path:
    sys.path.insert(0, SIM_DIR)

from cipher_meta import CIPHER_REGISTRY, sample_key_str, configure_rsa, get_rsa_instance
from attack_meta import ATTACK_REGISTRY, make_cipher_handle
from agent import Communicator, Attacker


# ---------------------------------------------------------------------------
# Load the agent-name and message-sentence corpuses from disk.
# ---------------------------------------------------------------------------

_NAMES_PATH = os.path.join(SIM_DIR, "names.txt")
_SENTENCES_PATH = os.path.join(SIM_DIR, "sentences.txt")


def _load_names() -> list[str]:
    """Load the agent name pool. Falls back to a small default if missing."""
    try:
        with open(_NAMES_PATH, "r", encoding="utf-8") as f:
            return [line.strip() for line in f if line.strip()]
    except Exception:
        return ["Alice", "Bob", "Carol", "Dave", "Erin", "Frank", "Grace",
                "Heidi", "Ivan", "Judy"]


def _load_sentences() -> list[str]:
    """Load the message corpus. Falls back to a small default if missing."""
    try:
        with open(_SENTENCES_PATH, "r", encoding="utf-8") as f:
            return [line.strip() for line in f if line.strip()]
    except Exception:
        return ["Hello, can you hear me?", "The package has arrived.",
                "Meet me at noon by the old church."]


_NAMES_POOL = _load_names()
_SENTENCES_POOL = _load_sentences()


def _random_rsa_params(rng: random.Random):
    """Pick random small primes p, q (distinct) and a valid e.

    The primes are drawn from a small list so the toy RSA stays fast and
    the modulus stays small enough that printable ASCII (< 127) always
    encrypts cleanly. We require n > 127.
    """
    # Small primes > 11 — keeps n in a comfortable range (130..~4000).
    small_primes = [11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59,
                    61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109,
                    113, 127, 131, 137, 139, 149, 151, 157, 163, 167,
                    173, 179, 181, 191, 193, 197, 199]
    while True:
        p = rng.choice(small_primes)
        q = rng.choice(small_primes)
        if p == q:
            continue
        n = p * q
        if n <= 127:
            continue
        phi = (p - 1) * (q - 1)
        # Pick a random e coprime to phi. Common choices: 3, 5, 7, 11, 13, 17.
        candidates = [e for e in (3, 5, 7, 11, 13, 17, 19, 23)
                      if _gcd(e, phi) == 1]
        if not candidates:
            continue
        e = rng.choice(candidates)
        return p, q, e


def _gcd(a: int, b: int) -> int:
    while b:
        a, b = b, a % b
    return a


# ---------------------------------------------------------------------------
# Event types — structured records of "what happened" in a tick.
# ---------------------------------------------------------------------------

@dataclass
class Event:
    tick: int
    kind: str              # "send" | "intercepted" | "secure" | "skip"
    sender: str
    target: Optional[str]
    cipher: Optional[str]
    attack: Optional[str]
    attacker: Optional[str]
    message_preview: str
    security_level: int
    notes: str = ""

    def render(self) -> str:
        """Single-line human-readable rendering for the activity log."""
        if self.kind == "send":
            return (f"[T{self.tick:>3}] {self.sender} -> {self.target} "
                    f"| cipher={self.cipher} sec=L{self.security_level} "
                    f"| msg=\"{self.message_preview}\"")
        if self.kind == "intercepted":
            return (f"[T{self.tick:>3}]   {self.attacker} broke "
                    f"{self.sender}'s {self.cipher} message via "
                    f"{self.attack}! ({self.notes})")
        if self.kind == "secure":
            return (f"[T{self.tick:>3}]   {self.attacker} failed to break "
                    f"{self.sender}'s {self.cipher} ({self.attack}: {self.notes})")
        if self.kind == "skip":
            return (f"[T{self.tick:>3}]   {self.attacker} skipped "
                    f"{self.sender}'s {self.cipher} (no applicable attack)")
        return f"[T{self.tick:>3}] {self.kind}"


# ---------------------------------------------------------------------------
# Captured message — what's sitting on the channel for attackers to see.
# ---------------------------------------------------------------------------

@dataclass
class CapturedMessage:
    tick: int
    sender: str
    target: str
    cipher_name: str
    key: object
    ciphertext_hex: str
    plaintext: str
    security_level: int


# ---------------------------------------------------------------------------
# Engine.
# ---------------------------------------------------------------------------

class Simulation:
    def __init__(
        self,
        num_communicators: int = 4,
        num_attackers: int = 2,
        event_history: int = 200,
        attacker_temperature: float = 1.0,
        communicator_temperature: float = 1.2,
        attack_budget: float = 1.5,
        seed: Optional[int] = None,
    ):
        if seed is not None:
            random.seed(seed)
        self._rng = random.Random(seed) if seed is not None else random.Random()

        self.tick: int = 0
        self.attacker_temperature = attacker_temperature
        self.communicator_temperature = communicator_temperature
        self.attack_budget = attack_budget

        # Generate fresh RSA params for this simulation run.
        p, q, e = _random_rsa_params(self._rng)
        try:
            configure_rsa(p, q, e)
        except Exception:
            # Fall back to the spec defaults if something goes wrong.
            configure_rsa(11, 13, 7)
        self.rsa_params = {"p": get_rsa_instance().p,
                           "q": get_rsa_instance().q,
                           "e": get_rsa_instance().e,
                           "n": get_rsa_instance().n,
                           "phi": get_rsa_instance().phi,
                           "d": get_rsa_instance().d}

        # Pick distinct names from the loaded corpus.
        name_pool = list(_NAMES_POOL)
        self._rng.shuffle(name_pool)
        comm_names = name_pool[:num_communicators]
        atk_names = name_pool[num_communicators:num_communicators + num_attackers]
        # If the pool is too small, fall back to indexed names.
        while len(comm_names) < num_communicators:
            comm_names.append(f"Agent-{len(comm_names)}")
        while len(atk_names) < num_attackers:
            atk_names.append(f"Hacker-{len(atk_names)}")

        self.communicators: list[Communicator] = [
            Communicator(name=comm_names[i],
                         temperature=communicator_temperature,
                         message_corpus=tuple(_SENTENCES_POOL))
            for i in range(num_communicators)
        ]
        self.attackers: list[Attacker] = [
            Attacker(name=atk_names[i],
                     temperature=attacker_temperature)
            for i in range(num_attackers)
        ]
        self.events: deque[Event] = deque(maxlen=event_history)
        self.channel: list[CapturedMessage] = []
        # Persistent log of every message ever sent, keyed by
        # (tick, sender, target). Used to power the WhatsApp-style phone
        # UI and the attacker observation panel.
        self._message_log: dict[tuple, dict] = {}

        # Aggregate statistics.
        self.cipher_usage: dict[str, int] = defaultdict(int)
        self.cipher_breaks: dict[str, int] = defaultdict(int)
        self.attack_usage: dict[str, int] = defaultdict(int)
        self.attack_success: dict[str, int] = defaultdict(int)
        self.communicator_sent: dict[str, int] = defaultdict(int)
        self.communicator_broken: dict[str, int] = defaultdict(int)
        self.attacker_attempts: dict[str, int] = defaultdict(int)
        self.attacker_success: dict[str, int] = defaultdict(int)

    @staticmethod
    def _comm_name(i: int) -> str:
        names = ["Alice", "Bob", "Carol", "Dave", "Erin",
                 "Frank", "Grace", "Heidi", "Ivan", "Judy"]
        return names[i % len(names)] + (f"-{i // len(names)}" if i >= len(names) else "")

    @staticmethod
    def _atk_name(i: int) -> str:
        names = ["Mallory", "Trudy", "Oscar", "Lee", "Marvin"]
        return names[i % len(names)] + (f"-{i // len(names)}" if i >= len(names) else "")

    # -----------------------------------------------------------------
    # Main loop.
    # -----------------------------------------------------------------

    def step(self) -> list[Event]:
        """Advance the simulation by one tick. Returns the events generated."""
        self.tick += 1
        tick_events: list[Event] = []
        self.channel.clear()

        # 1. Communicators send messages.
        for comm in self.communicators:
            target = self._pick_target(comm)
            message = comm.generate_message()
            security_level = random.randint(1, 5)
            cipher_name, _ = comm.pick_cipher(security_level)
            meta = CIPHER_REGISTRY[cipher_name]
            key = meta.key_generator()
            try:
                ciphertext_hex = meta.encrypt(message, key)
            except Exception as e:
                # If encryption fails (e.g. RSA with a non-ASCII byte),
                # fall back to shift with shift=1 and re-encrypt.
                cipher_name = "shift"
                meta = CIPHER_REGISTRY[cipher_name]
                key = meta.key_generator()
                ciphertext_hex = meta.encrypt(message, key)

            captured = CapturedMessage(
                tick=self.tick,
                sender=comm.name,
                target=target.name if target else "?",
                cipher_name=cipher_name,
                key=key,
                ciphertext_hex=ciphertext_hex,
                plaintext=message,
                security_level=security_level,
            )
            self.channel.append(captured)

            # Persist for the phone UI.
            self._message_log[(self.tick, comm.name,
                               target.name if target else "?")] = {
                "plaintext": message,
                "ciphertext": ciphertext_hex,
                "cipher": cipher_name,
                "key": key,
                "security_level": security_level,
            }

            self.cipher_usage[cipher_name] += 1
            self.communicator_sent[comm.name] += 1

            ev = Event(
                tick=self.tick, kind="send",
                sender=comm.name, target=target.name if target else "?",
                cipher=cipher_name, attack=None, attacker=None,
                message_preview=message[:40],
                security_level=security_level,
            )
            tick_events.append(ev)
            self.events.append(ev)

        # 2. Attackers attempt to break messages.
        # Each attacker picks one message from the channel (randomly).
        # Track which messages have already been broken this tick, so
        # that multiple attackers cracking the same message don't inflate
        # the break count beyond the number of messages actually sent.
        broken_msg_keys = set()

        for atk in self.attackers:
            if not self.channel:
                continue
            target_msg = random.choice(self.channel)
            attack_name, _ = atk.pick_attack(target_msg.cipher_name)
            if attack_name is None:
                ev = Event(
                    tick=self.tick, kind="skip",
                    sender=target_msg.sender, target=target_msg.target,
                    cipher=target_msg.cipher_name, attack=None,
                    attacker=atk.name, message_preview="",
                    security_level=target_msg.security_level,
                    notes="no applicable attack",
                )
                tick_events.append(ev)
                self.events.append(ev)
                continue

            attack_meta = ATTACK_REGISTRY[attack_name]
            handle = make_cipher_handle(target_msg.cipher_name, None)
            # Use a common English crib for KPA — typically the start of
            # the corpus messages begins with "The" or "Hello" etc.
            crib = self._guess_crib(target_msg.plaintext)

            budget = self.attack_budget  # seconds (configurable)
            try:
                result = attack_meta.instance.attempt(
                    target_msg.ciphertext_hex, handle,
                    budget_seconds=budget, crib=crib,
                )
            except Exception as e:
                # Defensive: an attack should never crash the simulation.
                result = None
                notes = f"attack crashed: {e}"
                success = False
            else:
                success = bool(result and result.success)
                notes = result.notes if result else "no result"

            self.attack_usage[attack_name] += 1
            self.attacker_attempts[atk.name] += 1
            atk.record_attack_outcome(attack_name, target_msg.cipher_name, success)

            # Inform the sender's communicator strategy.
            sender_comm = next((c for c in self.communicators
                                if c.name == target_msg.sender), None)
            # Only record the cipher outcome once per message (the first
            # attacker's result counts; subsequent attackers attacking the
            # same message still get credit for their attack, but the
            # communicator's strategy only learns from the first break).
            msg_key = (target_msg.tick, target_msg.sender, target_msg.target)
            already_broken = msg_key in broken_msg_keys

            if sender_comm is not None and not already_broken:
                sender_comm.record_cipher_outcome(target_msg.cipher_name, success)

            if success and not already_broken:
                self.cipher_breaks[target_msg.cipher_name] += 1
                self.attack_success[attack_name] += 1
                self.attacker_success[atk.name] += 1
                self.communicator_broken[target_msg.sender] += 1
                broken_msg_keys.add(msg_key)
                ev = Event(
                    tick=self.tick, kind="intercepted",
                    sender=target_msg.sender, target=target_msg.target,
                    cipher=target_msg.cipher_name, attack=attack_name,
                    attacker=atk.name, message_preview="",
                    security_level=target_msg.security_level,
                    notes=notes,
                )
            elif success and already_broken:
                # This attacker also cracked the message, but it was
                # already counted as broken by a previous attacker.
                # Credit the attacker with a successful attack, but
                # don't double-count the cipher/communicator break.
                self.attack_success[attack_name] += 1
                self.attacker_success[atk.name] += 1
                ev = Event(
                    tick=self.tick, kind="intercepted",
                    sender=target_msg.sender, target=target_msg.target,
                    cipher=target_msg.cipher_name, attack=attack_name,
                    attacker=atk.name, message_preview="",
                    security_level=target_msg.security_level,
                    notes=notes + " (already broken by another hacker)",
                )
            else:
                ev = Event(
                    tick=self.tick, kind="secure",
                    sender=target_msg.sender, target=target_msg.target,
                    cipher=target_msg.cipher_name, attack=attack_name,
                    attacker=atk.name, message_preview="",
                    security_level=target_msg.security_level,
                    notes=notes,
                )
            tick_events.append(ev)
            self.events.append(ev)

        return tick_events

    def _pick_target(self, comm: Communicator) -> Optional[Communicator]:
        others = [c for c in self.communicators if c.name != comm.name]
        if not others:
            return None
        return random.choice(others)

    def _guess_crib(self, plaintext: str) -> Optional[str]:
        """Attacker's crib guess: the first 4-5 chars of the message.

        In a real scenario the attacker wouldn't know this. For the
        simulation we model a 'reasonable guess' that the message
        starts with a common word. We achieve this by leaking the first
        4 chars of the plaintext — this models the attacker knowing
        the protocol's greeting header. For KPA to be fair, we cap the
        leaked prefix at 4 characters.
        """
        if not plaintext:
            return None
        return plaintext[:4]

    # -----------------------------------------------------------------
    # Read-only views for the TUI.
    # -----------------------------------------------------------------

    def recent_events(self, n: int = 30) -> list[Event]:
        return list(self.events)[-n:]

    def cipher_usage_stats(self) -> list[tuple[str, float, float]]:
        """Return [(cipher_name, usage_pct, break_rate), ...] sorted by usage."""
        total = sum(self.cipher_usage.values()) or 1
        rows = []
        for name in CIPHER_REGISTRY:
            used = self.cipher_usage.get(name, 0)
            broken = self.cipher_breaks.get(name, 0)
            usage_pct = 100.0 * used / total
            break_rate = (100.0 * broken / used) if used else 0.0
            rows.append((name, usage_pct, break_rate))
        rows.sort(key=lambda r: -r[1])
        return rows

    def attack_usage_stats(self) -> list[tuple[str, float, float]]:
        """Return [(attack_name, usage_pct, success_rate), ...] sorted by usage."""
        total = sum(self.attack_usage.values()) or 1
        rows = []
        for name in ATTACK_REGISTRY:
            used = self.attack_usage.get(name, 0)
            succ = self.attack_success.get(name, 0)
            usage_pct = 100.0 * used / total
            succ_rate = (100.0 * succ / used) if used else 0.0
            rows.append((name, usage_pct, succ_rate))
        rows.sort(key=lambda r: -r[1])
        return rows

    def communicator_stats(self) -> list[tuple[str, int, int, float]]:
        """Return [(name, sent, broken, survival_pct), ...]"""
        rows = []
        for c in self.communicators:
            sent = self.communicator_sent.get(c.name, 0)
            broken = self.communicator_broken.get(c.name, 0)
            survived = sent - broken
            survival = (100.0 * survived / sent) if sent else 0.0
            rows.append((c.name, sent, broken, survival))
        return rows

    def attacker_stats(self) -> list[tuple[str, int, int, float]]:
        """Return [(name, attempts, successes, success_pct), ...]"""
        rows = []
        for a in self.attackers:
            att = self.attacker_attempts.get(a.name, 0)
            succ = self.attacker_success.get(a.name, 0)
            rate = (100.0 * succ / att) if att else 0.0
            rows.append((a.name, att, succ, rate))
        return rows

    def environment_summary(self) -> dict:
        total_msgs = sum(self.cipher_usage.values())
        total_breaks = sum(self.cipher_breaks.values())
        survival = ((total_msgs - total_breaks) / total_msgs * 100) if total_msgs else 0.0
        distinct_ciphers = sum(1 for v in self.cipher_usage.values() if v > 0)
        return {
            "tick": self.tick,
            "total_messages": total_msgs,
            "total_breaks": total_breaks,
            "overall_survival_pct": survival,
            "distinct_ciphers_used": distinct_ciphers,
            "num_communicators": len(self.communicators),
            "num_attackers": len(self.attackers),
        }

    def agent_roster(self) -> list[tuple[str, str, list[tuple[str, float]]]]:
        """Return [(agent_name, role, top_actions_with_prob), ...]"""
        rows = []
        for c in self.communicators:
            top = c.strategy.top_actions(k=4)
            rows.append((c.name, "communicator", top))
        for a in self.attackers:
            top = a.strategy.top_actions(k=4)
            rows.append((a.name, "attacker", top))
        return rows

    # -----------------------------------------------------------------
    # Live tunable parameters (no reset required).
    # -----------------------------------------------------------------

    def set_attacker_temperature(self, temp: float):
        """Live-update the softmax temperature of every attacker.

        Lower temperature = more exploitative (attackers stick to the
        best-performing attack); higher temperature = more explorative
        (attackers try a wider variety of attacks).
        """
        self.attacker_temperature = float(temp)
        for atk in self.attackers:
            atk.strategy.temperature = float(temp)

    def set_communicator_temperature(self, temp: float):
        self.communicator_temperature = float(temp)
        for comm in self.communicators:
            comm.strategy.temperature = float(temp)

    def set_tick_interval(self, seconds: float):
        """Set the simulation tick interval (used by the API layer)."""
        self.tick_interval = float(seconds)

    # -----------------------------------------------------------------
    # Per-agent chat history (for the WhatsApp-like phone UI).
    # -----------------------------------------------------------------

    def communicator_chat_history(self, agent_name: str) -> dict:
        """Return a WhatsApp-style chat history for the named communicator.

        Structure:
            {
                "agent": "Alice",
                "contacts": {
                    "Bob": [
                        {"tick": 5, "direction": "out", "cipher": "aes",
                         "plaintext": "...", "ciphertext": "...",
                         "intercepted_by": "Mallory", "broken": True},
                        {"tick": 7, "direction": "in", "cipher": "stream",
                         "plaintext": "...", "ciphertext": "...",
                         "intercepted_by": null, "broken": False},
                        ...
                    ],
                    ...
                }
            }
        """
        history: dict[str, list[dict]] = {}
        # Iterate over all events; for each "send" event involving this
        # agent (as sender or receiver), record the message; for each
        # "intercepted" / "secure" event involving the message, attach
        # the attack outcome.
        # We track messages by (tick, sender, target) so we can attach
        # later attack outcomes.
        messages_by_key: dict[tuple, dict] = {}

        for ev in self.events:
            if ev.kind == "send":
                if ev.sender != agent_name and ev.target != agent_name:
                    continue
                other = ev.target if ev.sender == agent_name else ev.sender
                direction = "out" if ev.sender == agent_name else "in"
                # We need the actual message content; reconstruct from
                # the channel — but the channel is cleared each tick.
                # Instead we look it up in the persistent log we keep
                # in `_message_log`.
                msg = self._message_log.get((ev.tick, ev.sender, ev.target))
                if msg is None:
                    continue
                entry = {
                    "tick": ev.tick,
                    "direction": direction,
                    "cipher": ev.cipher,
                    "plaintext": msg["plaintext"],
                    "ciphertext": msg["ciphertext"],
                    "security_level": ev.security_level,
                    "intercepted_by": None,
                    "broken": False,
                    "attack": None,
                    "attack_notes": None,
                }
                history.setdefault(other, []).append(entry)
                messages_by_key[(ev.tick, ev.sender, ev.target)] = entry
            elif ev.kind in ("intercepted", "secure"):
                # Attach to the matching send event.
                key = (ev.tick, ev.sender, ev.target)
                entry = messages_by_key.get(key)
                if entry is None:
                    continue
                entry["intercepted_by"] = ev.attacker
                entry["broken"] = (ev.kind == "intercepted")
                entry["attack"] = ev.attack
                entry["attack_notes"] = ev.notes

        return {"agent": agent_name, "contacts": history}

    def attacker_observation_log(self, agent_name: str) -> dict:
        """Return the messages an attacker has observed / attacked.

        Structure:
            {
                "agent": "Mallory",
                "attempts": [
                    {"tick": 5, "sender": "Alice", "target": "Bob",
                     "cipher": "aes", "attack": "brute_force",
                     "success": True, "ciphertext": "...", "plaintext": "...",
                     "notes": "..."},
                    ...
                ]
            }
        """
        attempts = []
        for ev in self.events:
            if ev.attacker != agent_name:
                continue
            if ev.kind not in ("intercepted", "secure", "skip"):
                continue
            msg = self._message_log.get((ev.tick, ev.sender, ev.target), {})
            attempts.append({
                "tick": ev.tick,
                "sender": ev.sender,
                "target": ev.target,
                "cipher": ev.cipher,
                "attack": ev.attack,
                "success": ev.kind == "intercepted",
                "skipped": ev.kind == "skip",
                "ciphertext": msg.get("ciphertext", ""),
                "plaintext": msg.get("plaintext", "") if ev.kind == "intercepted" else "",
                "notes": ev.notes,
            })
        return {"agent": agent_name, "attempts": attempts}
