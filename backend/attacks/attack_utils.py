"""Shared utilities for attack implementations.

Attacks take ciphertext as a hex string (e.g. "5E 51 4D") and return
either None (failure) or a recovered plaintext as a hex string. These
helpers handle byte/hex conversions and plaintext scoring so that
attack code can stay focused on the cryptanalysis itself.
"""


def hex_to_bytes(hex_str: str) -> list[int]:
    """Convert a space-separated hex string into a list of byte values."""
    if not hex_str or not hex_str.strip():
        return []
    return [int(tok, 16) for tok in hex_str.split()]


def bytes_to_hex(byte_list: list[int]) -> str:
    """Convert a list of byte values into a space-separated hex string."""
    return " ".join(format(b, "02X") for b in byte_list)


def hex_to_bits(hex_str: str) -> str:
    """Convert a hex string into a continuous binary string."""
    bytes_list = hex_to_bytes(hex_str)
    return "".join(format(b, "08b") for b in bytes_list)


def bits_to_hex(bits: str) -> str:
    """Convert a binary string into a space-separated hex string.

    Pads the final byte with zero bits on the right if needed.
    """
    # Pad to a whole number of bytes.
    while len(bits) % 8 != 0:
        bits = bits + "0"
    bytes_list = [int(bits[i:i + 8], 2) for i in range(0, len(bits), 8)]
    return bytes_to_hex(bytes_list)


def printable_ratio(byte_list: list[int]) -> float:
    """Fraction of bytes that fall in the printable ASCII range 32..126."""
    if not byte_list:
        return 0.0
    printable = sum(1 for b in byte_list if 32 <= b <= 126)
    return printable / len(byte_list)


# Byte frequencies for typical English text (printable ASCII 32..126).
# Derived from a small reference corpus; absolute values are not important,
# only the relative ranking. Space (32) and lowercase letters dominate.
ENGLISH_FREQ = {
    32: 18.0,   # space
    101: 10.2,  # e
    116: 7.5,   # t
    97: 6.5,    # a
    111: 6.2,   # o
    105: 5.7,   # i
    110: 5.7,   # n
    115: 5.3,   # s
    104: 4.9,   # h
    114: 4.7,   # r
    100: 3.4,   # d
    108: 3.2,   # l
    117: 2.3,   # u
    99: 2.2,    # c
    109: 2.0,   # m
    119: 1.8,   # w
    102: 1.7,   # f
    103: 1.6,   # g
    121: 1.6,   # y
    112: 1.5,   # p
    98: 1.2,    # b
    118: 0.9,   # v
    107: 0.7,   # k
    106: 0.4,   # j
    120: 0.3,   # x
    113: 0.2,   # q
    122: 0.2,   # z
}
# Default frequency for any other printable byte.
_DEFAULT_FREQ = 0.1


def english_score(byte_list: list[int]) -> float:
    """Higher is more English-like. Range roughly 0..1.

    Combines printable ratio with a frequency-magnitude correlation.
    """
    if not byte_list:
        return 0.0
    total = 0.0
    for b in byte_list:
        if 32 <= b <= 126:
            total += ENGLISH_FREQ.get(b, _DEFAULT_FREQ)
        else:
            total -= 5.0  # heavy penalty for non-printable
    # Normalise: best possible score is if every byte is a space (18.0).
    max_possible = len(byte_list) * 18.0
    return max(0.0, total / max_possible)


def looks_like_plaintext(byte_list: list[int], threshold: float = 0.55) -> bool:
    """Quick heuristic: does this byte sequence look like English text?"""
    if not byte_list:
        return False
    if printable_ratio(byte_list) < 0.95:
        return False
    return english_score(byte_list) >= threshold
