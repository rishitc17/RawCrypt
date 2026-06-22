import utils


class Feistel:
    # Toy Feistel cipher.
    #
    # Inputs (per CIPHERS.md):
    #   * Plaintext block: 16 bits
    #   * Master key:      8 bits
    #
    # Structure:
    #   * 4 rounds
    #   * Round keys are the master key rotated LEFT by 0, 1, 2, 3 bits
    #     (K1 = original, K2 = rol1, K3 = rol2, K4 = rol3 — all from original)
    #   * Round function F(half, key):
    #       temp = half XOR key
    #       swap the two nibbles of temp
    #   * Round i (encryption):
    #       Li = Ri-1
    #       Ri = Li-1 XOR F(Ri-1, Ki)
    #   * Ciphertext = L4 || R4

    ROUNDS = 4

    def encrypt(self, plaintext: str, key: str):
        # plaintext: arbitrary text
        # key:      8-bit binary string e.g. "11001010"
        plaintext_bits = utils.text_to_binary(plaintext)

        # Pad to a whole number of 16-bit blocks with zero bits.
        while len(plaintext_bits) % 16 != 0:
            plaintext_bits = f"{plaintext_bits}0"

        round_keys = self._generate_round_keys(key)

        ciphertext_bits = ""
        for i in range(0, len(plaintext_bits), 16):
            block = plaintext_bits[i:i + 16]
            ciphertext_bits = f"{ciphertext_bits}{self._encrypt_block(block, round_keys)}"

        return utils.binary_to_hex(ciphertext_bits)

    def decrypt(self, ciphertext: str, key: str):
        # ciphertext: hex string e.g. "5E 51 4D 4D 72 2B"
        # key:        8-bit binary string e.g. "11001010"
        ciphertext_bits = utils.hex_to_binary(ciphertext)

        round_keys = self._generate_round_keys(key)

        plaintext_bits = ""
        for i in range(0, len(ciphertext_bits), 16):
            block = ciphertext_bits[i:i + 16]
            plaintext_bits = f"{plaintext_bits}{self._decrypt_block(block, round_keys)}"

        return utils.binary_to_hex(plaintext_bits)

    def _generate_round_keys(self, key: str):
        # Ki = rotate left by (i-1) bits from the ORIGINAL key.
        # i = 1..4 → rotation amounts 0, 1, 2, 3.
        round_keys = []
        for i in range(self.ROUNDS):
            rotation = i
            round_keys.append(key[rotation:] + key[:rotation])
        return round_keys

    def _F(self, half_block: str, round_key: str):
        # Step 1: XOR half block with the round key.
        temp = self._xor_bits(half_block, round_key)

        # Step 2 & 3: split into two nibbles and swap them.
        left_nibble = temp[:4]
        right_nibble = temp[4:]
        return f"{right_nibble}{left_nibble}"

    def _encrypt_block(self, block: str, round_keys: list):
        L = block[:8]
        R = block[8:]

        for round_key in round_keys:
            new_L = R
            new_R = self._xor_bits(L, self._F(R, round_key))
            L = new_L
            R = new_R

        return f"{L}{R}"

    def _decrypt_block(self, block: str, round_keys: list):
        # Feistel decryption = same structure with round keys applied in reverse.
        # For each round (given Li, Ri):
        #     Ri-1 = Li
        #     Li-1 = Ri XOR F(Li, Ki)
        L = block[:8]
        R = block[8:]

        for round_key in reversed(round_keys):
            new_R = L
            new_L = self._xor_bits(R, self._F(L, round_key))
            L = new_L
            R = new_R

        return f"{L}{R}"

    def _xor_bits(self, a: str, b: str):
        return "".join(str(int(x) ^ int(y)) for x, y in zip(a, b))
