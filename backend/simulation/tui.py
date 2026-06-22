"""Textual TUI for the RawCrypt multi-agent cipher simulation.

Layout:
  +----------------------------------------------------------+
  | Header: RawCrypt sim | tick / messages / survival        |
  +---------------------------+------------------------------+
  | Activity Log (scrolling)  | Environment Trends           |
  |                           |   - Cipher usage table       |
  |                           |   - Attack usage table       |
  |                           |   - Communicator survival    |
  |                           |   - Attacker success         |
  +---------------------------+------------------------------+
  | Agent Roster (communicator + attacker strategy summary)  |
  +----------------------------------------------------------+
  | Footer: q quit | p pause | r faster | s slower | R reset |
  +----------------------------------------------------------+

Run with:
    python backend/simulation/tui.py
"""
from __future__ import annotations

import os
import sys
import time

# Make the simulation directory importable.
SIM_DIR = os.path.dirname(os.path.abspath(__file__))
if SIM_DIR not in sys.path:
    sys.path.insert(0, SIM_DIR)

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.widgets import Header, Footer, Static, RichLog
from textual.reactive import reactive
from rich.table import Table
from rich.text import Text
from rich.panel import Panel

from engine import Simulation


# ---------------------------------------------------------------------------
# Renderers — turn simulation state into Rich renderables for the TUI.
# ---------------------------------------------------------------------------

# Stable colours per cipher / attack so the table is visually consistent.
CIPHER_COLOURS = {
    "shift":        "cyan",
    "rail_fence":   "bright_cyan",
    "permutation":  "blue",
    "vigenere":     "bright_blue",
    "substitution": "magenta",
    "stream":       "bright_magenta",
    "feistel":      "yellow",
    "aes":          "bright_yellow",
    "rsa":          "green",
}
ATTACK_COLOURS = {
    "brute_force":      "red",
    "frequency":        "bright_red",
    "known_plaintext":  "yellow",
    "dictionary":       "bright_yellow",
}


def render_cipher_usage(sim: Simulation) -> Table:
    table = Table(title="Cipher usage", title_style="bold", expand=True,
                  show_lines=False)
    table.add_column("cipher", style="bold")
    table.add_column("used", justify="right")
    table.add_column("usage %", justify="right")
    table.add_column("breaks", justify="right")
    table.add_column("break %", justify="right")
    table.add_column("bar", ratio=2)
    for name, usage_pct, break_rate in sim.cipher_usage_stats():
        used = sim.cipher_usage.get(name, 0)
        broken = sim.cipher_breaks.get(name, 0)
        colour = CIPHER_COLOURS.get(name, "white")
        bar_len = int(usage_pct / 5)
        bar = "#" * bar_len + "-" * (20 - bar_len)
        table.add_row(
            Text(name, style=colour),
            str(used),
            f"{usage_pct:5.1f}%",
            str(broken),
            f"{break_rate:5.1f}%",
            Text(bar, style=colour),
        )
    return table


def render_attack_usage(sim: Simulation) -> Table:
    table = Table(title="Attack usage", title_style="bold", expand=True,
                  show_lines=False)
    table.add_column("attack", style="bold")
    table.add_column("used", justify="right")
    table.add_column("usage %", justify="right")
    table.add_column("succ", justify="right")
    table.add_column("succ %", justify="right")
    table.add_column("bar", ratio=2)
    for name, usage_pct, succ_rate in sim.attack_usage_stats():
        used = sim.attack_usage.get(name, 0)
        succ = sim.attack_success.get(name, 0)
        colour = ATTACK_COLOURS.get(name, "white")
        bar_len = int(succ_rate / 5)
        bar = "#" * bar_len + "-" * (20 - bar_len)
        table.add_row(
            Text(name, style=colour),
            str(used),
            f"{usage_pct:5.1f}%",
            str(succ),
            f"{succ_rate:5.1f}%",
            Text(bar, style=colour),
        )
    return table


def render_communicator_stats(sim: Simulation) -> Table:
    table = Table(title="Communicator survival", title_style="bold", expand=True)
    table.add_column("agent", style="bold")
    table.add_column("sent", justify="right")
    table.add_column("broken", justify="right")
    table.add_column("survival", justify="right")
    for name, sent, broken, surv in sim.communicator_stats():
        surv_colour = "green" if surv >= 75 else ("yellow" if surv >= 50 else "red")
        table.add_row(
            name,
            str(sent),
            str(broken),
            Text(f"{surv:5.1f}%", style=surv_colour),
        )
    return table


