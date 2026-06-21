"""Base class and result type for all attacks.

Attacks follow the same conventions as the cipher classes: a PascalCase
class with a single primary method. Where ciphers have encrypt/decrypt,
attacks have `attempt`, which tries to recover plaintext from a
ciphertext given a budget.

The `attempt` method receives a `CipherMeta`-like object so it can call
the cipher's own decrypt function with candidate keys. This keeps the
attacks honest: they actually run the cipher's decrypt and check whether
the output looks like English text, rather than rolling a die.
"""
from dataclasses import dataclass, field
from time import perf_counter
from typing import Any, Optional


@dataclass
class AttackResult:
    """Outcome of a single attack attempt."""
    attack_name: str
    cipher_name: str
    success: bool
    recovered_hex: Optional[str] = None     # recovered plaintext as hex, if success
    attempts_made: int = 0                   # candidate keys / mappings tried
    time_elapsed: float = 0.0                # seconds spent
    notes: str = ""                          # human-readable detail


@dataclass
class CipherHandle:
    """Minimal interface that attacks need from a cipher.

    The simulation engine passes a real CipherMeta; tests can pass a stub.
    """
    name: str
    decrypt_fn: Any                            # callable(ciphertext_hex, key) -> hex
    enumerate_keys: Any = None                 # callable() -> iterator of keys, or None
    key_generator: Any = None                  # callable() -> random key (for KPA)


class Attack:
    """Base class. Subclasses override `attempt`."""

    name: str = "attack"
    cost: int = 1                  # 1..10, computational cost
    applicable_to: tuple = ()      # tuple of cipher names this attack targets

    def attempt(self, ciphertext_hex: str, cipher: CipherHandle,
                budget_seconds: float = 2.0,
                crib: Optional[str] = None) -> AttackResult:
        raise NotImplementedError

    def _start_timer(self) -> float:
        return perf_counter()

    def _elapsed(self, start: float) -> float:
        return perf_counter() - start
