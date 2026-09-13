"""
Reading an event storm - the doctrine, as checks.

Event storming is Alberto Brandolini's. Everything in this module comes from
`doc-es/eventstorm-doctrine.md`, and every reading here is a **warning or a
reading, never an error**: a wall with no hotspots on it is a perfectly valid
`.eventstorm` file, and it is also the first thing the doctrine tells you to
look at.

The doctrine's own framing governs the wording of every message: the person
holding this file was in the room and knows the domain far better than the tool
does. So these findings ask about the wall; they never correct it.

Three of the doctrine's instructions are about what *not* to do, and they are
honoured by omission rather than by a check:

  - **Do not resolve the hotspots.** No reading here proposes an answer to one.
  - **Do not invent domain facts.** Nothing here suggests a card to add; a hole
    in the timeline is reported as a hole.
  - **Do not tidy the disagreement into a tag.** No reading suggests turning a
    hotspot into `+`anything.
"""

from __future__ import annotations

from ..problems import Problem, Severity
from ..prose import count, looks_imperative, looks_past_tense, words
from .model import (
    KIND_LEVEL,
    LEVEL_LABEL,
    LEVELS,
    THE_WALL,
    Card,
    EventStorm,
    Lane,
)

#: How far along the timeline counts as "near" for the two proximity readings.
#:
#: One column either side. A wall's columns are moments, and a hotspot two
#: moments away from an opportunity is not the room's answer to it - it is a
#: different part of the process.
NEARBY = 1

#: A run of events this long with nobody and nothing named around it is the
#: stretch of process the doctrine says nobody owns.
UNOWNED_RUN = 4


def read(storm: EventStorm) -> list[Problem]:
    """Every doctrine reading of this wall, in file order where it matters."""
    findings: list[Problem] = []
    findings += _phase(storm)
    findings += _hotspots(storm)
    findings += _events(storm)
    findings += _commands(storm)
    findings += _policies(storm)
    findings += _unowned_runs(storm)
    findings += _lanes(storm)
    findings += _opportunities(storm)
    findings += _seams(storm)
    findings += _retired_level(storm)
    return findings


def _at(card: Card | Lane, message: str, hint: str, code: str, severity: Severity) -> Problem:
    return Problem(
        message=message,
        line=card.line,
        column=card.col,
        length=card.width,
        hint=hint,
        severity=severity,
        code=code,
    )


# -- which workshop this is -------------------------------------------------


def _phase(storm: EventStorm) -> list[Problem]:
    """Which level a wall is in decides what is missing on purpose.

    A big picture with no commands on it is not unfinished, and pointing that
    out is noise - so this is stated once, as a reading, and the checks below
    are gated on it rather than complaining about absent notation.
    """
    if not storm.cards:
        return [
            Problem(
                message="This wall has no cards on it.",
                line=storm.line,
                column=storm.col,
                length=storm.width,
                hint="A storm with no cards is a wall nobody has drawn on yet. "
                "That is a legal file, not a finding.",
                severity=Severity.INFO,
                code="es-empty-wall",
            )
        ]

    level = storm.deepest_level
    counts = {kind: len(storm.of_kind(kind)) for kind in ("event", "hotspot", "command", "policy")}
    return [
        Problem(
            message=(
                f"Read as {LEVEL_LABEL[level].lower()}: "
                f"{count(counts['event'], 'event')}, "
                f"{count(counts['hotspot'], 'hotspot')}, "
                f"{count(counts['command'], 'command')}, "
                f"{count(counts['policy'], 'policy', 'policies')}, across "
                f"{count(len(storm.lanes), 'lane')} and "
                f"{count(storm.last_column, 'column')}."
            ),
            line=storm.line,
            column=storm.col,
            length=storm.width,
            hint="The level is read off the cards, not declared. "
            "Which phase the wall is in decides what is missing on purpose.",
            severity=Severity.INFO,
            code="es-level",
        )
    ]


# -- the red cards ----------------------------------------------------------


def _hotspots(storm: EventStorm) -> list[Problem]:
    """The most valuable card on the wall is the red one.

    A storm that has produced no hotspots has not been honest yet - either the
    room agreed about everything, which almost never happens, or nobody said
    the thing they were unsure about.
    """
    if not storm.cards:
        return []
    if storm.of_kind("hotspot"):
        return []
    return [
        Problem(
            message="This wall has no hotspots on it.",
            line=storm.line,
            column=storm.col,
            length=storm.width,
            hint="A storm that has produced no hotspots has not been honest yet. "
            "Ask about the parts of the timeline that are suspiciously smooth.",
            severity=Severity.WARNING,
            code="es-no-hotspots",
        )
    ]


# -- the orange cards -------------------------------------------------------