def render_attacker_stats(sim: Simulation) -> Table:
    table = Table(title="Attacker success", title_style="bold", expand=True)
    table.add_column("agent", style="bold")
    table.add_column("attempts", justify="right")
    table.add_column("success", justify="right")
    table.add_column("success %", justify="right")
    for name, att, succ, rate in sim.attacker_stats():
        rate_colour = "red" if rate >= 60 else ("yellow" if rate >= 30 else "green")
        table.add_row(
            name,
            str(att),
            str(succ),
            Text(f"{rate:5.1f}%", style=rate_colour),
        )
    return table


def render_roster(sim: Simulation) -> Table:
    table = Table(title="Agent roster — current strategy preferences",
                  title_style="bold", expand=True)
    table.add_column("agent", style="bold")
    table.add_column("role")
    table.add_column("top actions (probability)", ratio=4)
    for name, role, top in sim.agent_roster():
        if role == "communicator":
            parts = []
            for action, prob in top:
                colour = CIPHER_COLOURS.get(action, "white")
                parts.append(Text(f"{action}({prob:.0%})", style=colour))
                parts.append(Text("  "))
            actions_text = Text.assemble(*parts)
        else:
            parts = []
            for action, prob in top:
                colour = ATTACK_COLOURS.get(action, "white")
                parts.append(Text(f"{action}({prob:.0%})", style=colour))
                parts.append(Text("  "))
            actions_text = Text.assemble(*parts)
        table.add_row(name, role, actions_text)
    return table


def render_event(ev, sim: Simulation) -> Text:
    """Render a single event as a Rich Text line for the activity log."""
    if ev.kind == "send":
        colour = CIPHER_COLOURS.get(ev.cipher, "white")
        return Text.assemble(
            Text(f"[T{ev.tick:>3}] ", style="dim"),
            Text(f"{ev.sender} → {ev.target} ", style="bold"),
            Text(f"| cipher=", style="dim"),
            Text(ev.cipher, style=colour),
            Text(f" sec=L{ev.security_level} ", style="dim"),
            Text(f"| \"{ev.message_preview}\""),
        )
    if ev.kind == "intercepted":
        atk_colour = ATTACK_COLOURS.get(ev.attack, "white")
        return Text.assemble(
            Text(f"[T{ev.tick:>3}]   ", style="dim"),
            Text(f"☠ {ev.attacker}", style="bold red"),
            Text(f" broke ", style="red"),
            Text(f"{ev.sender}'s ", style="bold"),
            Text(ev.cipher, style=CIPHER_COLOURS.get(ev.cipher, "white")),
            Text(f" via ", style="dim"),
            Text(ev.attack, style=atk_colour),
            Text(f"  ({ev.notes})", style="dim italic"),
        )
    if ev.kind == "secure":
        atk_colour = ATTACK_COLOURS.get(ev.attack, "white")
        return Text.assemble(
            Text(f"[T{ev.tick:>3}]   ", style="dim"),
            Text(f"✓ {ev.attacker}", style="bold green"),
            Text(f" failed to break ", style="green"),
            Text(f"{ev.sender}'s ", style="bold"),
            Text(ev.cipher, style=CIPHER_COLOURS.get(ev.cipher, "white")),
            Text(f"  ({ev.attack}: {ev.notes})", style="dim italic"),
        )
    if ev.kind == "skip":
        return Text.assemble(
            Text(f"[T{ev.tick:>3}]   ", style="dim"),
            Text(f"⊘ {ev.attacker}", style="bold yellow"),
            Text(f" skipped ", style="yellow"),
            Text(f"{ev.sender}'s ", style="bold"),
            Text(ev.cipher, style=CIPHER_COLOURS.get(ev.cipher, "white")),
            Text(f"  ({ev.notes})", style="dim italic"),
        )
    return Text(f"[T{ev.tick:>3}] {ev.kind}")


# ---------------------------------------------------------------------------
# The Textual app.
# ---------------------------------------------------------------------------

