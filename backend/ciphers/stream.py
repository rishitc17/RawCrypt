import utils

class Stream:
    def encrypt(self, plaintext:str, seed:str, taps:list[int]):
        plaintext_bits = utils.text_to_binary(plaintext)

        lfsr = [int(ch) for ch in seed]
        key = []

        while len(key) < len(plaintext_bits):
            key.append(lfsr[-1])
            new_bit = 0
            for idx, val in enumerate(lfsr):
                if (len(lfsr) - 1 - idx) in taps:
                    new_bit ^= val

            lfsr.pop(-1)
            lfsr.insert(0, new_bit)
        
        ciphertext_bit_array = []
        for idx, bit in enumerate(plaintext_bits):
            ciphertext_bit_array.append(str(key[idx] ^ int(bit)))
        
        ciphertext = utils.binary_to_hex(''.join(ciphertext_bit_array))
        return ciphertext

    def decrypt(self, ciphertext:str, seed:str, taps:list[int]):
        ciphertext_bits = utils.hex_to_binary(ciphertext)
        lfsr = [int(ch) for ch in seed]
        key = []

        while len(key) < len(ciphertext_bits):
            key.append(lfsr[-1])
            new_bit = 0
            for idx, val in enumerate(lfsr):
                if (len(lfsr) - 1 - idx) in taps:
                    new_bit ^= val

            lfsr.pop(-1)
            lfsr.insert(0, new_bit)
        
        plaintext_bit_array = []
        for idx, bit in enumerate(ciphertext_bits):
            plaintext_bit_array.append(str(key[idx] ^ int(bit)))
        
        plaintext = utils.binary_to_hex(''.join(plaintext_bit_array))
        return plaintext
