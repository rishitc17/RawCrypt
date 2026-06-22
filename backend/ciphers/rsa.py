import utils


def is_prime(n: int) -> bool:
    """Trial-division primality test. Fine for small n (< 10^6)."""
    if n < 2:
        return False
    if n < 4:
        return True
    if n % 2 == 0:
        return False
    i = 3
    while i * i <= n:
        if n % i == 0:
            return False
        i += 2
    return True


def gcd(a: int, b: int) -> int:
    while b:
        a, b = b, a % b
    return a


class RSA:
    # Toy RSA cipher.
    #
    # Defaults follow CIPHERS.md:
    #   * p = 11, q = 13  →  n = 143,  phi(n) = 120
    #   * e = 7           (gcd(7, 120) = 1)
    #   * d = e^-1 mod phi(n) = 103   (because 7 * 103 = 721 = 6 * 120 + 1)
    #
    # Public  key: (e, n) = (7,   143)
    # Private key: (d, n) = (103, 143)
    #
    # Encryption: c = m^e mod n
    # Decryption: m = c^d mod n
    #
    # Block size: 8 bits per character (ASCII byte). Because the default
    # n = 143 < 256, any plaintext byte >= 143 wraps around and is not
    # recoverable — this is a known limitation of the toy parameters and
    # is fine for the educational ASCII range (printable ASCII: 32-126).

    DEFAULT_P = 11
    DEFAULT_Q = 13
    DEFAULT_E = 7

    def __init__(self, p: int = DEFAULT_P, q: int = DEFAULT_Q, e: int = DEFAULT_E):
        # Validate inputs.
        if p == q:
            raise ValueError("p and q must be different primes")
        if not is_prime(p):
            raise ValueError(f"p = {p} is not prime")
        if not is_prime(q):
            raise ValueError(f"q = {q} is not prime")
        n = p * q
        if n < 256:
            # Not an error — just a limitation. Printable ASCII (32-126)
            # still works as long as n > 126.
            if n <= 126:
                raise ValueError(
                    f"n = p*q = {n} is too small — must be > 126 to encrypt "
                    f"printable ASCII. Try larger primes."
                )
        phi = (p - 1) * (q - 1)
        if gcd(e, phi) != 1:
            raise ValueError(
                f"e = {e} is not coprime with phi(n) = {phi}. "
                f"Pick a different e."
            )

        self.p = p
        self.q = q
        self.n = n
        self.phi = phi
        self.e = e
        self.d = self._modular_inverse(e, self.phi)

        # Public and private keys.
        self.public_key = (self.e, self.n)
        self.private_key = (self.d, self.n)

    def _modular_inverse(self, a: int, m: int):
        # Extended Euclidean Algorithm.
        # Returns x such that (a * x) ≡ 1 (mod m).
        def extended_gcd(a, b):
            if a == 0:
                return b, 0, 1
            gcd, x1, y1 = extended_gcd(b % a, a)
            x = y1 - (b // a) * x1
            y = x1
            return gcd, x, y

        gcd, x, _ = extended_gcd(a, m)
        if gcd != 1:
            raise ValueError(f"No modular inverse: gcd({a}, {m}) = {gcd} != 1")
        return x % m

    def encrypt(self, plaintext: str):
        # plaintext: arbitrary text. Each character is treated as one 8-bit block.
        plaintext_bytes = utils.binary_to_byte_array(utils.text_to_binary(plaintext))

        ciphertext_bytes = []
        for byte in plaintext_bytes:
            m = int(byte, 2)
            if m >= self.n:
                raise ValueError(
                    f"Plaintext byte {m} ('{chr(m) if 32 <= m < 127 else '?'}') "
                    f"is >= n = {self.n}. Use larger primes so n > 255, or "
                    f"stick to characters with code < {self.n}."
                )
            c = pow(m, self.e, self.n)
            ciphertext_bytes.append(format(c, "08b"))

        return utils.binary_to_hex("".join(ciphertext_bytes))

    def decrypt(self, ciphertext: str):
        # ciphertext: hex string e.g. "41 41"
        ciphertext_bytes = utils.binary_to_byte_array(utils.hex_to_binary(ciphertext))

        plaintext_bytes = []
        for byte in ciphertext_bytes:
            c = int(byte, 2)
            m = pow(c, self.d, self.n)
            plaintext_bytes.append(format(m, "08b"))

        return utils.binary_to_hex("".join(plaintext_bytes))