class RawCryptApp(App):
    """A multi-agent cipher simulation TUI."""

    CSS = """
    Screen {
        layout: vertical;
    }
    #main-row {
        height: 1fr;
    }
    #activity-panel {
        width: 2fr;
        border: round $primary;
        padding: 0 1;
    }
    #trends-panel {
        width: 3fr;
        border: round $accent;
        padding: 0 1;
    }
    #roster-panel {
        height: auto;
        max-height: 14;
        border: round $secondary;
        padding: 0 1;
    }
    #activity-log {
        height: 1fr;
        border: solid $primary 50%;
    }
    .panel-title {
        text-style: bold;
        padding: 0 1;
        background: $primary 20%;
    }
    """

    BINDINGS = [
        Binding("q", "quit", "Quit"),
        Binding("p", "toggle_pause", "Pause/Resume"),
        Binding("r", "faster", "Faster"),
        Binding("s", "slower", "Slower"),
        Binding("R", "reset", "Reset"),
    ]

    tick_reactive = reactive(0)
    paused = reactive(False)
    speed_label = reactive("normal")

    def __init__(self, num_communicators: int = 4, num_attackers: int = 2,
                 seed: int | None = None):
        super().__init__()
        self._num_comms = num_communicators
        self._num_atks = num_attackers
        self._seed = seed
        self.sim = Simulation(num_communicators=num_communicators,
                              num_attackers=num_attackers, seed=seed)
        # Speed control: ticks per second.
        self.tick_interval = 0.75
        # Track the last tick we rendered so we only log new events.
        self._last_rendered_tick = 0

    def compose(self) -> ComposeResult:
        yield Header()
        with Horizontal(id="main-row"):
            with Vertical(id="activity-panel"):
                yield Static("Activity Log", classes="panel-title")
                yield RichLog(id="activity-log", markup=False, auto_scroll=True)
            with VerticalScroll(id="trends-panel"):
                yield Static("Environment Trends", classes="panel-title")
                yield Static(id="cipher-usage", markup=True)
                yield Static(id="attack-usage", markup=True)
                yield Static(id="comm-stats", markup=True)
                yield Static(id="atk-stats", markup=True)
        with Vertical(id="roster-panel"):
            yield Static("Agent Roster", classes="panel-title")
            yield Static(id="roster", markup=True)
        yield Footer()

    def on_mount(self) -> None:
        self.tick_reactive = 0
        self._refresh_panels()
        self.set_interval(self.tick_interval, self._tick)

    # -----------------------------------------------------------------
    # Simulation tick.
    # -----------------------------------------------------------------

    def _tick(self) -> None:
        if self.paused:
            return
        events = self.sim.step()
        self.tick_reactive = self.sim.tick

        # Append only NEW events to the activity log.
        log = self.query_one("#activity-log", RichLog)
        for ev in events:
            log.write(render_event(ev, self.sim))

        self._refresh_panels()

    def _refresh_panels(self) -> None:
        sim = self.sim

        # Header subtitle.
        self.title = f"RawCrypt — multi-agent cipher simulation"
        summary = sim.environment_summary()
        self.sub_title = (
            f"tick {summary['tick']} | "
            f"messages {summary['total_messages']} | "
            f"survival {summary['overall_survival_pct']:.1f}% | "
            f"{'PAUSED' if self.paused else 'RUNNING'} ({self.speed_label})"
        )

        # Trend tables.
        from rich.console import Group
        self.query_one("#cipher-usage", Static).update(
            Panel(render_cipher_usage(sim), border_style="cyan"))
        self.query_one("#attack-usage", Static).update(
            Panel(render_attack_usage(sim), border_style="red"))
        self.query_one("#comm-stats", Static).update(
            Panel(render_communicator_stats(sim), border_style="green"))
        self.query_one("#atk-stats", Static).update(
            Panel(render_attacker_stats(sim), border_style="magenta"))
        self.query_one("#roster", Static).update(
            Panel(render_roster(sim), border_style="blue"))

    # -----------------------------------------------------------------
    # Key bindings.
    # -----------------------------------------------------------------

    def action_toggle_pause(self) -> None:
        self.paused = not self.paused
        self._refresh_panels()

    def action_faster(self) -> None:
        self.tick_interval = max(0.1, self.tick_interval * 0.7)
        self.speed_label = "fast"
        self.set_interval(self.tick_interval, self._tick)
        self._refresh_panels()

    def action_slower(self) -> None:
        self.tick_interval = min(5.0, self.tick_interval * 1.5)
        self.speed_label = "slow"
        self.set_interval(self.tick_interval, self._tick)
        self._refresh_panels()

    def action_reset(self) -> None:
        self.sim = Simulation(num_communicators=self._num_comms,
                              num_attackers=self._num_atks, seed=self._seed)
        self._last_rendered_tick = 0
        self.query_one("#activity-log", RichLog).clear()
        self._refresh_panels()


def main():
    app = RawCryptApp(num_communicators=4, num_attackers=2, seed=42)
    app.run()


if __name__ == "__main__":
    main()
