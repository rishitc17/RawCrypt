"""Brute-force attack.

Tries every candidate key in the cipher's key space (via
`cipher.enumerate_keys()`) and uses the cipher's own `decrypt_fn` to
test each candidate. A candidate "works" if the decrypted output looks
like English text (printable ASCII + frequency score).

This attack only succeeds on ciphers with an enumerable key space:
shift, rail_fence, feistel, and (within budget) toy AES. It bails
immediately on ciphers whose key space is None (substitution, vigenere
with long keys, stream, permutation with long messages, RSA).
"""
import attack_utils as utils
from base import Attack, AttackResult, CipherHandle


class BruteForce(Attack):
    name = "brute_force"
    cost = 4
    applicable_to = ("shift", "rail_fence", "feistel", "aes")

    # Score threshold above which a decrypted candidate is accepted as plaintext.
    # Tuned to accept short English phrases (~0.20) while rejecting random
    # byte sequences (which typically score < 0.10).
    ACCEPT_THRESHOLD = 0.18

    def attempt(self, ciphertext_hex: str, cipher: CipherHandle,
                budget_seconds: float = 2.0,
                crib: str | None = None) -> AttackResult:
        start = self._start_timer()

        if cipher.enumerate_keys is None:
            return AttackResult(
                attack_name=self.name,
                cipher_name=cipher.name,
                success=False,
                time_elapsed=self._elapsed(start),
                notes="key space not enumerable",
            )

        attempts = 0
        for key in cipher.enumerate_keys():
            attempts += 1
            try:
                candidate_hex = cipher.decrypt_fn(ciphertext_hex, key)
            except Exception:
                # Some keys may be invalid for the cipher's internal format;
                # skip them rather than aborting the whole attack.
                continue

            candidate_bytes = utils.hex_to_bytes(candidate_hex)
            if utils.looks_like_plaintext(candidate_bytes, self.ACCEPT_THRESHOLD):
                return AttackResult(
                    attack_name=self.name,
                    cipher_name=cipher.name,
                    success=True,
                    recovered_hex=candidate_hex,
                    attempts_made=attempts,
                    time_elapsed=self._elapsed(start),
                    notes=f"accepted after {attempts} candidate key(s)",
                )

            if self._elapsed(start) > budget_seconds:
                return AttackResult(
                    attack_name=self.name,
                    cipher_name=cipher.name,
                    success=False,
                    attempts_made=attempts,
                    time_elapsed=self._elapsed(start),
                    notes="budget exhausted",
                )

        return AttackResult(
            attack_name=self.name,
            cipher_name=cipher.name,
            success=False,
            attempts_made=attempts,
            time_elapsed=self._elapsed(start),
            notes="exhausted key space without match",
        )
