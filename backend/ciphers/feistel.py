import utils

class Feistel:
    def encrypt(self, plaintext:str, master_key:str):
        plaintext_bytes = utils.binary_to_byte_array(utils.text_to_binary(plaintext))
        plaintext_blocks = [plaintext_bytes[i] + (plaintext_bytes[i + 1] if i + 1 < len(plaintext_bytes) else '00000000') for i in range(0, len(plaintext_bytes), 2)]
        