"""Cipher metadata and registry.

This module wraps each cipher class in `backend/ciphers/` with a uniform
interface so the simulation can treat them generically. For every cipher
we expose:

  * `name`             — canonical string identifier
  * `cost`             — 1..10, computational cost (used by scoring)
  * `security`         — 1..10, intrinsic security (used by scoring)
  * `key_generator()`  — produces a random key for this cipher
  * `encrypt(pt, key)` — encrypts a plaintext string -> hex string
  * `decrypt(ct, key)` — decrypts a hex string -> hex string
  * `enumerate_keys()` — iterator over the key space, or None if
                          intractable (used by BruteForce)
  * `sample_key_str()` — a short human-readable key preview for the TUI

The adapters below glue the various cipher-specific call signatures
(different key types, multi-arg calls, etc.) into this single shape.
"""
from __future__ import annotations

import os
import sys
import random
import string
from dataclasses import dataclass
from typing import Any, Callable, Iterator, Optional

# The cipher modules use `import utils` and expect to be run from inside
# the ciphers directory. We add it to sys.path so they import cleanly.
CIPHERS_DIR = os.path.join(os.path.dirname(__file__), "..", "ciphers")
CIPHERS_DIR = os.path.abspath(CIPHERS_DIR)
if CIPHERS_DIR not in sys.path:
    sys.path.insert(0, CIPHERS_DIR)

# Also chdir into the ciphers dir so the cipher modules' `import utils`
# resolves correctly (some cipher modules call utils at import time).
_ORIGINAL_CWD = os.getcwd()
os.chdir(CIPHERS_DIR)

import shift as _shift_mod
import substitution as _subst_mod
import vigenere as _vigenere_mod
import rail_fence as _railfence_mod
import permutation as _permutation_mod
import stream as _stream_mod
import feistel as _feistel_mod
import aes as _aes_mod
import rsa as _rsa_mod

os.chdir(_ORIGINAL_CWD)


# ---------------------------------------------------------------------------
# Key generators — one per cipher, returning a key in the format the cipher
# expects.
# ---------------------------------------------------------------------------

def _shift_key_gen() -> int:
    return random.randint(1, 255)  # avoid 0 (no-op)


def _shift_enumerate_keys() -> Iterator[int]:
    return iter(range(1, 256))


def _vigenere_key_gen() -> str:
    length = random.choice([3, 4, 5, 6, 8])
    alphabet = string.ascii_letters + string.digits
    return "".join(random.choice(alphabet) for _ in range(length))


def _railfence_key_gen() -> int:
    return random.randint(2, 8)


def _railfence_enumerate_keys() -> Iterator[int]:
    return iter(range(2, 21))


def _permutation_key_gen() -> list[int]:
    # Fixed 8-byte block permutation; messages are chunked into 8-byte
    # blocks by the adapter below.
    perm = list(range(8))
    random.shuffle(perm)
    return perm


def _permutation_enumerate_keys() -> Iterator[list[int]]:
    """Enumerate all 8! = 40,320 permutations of an 8-byte block.

    This makes the cipher attackable by BruteForce (within budget).
    """
    import itertools
    for perm in itertools.permutations(range(8)):
        yield list(perm)


def _substitution_key_gen() -> dict:
    sources = [format(b, "08b") for b in range(32, 127)]
    dests = sources.copy()
    random.shuffle(dests)
    return dict(zip(sources, dests))


def _stream_key_gen() -> tuple[str, list[int]]:
    seed_len = random.choice([4, 6, 8])
    seed = "".join(random.choice("01") for _ in range(seed_len))
    # Pick a valid taps config for this seed length.
    valid_taps = [
        [t] for t in range(1, seed_len)
    ] + [
        [seed_len - 1, seed_len - 2],
        [seed_len - 1, 1],
    ]
    taps = random.choice(valid_taps)
    return (seed, taps)


def _feistel_key_gen() -> str:
    return format(random.randint(1, 255), "08b")  # avoid all-zero key


def _feistel_enumerate_keys() -> Iterator[str]:
    for k in range(256):
        yield format(k, "08b")


def _aes_key_gen() -> str:
    return format(random.randint(1, 65535), "016b")


def _aes_enumerate_keys() -> Iterator[str]:
    for k in range(65536):
        yield format(k, "016b")


# RSA has no key — p, q, e are baked in.
def _rsa_key_gen() -> None:
    return None


# ---------------------------------------------------------------------------
# Encrypt / decrypt adapters — wrap cipher-specific signatures into the
# uniform (plaintext_or_hex, key) -> hex interface.
# ---------------------------------------------------------------------------

