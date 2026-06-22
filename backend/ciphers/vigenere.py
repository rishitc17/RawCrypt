import utils

class Vigenere:
    def encrypt(self, plaintext:str, key:str):
        plaintext_bytes = utils.binary_to_byte_array(utils.text_to_binary(plaintext))
        key_bytes = utils.binary_to_byte_array(utils.text_to_binary(key))

        original_key = key_bytes.copy()

        while len(key_bytes) < len(plaintext_bytes):
            key_bytes.extend(original_key)

        key_bytes = key_bytes[:len(plaintext_bytes)]
        
        ciphertext_bytes = []
        for idx, char in enumerate(plaintext_bytes):
            ciphertext_bytes.append(format(((((int(char, 2) - 32) + (int(key_bytes[idx], 2) - 32)) % 95) + 32), "08b"))
        
        ciphertext = utils.binary_to_hex(''.join(ciphertext_bytes))
        return ciphertext
    
    def decrypt(self, ciphertext:str, key:str):
        ciphertext_bytes = utils.binary_to_byte_array(utils.hex_to_binary(ciphertext))
        key_bytes = utils.binary_to_byte_array(utils.text_to_binary(key))

        original_key = key_bytes.copy()

        while len(key_bytes) < len(ciphertext_bytes):
            key_bytes.extend(original_key)

        key_bytes = key_bytes[:len(ciphertext_bytes)]
        
        plaintext_bytes = []
        for idx, char in enumerate(ciphertext_bytes):
            plaintext_bytes.append(format(((((int(char, 2) - 32) - (int(key_bytes[idx], 2) - 32)) % 95) + 32), "08b"))
        
        plaintext = utils.binary_to_hex(''.join(plaintext_bytes))
        return plaintext
