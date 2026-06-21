"""Wiki content for cryptographic terms.

Each term has a short definition, an example, related terms, and an
optional "why it matters" hook aimed at teenagers learning crypto.
"""
WIKI = {
    "plaintext": {
        "title": "Plaintext",
        "icon": "fa-file-lines",
        "summary": "The original, readable message before it gets scrambled.",
        "body": (
            "Plaintext is just the message you want to send — written in a form "
            "anyone can read. It could be English text like \"meet me at noon\", "
            "a credit-card number, or the bytes of an image file. The whole point "
            "of cryptography is to turn plaintext into something an eavesdropper "
            "cannot read, then turn it back into plaintext at the other end.\n\n"
            "In RawCrypt, every message starts as plaintext from a small corpus "
            "of spy-movie-style sentences. Communicators pick a cipher, scramble "
            "the plaintext into ciphertext, and send it across the wire."
        ),
        "example": "Meet me at noon by the old church.",
        "related": ["ciphertext", "encryption", "decryption"],
    },
    "ciphertext": {
        "title": "Ciphertext",
        "icon": "fa-lock",
        "summary": "The scrambled output of a cipher — unreadable without the key.",
        "body": (
            "Ciphertext is what you actually send over the wire. It looks like "
            "gibberish to anyone who intercepts it: a string of bytes that "
            "reveals nothing about the original message unless you know how to "
            "reverse the cipher (and usually, the key).\n\n"
            "In RawCrypt, ciphertext is shown as a space-separated hex string "
            "like \"5E 51 4D 4D 72 2B\". Each pair of hex digits is one byte "
            "(0-255) of scrambled output."
        ),
        "example": "5E 51 4D 4D 72 2B",
        "related": ["plaintext", "encryption", "cipher"],
    },
    "cipher": {
        "title": "Cipher",
        "icon": "fa-shuffle",
        "summary": "An algorithm that turns plaintext into ciphertext and back.",
        "body": (
            "A cipher is a recipe for scrambling and unscrambling messages. "
            "You feed it plaintext plus a key, and out comes ciphertext. Feed "
            "it ciphertext plus the same (or related) key, and out comes the "
            "original plaintext.\n\n"
            "Ciphers come in two big flavours: symmetric (same key for "
            "encrypt and decrypt, like AES or our toy Feistel) and asymmetric "
            "(different keys, like RSA — you encrypt with a public key but "
            "can only decrypt with a private key).\n\n"
            "RawCrypt ships 9 ciphers ranging from the trivial Caesar shift "
            "to a toy RSA. Each has its own cost (how expensive it is to use) "
            "and security (how hard it is to break)."
        ),
        "example": "Shift, Vigenere, Feistel, AES, RSA",
        "related": ["encryption", "decryption", "key", "symmetric", "asymmetric"],
    },
    "encryption": {
        "title": "Encryption",
        "icon": "fa-arrow-right-arrow-left",
        "summary": "Turning plaintext into ciphertext using a cipher and a key.",
        "body": (
            "Encryption is the forward direction of a cipher: plaintext goes "
            "in, ciphertext comes out. It is the act of scrambling a message "
            "so that only someone with the right key can read it.\n\n"
            "Mathematically, encryption is a function E(plaintext, key) → "
            "ciphertext. The function must be efficient to compute but "
            "practically impossible to reverse without the key — that's what "
            "makes the cipher secure."
        ),
        "example": "encrypt('hello', key=3) → 'khoor'  (Caesar shift)",
        "related": ["decryption", "cipher", "plaintext", "ciphertext"],
    },
    "decryption": {
        "title": "Decryption",
        "icon": "fa-unlock",
        "summary": "Turning ciphertext back into plaintext using the right key.",
        "body": (
            "Decryption is the reverse of encryption: ciphertext goes in, "
            "plaintext comes out. To decrypt, you need the same key that was "
            "used to encrypt (for symmetric ciphers) or the matching private "
            "key (for asymmetric ciphers).\n\n"
            "An attacker's job is to decrypt a message without knowing the "
            "key — that's called cryptanalysis, and the techniques used to do "
            "it are called attacks."
        ),
        "example": "decrypt('khoor', key=3) → 'hello'  (Caesar shift)",
        "related": ["encryption", "cipher", "attack", "key"],
    },
    "key": {
        "title": "Key",
        "icon": "fa-key",
        "summary": "The secret piece of data that makes a cipher work.",
        "body": (
            "A key is the secret that unlocks a cipher. Two people can use "
            "the exact same cipher algorithm, but if they have different "
            "keys, they cannot read each other's messages. This is why "
            "Kerckhoffs's principle says: a cipher should be secure even if "
            "the attacker knows everything about it except the key.\n\n"
            "Keys come in many shapes: a small number (Caesar shift = 3), a "
            "word or phrase (Vigenere key = \"SECRET\"), a binary string "
            "(toy AES = \"1100101011110000\"), or a pair of large primes (RSA).\n\n"
            "The size of the key space — how many possible keys exist — is "
            "what makes brute-force attacks hard. 8-bit keys (256 options) "
            "are trivial to brute-force. 256-bit AES keys (2^256 options) "
            "would take longer than the age of the universe."
        ),
        "example": "Caesar key=3, AES key=16-bit binary string",
        "related": ["cipher", "brute_force", "encryption", "decryption"],
    },
    "attack": {
        "title": "Attack",
        "icon": "fa-skull",
        "summary": "A technique for breaking a cipher without the key.",
        "body": (
            "In cryptography, an attack is any method that lets you recover "
            "plaintext (or the key) from ciphertext without already knowing "
            "the key. Attacks exploit weaknesses in the cipher design, the "
            "key space, or the way the cipher is used.\n\n"
            "Common attacks include brute force (try every key), frequency "
            "analysis (use letter-frequency statistics), and known-plaintext "
            "attacks (use a chunk of known plaintext to recover the key).\n\n"
            "In RawCrypt, each attacker agent picks an attack from a "
            "registry of four (BruteForce, FrequencyAnalysis, "
            "KnownPlaintext, Dictionary) based on which cipher was used and "
            "what has worked in the past."
        ),
        "example": "BruteForce on shift cipher: try all 256 keys, score each decryption",
        "related": ["brute_force", "frequency", "known_plaintext", "dictionary", "cipher"],
    },
    "brute_force": {
        "title": "Brute Force",
        "icon": "fa-hammer",
        "summary": "Try every possible key until one works.",
        "body": (
            "Brute force is the simplest attack: enumerate every key in the "
            "cipher's key space, decrypt the ciphertext with each one, and "
            "check whether the result looks like a sensible message. When "
            "you find a key whose decryption looks like English, you've "
            "probably found the right one.\n\n"
            "Brute force always works in principle — the only defence is to "
            "make the key space so large that trying every key would take "
            "longer than the age of the universe. That's why modern ciphers "
            "use 128-bit or 256-bit keys.\n\n"
            "In RawCrypt, BruteForce is effective against shift (256 keys), "
            "rail_fence (18 keys), feistel (256 keys), and within budget "
            "against toy AES (65,536 keys) and permutation (40,320 keys)."
        ),
        "example": "Shift cipher with shift=7: brute-force tries 1,2,3,...,7 — accepted at key=7",
        "related": ["attack", "key", "cipher"],
    },
    "frequency": {
        "title": "Frequency Analysis",
        "icon": "fa-chart-column",
        "summary": "Use letter-frequency statistics to break substitution ciphers.",
        "body": (
            "Frequency analysis exploits the fact that in English (and every "
            "other natural language) some letters appear far more often than "
            "others. 'E' is the most common letter, followed by 'T', 'A', "
            "'O', 'I', 'N'.\n\n"
            "If a cipher replaces each letter with a fixed substitute "
            "(monoalphabetic substitution), the substitutes will have the "
            "same frequency pattern as the original letters. So the most "
            "common ciphertext letter is probably the substitute for 'E', "
            "and so on.\n\n"
            "This attack destroyed the Caesar cipher in the 9th century and "
            "makes simple substitution ciphers useless on their own. "
            "Vigenere's polyalphabetic cipher was invented to defeat it, by "
            "using different substitutions at different positions.\n\n"
            "In RawCrypt, FrequencyAnalysis targets the substitution cipher "
            "and needs at least 20 bytes of ciphertext to be reliable."
        ),
        "example": "Most common ciphertext byte → maps to space (most common English byte)",
        "related": ["attack", "substitution"],
    },
    "known_plaintext": {
        "title": "Known Plaintext Attack",
        "icon": "fa-magnifying-glass",
        "summary": "If you know part of the message, you can often recover the key.",
        "body": (
            "In a known-plaintext attack (KPA), the attacker has access to a "
            "small chunk of plaintext that is known to appear at a known "
            "position in the message — called a 'crib'. For example, many "
            "messages start with a greeting like \"Hello\" or a protocol "
            "header like \"GET / HTTP/1.1\".\n\n"
            "With a crib in hand, the attacker can often recover the key "
            "directly:\n"
            "  • Shift cipher: subtract crib bytes from ciphertext bytes. If "
            "    the difference is constant, that's the shift.\n"
            "  • Vigenere: same idea, but per position — reveals the key cycle.\n"
            "  • Stream cipher: XOR crib with ciphertext to get keystream "
            "    bytes, then solve for the LFSR seed.\n\n"
            "This is why real-world protocols add random 'initialisation "
            "vectors' to every message — to make sure no two messages ever "
            "start with the same keystream."
        ),
        "example": "Crib \"Hello\" + ciphertext → directly recover the shift key",
        "related": ["attack", "stream", "vigenere", "shift"],
    },
    "dictionary": {
        "title": "Dictionary Attack",
        "icon": "fa-book",
        "summary": "Try a small list of common, weak keys before doing real work.",
        "body": (
            "A dictionary attack is the lazy cousin of brute force. Instead "
            "of trying every possible key, you try a small curated list of "
            "keys that humans tend to pick because they're easy to remember: "
            "\"password\", \"1234\", \"KEY\", common shift values like 3 or "
            "13 (ROT13).\n\n"
            "It's astonishingly effective against real-world systems — most "
            "human-chosen passwords fall to a dictionary attack in seconds.\n\n"
            "In RawCrypt, DictionaryAttack also models a second meaning: "
            "factoring small RSA moduli by trial division. The toy RSA "
            "modulus n=143 = 11 × 13 falls to this attack in microseconds — "
            "which is exactly why real RSA uses 2048-bit moduli (about 600 "
            "decimal digits) where trial division would never finish."
        ),
        "example": "Vigenere key 'KEY' is in the dictionary → recovered instantly",
        "related": ["attack", "brute_force", "rsa"],
    },
    "symmetric": {
        "title": "Symmetric Cipher",
        "icon": "fa-equals",
        "summary": "Same key for encryption and decryption.",
        "body": (
            "A symmetric cipher uses the same key to encrypt and decrypt. "
            "This is fast and simple, but it creates a key-distribution "
            "problem: how do Alice and Bob share the secret key without "
            "anyone else seeing it?\n\n"
            "Most of the ciphers you use every day — AES in HTTPS, ChaCha20 "
            "in Signal, the toy Feistel/AES/shift in RawCrypt — are "
            "symmetric. They're typically 1000× faster than asymmetric "
            "ciphers, so real systems use a slow asymmetric cipher (like "
            "RSA) just to exchange a symmetric key, then use the symmetric "
            "key for the actual message."
        ),
        "example": "AES, Feistel, Vigenere, Shift — all symmetric",
        "related": ["asymmetric", "cipher", "key"],
    },
    "asymmetric": {
        "title": "Asymmetric Cipher",
        "icon": "fa-not-equal",
        "summary": "Two different keys: a public one to encrypt, a private one to decrypt.",
        "body": (
            "An asymmetric cipher (also called public-key cryptography) uses "
            "two different keys: a public key that anyone can use to "
            "encrypt messages to you, and a private key that only you have, "
            "which is needed to decrypt those messages.\n\n"
            "This solves the key-distribution problem beautifully: you can "
            "publish your public key on your website, and anyone in the "
            "world can send you a secret message that only you can read. "
            "The catch is that asymmetric ciphers are slow and rely on "
            "hard maths problems (factoring large numbers for RSA, "
            "discrete logarithms for Diffie-Hellman).\n\n"
            "In RawCrypt, RSA is the only asymmetric cipher. It's "
            "intentionally unbreakable in the simulation (attackers skip "
            "it), which mirrors real-world RSA with 2048-bit moduli."
        ),
        "example": "RSA: public key (e=7, n=143), private key (d=103, n=143)",
        "related": ["symmetric", "cipher", "rsa"],
    },
    "block_cipher": {
        "title": "Block Cipher",
        "icon": "fa-cubes",
        "summary": "Encrypts data in fixed-size chunks (e.g. 128 bits at a time).",
        "body": (
            "A block cipher processes plaintext in fixed-size blocks. AES, "
            "for example, works on 128-bit (16-byte) blocks. If your "
            "message is longer than one block, you have to choose a 'mode "
            "of operation' (ECB, CBC, GCM, ...) that specifies how to chain "
            "blocks together.\n\n"
            "Block ciphers are the workhorse of modern encryption. They're "
            "designed so that flipping a single bit in either the plaintext "
            "or the key changes roughly half the bits of the ciphertext — a "
            "property called the 'avalanche effect'.\n\n"
            "In RawCrypt, the toy AES (16-bit blocks), toy Feistel (16-bit "
            "blocks) and permutation (8-byte blocks) are all block ciphers."
        ),
        "example": "AES: 128-bit block, 128/192/256-bit key",
        "related": ["stream_cipher", "cipher", "aes", "feistel"],
    },
    "stream_cipher": {
        "title": "Stream Cipher",
        "icon": "fa-water",
        "summary": "Encrypts one bit or byte at a time using a keystream.",
        "body": (
            "A stream cipher generates a long pseudo-random 'keystream' "
            "from a short key, then XORs the keystream with the plaintext "
            "bit-by-bit (or byte-by-byte). Decryption is the same operation "
            "— XOR is its own inverse.\n\n"
            "Stream ciphers are fast and great for streaming data (live "
            "audio, video, network packets) because they don't need to "
            "buffer a whole block before producing output. But they're "
            "catastrophic if you reuse the same keystream for two "
            "different messages — XOR the two ciphertexts together and the "
            "keystream cancels out, leaving plaintext XOR plaintext, which "
            "is easy to break.\n\n"
            "In RawCrypt, the stream cipher uses a Linear Feedback Shift "
            "Register (LFSR) to generate the keystream. LFSRs are simple "
            "but famously insecure on their own — modern stream ciphers "
            "like ChaCha20 use much more sophisticated primitives."
        ),
        "example": "LFSR keystream XOR plaintext = ciphertext",
        "related": ["block_cipher", "cipher", "stream", "lfsr"],
    },
    "lfsr": {
        "title": "LFSR (Linear Feedback Shift Register)",
        "icon": "fa-arrows-rotate",
        "summary": "A simple circuit that generates a pseudo-random bit stream.",
        "body": (
            "An LFSR is a shift register whose input bit is a linear "
            "function of its previous state. You pick a 'seed' (the "
            "initial state) and a set of 'taps' (which positions to XOR "
            "together to produce the next bit). The register then shifts "
            "right one position on each step, feeding the XOR result in "
            "at the left.\n\n"
            "LFSRs are dirt cheap to build in hardware and produce "
            "output that looks random to a casual observer. But they're "
            "completely linear, which means they fall to algebraic "
            "attacks: with 2n bits of known output, you can solve a "
            "system of linear equations to recover the n-bit state.\n\n"
            "In RawCrypt's KnownPlaintext attack, we brute-force the "
            "4-bit or 8-bit LFSR seed and validate each candidate "
            "against the crib — a much simpler approach that works "
            "because the seed space is tiny."
        ),
        "example": "Seed=0001, taps=[2,1] → keystream 1000 1100 1010 1110 ...",
        "related": ["stream_cipher", "stream", "known_plaintext"],
    },
    "feistel": {
        "title": "Feistel Network",
        "icon": "fa-network-wired",
        "summary": "A symmetric cipher design where encryption and decryption use the same circuit.",
        "body": (
            "A Feistel network splits the plaintext block into two halves "
            "L and R. On each round, the new L is the old R, and the new R "
            "is the old L XOR F(R, round_key), where F is any round "
            "function. After N rounds, you concatenate L and R to get the "
            "ciphertext.\n\n"
            "The elegant trick: F doesn't need to be invertible. Decryption "
            "uses the same circuit with the round keys in reverse order. "
            "This makes Feistel ciphers very easy to design — you can use "
            "any scrambled F you like.\n\n"
            "DES (the Data Encryption Standard, 1977) is the most famous "
            "Feistel cipher. Our toy version uses 4 rounds with a "
            "simple XOR + nibble-swap F."
        ),
        "example": "DES = 16-round Feistel with 64-bit blocks; RawCrypt toy = 4 rounds, 16-bit blocks",
        "related": ["block_cipher", "symmetric", "feistel"],
    },
    "aes": {
        "title": "AES (Advanced Encryption Standard)",
        "icon": "fa-shield-halved",
        "summary": "The most widely used symmetric cipher in the world.",
        "body": (
            "AES is the symmetric cipher used in HTTPS, WiFi (WPA2/3), disk "
            "encryption (BitLocker, FileVault), Signal, iMessage, and "
            "countless other systems. It was standardised by NIST in 2001 "
            "after a multi-year open competition.\n\n"
            "AES works on 128-bit blocks and supports 128, 192, or 256-bit "
            "keys. Each round applies four steps: SubBytes (substitute "
            "each byte using an S-box), ShiftRows (permute bytes within "
            "rows), MixColumns (mix bytes within columns), and AddRoundKey "
            "(XOR with the round key).\n\n"
            "Our toy AES uses 16-bit blocks, a 16-bit key, only 2 rounds, "
            "and a tiny 4-nibble S-box. It's cryptographically useless but "
            "demonstrates the structure — and it's still strong enough to "
            "frustrate BruteForce within the simulation's 1.5-second budget."
        ),
        "example": "Real AES: 128-bit block, 10-14 rounds. Toy AES: 16-bit block, 2 rounds.",
        "related": ["block_cipher", "symmetric", "aes"],
    },
    "rsa": {
        "title": "RSA",
        "icon": "fa-key",
        "summary": "The original public-key cryptosystem, based on the difficulty of factoring.",
        "body": (
            "RSA was invented in 1977 by Rivest, Shamir, and Adleman. Its "
            "security rests on a simple observation: multiplying two large "
            "primes is easy, but factoring the product back into its "
            "primes is (as far as anyone knows) extremely hard.\n\n"
            "Setup: pick two large primes p and q, compute n = p × q. Pick "
            "a public exponent e coprime to φ(n) = (p-1)(q-1). Compute d = "
            "e^(-1) mod φ(n). Publish (e, n) as your public key; keep (d, n) "
            "as your private key.\n\n"
            "Encryption: c = m^e mod n. Decryption: m = c^d mod n.\n\n"
            "In RawCrypt, the toy RSA uses p=11, q=13 (so n=143) and e=7, "
            "which gives d=103. This is comically small — n=143 factors "
            "instantly — but it lets you do RSA by hand. Real RSA uses "
            "2048 or 4096-bit moduli; factoring those would take millions "
            "of years on current hardware."
        ),
        "example": "p=11, q=13, e=7, d=103. Encrypt 'A' (65): c = 65^7 mod 143 = 65",
        "related": ["asymmetric", "cipher", "dictionary"],
    },
}


def get_term(term: str):
    return WIKI.get(term)


def list_terms():
    return [
        {"slug": slug, "title": t["title"], "icon": t["icon"], "summary": t["summary"]}
        for slug, t in WIKI.items()
    ]