def _shift_encrypt(pt: str, key: int) -> str:
    return _shift_mod.Shift().encrypt(pt, key)


def _shift_decrypt(ct: str, key: int) -> str:
    return _shift_mod.Shift().decrypt(ct, key)


def _vigenere_encrypt(pt: str, key: str) -> str:
    return _vigenere_mod.Vigenere().encrypt(pt, key)


def _vigenere_decrypt(ct: str, key: str) -> str:
    return _vigenere_mod.Vigenere().decrypt(ct, key)


def _railfence_encrypt(pt: str, key: int) -> str:
    return _railfence_mod.RailFence().encrypt(pt, key)


def _railfence_decrypt(ct: str, key: int) -> str:
    return _railfence_mod.RailFence().decrypt(ct, key)


def _permutation_encrypt(pt: str, key: list[int]) -> str:
    # The existing Permutation class applies the perm_map to the entire
    # message. We chunk into 8-byte blocks and apply the same perm_map to
    # each block, so a single 8-index key works for any message length.
    block_size = len(key)
    # Pad plaintext to a multiple of block_size bytes.
    pt_bytes = pt.encode("latin-1")
    while len(pt_bytes) % block_size != 0:
        pt_bytes += b" "
    pt_padded = pt_bytes.decode("latin-1")
    # Apply the cipher block-by-block.
    out_hex_parts = []
    cipher = _permutation_mod.Permutation()
    for i in range(0, len(pt_padded), block_size):
        chunk = pt_padded[i:i + block_size]
        out_hex_parts.append(cipher.encrypt(chunk, key))
    # Each cipher call returns hex like "AB CD EF ..."; concatenate the
    # byte tokens (drop the per-call spacing, re-add at the end).
    all_bytes = []
    for part in out_hex_parts:
        all_bytes.extend(part.split())
    return " ".join(all_bytes)


def _permutation_decrypt(ct: str, key: list[int]) -> str:
    block_size = len(key)
    cipher = _permutation_mod.Permutation()
    tokens = ct.split()
    out_bytes = []
    for i in range(0, len(tokens), block_size):
        chunk_hex = " ".join(tokens[i:i + block_size])
        out_bytes.extend(cipher.decrypt(chunk_hex, key).split())
    return " ".join(out_bytes)


def _substitution_encrypt(pt: str, key: dict) -> str:
    return _subst_mod.Substitution().encrypt(pt, key)


def _substitution_decrypt(ct: str, key: dict) -> str:
    # Substitution.decrypt already builds the inverse map internally,
    # so we pass the original forward map directly.
    return _subst_mod.Substitution().decrypt(ct, key)


def _stream_encrypt(pt: str, key: tuple) -> str:
    seed, taps = key
    return _stream_mod.Stream().encrypt(pt, seed, taps)


def _stream_decrypt(ct: str, key: tuple) -> str:
    seed, taps = key
    return _stream_mod.Stream().decrypt(ct, seed, taps)


def _feistel_encrypt(pt: str, key: str) -> str:
    return _feistel_mod.Feistel().encrypt(pt, key)


def _feistel_decrypt(ct: str, key: str) -> str:
    return _feistel_mod.Feistel().decrypt(ct, key)


def _aes_encrypt(pt: str, key: str) -> str:
    return _aes_mod.AES().encrypt(pt, key)


def _aes_decrypt(ct: str, key: str) -> str:
    return _aes_mod.AES().decrypt(ct, key)


# A shared RSA instance — can be reconfigured per-simulation via
# `configure_rsa(p, q, e)`. Defaults follow CIPHERS.md (p=11, q=13, e=7).
_RSA_INSTANCE = _rsa_mod.RSA()


def configure_rsa(p: int, q: int, e: int):
    """Reconfigure the shared RSA instance with new parameters.

    Called by the simulation engine when it resets, so each simulation
    can use freshly-generated random primes (instead of the fixed
    p=11, q=13, e=7 from the spec).
    """
    global _RSA_INSTANCE
    _RSA_INSTANCE = _rsa_mod.RSA(p=p, q=q, e=e)


def get_rsa_instance():
    """Return the current shared RSA instance."""
    return _RSA_INSTANCE


def _rsa_encrypt(pt: str, key) -> str:
    # `key` can be None (use the shared instance) or a (p, q, e) tuple
    # to use a one-off instance with custom params.
    if key is None:
        return _RSA_INSTANCE.encrypt(pt)
    p, q, e = key
    return _rsa_mod.RSA(p=p, q=q, e=e).encrypt(pt)


