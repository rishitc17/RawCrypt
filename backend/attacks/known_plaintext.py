"""Known-plaintext attack (KPA).

This attack assumes the attacker has access to a "crib" — a known
portion of plaintext that is likely to appear at a known position in
the message. In the simulation, the crib is typically a common English
greeting such as "Hello" or "The" that the communicator is likely to
have sent.

In scope:
  * shift: subtract crib bytes from ciphertext bytes; if the difference
    is constant modulo 256, that constant is the shift.
  * vigenere: similar to shift but per-position; reveals the key cycle.
  * stream: brute-force the LFSR seed (and a small set of common tap
    configurations) using the cipher's own decrypt function, validating
    each candidate by checking that the decrypted prefix matches the
    crib. This is much stronger than the generic BruteForce scoring
    heuristic because the crib is an exact byte match.

Out of scope: feistel, aes, rsa, substitution (these either ignore the
crib or have too many unknowns to recover from a short crib).
"""
import itertools
import attack_utils as utils
from base import Attack, AttackResult, CipherHandle


class KnownPlaintext(Attack):
    name = "known_plaintext"
    cost = 2
    applicable_to = ("shift", "vigenere", "stream")

    # Default crib used when the simulation does not supply one.
    DEFAULT_CRIBS = ("Hello", "The ", "Meet ", "Hi ")

    # For stream-cipher KPA: try seeds of these lengths (in bits) and a
    # small set of common tap configurations.
    STREAM_SEED_LENGTHS = (4, 8)
    STREAM_TAP_CONFIGS = (
        [2, 1], [3, 1], [3, 2], [4, 1], [4, 3],
        [5, 2], [6, 1], [7, 1], [8, 6, 5, 4],
    )

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

        cribs_to_try = [crib] if crib else list(self.DEFAULT_CRIBS)
        cribs_to_try = [c for c in cribs_to_try if c]

        ct_bytes = utils.hex_to_bytes(ciphertext_hex)
        if not ct_bytes:
            return AttackResult(
                attack_name=self.name,
                cipher_name=cipher.name,
                success=False,
                time_elapsed=self._elapsed(start),
                notes="empty ciphertext",
            )

        attempts = 0
        for crib_str in cribs_to_try:
            crib_bytes = [ord(c) for c in crib_str]
            if len(crib_bytes) > len(ct_bytes):
                continue

            if cipher.name == "shift":
                result = self._try_shift(ct_bytes, crib_bytes)
            elif cipher.name == "vigenere":
                result = self._try_vigenere(ct_bytes, crib_bytes)
            elif cipher.name == "stream":
                result = self._try_stream(ct_bytes, crib_bytes, cipher, start,
                                          budget_seconds)
                attempts += result[2] if result else 0
                if result and result[0] is not None:
                    recovered_hex, notes, _ = result
                    return AttackResult(
                        attack_name=self.name,
                        cipher_name=cipher.name,
                        success=True,
                        recovered_hex=recovered_hex,
                        attempts_made=attempts,
                        time_elapsed=self._elapsed(start),
                        notes=notes,
                    )
                continue
            else:
                result = None

            attempts += 1
            if result is not None:
                recovered_hex, notes = result
                recovered_bytes = utils.hex_to_bytes(recovered_hex)
                if utils.looks_like_plaintext(recovered_bytes, 0.18):
                    return AttackResult(
                        attack_name=self.name,
                        cipher_name=cipher.name,
                        success=True,
                        recovered_hex=recovered_hex,
                        attempts_made=attempts,
                        time_elapsed=self._elapsed(start),
                        notes=notes,
                    )

        return AttackResult(
            attack_name=self.name,
            cipher_name=cipher.name,
            success=False,
            attempts_made=attempts,
            time_elapsed=self._elapsed(start),
            notes="crib did not match any candidate",
        )

    def _try_shift(self, ct_bytes, crib_bytes):
        # Difference between ciphertext and crib bytes; if constant, that's the shift.
        diffs = [(c - p) % 256 for c, p in zip(ct_bytes, crib_bytes)]
        if len(set(diffs)) == 1:
            shift = diffs[0]
            recovered = [(c - shift) % 256 for c in ct_bytes]
            return utils.bytes_to_hex(recovered), f"recovered shift={shift}"
        return None

    def _try_vigenere(self, ct_bytes, crib_bytes):
        # The Vigenere cipher in this repo operates on printable ASCII
        # (32..126) with modulo 95. Recover the key cycle from the crib.
        diffs = [((c - 32) - (p - 32)) % 95 for c, p in zip(ct_bytes, crib_bytes)]
        # Try to find a period: shortest k such that diffs is k-periodic.
        for period in range(1, len(diffs) + 1):
            if all(diffs[i] == diffs[i % period] for i in range(len(diffs))):
                key_codes = diffs[:period]
                # Recover plaintext using the inferred key cycle.
                recovered = []
                for i, c in enumerate(ct_bytes):
                    k = key_codes[i % period]
                    p = (((c - 32) - k) % 95) + 32
                    recovered.append(p)
                # Sanity: crib should appear at the start.
                if recovered[:len(crib_bytes)] == crib_bytes:
                    key_str = "".join(chr(k + 32) for k in key_codes)
                    return utils.bytes_to_hex(recovered), f"recovered key='{key_str}'"
                break
        return None

    def _try_stream(self, ct_bytes, crib_bytes, cipher: CipherHandle,
                    start: float, budget_seconds: float):
        """Brute-force the LFSR seed (and common tap configs) using the
        crib as an exact-match validator.

        Returns (recovered_hex, notes, attempts) on success, or
        (None, notes, attempts) on failure.
        """
        if cipher.decrypt_fn is None:
            return None, "no decrypt function available", 0

        ct_hex = utils.bytes_to_hex(ct_bytes)
        attempts = 0
        for seed_len in self.STREAM_SEED_LENGTHS:
            for taps in self.STREAM_TAP_CONFIGS:
                # Only consider taps that fit within the seed length.
                if any(t >= seed_len for t in taps):
                    continue
                for seed_int in range(2 ** seed_len):
                    attempts += 1
                    seed_str = format(seed_int, f"0{seed_len}b")
                    try:
                        candidate_hex = cipher.decrypt_fn(ct_hex, (seed_str, taps))
                    except Exception:
                        continue
                    candidate_bytes = utils.hex_to_bytes(candidate_hex)
                    # Exact-match check: does the decrypted prefix equal the crib?
                    if candidate_bytes[:len(crib_bytes)] == crib_bytes:
                        return candidate_hex, \
                            f"recovered seed={seed_str}, taps={taps}", attempts
                    if self._elapsed(start) > budget_seconds:
                        return None, "budget exhausted", attempts
        return None, "no seed/taps matched the crib", attempts

