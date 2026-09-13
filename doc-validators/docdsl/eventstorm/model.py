"""
The document model - an event storm exactly as the `.eventstorm` file spells it.

Event storming is Alberto Brandolini's, and unlike the two boards next door it
is not one shape but three. The practice is run at three levels - Big Picture,
Process Modelling, Software Design - and each **adds** elements to the one
before it rather than replacing it. So this model has more kinds in it than
doc-em's four, and the kinds are grouped by the level that introduces them.

Flat, with no identifiers, mirroring the grammar node for node. The only thing
here the grammar does not have is a source position on every node, because a
validator's whole output is positions.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Final, Literal

Level = Literal["big-picture", "process-modelling", "software-design"]

#: In order of depth. Each admits everything the one before it does.
LEVELS: Final[tuple[Level, ...]] = (
    "big-picture",
    "process-modelling",
    "software-design",
)

LEVEL_LABEL: Final[dict[str, str]] = {
    "big-picture": "Big picture",
    "process-modelling": "Process modelling",
    "software-design": "Software design",
}

CardKind = str

#: The ten kinds, grouped by the level that introduces them.
#:
#: They are the notation, not a palette. Somebody who has stood at one of these
#: walls has to recognise the board without being told, so these were never
#: ours to choose.
BIG_PICTURE_KINDS: Final[tuple[CardKind, ...]] = (
    "event",
    "actor",
    "system",
    "hotspot",
    "opportunity",
    "context",
)
PROCESS_KINDS: Final[tuple[CardKind, ...]] = ("command", "policy", "readmodel")
DESIGN_KINDS: Final[tuple[CardKind, ...]] = ("aggregate", "ui")

CARD_KINDS: Final[tuple[CardKind, ...]] = (
    *BIG_PICTURE_KINDS,
    *PROCESS_KINDS,
    *DESIGN_KINDS,
)

#: Which level introduces each kind. Read the other way round, this is what
#: `deepest_level` uses: a wall carrying a `command` *is* a process model, and
#: there is no second fact for a declaration to carry.
KIND_LEVEL: Final[dict[CardKind, Level]] = {
    **{kind: "big-picture" for kind in BIG_PICTURE_KINDS},
    **{kind: "process-modelling" for kind in PROCESS_KINDS},
    **{kind: "software-design" for kind in DESIGN_KINDS},
}

#: What each kind is, for a message that has to say so.
KIND_LABEL: Final[dict[CardKind, str]] = {
    "event": "domain event",
    "actor": "actor",
    "system": "external system",
    "hotspot": "hotspot",
    "opportunity": "opportunity",
    "context": "bounded context",
    "command": "command",
    "policy": "policy",
    "readmodel": "read model",
    "aggregate": "aggregate",
    "ui": "screen",
}

#: What each kind looks like written properly, for an error hint.
KIND_EXAMPLE: Final[dict[CardKind, str]] = {
    "event": 'event "Order placed"',
    "actor": 'actor "Customer"',
    "system": 'system "Payment provider"',
    "hotspot": 'hotspot "Nobody agrees what confirmed means"',
    "opportunity": 'opportunity "Tell the customer sooner"',
    "context": 'context "Ordering"',
    "command": 'command "Place the order"',
    "policy": 'policy "Whenever payment is refused, hold the order"',
    "readmodel": 'readmodel "Basket total"',
    "aggregate": 'aggregate "Order"',
    "ui": 'ui "Checkout page"',
}

#: The name of the unnamed lane loose cards are gathered into.
THE_WALL: Final[str] = "The wall"


def is_card_kind(value: str) -> bool:
    return value in KIND_LEVEL


@dataclass
class Card:
    """One sticky note, of whichever of the ten kinds its keyword names.

    There is no separate colour or type annotation: the keyword *is* the kind.
    A card whose keyword said one thing and whose annotation said another would
    be a state the file could express and the board could not.
    """

    kind: CardKind
    title: str
    #: One-based position on the shared timeline. Never `None`: a card written
    #: without `@` takes the square after the highest one written so far in its
    #: lane, and that default is resolved while parsing.
    column: int
    notes: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    line: int = 1
    col: int = 1
    #: Width of the keyword in the source, so an error caret can be the right
    #: length rather than one character wide.
    width: int = 0
    #: False when the card was written without `@`, which is what lets the
    #: doctrine tell an implicit run of events from deliberate coordinates.
    column_written: bool = False


@dataclass
class Lane:
    """One horizontal swimlane: a department, an actor, a subsystem.

    **Lanes do not have their own clocks.** Column 4 is the same moment in
    every lane, which is the whole reason to draw them as rows rather than as
    separate walls.
    """

    title: str
    cards: list[Card] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    line: int = 1
    col: int = 1
    #: Width of the keyword in the source, so an error caret can be the right
    #: length rather than one character wide.
    width: int = 0
    #: True for the unnamed lane that holds cards written before any `lane`
    #: line. It is a normalisation, not something anybody typed.
    unnamed: bool = False


@dataclass
class EventStorm:
    title: str
    product: str | None = None
    lanes: list[Lane] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    line: int = 1
    col: int = 1
    #: Width of the keyword in the source, so an error caret can be the right
    #: length rather than one character wide.
    width: int = 0
    #: The word a retired `level` line carried, kept only so the doctrine can
    #: say the line no longer means anything. See `parse_legacy_level`.
    declared_level: str | None = None
    declared_level_line: int | None = None

    @property
    def cards(self) -> list[Card]:
        return [card for lane in self.lanes for card in lane.cards]

    def of_kind(self, *kinds: CardKind) -> list[Card]:
        return [card for card in self.cards if card.kind in kinds]

    @property
    def deepest_level(self) -> Level:
        """The level this wall is, read off the wall.

        A wall with a command on it is a process model; there is no second fact
        for a declaration to carry. This is why `level` was retired from the
        format: a declaration that may only ever say what the content already
        says is not a statement of intent, it is a duplicate - and the
        duplicate is what drifts.
        """
        deepest: Level = "big-picture"
        for card in self.cards:
            level = KIND_LEVEL[card.kind]
            if LEVELS.index(level) > LEVELS.index(deepest):
                deepest = level
        return deepest

    @property
    def last_column(self) -> int:
        return max((card.column for card in self.cards), default=0)

    def column_of(self, column: int) -> list[Card]:
        """Every card standing at one moment, across every lane.

        Two cards in different lanes at the same column are **simultaneous**,
        and that is the one thing a wall says constantly and a list cannot.
        """
        return [card for card in self.cards if card.column == column]