def _rsa_decrypt(ct: str, key) -> str:
    if key is None:
        return _RSA_INSTANCE.decrypt(ct)
    p, q, e = key
    return _rsa_mod.RSA(p=p, q=q, e=e).decrypt(ct)


def _rsa_key_gen():
    """No key — the RSA instance's parameters are set at sim reset time."""
    return None


# ---------------------------------------------------------------------------
# Cipher metadata.
# ---------------------------------------------------------------------------

@dataclass
class CipherMeta:
    name: str
    cost: int                       # 1..10
    security: int                   # 1..10
    key_generator: Callable[[], Any]
    encrypt: Callable[[str, Any], str]
    decrypt: Callable[[str, Any], str]
    enumerate_keys: Optional[Callable[[], Iterator[Any]]] = None
    description: str = ""


CIPHER_REGISTRY: dict[str, CipherMeta] = {
    "shift": CipherMeta(
        name="shift",
        cost=1,
        security=1,
        key_generator=_shift_key_gen,
        encrypt=_shift_encrypt,
        decrypt=_shift_decrypt,
        enumerate_keys=_shift_enumerate_keys,
        description="Caesar shift on 8-bit bytes",
    ),
    "rail_fence": CipherMeta(
        name="rail_fence",
        cost=1,
        security=2,
        key_generator=_railfence_key_gen,
        encrypt=_railfence_encrypt,
        decrypt=_railfence_decrypt,
        enumerate_keys=_railfence_enumerate_keys,
        description="Transposition cipher with N rails",
    ),
    "permutation": CipherMeta(
        name="permutation",
        cost=2,
        security=3,
        key_generator=_permutation_key_gen,
        encrypt=_permutation_encrypt,
        decrypt=_permutation_decrypt,
        enumerate_keys=_permutation_enumerate_keys,  # 8! = 40320 keys, feasible
        description="Block permutation of 8 bytes",
    ),
    "vigenere": CipherMeta(
        name="vigenere",
        cost=2,
        security=3,
        key_generator=_vigenere_key_gen,
        encrypt=_vigenere_encrypt,
        decrypt=_vigenere_decrypt,
        enumerate_keys=None,
        description="Polyalphabetic substitution",
    ),
    "substitution": CipherMeta(
        name="substitution",
        cost=3,
        security=4,
        key_generator=_substitution_key_gen,
        encrypt=_substitution_encrypt,
        decrypt=_substitution_decrypt,
        enumerate_keys=None,  # 95! is intractable
        description="Monoalphabetic byte substitution",
    ),
    "stream": CipherMeta(
        name="stream",
        cost=2,
        security=5,
        key_generator=_stream_key_gen,
        encrypt=_stream_encrypt,
        decrypt=_stream_decrypt,
        enumerate_keys=None,
        description="LFSR keystream XOR",
    ),
    "feistel": CipherMeta(
        name="feistel",
        cost=3,
        security=6,
        key_generator=_feistel_key_gen,
        encrypt=_feistel_encrypt,
        decrypt=_feistel_decrypt,
        enumerate_keys=_feistel_enumerate_keys,
        description="4-round toy Feistel network",
    ),
    "aes": CipherMeta(
        name="aes",
        cost=5,
        security=8,
        key_generator=_aes_key_gen,
        encrypt=_aes_encrypt,
        decrypt=_aes_decrypt,
        enumerate_keys=_aes_enumerate_keys,  # 2^16 keys, feasible but slow
        description="2-round toy AES",
    ),
    "rsa": CipherMeta(
        name="rsa",
        cost=8,
        security=10,
        key_generator=_rsa_key_gen,
        encrypt=_rsa_encrypt,
        decrypt=_rsa_decrypt,
        enumerate_keys=None,
        description="Toy RSA — parameters p, q, e are configurable",
    ),
}


def sample_key_str(cipher_name: str, key: Any) -> str:
    """Render a key as a short human-readable string for the TUI."""
    if cipher_name in ("shift", "rail_fence"):
        return str(key)
    if cipher_name in ("vigenere",):
        return f'"{key}"'
    if cipher_name == "permutation":
        return "".join(str(k) for k in key)
    if cipher_name == "substitution":
        return f"<{len(key)}-byte map>"
    if cipher_name == "stream":
        seed, taps = key
        return f"seed={seed},taps={taps}"
    if cipher_name in ("feistel", "aes"):
        return key
    if cipher_name == "rsa":
        return "(n=143)"
    return str(key)
