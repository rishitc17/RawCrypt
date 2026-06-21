import utils

class Substitution:
    def encrypt(self, plaintext:str, substitution_map:dict):
        plaintext_bytes = utils.binary_to_byte_array(utils.text_to_binary(plaintext))
        ciphertext_bytes = [substitution_map[char] for char in plaintext_bytes]

        ciphertext = utils.binary_to_hex(''.join(ciphertext_bytes))
        return ciphertext
    
    def decrypt(self, ciphertext:str, substitution_map:dict):
        inverse_map = {value: key for key, value in substitution_map.items()}
        ciphertext_bytes = utils.binary_to_byte_array(utils.hex_to_binary(ciphertext))
        plaintext_bytes = [inverse_map[char] for char in ciphertext_bytes]

        plaintext = utils.binary_to_hex(''.join(plaintext_bytes))
        return plaintext
    
