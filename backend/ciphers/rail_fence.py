import utils

class RailFence:
    def encrypt(self, plaintext:str, rails:int):
        if rails == 1:
            ciphertext = utils.binary_to_hex(utils.text_to_binary(plaintext))
            return ciphertext
        plaintext_bits = utils.text_to_binary(plaintext)
        track = [[] for _ in range(rails)]

        direction = 1
        t = 0
        for bit in plaintext_bits:
            track[t].append(bit)
            t += direction
            if (t == rails - 1 and direction == 1) or (t == 0 and direction == -1):
                direction = -direction
        
        ciphertext_bits = ""
        for rail in track:
            ciphertext_bits = f"{ciphertext_bits}{''.join(rail)}"
        
        ciphertext = utils.binary_to_hex(ciphertext_bits)
        return ciphertext
    
    def decrypt(self, ciphertext:str, rails:int):
        if rails == 1:
            return ciphertext
        ciphertext_bits = utils.hex_to_binary(ciphertext)
        track = [[] for _ in range(rails)]

        direction = 1
        t = 0
        for _ in range(len(ciphertext_bits)):
            track[t].append("X")
            t += direction
            if (t == rails - 1 and direction == 1) or (t == 0 and direction == -1):
                direction = -direction
        
        temp_c_bits = ciphertext_bits
        for idx in range(len(track)):
            track[idx] = list(temp_c_bits[:len(track[idx])])
            temp_c_bits = temp_c_bits[len(track[idx]):]
        
        direction = 1
        t = 0
        plaintext_bits = ""
        for _ in range(len(ciphertext_bits)):
            plaintext_bits = f"{plaintext_bits}{track[t][0]}"
            track[t].pop(0)
            t += direction
            if (t == rails - 1 and direction == 1) or (t == 0 and direction == -1):
                direction = -direction
        
        plaintext = utils.binary_to_hex(plaintext_bits)
        return plaintext
