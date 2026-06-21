"""Wiki content for cryptographic terms and ciphers.

Each term has a short summary, a longer body, an example, related terms,
and a category (so the sidebar can group them). All copy is written for
teenagers — no jargon left undefined, no slug snake_case in the prose.
"""

# ---------------------------------------------------------------------------
# Cipher pages (one per cipher in the simulation).
# ---------------------------------------------------------------------------

CIPHER_PAGES = {
    "shift": {
        "title": "Shift Cipher",
        "icon": "fa-arrow-right-arrow-left",
        "category": "Ciphers",
        "summary": "The Caesar cipher. Every byte of the message gets nudged forward by the same amount.",
        "body": (
            "The shift cipher is the oldest trick in the book. Julius Caesar "
            "used it 2,000 years ago to send messages to his generals. The "
            "idea is dead simple: shift every letter forward by the same "
            "amount. Caesar used a shift of 3, so 'A' became 'D', 'B' became "
            "'E', and so on.\n\n"
            "In RawCrypt, the shift cipher works on bytes instead of letters. "
            "Each byte of your message gets nudged forward by your chosen "
            "shift amount, wrapping around at 256. So with shift=7, the byte "
            "for 'A' (65) becomes the byte for 'H' (72).\n\n"
            "The shift cipher is dirt cheap to use (cost 1) but offers almost "
            "no security (security 1). With only 256 possible keys, a brute "
            "force attack cracks it in milliseconds. Even without a computer, "
            "frequency analysis gives the game away — the most common "
            "ciphertext byte is probably the shifted version of space.\n\n"
            "You'll rarely see communicators pick this cipher in the "
            "simulation, except for low-security messages where the cost "
            "matters more than the secrecy."
        ),
        "example": "encrypt('Hello', shift=3) → 'Khoor'",
        "related": ["plaintext", "ciphertext", "brute_force", "symmetric"],
    },
    "rail_fence": {
        "title": "Rail Fence Cipher",
        "icon": "fa-bars-staggered",
        "category": "Ciphers",
        "summary": "Writes the message in a zig-zag across N rails, then reads off each rail.",
        "body": (
            "Rail fence is a transposition cipher — it doesn't replace any "
            "letters, it just rearranges them. Picture writing your message "
            "in a zig-zag pattern across several horizontal 'rails', then "
            "reading off each rail left to right.\n\n"
            "With 3 rails and the message 'HELLO WORLD', the zig-zag looks "
            "like:\n\n"
            "H . . . O . . . R . .\n"
            ". E . L . W . R . D .\n"
            ". . L . . . O . . . .\n\n"
            "Reading the rails top to bottom gives the ciphertext: 'HOR ELWRD LO'.\n\n"
            "In RawCrypt, the rail fence cipher works on the bits of your "
            "message. With 3 rails, every bit of the message traces a zig-zag "
            "across the three rails, and the ciphertext is the bits read off "
            "rail by rail.\n\n"
            "Rail fence is cheap (cost 1) and slightly harder to crack than "
            "shift (security 2) — but only because there are 18 possible rail "
            "counts to try, not 256 shifts. Brute force still cracks it in "
            "milliseconds."
        ),
        "example": "encrypt('HELLO WORLD', rails=3) → bits zig-zagged across 3 rails",
        "related": ["permutation", "brute_force", "symmetric"],
    },
    "permutation": {
        "title": "Permutation Cipher",
        "icon": "fa-shuffle",
        "category": "Ciphers",
        "summary": "Shuffles the bytes of each 8-byte block according to a fixed pattern.",
        "body": (
            "The permutation cipher chops your message into 8-byte blocks "
            "and rearranges the bytes of each block according to a fixed "
            "pattern (the key). For example, with the pattern "
            "[2,0,5,1,7,3,6,4], byte 0 goes to position 2, byte 1 goes to "
            "position 0, and so on.\n\n"
            "There are 8! = 40,320 possible 8-byte permutations. That sounds "
            "like a lot, but a modern computer can brute-force them all in "
            "under a second.\n\n"
            "In RawCrypt, the permutation cipher has cost 2 and security 3. "
            "Communicators like it because it's cheap and reasonably secure "
            "for short messages, but attackers who know the structure can "
            "brute-force the permutation if they have enough ciphertext.\n\n"
            "Real-world block ciphers like AES use permutation as just one "
            "step in a much larger recipe — they combine it with "
            "substitution, mixing, and key addition to make brute force "
            "impossible."
        ),
        "example": "Pattern [2,0,5,1,7,3,6,4] turns 'ABCDEFGH' into 'CAEGBFDH'",
        "related": ["block_cipher", "brute_force", "rail_fence", "aes"],
    },
    "vigenere": {
        "title": "Vigenère Cipher",
        "icon": "fa-table-cells",
        "category": "Ciphers",
        "summary": "A repeating-key cipher that fooled Europe for 300 years.",
        "body": (
            "The Vigenère cipher was invented in the 1500s and was famously "
            "called 'le chiffre indéchiffrable' — the indecipherable cipher. "
            "For three centuries it was considered unbreakable.\n\n"
            "The idea: pick a short key word, like 'KEY'. Repeat it to match "
            "the length of your message. Then shift each plaintext letter by "
            "the value of the corresponding key letter. So if your message "
            "is 'HELLO' and the key is 'KEYKE', each letter of HELLO gets "
            "shifted by a different amount.\n\n"
            "The trick that makes Vigenère harder than shift is that the "
            "same letter doesn't always become the same ciphertext letter. "
            "An 'E' in position 1 might become 'I', but an 'E' in position 2 "
            "might become 'P'. So a simple frequency count doesn't work.\n\n"
            "What does work is the known-plaintext attack: if you know any "
            "chunk of the original message (say, the standard greeting "
            "'Hello'), you can subtract it from the ciphertext to recover "
            "the key cycle. Once you have the key cycle, you have the key.\n\n"
            "In RawCrypt, Vigenère works on printable ASCII characters "
            "(32-126) with modulo 95 arithmetic. Cost 2, security 3."
        ),
        "example": "encrypt('HELLO', key='KEY') → 'RIJVS'",
        "related": ["shift", "known_plaintext", "frequency", "substitution"],
    },
    "substitution": {
        "title": "Substitution Cipher",
        "icon": "fa-exchange-alt",
        "category": "Ciphers",
        "summary": "Every printable byte maps to a different byte. 95! possible keys — but frequency analysis cracks it.",
        "body": (
            "A substitution cipher builds a giant lookup table: every "
            "printable byte maps to a different printable byte. The table "
            "is the key. There are 95 printable ASCII bytes, so there are "
            "95! possible keys — a number so astronomically large that "
            "brute force is impossible (it would take longer than the age "
            "of the universe).\n\n"
            "And yet, substitution ciphers are trivially broken. The "
            "problem is that the frequency pattern of the original text "
            "leaks straight through. In English, space is the most common "
            "character, then 'e', then 't', then 'a'. A substitution cipher "
            "doesn't change that — it just renames the characters. So the "
            "most common byte in the ciphertext is probably the substitute "
            "for space.\n\n"
            "This is called frequency analysis, and it's been used to break "
            "substitution ciphers since the 9th century. The attack works "
            "best on long messages (more text = more reliable frequency "
            "statistics). In RawCrypt, the Frequency attack needs at least "
            "20 bytes of ciphertext to work reliably.\n\n"
            "Cost 3, security 4 — but only because of the long-message "
            "requirement. Short messages are actually quite safe."
        ),
        "example": "encrypt('the quick brown fox', random 95-byte table)",
        "related": ["frequency", "vigenere", "symmetric"],
    },
    "stream": {
        "title": "Stream Cipher",
        "icon": "fa-water",
        "category": "Ciphers",
        "summary": "Generates a pseudo-random keystream from a short seed and XORs it with the message.",
        "body": (
            "A stream cipher is the speed demon of cryptography. Instead of "
            "chopping your message into blocks, it generates a long "
            "pseudo-random 'keystream' from a short seed, then XORs the "
            "keystream with your message one byte at a time.\n\n"
            "Decryption is the same operation — XOR is its own inverse. XOR "
            "the ciphertext with the same keystream and you get the "
            "plaintext back.\n\n"
            "In RawCrypt, the keystream is generated by a Linear Feedback "
            "Shift Register (LFSR). You pick a short binary seed (like "
            "'0001') and a set of 'taps' (which bits to XOR together to "
            "produce the next bit). The register then shifts right one "
            "position on each step, feeding the XOR result in at the left.\n\n"
            "LFSRs are simple and fast, but they're completely linear — "
            "which is their Achilles heel. The Known Plaintext attack "
            "brute-forces the 4-bit or 8-bit seed and validates each "
            "candidate against a known chunk of plaintext (the 'crib'). "
            "With only 16 or 256 possible seeds, this is trivial.\n\n"
            "Real stream ciphers like ChaCha20 use much more sophisticated "
            "keystream generators that resist algebraic attacks.\n\n"
            "Cost 2, security 5."
        ),
        "example": "encrypt('Hello', seed='0001', taps=[2,1]) → XOR each byte with the LFSR keystream",
        "related": ["lfsr", "known_plaintext", "stream_cipher", "symmetric"],
    },
    "feistel": {
        "title": "Feistel Network",
        "icon": "fa-network-wired",
        "category": "Ciphers",
        "summary": "A symmetric cipher design where encryption and decryption use the same circuit.",
        "body": (
            "A Feistel network is a clever way to build a symmetric cipher. "
            "It splits the plaintext block into two halves — call them L "
            "and R. On each round, the new L is the old R, and the new R "
            "is the old L XOR F(R, round_key), where F can be any "
            "scrambling function you like.\n\n"
            "The elegant trick: F doesn't need to be invertible. Decryption "
            "uses the exact same circuit, just with the round keys applied "
            "in reverse order. This makes Feistel ciphers very easy to "
            "design — you can use any scrambled F you like, even one that "
            "loses information.\n\n"
            "DES (the Data Encryption Standard, 1977) is the most famous "
            "Feistel cipher. It uses 16 rounds with 64-bit blocks.\n\n"
            "In RawCrypt, the toy Feistel uses 4 rounds with 16-bit blocks "
            "(8-bit halves). The round function F is dead simple: XOR the "
            "half-block with the round key, then swap the two nibbles. The "
            "round keys are generated by rotating the 8-bit master key left "
            "by 0, 1, 2, and 3 bits.\n\n"
            "With only 256 possible keys, brute force cracks it quickly — "
            "but it's still a fun toy. Cost 3, security 6."
        ),
        "example": "encrypt(16-bit block, 8-bit key) → 4 rounds of L↔R swap + XOR + nibble swap",
        "related": ["block_cipher", "symmetric", "brute_force", "aes"],
    },
    "aes": {
        "title": "AES (Toy)",
        "icon": "fa-shield-halved",
        "category": "Ciphers",
        "summary": "A 2-round miniature of the Advanced Encryption Standard. Real AES has 10-14 rounds.",
        "body": (
            "AES is the most widely used symmetric cipher in the world. "
            "It protects HTTPS, WiFi (WPA2/3), disk encryption, Signal, "
            "iMessage, and countless other systems. It was standardised by "
            "NIST in 2001 after a multi-year open competition.\n\n"
            "Real AES works on 128-bit blocks with 128, 192, or 256-bit "
            "keys. Each round applies four steps:\n"
            "  1. SubBytes — substitute each byte using a lookup table (the S-box)\n"
            "  2. ShiftRows — permute bytes within rows of a 4x4 grid\n"
            "  3. MixColumns — mix bytes within columns using matrix maths\n"
            "  4. AddRoundKey — XOR with the round key\n\n"
            "Real AES uses 10 rounds for 128-bit keys, 12 for 192-bit, 14 "
            "for 256-bit. Every additional round roughly squares the "
            "difficulty of cryptanalysis.\n\n"
            "In RawCrypt, the toy AES uses 16-bit blocks (4 nibbles in a "
            "2x2 grid), a 16-bit key, only 2 rounds, and a tiny 4-nibble "
            "S-box. The final round skips MixColumns (just like real AES). "
            "It's cryptographically useless but demonstrates the structure.\n\n"
            "With 65,536 possible keys, brute force can crack it but takes "
            "longer than the simulation's 1.5-second attack budget on most "
            "messages. Cost 5, security 8."
        ),
        "example": "encrypt(16-bit block, 16-bit key) → 2 rounds of SubBytes/ShiftRows/MixColumns/AddRoundKey",
        "related": ["block_cipher", "symmetric", "brute_force", "feistel"],
    },
    "rsa": {
        "title": "RSA (Toy)",
        "icon": "fa-key",
        "category": "Ciphers",
        "summary": "The only asymmetric cipher. Based on the difficulty of factoring the product of two primes.",
        "body": (
            "RSA was invented in 1977 by Rivest, Shamir, and Adleman. Its "
            "security rests on a simple observation: multiplying two large "
            "prime numbers is easy, but factoring the product back into "
            "its primes is (as far as anyone knows) extremely hard.\n\n"
            "Setup: pick two primes p and q, compute n = p × q. Pick a "
            "public exponent e that's coprime to (p-1)(q-1). Compute the "
            "private exponent d such that d × e ≡ 1 mod (p-1)(q-1).\n\n"
            "Publish (e, n) as your public key. Keep (d, n) as your private "
            "key. Anyone can encrypt a message m to you by computing "
            "c = m^e mod n. Only you can decrypt, by computing "
            "m = c^d mod n.\n\n"
            "In RawCrypt, the toy RSA uses p=11, q=13 (so n=143), and e=7. "
            "That gives d=103, because 7 × 103 = 721 = 6 × 120 + 1.\n\n"
            "This is comically small — n=143 factors instantly with trial "
            "division. In fact, the Dictionary attack code can crack it. "
            "But in the simulation, attackers are constrained to skip RSA, "
            "which mirrors real-world RSA with 2048-bit moduli (about 600 "
            "decimal digits). Factoring a 2048-bit number would take "
            "millions of years on current hardware.\n\n"
            "Cost 8 (slow), security 10 (unbreakable in-sim)."
        ),
        "example": "p=11, q=13, e=7, d=103. encrypt('A' = 65): c = 65^7 mod 143 = 65",
        "related": ["asymmetric", "cipher", "dictionary", "key"],
    },
}

