"""Communicator and Attacker agents.

Both agent types maintain a *strategy* — a probability distribution over
their available actions (ciphers for communicators, attacks for attackers).
After each tick the simulation informs every agent of the outcome of the
actions they took; agents update their strategy using a softmax over
empirical utility.

Utility formula (communicators, per cipher c):
    utility(c) = security(c) * (1 - empirical_break_rate(c)) / cost(c)
                + exploration_bonus(c)

Utility formula (attackers, per attack a, given target cipher c):
    utility(a | c) = empirical_success_rate(a, c) / cost(a)
                    + exploration_bonus(a)

The exploration bonus is small and decays as we collect more samples,
which prevents the agents from collapsing onto a single action too
quickly. Communicators also have a *security bias*: when the message's
security level is high, they weight cipher security more heavily.
"""
from __future__ import annotations

import math
import random
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional

from cipher_meta import CIPHER_REGISTRY, CipherMeta, sample_key_str
from attack_meta import ATTACK_REGISTRY, AttackMeta, make_cipher_handle


# ---------------------------------------------------------------------------
# Shared strategy machinery.
# ---------------------------------------------------------------------------

class Strategy:
    """Maintains softmax probabilities over a fixed set of actions.

    Each action has:
      * a `weight` (the agent's current preference, larger = more likely)
      * an `empirical` dict tracking per-outcome counts (e.g. "success",
        "failure") used to compute a smoothed success rate
    """

    def __init__(self, actions: list[str], temperature: float = 1.0):
        assert actions, "Strategy requires at least one action"
        self.actions = list(actions)
        self.temperature = temperature
        self.weights: dict[str, float] = {a: 0.0 for a in actions}
        # empirical[action][outcome] = count
        self.empirical: dict[str, dict[str, int]] = {
            a: defaultdict(int) for a in actions
        }

    def sample(self, mask: Optional[set[str]] = None) -> str:
        """Sample an action. If `mask` is given, only those actions are eligible."""
        eligible = [a for a in self.actions if mask is None or a in mask]
        if not eligible:
            # Fall back to all actions if the mask wiped everything out.
            eligible = list(self.actions)
        ws = [self.weights.get(a, 0.0) for a in eligible]
        # Subtract max for numerical stability before exp.
        m = max(ws) if ws else 0.0
        exps = [math.exp((w - m) / max(self.temperature, 1e-6)) for w in ws]
        total = sum(exps)
        if total <= 0:
            return random.choice(eligible)
        probs = [e / total for e in exps]
        return random.choices(eligible, weights=probs, k=1)[0]

    def record_outcome(self, action: str, outcome: str, reward: float = 0.0):
        """Record an outcome for an action and update its weight.

        Weights are updated with exponential moving average so recent
        outcomes matter more than ancient history.
        """
        if action not in self.weights:
            return
        self.empirical[action][outcome] += 1
        # EMA update: weight = 0.85 * weight + 0.15 * reward
        self.weights[action] = 0.85 * self.weights[action] + 0.15 * reward

    def success_rate(self, action: str) -> float:
        """Smoothed success rate for an action; defaults to 0.5 (uncertain)."""
        e = self.empirical[action]
        total = e["success"] + e["failure"]
        if total == 0:
            return 0.5
        return e["success"] / total

    def top_actions(self, k: int = 3) -> list[tuple[str, float]]:
        """Return the top-k actions by current weight, with normalised probability."""
        ws = [(a, self.weights[a]) for a in self.actions]
        ws.sort(key=lambda x: -x[1])
        m = max(w for _, w in ws) if ws else 0.0
        exps = [(a, math.exp((w - m) / max(self.temperature, 1e-6))) for a, w in ws]
        total = sum(e for _, e in exps) or 1.0
        return [(a, e / total) for a, e in exps[:k]]


# ---------------------------------------------------------------------------
# Communicator agent.
# ---------------------------------------------------------------------------

# A small corpus of plausible "secret" messages. Picking from here keeps
# the simulation's traffic feeling realistic and gives frequency-analysis
# attacks enough ciphertext volume to work with.
MESSAGE_CORPUS = [
    "Hello, can you hear me?",
    "The package has arrived at the dock.",
    "Meet me at noon by the old church.",
    "Operation midnight is a go.",
    "The eagle has landed safely.",
    "Abort the mission immediately.",
    "Confirm receipt of this message.",
    "Target acquired, moving in now.",
    "All units stand by for orders.",
    "Everything goes according to plan.",
    "New credentials are in the safe.",
    "Rendezvous at checkpoint Bravo.",
    "The courier arrives at dawn.",
    "Maintain radio silence tonight.",
    "Proceed to the fallback location.",
]


