"""Frequency-analysis attack.

Statistical attack that targets ciphers where the underlying byte
frequencies are preserved (monoalphabetic substitution ciphers).

In scope for this attack:
  * substitution: build a frequency table of ciphertext bytes, map each
    ciphertext byte to the English byte with the closest frequency rank,
    and decrypt. Works well on long messages; fails on short ones.

Out of scope (returns failure with notes):
  * shift, vigenere, etc. — these are better handled by brute force or
    KPA, so this attack declines to waste time on them.
"""
import attack_utils as utils
from base import Attack, AttackResult, CipherHandle


class FrequencyAnalysis(Attack):
    name = "frequency"
    cost = 3
    applicable_to = ("substitution",)

    # Minimum ciphertext length (in bytes) for the statistics to be reliable.
    MIN_CIPHERTEXT_LEN = 20

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
        if len(ct_bytes) < self.MIN_CIPHERTEXT_LEN:
            return AttackResult(
                attack_name=self.name,
                cipher_name=cipher.name,
                success=False,
                time_elapsed=self._elapsed(start),
                notes=f"ciphertext too short ({len(ct_bytes)} bytes)",
            )

        # Rank ciphertext bytes by observed frequency (most frequent first).
        ct_freq = {}
        for b in ct_bytes:
            ct_freq[b] = ct_freq.get(b, 0) + 1
        ct_ranked = sorted(ct_freq.keys(), key=lambda b: -ct_freq[b])

        # Rank English bytes by expected frequency (most frequent first).
        eng_freq = utils.ENGLISH_FREQ
        # Build a full ranking over all printable bytes plus common bytes.
        all_bytes = list(range(32, 127))
        eng_ranked = sorted(all_bytes, key=lambda b: -eng_freq.get(b, utils._DEFAULT_FREQ))

        # Build the inferred substitution map: ciphertext byte -> plaintext byte.
        mapping = {}
        for i, ct_byte in enumerate(ct_ranked):
            if i < len(eng_ranked):
                mapping[ct_byte] = eng_ranked[i]
            else:
                mapping[ct_byte] = 32  # default to space

        # Apply the mapping to recover plaintext.
        recovered = [mapping.get(b, 32) for b in ct_bytes]

        # Decide success: does the recovered text score well?
        score = utils.english_score(recovered)
        success = score >= 0.4 and utils.printable_ratio(recovered) >= 0.95

        return AttackResult(
            attack_name=self.name,
            cipher_name=cipher.name,
            success=success,
            recovered_hex=utils.bytes_to_hex(recovered) if success else None,
            attempts_made=1,
            time_elapsed=self._elapsed(start),
            notes=f"freq score={score:.2f} (threshold 0.40)",
        )
