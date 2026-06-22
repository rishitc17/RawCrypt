"""Attack metadata and registry.

Wraps each attack class in `backend/attacks/` with a uniform interface.
The simulation's attacker agents pick attacks from this registry based
on empirical success rates and per-attack cost.
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from typing import Any, Optional

# The attack modules use `import attack_utils` and `from base import ...`,
# which means they expect to be run from inside the attacks directory.
ATTACKS_DIR = os.path.join(os.path.dirname(__file__), "..", "attacks")
ATTACKS_DIR = os.path.abspath(ATTACKS_DIR)
if ATTACKS_DIR not in sys.path:
    sys.path.insert(0, ATTACKS_DIR)

from base import Attack, AttackResult, CipherHandle
from brute_force import BruteForce
from frequency import FrequencyAnalysis
from known_plaintext import KnownPlaintext
from dictionary import DictionaryAttack


@dataclass
class AttackMeta:
    name: str
    cost: int                       # 1..10
    instance: Attack
    applicable_to: tuple[str, ...]  # cipher names this attack targets
    description: str = ""


ATTACK_REGISTRY: dict[str, AttackMeta] = {
    "brute_force": AttackMeta(
        name="brute_force",
        cost=4,
        instance=BruteForce(),
        applicable_to=BruteForce.applicable_to,
        description="Enumerate the cipher's key space, score each decryption",
    ),
    "frequency": AttackMeta(
        name="frequency",
        cost=3,
        instance=FrequencyAnalysis(),
        applicable_to=FrequencyAnalysis.applicable_to,
        description="Statistical byte-frequency attack on substitution ciphers",
    ),
    "known_plaintext": AttackMeta(
        name="known_plaintext",
        cost=2,
        instance=KnownPlaintext(),
        applicable_to=KnownPlaintext.applicable_to,
        description="Recover the key from a known plaintext crib",
    ),
    "dictionary": AttackMeta(
        name="dictionary",
        cost=1,
        instance=DictionaryAttack(),
        applicable_to=DictionaryAttack.applicable_to,
        description="Try a small list of weak keys / factor small RSA moduli",
    ),
}


def make_cipher_handle(cipher_name: str, cipher_meta) -> CipherHandle:
    """Build a CipherHandle that an Attack can use against this cipher."""
    from cipher_meta import CIPHER_REGISTRY  # local import to avoid cycle
    meta = CIPHER_REGISTRY[cipher_name]
    # For RSA, stash the RSA instance on the handle so the dictionary
    # attack can read its modulus `n` for factoring.
    handle = CipherHandle(
        name=cipher_name,
        decrypt_fn=meta.decrypt,
        enumerate_keys=meta.enumerate_keys,
        key_generator=meta.key_generator,
    )
    if cipher_name == "rsa":
        # The dictionary attack reads .n via key_generator.__self__.
        # Attach the shared RSA instance accordingly.
        handle.key_generator = type("Wrapper", (), {"__self__": _get_rsa_instance()})()
    return handle


def _get_rsa_instance():
    """Return the shared RSA instance from cipher_meta."""
    from cipher_meta import _RSA_INSTANCE
    return _RSA_INSTANCE