def _events(storm: EventStorm) -> list[Problem]:
    """A domain event is something that happened, past tense, in the
    business's own words.

    `Place order` is a command wearing an event's colour, and a wall full of
    them is a wall of intentions rather than facts.
    """
    findings: list[Problem] = []
    for card in storm.of_kind("event"):
        if looks_imperative(card.title):
            findings.append(
                _at(
                    card,
                    f'The event "{card.title}" reads as an imperative.',
                    "A domain event is something that happened, in the past tense: "
                    "`Order placed`, not `Place order`. If it is a request to do "
                    "something, it is a command.",
                    "es-event-reads-as-command",
                    Severity.WARNING,
                )
            )
        elif not looks_past_tense(card.title):
            findings.append(
                _at(
                    card,
                    f'The event "{card.title}" carries no past-tense verb.',
                    "Events are written in the past tense and in the business's own "
                    "words. Worth a second look - this reading is only as good as its "
                    "word list.",
                    "es-event-not-past-tense",
                    Severity.INFO,
                )
            )
    return findings


# -- the blue cards ---------------------------------------------------------


def _commands(storm: EventStorm) -> list[Problem]:
    """A command is a request to do something, in the imperative."""
    findings: list[Problem] = []
    for card in storm.of_kind("command"):
        if looks_past_tense(card.title):
            findings.append(
                _at(
                    card,
                    f'The command "{card.title}" reads as something that already happened.',
                    "A command is in the imperative: `Take the payment`. "
                    "If it is a record of something that happened, it is an event.",
                    "es-command-not-imperative",
                    Severity.WARNING,
                )
            )
    return findings


# -- the violet cards -------------------------------------------------------


def _policies(storm: EventStorm) -> list[Problem]:
    """A policy is the rule that reacts to an event and issues a command.

    If a policy has no event before it or no command after it, the causal chain
    has a hole where somebody's decision goes. Checked across the whole wall
    rather than within one lane: lanes do not have their own clocks, and a
    policy in the payments lane reacts perfectly well to an event in the
    customer's.
    """
    findings: list[Problem] = []
    events = storm.of_kind("event")
    commands = storm.of_kind("command")

    for card in storm.of_kind("policy"):
        before = [event for event in events if event.column <= card.column]
        after = [command for command in commands if command.column >= card.column]
        if not before or not after:
            missing = []
            if not before:
                missing.append("no event before it")
            if not after:
                missing.append("no command after it")
            findings.append(
                _at(
                    card,
                    f'The policy "{card.title}" has {" and ".join(missing)}.',
                    "A policy is the rule that reacts to an event and issues a command: "
                    "whenever X, do Y. The causal chain has a hole where somebody's "
                    "decision goes.",
                    "es-policy-chain-hole",
                    Severity.WARNING,
                )
            )
            continue

        if "whenever" not in words(card.title) and "when" not in words(card.title):
            findings.append(
                _at(
                    card,
                    f'The policy "{card.title}" does not say what it reacts to.',
                    'A policy reads as "whenever X, do Y" - the event that triggers it '
                    "and the command it issues.",
                    "es-policy-not-a-rule",
                    Severity.INFO,
                )
            )
    return findings


# -- who owns this stretch --------------------------------------------------


def _unowned_runs(storm: EventStorm) -> list[Problem]:
    """A run of events with no actor and no system anywhere near it is usually
    a stretch of the process nobody in the room actually owns."""
    findings: list[Problem] = []
    owners = [card.column for card in storm.of_kind("actor", "system", "aggregate", "ui")]
    if not storm.of_kind("event"):
        return findings

    for lane in storm.lanes:
        run: list[Card] = []
        for card in sorted(lane.cards, key=lambda item: item.column):
            if card.kind != "event":
                continue
            if any(abs(column - card.column) <= NEARBY for column in owners):
                run = []
                continue
            if run and card.column - run[-1].column > NEARBY + 1:
                run = []
            run.append(card)
            if len(run) == UNOWNED_RUN:
                findings.append(
                    _at(
                        run[0],
                        f"{count(UNOWNED_RUN, 'event')} in a row in "
                        f'"{lane.title}" with no actor and no system near them.',
                        "A run of events nobody is named against is usually a stretch "
                        "of the process nobody in the room actually owns. Ask who does.",
                        "es-unowned-run",
                        Severity.WARNING,
                    )
                )
                run = []
    return findings


# -- the rows ---------------------------------------------------------------


