#!/usr/bin/env python3
"""Entry point for the RawCrypt multi-agent cipher simulation TUI.

Usage:
    python backend/run_simulation.py             # default 4 communicators, 2 attackers
    python backend/run_simulation.py --comms 6 --atks 3
    python backend/run_simulation.py --seed 42

Controls (inside the TUI):
    q   quit
    p   pause / resume
    r   speed up
    s   slow down
    R   reset the simulation
"""
import argparse
import os
import sys

# Make sure the simulation package is importable.
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
SIM_DIR = os.path.join(BACKEND_DIR, "simulation")
if SIM_DIR not in sys.path:
    sys.path.insert(0, SIM_DIR)

from tui import RawCryptApp


def main():
    parser = argparse.ArgumentParser(description="RawCrypt cipher simulation TUI")
    parser.add_argument("--comms", type=int, default=4,
                        help="Number of communicator agents (default 4)")
    parser.add_argument("--atks", type=int, default=2,
                        help="Number of attacker agents (default 2)")
    parser.add_argument("--seed", type=int, default=None,
                        help="Random seed for reproducibility")
    args = parser.parse_args()

    app = RawCryptApp(num_communicators=args.comms,
                      num_attackers=args.atks,
                      seed=args.seed)
    app.run()


if __name__ == "__main__":
    main()
