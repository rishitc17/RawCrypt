import utils


class AES:
    # Toy AES cipher.
    #
    # Inputs (per CIPHERS.md):
    #   * Plaintext block: 16 bits  (treated as 4 nibbles N1 N2 N3 N4)
    #   * Key:             16 bits
    #
    # Structure:
    #   * Initial AddRoundKey with K0
    #   * Round 1: SubBytes, ShiftRows, MixColumns, AddRoundKey (K1)
    #   * Round 2 (final): SubBytes, ShiftRows, AddRoundKey (K2)  — no MixColumns
    #
    # Key schedule:
    #   * K0 = original key
    #   * K1 = key rotated LEFT by 4 bits
    #   * K2 = key rotated LEFT by 8 bits
    #
    # State layout: 4 nibbles [N1, N2, N3, N4] viewed as a 2x2 grid:
    #     N1 N2
    #     N3 N4

    S_BOX = {
        "0000": "1110", "0001": "0100", "0010": "1101", "0011": "0001",
        "0100": "0010", "0101": "1111", "0110": "1011", "0111": "1000",
        "1000": "0011", "1001": "1010", "1010": "0110", "1011": "1100",
        "1100": "0101", "1101": "1001", "1110": "0000", "1111": "0111",
    }

    def __init__(self):
        # Inverse S-Box: swap keys and values of the forward S-Box.
        self.INVERSE_S_BOX = {output: input_nibble
                              for input_nibble, output in self.S_BOX.items()}

    def encrypt(self, plaintext: str, key: str):
        # plaintext: arbitrary text
        # key:       16-bit binary string e.g. "1100101011110000"
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
        # ciphertext: hex string e.g. "9D DE C0"
        # key:         16-bit binary string e.g. "1100101011110000"
        ciphertext_bits = utils.hex_to_binary(ciphertext)

        round_keys = self._generate_round_keys(key)

        plaintext_bits = ""
        for i in range(0, len(ciphertext_bits), 16):
            block = ciphertext_bits[i:i + 16]
            plaintext_bits = f"{plaintext_bits}{self._decrypt_block(block, round_keys)}"

        return utils.binary_to_hex(plaintext_bits)

    def _generate_round_keys(self, key: str):
        k0 = key
        k1 = key[4:] + key[:4]    # rotate left by 4 bits
        k2 = key[8:] + key[:8]    # rotate left by 8 bits
        return [k0, k1, k2]

    # --- AES operations (state is a list of 4 nibble strings) ---

    def _sub_bytes(self, state):
        return [self.S_BOX[nibble] for nibble in state]

    def _inv_sub_bytes(self, state):
        return [self.INVERSE_S_BOX[nibble] for nibble in state]

    def _shift_rows(self, state):
        # 2x2 view: [[N1, N2], [N3, N4]]
        # Rotate the second row LEFT by one position:
        #     [[N1, N2], [N3, N4]] → [[N1, N2], [N4, N3]]
        # In flat form: swap N3 and N4.
        return [state[0], state[1], state[3], state[2]]

    def _inv_shift_rows(self, state):
        # Rotating a 2-element row left by 1 is its own inverse.
        return [state[0], state[1], state[3], state[2]]

    def _mix_columns(self, state):
        # Columns are [N1, N4] and [N2, N3].
        # For each column [top, bottom]:
        #     top    = top XOR bottom
        #     bottom = original top
        n1, n2, n3, n4 = state
        new_n1 = self._xor_nibbles(n1, n4)
        new_n2 = self._xor_nibbles(n2, n3)
        new_n3 = n2
        new_n4 = n1
        return [new_n1, new_n2, new_n3, new_n4]

    def _inv_mix_columns(self, state):
        # Inverse of the above MixColumns:
        # Given (a', b', c', d') = (a^d, b^c, b, a):
        #     a = d'
        #     b = c'
        #     c = b' XOR c'   (since b' = b^c = c' ^ c  →  c = b' ^ c')
        #     d = a' XOR d'   (since a' = a^d = d' ^ d  →  d = a' ^ d')
        n1, n2, n3, n4 = state
        new_n1 = n4
        new_n2 = n3
        new_n3 = self._xor_nibbles(n2, n3)
        new_n4 = self._xor_nibbles(n1, n4)
        return [new_n1, new_n2, new_n3, new_n4]

    def _add_round_key(self, state, round_key):
        # state: list of 4 nibbles; round_key: 16-bit binary string.
        key_nibbles = [round_key[i:i + 4] for i in range(0, 16, 4)]
        return [self._xor_nibbles(s, k) for s, k in zip(state, key_nibbles)]

    def _xor_nibbles(self, a, b):
        return format(int(a, 2) ^ int(b, 2), "04b")

    # --- Block-level encryption / decryption ---

    def _encrypt_block(self, block, round_keys):
        state = [block[i:i + 4] for i in range(0, 16, 4)]

        # Initial AddRoundKey with K0.
        state = self._add_round_key(state, round_keys[0])

        # Round 1 (full round: SubBytes, ShiftRows, MixColumns, AddRoundKey).
        state = self._sub_bytes(state)
        state = self._shift_rows(state)
        state = self._mix_columns(state)
        state = self._add_round_key(state, round_keys[1])

        # Round 2 (final round: no MixColumns).
        state = self._sub_bytes(state)
        state = self._shift_rows(state)
        state = self._add_round_key(state, round_keys[2])

        return "".join(state)

    def _decrypt_block(self, block, round_keys):
        state = [block[i:i + 4] for i in range(0, 16, 4)]

        # Undo Round 2 (reverse order: AddRoundKey, InvShiftRows, InvSubBytes).
        state = self._add_round_key(state, round_keys[2])
        state = self._inv_shift_rows(state)
        state = self._inv_sub_bytes(state)

        # Undo Round 1 (AddRoundKey, InvMixColumns, InvShiftRows, InvSubBytes).
        state = self._add_round_key(state, round_keys[1])
        state = self._inv_mix_columns(state)
        state = self._inv_shift_rows(state)
        state = self._inv_sub_bytes(state)

        # Undo initial AddRoundKey with K0.
        state = self._add_round_key(state, round_keys[0])

        return "".join(state)