# ---------------------------------------------------------------------------
# Concept pages (the rest of the wiki).
# ---------------------------------------------------------------------------

CONCEPT_PAGES = {
    "plaintext": {
        "title": "Plaintext",
        "icon": "fa-file-lines",
        "category": "Basics",
        "summary": "The original, readable message before it gets scrambled.",
        "body": (
            "Plaintext is just the message you want to send — written in a "
            "form anyone can read. It could be English text like \"meet me "
            "at noon\", a credit-card number, or the bytes of an image "
            "file.\n\n"
            "The whole point of cryptography is to turn plaintext into "
            "something an eavesdropper cannot read, then turn it back into "
            "plaintext at the other end. That's why the sender encrypts "
            "their plaintext into ciphertext, and the receiver decrypts "
            "the ciphertext back into plaintext.\n\n"
            "In RawCrypt, every message starts as plaintext from a small "
            "corpus of spy-movie-style sentences. Communicators pick a "
            "cipher, scramble the plaintext into ciphertext, and send it "
            "across the wire."
        ),
        "example": "Meet me at noon by the old church.",
        "related": ["ciphertext", "encryption", "decryption"],
    },
    "ciphertext": {
        "title": "Ciphertext",
        "icon": "fa-lock",
        "category": "Basics",
        "summary": "The scrambled output of a cipher. Gibberish to anyone without the key.",
        "body": (
            "Ciphertext is what you actually send over the wire. It looks "
            "like gibberish to anyone who intercepts it: a string of bytes "
            "that reveals nothing about the original message unless you "
            "know how to reverse the cipher (and usually, the key).\n\n"
            "In RawCrypt, ciphertext is shown as a space-separated hex "
            "string like \"5E 51 4D 4D 72 2B\". Each pair of hex digits is "
            "one byte (0-255) of scrambled output.\n\n"
            "Good ciphertext should look completely random. If patterns "
            "leak through (like the same byte appearing again and again), "
            "an attacker can use those patterns to break the cipher. This "
            "is exactly how frequency analysis breaks substitution ciphers."
        ),
        "example": "5E 51 4D 4D 72 2B",
        "related": ["plaintext", "encryption", "cipher"],
    },
    "cipher": {
        "title": "Cipher",
        "icon": "fa-shuffle",
        "category": "Basics",
        "summary": "A recipe for scrambling and unscrambling messages using a key.",
        "body": (
            "A cipher is a recipe for scrambling and unscrambling messages. "
            "You feed it plaintext plus a key, and out comes ciphertext. "
            "Feed it ciphertext plus the same (or related) key, and out "
            "comes the original plaintext.\n\n"
            "Ciphers come in two big flavours:\n"
            "  • Symmetric — same key for encrypt and decrypt (like AES or shift)\n"
            "  • Asymmetric — different keys (like RSA: public key encrypts, "
            "private key decrypts)\n\n"
            "RawCrypt ships 9 ciphers ranging from the trivial Caesar shift "
            "(2000 years old, broken in milliseconds) to a toy RSA "
            "(unbreakable in the simulation). Each cipher has a cost "
            "(how expensive it is to use) and a security rating (how hard "
            "it is to break)."
        ),
        "example": "Shift, Vigenère, Feistel, AES, RSA",
        "related": ["encryption", "decryption", "key", "symmetric", "asymmetric"],
    },
    "encryption": {
        "title": "Encryption",
        "icon": "fa-arrow-right-arrow-left",
        "category": "Basics",
        "summary": "Turning plaintext into ciphertext using a cipher and a key.",
        "body": (
            "Encryption is the forward direction of a cipher: plaintext "
            "goes in, ciphertext comes out. It is the act of scrambling a "
            "message so that only someone with the right key can read it.\n\n"
            "Mathematically, encryption is a function E(plaintext, key) → "
            "ciphertext. The function must be efficient to compute but "
            "practically impossible to reverse without the key — that's "
            "what makes the cipher secure.\n\n"
            "In RawCrypt, every tick each communicator picks a cipher, "
            "generates a random key, and encrypts their plaintext message. "
            "The ciphertext then sits on a shared channel where any "
            "attacker can see it."
        ),
        "example": "encrypt('hello', key=3) → 'khoor'  (Caesar shift)",
        "related": ["decryption", "cipher", "plaintext", "ciphertext"],
    },
    "decryption": {
        "title": "Decryption",
        "icon": "fa-unlock",
        "category": "Basics",
        "summary": "Turning ciphertext back into plaintext using the right key.",
        "body": (
            "Decryption is the reverse of encryption: ciphertext goes in, "
            "plaintext comes out. To decrypt, you need the same key that "
            "was used to encrypt (for symmetric ciphers) or the matching "
            "private key (for asymmetric ciphers).\n\n"
            "An attacker's job is to decrypt a message without knowing the "
            "key — that's called cryptanalysis, and the techniques used "
            "to do it are called attacks.\n\n"
            "In RawCrypt's simulation, when an attacker 'breaks' a message, "
            "what they've actually done is recover the key (or equivalent "
            "information) and run the cipher's own decrypt function."
        ),
        "example": "decrypt('khoor', key=3) → 'hello'  (Caesar shift)",
        "related": ["encryption", "cipher", "attack", "key"],
    },
    "key": {
        "title": "Key",
        "icon": "fa-key",
        "category": "Basics",
        "summary": "The secret piece of data that makes a cipher work.",
        "body": (
            "A key is the secret that unlocks a cipher. Two people can use "
            "the exact same cipher algorithm, but if they have different "
            "keys, they cannot read each other's messages. This is why "
            "Kerckhoffs's principle says: a cipher should be secure even "
            "if the attacker knows everything about it except the key.\n\n"
            "Keys come in many shapes:\n"
            "  • A small number (Caesar shift = 3)\n"
            "  • A word or phrase (Vigenère key = 'SECRET')\n"
            "  • A binary string (toy AES = '1100101011110000')\n"
            "  • A pair of large primes (RSA)\n\n"
            "The size of the key space — how many possible keys exist — is "
            "what makes brute-force attacks hard. 8-bit keys (256 options) "
            "are trivial to brute-force. 256-bit AES keys (2^256 options) "
            "would take longer than the age of the universe."
        ),
        "example": "Caesar key=3, AES key=16-bit binary string, RSA key=p,q primes",
        "related": ["cipher", "brute_force", "encryption", "decryption"],
    },
    "attack": {
        "title": "Attack",
        "icon": "fa-skull",
        "category": "Attacks",
        "summary": "A technique for breaking a cipher without the key.",
        "body": (
            "In cryptography, an attack is any method that lets you "
            "recover plaintext (or the key) from ciphertext without "
            "already knowing the key. Attacks exploit weaknesses in the "
            "cipher design, the key space, or the way the cipher is used.\n\n"
            "Common attacks include:\n"
            "  • Brute force — try every possible key until one works\n"
            "  • Frequency analysis — use letter-frequency statistics\n"
            "  • Known plaintext — use a known chunk of plaintext to recover the key\n"
            "  • Dictionary — try a small list of common, weak keys\n\n"
            "In RawCrypt, each attacker agent picks an attack from a "
            "registry of four (Brute Force, Frequency, Known Plaintext, "
            "Dictionary) based on which cipher was used and what has "
            "worked in the past."
        ),
        "example": "Brute Force on Shift: try all 256 keys, score each decryption",
        "related": ["brute_force", "frequency", "known_plaintext", "dictionary", "cipher"],
    },
    "brute_force": {
        "title": "Brute Force Attack",
        "icon": "fa-hammer",
        "category": "Attacks",
        "summary": "Try every possible key until one works.",
        "body": (
            "Brute force is the simplest attack: enumerate every key in "
            "the cipher's key space, decrypt the ciphertext with each one, "
            "and check whether the result looks like a sensible message. "
            "When you find a key whose decryption looks like English, "
            "you've probably found the right one.\n\n"
            "Brute force always works in principle — the only defence is "
            "to make the key space so large that trying every key would "
            "take longer than the age of the universe. That's why modern "
            "ciphers use 128-bit or 256-bit keys.\n\n"
            "In RawCrypt, Brute Force is effective against:\n"
            "  • Shift (256 keys — instant)\n"
            "  • Rail Fence (18 keys — instant)\n"
            "  • Feistel (256 keys — instant)\n"
            "  • Permutation (40,320 keys — within budget)\n"
            "  • Toy AES (65,536 keys — usually within budget)\n\n"
            "Each candidate decryption is scored by an English-likeness "
            "heuristic that rewards common letters and penalises weird "
            "bytes. When the score crosses a threshold, the attack declares "
            "success."
        ),
        "example": "Shift with key=7: brute force tries 1,2,3,...,7 — accepted at key=7",
        "related": ["attack", "key", "cipher", "dictionary"],
    },
    "frequency": {
        "title": "Frequency Analysis",
        "icon": "fa-chart-column",
        "category": "Attacks",
        "summary": "Uses byte-frequency statistics to break substitution ciphers.",
        "body": (
            "Frequency analysis exploits the fact that in English (and "
            "every other natural language) some characters appear far more "
            "often than others. Space is the most common, then 'e', 't', "
            "'a', 'o', 'i', 'n'.\n\n"
            "If a cipher replaces each byte with a fixed substitute "
            "(monoalphabetic substitution), the substitutes will have the "
            "same frequency pattern as the original bytes. So the most "
            "common ciphertext byte is probably the substitute for space, "
            "and so on.\n\n"
            "This attack destroyed the Caesar cipher in the 9th century "
            "and makes simple substitution ciphers useless on their own. "
            "Vigenère's polyalphabetic cipher was invented to defeat it, "
            "by using different substitutions at different positions.\n\n"
            "In RawCrypt, the Frequency attack targets the substitution "
            "cipher and needs at least 20 bytes of ciphertext to be "
            "reliable. Short messages have too little text for the "
            "statistics to stabilise."
        ),
        "example": "Most common ciphertext byte → maps to space (most common English byte)",
        "related": ["attack", "substitution", "vigenere"],
    },
    "known_plaintext": {
        "title": "Known Plaintext Attack",
        "icon": "fa-magnifying-glass",
        "category": "Attacks",
        "summary": "If you know part of the message, you can often recover the key.",
        "body": (
            "In a known-plaintext attack (KPA), the attacker has access to "
            "a small chunk of plaintext that is known to appear at a known "
            "position in the message — called a 'crib'. For example, many "
            "messages start with a greeting like 'Hello' or a protocol "
            "header like 'GET / HTTP/1.1'.\n\n"
            "With a crib in hand, the attacker can often recover the key "
            "directly:\n"
            "  • Shift cipher: subtract crib bytes from ciphertext bytes. "
            "If the difference is constant, that's the shift.\n"
            "  • Vigenère: same idea, but per position — reveals the key cycle.\n"
            "  • Stream cipher: brute-force the LFSR seed, validate against the crib.\n\n"
            "This is why real-world protocols add random 'initialisation "
            "vectors' to every message — to make sure no two messages ever "
            "start with the same keystream."
        ),
        "example": "Crib 'Hello' + ciphertext → directly recover the shift key",
        "related": ["attack", "stream", "vigenere", "shift"],
    },
    "dictionary": {
        "title": "Dictionary Attack",
        "icon": "fa-book",
        "category": "Attacks",
        "summary": "Try a small list of common, weak keys before doing real work.",
        "body": (
            "A dictionary attack is the lazy cousin of brute force. "
            "Instead of trying every possible key, you try a small curated "
            "list of keys that humans tend to pick because they're easy "
            "to remember: 'password', '1234', 'KEY', common shift values "
            "like 3 or 13 (ROT13).\n\n"
            "It's astonishingly effective against real-world systems — "
            "most human-chosen passwords fall to a dictionary attack in "
            "seconds.\n\n"
            "In RawCrypt, the Dictionary attack also models a second "
            "meaning: factoring small RSA moduli by trial division. The "
            "toy RSA modulus n=143 = 11 × 13 falls to this attack in "
            "microseconds — which is exactly why real RSA uses 2048-bit "
            "moduli (about 600 decimal digits) where trial division would "
            "never finish.\n\n"
            "The Dictionary attack is the cheapest attack (cost 1) but "
            "only works on ciphers where the user picked a weak key."
        ),
        "example": "Vigenère key 'KEY' is in the dictionary → recovered instantly",
        "related": ["attack", "brute_force", "rsa"],
    },
    "symmetric": {
        "title": "Symmetric Cipher",
        "icon": "fa-equals",
        "category": "Concepts",
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
            "key for the actual message.\n\n"
            "In RawCrypt, every cipher except RSA is symmetric."
        ),
        "example": "AES, Feistel, Vigenère, Shift — all symmetric",
        "related": ["asymmetric", "cipher", "key"],
    },
    "asymmetric": {
        "title": "Asymmetric Cipher",
        "icon": "fa-not-equal",
        "category": "Concepts",
        "summary": "Two different keys: a public one to encrypt, a private one to decrypt.",
        "body": (
            "An asymmetric cipher (also called public-key cryptography) "
            "uses two different keys: a public key that anyone can use to "
            "encrypt messages to you, and a private key that only you "
            "have, which is needed to decrypt those messages.\n\n"
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
        "category": "Concepts",
        "summary": "Encrypts data in fixed-size chunks (e.g. 128 bits at a time).",
        "body": (
            "A block cipher processes plaintext in fixed-size blocks. AES, "
            "for example, works on 128-bit (16-byte) blocks. If your "
            "message is longer than one block, you have to choose a 'mode "
            "of operation' (ECB, CBC, GCM, ...) that specifies how to "
            "chain blocks together.\n\n"
            "Block ciphers are the workhorse of modern encryption. They're "
            "designed so that flipping a single bit in either the plaintext "
            "or the key changes roughly half the bits of the ciphertext — "
            "a property called the 'avalanche effect'.\n\n"
            "In RawCrypt, the toy AES (16-bit blocks), toy Feistel (16-bit "
            "blocks) and permutation (8-byte blocks) are all block ciphers."
        ),
        "example": "Real AES: 128-bit block. Toy AES: 16-bit block.",
        "related": ["stream_cipher", "cipher", "aes", "feistel", "permutation"],
    },
    "stream_cipher": {
        "title": "Stream Cipher",
        "icon": "fa-water",
        "category": "Concepts",
        "summary": "Encrypts one bit or byte at a time using a keystream.",
        "body": (
            "A stream cipher generates a long pseudo-random 'keystream' "
            "from a short key, then XORs the keystream with the plaintext "
            "bit-by-bit (or byte-by-byte). Decryption is the same "
            "operation — XOR is its own inverse.\n\n"
            "Stream ciphers are fast and great for streaming data (live "
            "audio, video, network packets) because they don't need to "
            "buffer a whole block before producing output. But they're "
            "catastrophic if you reuse the same keystream for two "
            "different messages — XOR the two ciphertexts together and "
            "the keystream cancels out, leaving plaintext XOR plaintext, "
            "which is easy to break.\n\n"
            "In RawCrypt, the Stream cipher uses a Linear Feedback Shift "
            "Register (LFSR) to generate the keystream. LFSRs are simple "
            "but famously insecure on their own — modern stream ciphers "
            "like ChaCha20 use much more sophisticated primitives."
        ),
        "example": "LFSR keystream XOR plaintext = ciphertext",
        "related": ["block_cipher", "cipher", "stream", "lfsr"],
    },
    "lfsr": {
        "title": "LFSR",
        "icon": "fa-arrows-rotate",
        "category": "Concepts",
        "summary": "Linear Feedback Shift Register — a simple circuit that generates a pseudo-random bit stream.",
        "body": (
            "An LFSR is a shift register whose input bit is a linear "
            "function of its previous state. You pick a 'seed' (the "
            "initial state) and a set of 'taps' (which positions to XOR "
            "together to produce the next bit). The register then shifts "
            "right one position on each step, feeding the XOR result in "
            "at the left.\n\n"
            "LFSRs are dirt cheap to build in hardware and produce output "
            "that looks random to a casual observer. But they're "
            "completely linear, which means they fall to algebraic "
            "attacks: with 2n bits of known output, you can solve a "
            "system of linear equations to recover the n-bit state.\n\n"
            "In RawCrypt's Known Plaintext attack, we brute-force the "
            "4-bit or 8-bit LFSR seed and validate each candidate against "
            "the crib — a much simpler approach that works because the "
            "seed space is tiny."
        ),
        "example": "Seed=0001, taps=[2,1] → keystream 1000 1100 1010 1110 ...",
        "related": ["stream_cipher", "stream", "known_plaintext"],
    },
}

# ---------------------------------------------------------------------------
# Combined registry.
# ---------------------------------------------------------------------------

WIKI = {**CIPHER_PAGES, **CONCEPT_PAGES}


def get_term(term: str):
    return WIKI.get(term)


def list_terms():
    return [
        {"slug": slug, "title": t["title"], "icon": t["icon"],
         "summary": t["summary"], "category": t.get("category", "Other")}
        for slug, t in WIKI.items()
    ]


def list_categories():
    """Return category → [terms] for sidebar grouping."""
    cats = {}
    for slug, t in WIKI.items():
        cat = t.get("category", "Other")
        cats.setdefault(cat, []).append({
            "slug": slug, "title": t["title"], "icon": t["icon"],
        })
    # Sort categories in a sensible order.
    order = ["Basics", "Ciphers", "Attacks", "Concepts", "Other"]
    return [(c, cats[c]) for c in order if c in cats]