def _lanes(storm: EventStorm) -> list[Problem]:
    """Lanes are not a taxonomy.

    A lane whose cards have no timing relationship to its neighbours is a list
    that has been drawn on a timeline. The test is whether anything in the lane
    shares a moment with anything outside it: two cards in different lanes at
    the same column are simultaneous, and that is the only reason to draw lanes
    as rows rather than as separate walls.
    """
    findings: list[Problem] = []
    if len(storm.lanes) < 2:
        return findings

    for lane in storm.lanes:
        if lane.unnamed or not lane.cards:
            continue
        mine = [card.column for card in lane.cards]
        first, last = min(mine), max(mine)
        # Interval overlap rather than a shared square. A lane that occupies
        # columns 6 and 7 while its neighbour runs 1 to 8 has a timing
        # relationship to it even though the two never stand on the same
        # column - that is a sequential process, which is the ordinary case
        # and not a finding. What the doctrine is pointing at is the lane whose
        # whole stretch sits outside everybody else's: a row that could be
        # lifted off the wall without disturbing the timeline, which is a list
        # that has been drawn on one.
        overlaps = False
        for other in storm.lanes:
            if other is lane or not other.cards:
                continue
            theirs = [card.column for card in other.cards]
            if min(theirs) <= last and first <= max(theirs):
                overlaps = True
                break
        if overlaps:
            continue
        findings.append(
            _at(
                lane,
                f'Nothing in the lane "{lane.title}" shares a moment with any other lane.',
                "Column 4 is the same moment in every lane, and that is the whole "
                "reason to draw them as rows. A lane with no timing relationship to "
                "its neighbours is a list that has been drawn on a timeline.",
                "es-lane-off-the-clock",
                Severity.WARNING,
            )
        )

    loose = next((lane for lane in storm.lanes if lane.unnamed), None)
    if loose is not None:
        findings.append(
            _at(
                loose,
                f"{count(len(loose.cards), 'card')} written before the first lane.",
                f'They are gathered into one unnamed lane - "{THE_WALL}" - which is '
                "what chaotic exploration looks like before anybody agrees on lanes. "
                "A legal state, and the one normalisation the format makes.",
                "es-loose-cards",
                Severity.INFO,
            )
        )
    return findings


# -- the green cards --------------------------------------------------------


def _opportunities(storm: EventStorm) -> list[Problem]:
    """An opportunity next to a hotspot is the room's answer to it.

    One with no hotspot near it is often a solution looking for its problem.
    """
    findings: list[Problem] = []
    hotspots = [card.column for card in storm.of_kind("hotspot")]
    for card in storm.of_kind("opportunity"):
        if any(abs(column - card.column) <= NEARBY for column in hotspots):
            continue
        findings.append(
            _at(
                card,
                f'The opportunity "{card.title}" has no hotspot near it.',
                "An opportunity beside a hotspot is the room's answer to it. "
                "One on its own is often a solution looking for its problem.",
                "es-opportunity-without-hotspot",
                Severity.INFO,
            )
        )
    return findings


# -- the last phase ---------------------------------------------------------


def _seams(storm: EventStorm) -> list[Problem]:
    """Finding the seams is the last phase of a big picture.

    Only said on a wall that has enough on it for the question to be fair, and
    only as a reading: a storm still in chaotic exploration is not missing its
    contexts, it has not got there yet.
    """
    if storm.of_kind("context"):
        return []
    if len(storm.of_kind("event")) < 8:
        return []
    return [
        Problem(
            message="This wall names no bounded contexts.",
            line=storm.line,
            column=storm.col,
            length=storm.width,
            hint="Finding the seams is the last phase of a big picture: clusters of "
            "events that share a language and change together are the candidates. "
            "Not a defect - a wall mid-session has not got there yet.",
            severity=Severity.INFO,
            code="es-no-contexts",
        )
    ]


# -- the retired line -------------------------------------------------------


def _retired_level(storm: EventStorm) -> list[Problem]:
    """`level process-modelling` is read, and no longer means anything.

    The line was part of the format once. It was retired because it was
    derivable - a wall with a command on it is a process model - and the
    duplicate is what drifts. So the only thing worth saying about it is when
    the word and the wall now disagree, and even that is a reading rather than
    an error: the file was correct when it was written.
    """
    if storm.declared_level is None:
        return []
    line = storm.declared_level_line or storm.line
    actual = storm.deepest_level
    if storm.declared_level not in LEVELS:
        return []
    if storm.declared_level == actual:
        return [
            Problem(
                message="The `level` line is retired and has no effect.",
                line=line,
                column=1,
                hint="The level is read off the cards - a wall holding a command is a "
                "process model. The line disappears the first time the board "
                "rewrites the file.",
                severity=Severity.INFO,
                code="es-level-retired",
            )
        ]
    return [
        Problem(
            message=(
                f"The `level` line says {LEVEL_LABEL[storm.declared_level].lower()}, "
                f"and the cards make this {LEVEL_LABEL[actual].lower()}."
            ),
            line=line,
            column=1,
            hint="The line is retired: the level is read off the cards, so the cards "
            "win. Delete it - the board does, the first time it rewrites the file.",
            severity=Severity.WARNING,
            code="es-level-disagrees",
        )
    ]


def deepest_level_of(cards: list[Card]) -> str:
    """The level a set of cards makes a wall. Exposed for the tests."""
    deepest = "big-picture"
    for card in cards:
        level = KIND_LEVEL[card.kind]
        if LEVELS.index(level) > LEVELS.index(deepest):
            deepest = level
    return deepest
