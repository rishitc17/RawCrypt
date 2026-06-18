import utils

class Permutation:
    def encrypt(self, plaintext:str, perm_map:list[int]):
        plaintext_bytes = utils.binary_to_byte_array(utils.text_to_binary(plaintext))
        ciphertext_bytes = [0 for _ in range(len(plaintext_bytes))]

        for idx, byte in enumerate(plaintext_bytes):
            ciphertext_bytes[perm_map[idx]] = byte
        
        ciphertext = utils.binary_to_hex(''.join(ciphertext_bytes))
        return ciphertext
    
    def decrypt(self, ciphertext:str, perm_map:list[int]):
        ciphertext_bytes = utils.binary_to_byte_array(utils.hex_to_binary(ciphertext))
        plaintext_bytes = [0 for _ in range(len(ciphertext_bytes))]

        inverse_map = [0 for _ in range(len(perm_map))]
        
        for idx, ele in enumerate(perm_map):
            inverse_map[ele] = idx

        for idx, byte in enumerate(ciphertext_bytes):
            plaintext_bytes[inverse_map[idx]] = byte
        
        plaintext = utils.binary_to_hex(''.join(plaintext_bytes))
        return plaintext

