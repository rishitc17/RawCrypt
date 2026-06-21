# RawCrypt — Multi-Agent Cipher Simulation

A multi-agent cryptography simulation where communicator agents exchange
messages encrypted with toy ciphers, attacker agents try to break them
using cryptanalytic attacks, and both sides evolve their strategies
based on empirical success rates.

The simulation ships with a Textual TUI that shows live activity logs
and aggregate environment trends.

## Quick start

```bash
# From the repo root:
python backend/run_simulation.py

# Or with custom agent counts:
python backend/run_simulation.py --comms 6 --atks 3 --seed 42
```

Controls (inside the TUI):

| Key | Action           |
|-----|------------------|
| `q` | Quit             |
| `p` | Pause / resume   |
| `r` | Speed up         |
| `s` | Slow down        |
| `R` | Reset simulation |

## Architecture

```
backend/
├── ciphers/                # 9 toy cipher implementations (existing)
│   ├── shift.py
│   ├── substitution.py
│   ├── vigenere.py
│   ├── rail_fence.py
│   ├── permutation.py
│   ├── stream.py           # LFSR keystream + XOR
│   ├── feistel.py          # 4-round toy Feistel
│   ├── aes.py              # 2-round toy AES
│   └── rsa.py              # toy RSA (p=11, q=13, n=143)
│
├── attacks/                # 4 attack implementations
│   ├── attack_utils.py     # byte/hex helpers + English scoring
│   ├── base.py             # Attack base class + AttackResult
│   ├── brute_force.py      # enumerate key space + score candidates
│   ├── frequency.py        # byte-frequency attack on substitution
│   ├── known_plaintext.py  # crib-based key recovery
│   └── dictionary.py       # weak-key + small-prime RSA factoring
│
├── simulation/             # simulation engine + TUI
│   ├── cipher_meta.py      # CipherMeta registry (cost, security, keys)
│   ├── attack_meta.py      # AttackMeta registry (cost, applicability)
│   ├── agent.py            # Communicator + Attacker agents w/ strategy
│   ├── engine.py           # main simulation loop + statistics
│   └── tui.py              # Textual TUI
│
└── run_simulation.py       # entry point
```

## Ciphers

Every cipher is wrapped in a `CipherMeta` with:
- `cost` (1-10) — computational cost
- `security` (1-10) — intrinsic resistance to attacks
- `key_generator()` — produces a random key
- `encrypt(plaintext, key)` and `decrypt(ciphertext, key)`
- `enumerate_keys()` — iterator over the key space (or `None` if intractable)

| cipher       | cost | security | key space      | breakable by (in-sim)        |
|--------------|------|----------|----------------|-------------------------------|
| shift        | 1    | 1        | 256            | brute_force, KPA, dictionary  |
| rail_fence   | 1    | 2        | 18             | brute_force, dictionary       |
| permutation  | 2    | 3        | 8! = 40320     | (none in-sim)                 |
| vigenere     | 2    | 3        | variable       | KPA, dictionary               |
| substitution | 3    | 4        | 95! (intract.) | frequency                     |
| stream       | 2    | 5        | variable       | KPA (via LFSR seed search)    |
| feistel      | 3    | 6        | 256            | brute_force                   |
| aes          | 5    | 8        | 65536          | brute_force (slow)            |
| rsa          | 8    | 10       | n/a            | (unbreakable in-sim)          |

**RSA is intentionally unbreakable in the simulation** — even though the
dictionary attack code can factor the toy modulus n=143 = 11 × 13, the
attacker agents are constrained to skip RSA. This mirrors real-world
RSA with 2048-bit moduli and forces the communicators to balance RSA's
high cost against its perfect security (otherwise every agent would
just use RSA for every message and the simulation would be boring).

## Attacks

Each attack is a class with an `attempt(ciphertext, cipher_handle,
budget, crib)` method that returns an `AttackResult` (success/failure +
recovered plaintext + diagnostics).

| attack          | cost | targets                                | how it works                                              |
|-----------------|------|----------------------------------------|-----------------------------------------------------------|
| brute_force     | 4    | shift, rail_fence, feistel, aes        | enumerates the cipher's key space; accepts the first key whose decryption scores above an English-likeness threshold |
| frequency       | 3    | substitution                           | ranks ciphertext bytes by frequency, maps them to the English byte-frequency ranking, applies the inferred map |
| known_plaintext | 2    | shift, vigenere, stream                | uses a "crib" (a known plaintext prefix) to recover the key directly (shift: constant diff; vigenere: per-position diff reveals the key cycle; stream: brute-force the LFSR seed and validate against the crib) |
| dictionary      | 1    | shift, vigenere, rail_fence, stream, rsa | tries a small list of weak keys; also factors small RSA moduli by trial division (educational — the simulation's attackers don't actually use this on RSA) |

## Agents

### Communicator

Each tick a communicator:
1. Picks a target (another communicator) and a message from a corpus
2. Picks a security level (1-5) at random
3. Picks a cipher via softmax over utility:
   ```
   utility(c) = (0.7 + 0.4 * security_level) * security(c) * survival_rate(c)
                - 0.2 * cost(c)^2
                + Gaussian(0, 0.5)
   ```
   The quadratic cost penalty is what keeps communicators from always
   picking RSA: RSA's cost=8 incurs a -12.8 penalty, which dominates
   its +security benefit at low security levels.
4. Generates a random key, encrypts, broadcasts onto a shared channel

After each tick, the communicator records whether their message
survived. Strategy weights are updated via EMA (0.85 old + 0.15 new).

### Attacker

Each tick an attacker:
1. Picks a random message from the channel
2. Picks an attack via softmax over utility:
   ```
   utility(a | cipher) = log(success_rate(a, cipher) + 1e-6)
                         - 0.3 * cost(a)
   ```
3. Runs the attack with a 1.5-second budget
4. Records success/failure and updates both the global strategy and a
   per-(cipher, attack) pairwise table

## Scoring method

The simulation's scoring method combines:
- **Empirical data** — every agent tracks per-action success rates and
  updates its strategy with exponential moving average
- **Cipher-specific factors** — cost and intrinsic security are baked
  into the utility formula
- **Per-message context** — the security level (1-5) of each message
  weights security vs. cost differently

This produces variation in cipher usage: communicators don't converge
on RSA because its cost dominates at low security levels, and they
don't converge on shift because attackers break it too easily at high
security levels. Over a 60-tick run with default parameters, you'll
typically see 7-9 distinct ciphers in use with no single cipher
exceeding ~35% of total traffic.
