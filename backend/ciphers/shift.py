import utils

class Shift:
    def encrypt(self, plaintext:str, shift:int):
        plaintext_bytes = utils.binary_to_byte_array(utils.text_to_binary(plaintext))
        ciphertext_bytes = []

        for byte in plaintext_bytes:
            byte_int = int(byte, 2)
            byte_int = (byte_int + shift) % 256
            ciphertext_bytes.append(format(byte_int, "08b"))
        
        ciphertext = utils.binary_to_hex(''.join(ciphertext_bytes))

        return ciphertext
    
    def decrypt(self, ciphertext:str, shift:int):
        ciphertext_bytes = utils.binary_to_byte_array(utils.hex_to_binary(ciphertext))
        plaintext_bytes = []

        for byte in ciphertext_bytes:
            byte_int = int(byte, 2)
            byte_int = (byte_int - shift) % 256
            plaintext_bytes.append(format(byte_int, "08b"))

        plaintext = utils.binary_to_hex(''.join(plaintext_bytes))
        return plaintext