@dataclass
class Communicator:
    name: str
    temperature: float = 1.2
    strategy: Strategy = field(init=False)

    def __post_init__(self):
        self.strategy = Strategy(list(CIPHER_REGISTRY.keys()),
                                 temperature=self.temperature)

    def pick_cipher(self, security_level: int) -> tuple[str, Any]:
        """Pick a cipher for a message with the given security level (1..5).

        Utility formula (per cipher c):

            utility(c) = w_sec * security(c) * (1 - break_rate(c))
                         - w_cost * cost(c)^2
                         + exploration_noise

        Where:
          w_sec   = 0.7 + 0.4 * security_level  (high-sec messages weight
                                                  security more heavily)
          w_cost  = 0.2                          (constant)
          exploration_noise = Gaussian(0, 0.5)   (prevents total convergence)

        The quadratic cost penalty is what keeps communicators from always
        picking RSA: RSA's cost=8 incurs a -12.8 penalty, which dominates
        its +security benefit at low security levels. At high security
        levels the security term wins and RSA becomes attractive — but
        only for messages that actually need it.
        """
        utilities = {}
        for name, meta in CIPHER_REGISTRY.items():
            # `success_rate` here is the communicator's survival rate for
            # this cipher (fraction of past messages that were NOT broken).
            # With no data, assume the cipher is fully secure (1.0) — this
            # prevents new ciphers from being penalised just because they
            # haven't been tried yet.
            e = self.strategy.empirical[name]
            total_obs = e["success"] + e["failure"]
            survival_rate = (e["success"] / total_obs) if total_obs > 0 else 1.0
            w_sec = 0.7 + 0.4 * security_level
            w_cost = 0.2
            sec_term = w_sec * meta.security * survival_rate
            cost_term = w_cost * (meta.cost ** 2)
            noise = random.gauss(0.0, 0.5)
            utility = sec_term - cost_term + noise
            utilities[name] = utility

        # Softmax sample with the strategy's temperature.
        m = max(utilities.values())
        exps = {k: math.exp((v - m) / self.strategy.temperature)
                for k, v in utilities.items()}
        total = sum(exps.values())
        probs = {k: v / total for k, v in exps.items()}

        # Small exploration probability — pick uniformly at random.
        if random.random() < 0.08:
            chosen = random.choice(list(CIPHER_REGISTRY.keys()))
        else:
            chosen = random.choices(list(probs.keys()),
                                    weights=list(probs.values()), k=1)[0]
        return chosen, probs

    def generate_message(self) -> str:
        return random.choice(MESSAGE_CORPUS)

    def record_cipher_outcome(self, cipher_name: str, broken: bool):
        """Update the communicator's strategy based on whether their message was broken.

        Reward = +1 if message survived (not broken), -1 if broken.
        The reward is scaled by the inverse of cipher cost so that cheap
        ciphers that survive are rewarded more than expensive ones that
        survive (encouraging cost-conscious choices).
        """
        meta = CIPHER_REGISTRY[cipher_name]
        if broken:
            reward = -1.0
        else:
            # Cheaper ciphers that survive get a bigger positive reward.
            reward = 1.0 / math.sqrt(meta.cost)
        self.strategy.record_outcome(cipher_name, "failure" if broken else "success",
                                     reward=reward)


# ---------------------------------------------------------------------------
# Attacker agent.
# ---------------------------------------------------------------------------

@dataclass
class Attacker:
    name: str
    temperature: float = 1.0
    strategy: Strategy = field(init=False)
    # Per-(cipher, attack) empirical success rate.
    pairwise_empirical: dict[tuple[str, str], dict[str, int]] = field(
        default_factory=lambda: defaultdict(lambda: defaultdict(int)))

    def __post_init__(self):
        self.strategy = Strategy(list(ATTACK_REGISTRY.keys()),
                                 temperature=self.temperature)

    def pick_attack(self, cipher_name: str) -> tuple[str, Any]:
        """Pick an attack to use against a given cipher.

        Only attacks whose `applicable_to` includes the cipher are eligible.
        If none are applicable, the attacker sits this one out.

        Important: in this simulation, RSA is treated as unbreakable. The
        DictionaryAttack's `applicable_to` lists 'rsa' because the attack
        code can in principle factor small moduli (n=143 = 11*13), but we
        filter it out here so that RSA messages always survive — this is
        what makes the simulation interesting (communicators must balance
        RSA's high cost against its perfect security, instead of all
        converging on the strongest cipher).
        """
        eligible = [
            name for name, meta in ATTACK_REGISTRY.items()
            if cipher_name in meta.applicable_to
        ]
        # Simulation-level filter: attackers don't have the budget to
        # factor RSA moduli (this models real-world RSA with 2048+ bit keys).
        if cipher_name == "rsa":
            eligible = [n for n in eligible if n != "dictionary"]
        if not eligible:
            return None, {}

        utilities = {}
        for name in eligible:
            meta = ATTACK_REGISTRY[name]
            succ = self.pairwise_success_rate(name, cipher_name)
            utility = math.log(max(succ, 1e-6)) - 0.3 * meta.cost
            utilities[name] = utility

        m = max(utilities.values())
        exps = {k: math.exp((v - m) / self.strategy.temperature)
                for k, v in utilities.items()}
        total = sum(exps.values())
        probs = {k: v / total for k, v in exps.items()}

        # Exploration.
        if random.random() < 0.1:
            chosen = random.choice(eligible)
        else:
            chosen = random.choices(list(probs.keys()),
                                    weights=list(probs.values()), k=1)[0]
        return chosen, probs

    def pairwise_success_rate(self, attack_name: str, cipher_name: str) -> float:
        e = self.pairwise_empirical[(cipher_name, attack_name)]
        total = e["success"] + e["failure"]
        if total == 0:
            return 0.5
        return e["success"] / total

    def record_attack_outcome(self, attack_name: str, cipher_name: str,
                              success: bool):
        outcome = "success" if success else "failure"
        self.pairwise_empirical[(cipher_name, attack_name)][outcome] += 1
        meta = ATTACK_REGISTRY[attack_name]
        reward = (1.0 if success else -0.5) / meta.cost
        self.strategy.record_outcome(attack_name, outcome, reward=reward)
