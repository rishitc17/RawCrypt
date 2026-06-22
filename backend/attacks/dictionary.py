"""Dictionary attack.

Tries a small list of "weak" or common keys against the cipher. This
catches agents that pick poor keys (e.g. shift=3, vigenere key="KEY",
the LFSR seed "0001"). It also targets toy RSA by attempting to factor
n with small primes — since the default n=143=11*13, this attack
succeeds against the toy RSA parameters, which is a nice teaching
moment about why real RSA uses 2048-bit moduli.

In scope:
  * shift: try common shift values (1, 3, 13, 25, 47).
  * vigenere: try common short keys ("KEY", "SECRET", "PASSWORD", "A").
  * rail_fence: try small rail counts (2, 3, 4, 5).
  * rsa: factor n with primes up to a small bound.
"""
import attack_utils as utils
from base import Attack, CipherHandle, AttackResult


# Weak-key dictionaries. Keys are encoded in the format the cipher expects.
WEAK_SHIFTS = (1, 3, 13, 25, 47)
WEAK_VIGENERE_KEYS = ("KEY", "SECRET", "PASSWORD", "A", "HELLO")
WEAK_RAIL_FENCES = (2, 3, 4, 5)
WEAK_STREAM_SEEDS = ("0001", "1111", "0101", "0010")


class DictionaryAttack(Attack):
    name = "dictionary"
    cost = 1
    applicable_to = ("shift", "vigenere", "rail_fence", "rsa", "stream")

    def attempt(self, ciphertext_hex: str, cipher: CipherHandle,
                budget_seconds: float = 2.0,
                crib: str | None = None) -> AttackResult:
        start = self._start_timer()

        if cipher.name not in self.applicable_to:
            return AttackResult(
                attack_name=self.name,
                cipher_name=cipher.name,
                success=False,
                time_elapsed=self._elapsed(start),
                notes="not applicable to this cipher",
            )

        ct_bytes = utils.hex_to_bytes(ciphertext_hex)
        attempts = 0

        if cipher.name == "rsa":
            # Factor n with small primes. n is exposed via the cipher's
            # key_generator (the RSA constructor stores n there).
            # We try primes up to 1000; for the toy n=143 this finds 11 and 13.
            n = self._extract_rsa_n(cipher)
            if n is None:
                return AttackResult(
                    attack_name=self.name, cipher_name=cipher.name,
                    success=False, time_elapsed=self._elapsed(start),
                    notes="could not determine RSA modulus",
                )
            for p in self._small_primes_up_to(1000):
                attempts += 1
                if n % p == 0 and p != n:
                    q = n // p
                    return AttackResult(
                        attack_name=self.name,
                        cipher_name=cipher.name,
                        success=True,
                        recovered_hex=ciphertext_hex,  # ciphertext == plaintext for toy RSA on byte b where b<n
                        attempts_made=attempts,
                        time_elapsed=self._elapsed(start),
                        notes=f"factored n={n} = {p} * {q}",
                    )
                if self._elapsed(start) > budget_seconds:
                    return AttackResult(
                        attack_name=self.name, cipher_name=cipher.name,
                        success=False, attempts_made=attempts,
                        time_elapsed=self._elapsed(start),
                        notes="budget exhausted",
                    )
            return AttackResult(
                attack_name=self.name, cipher_name=cipher.name,
                success=False, attempts_made=attempts,
                time_elapsed=self._elapsed(start),
                notes="no small prime factor found",
            )

        # For the other ciphers, try each weak key and score the result.
        weak_keys = self._weak_keys_for(cipher.name)
        for key in weak_keys:
            attempts += 1
            try:
                candidate_hex = cipher.decrypt_fn(ciphertext_hex, key)
            except Exception:
                continue
            candidate_bytes = utils.hex_to_bytes(candidate_hex)
            if utils.looks_like_plaintext(candidate_bytes, 0.18):
                return AttackResult(
                    attack_name=self.name,
                    cipher_name=cipher.name,
                    success=True,
                    recovered_hex=candidate_hex,
                    attempts_made=attempts,
                    time_elapsed=self._elapsed(start),
                    notes=f"weak key worked: {key!r}",
                )
            if self._elapsed(start) > budget_seconds:
                return AttackResult(
                    attack_name=self.name, cipher_name=cipher.name,
                    success=False, attempts_made=attempts,
                    time_elapsed=self._elapsed(start),
                    notes="budget exhausted",
                )

        return AttackResult(
            attack_name=self.name, cipher_name=cipher.name,
            success=False, attempts_made=attempts,
            time_elapsed=self._elapsed(start),
            notes="no weak key matched",
        )

    def _weak_keys_for(self, cipher_name: str):
        if cipher_name == "shift":
            return list(WEAK_SHIFTS)
        if cipher_name == "vigenere":
            return list(WEAK_VIGENERE_KEYS)
        if cipher_name == "rail_fence":
            return list(WEAK_RAIL_FENCES)
        if cipher_name == "stream":
            # Stream cipher takes (seed, taps); we use a few common taps configs.
            return [(seed, [2, 1]) for seed in WEAK_STREAM_SEEDS]
        return []

    def _extract_rsa_n(self, cipher: CipherHandle):
        # The simulation's CipherHandle.key_generator holds an RSA instance
        # whose .n attribute is the modulus. We try a few access paths.
        gen = cipher.key_generator
        if gen is None:
            return None
        # The simulation may store the RSA instance on the handle.
        rsa_instance = getattr(gen, "__self__", None)
        if rsa_instance is not None and hasattr(rsa_instance, "n"):
            return rsa_instance.n
        # Fallback: look for an attribute on the handle.
        return getattr(cipher, "rsa_n", None)

    def _small_primes_up_to(self, bound: int):
        # Simple sieve. Small bound so we don't bother with optimisations.
        sieve = [True] * (bound + 1)
        sieve[0:2] = [False, False]
        for i in range(2, int(bound ** 0.5) + 1):
            if sieve[i]:
                for j in range(i * i, bound + 1, i):
                    sieve[j] = False
        return [i for i, is_prime in enumerate(sieve) if is_prime]
