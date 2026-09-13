"""
The `.eventstorm` parser - recursive descent over the token array.

The shortest of the three, because there is no reference to resolve and no
second phase: nothing in this grammar points at anything else, so everything
can be decided as it is read.

Errors are collected rather than fatal, for the reason the other two give:
these files are hand-edited in an editor with no language server and imported
through a file picker, so failing on the first problem costs one trip through a
file dialog per typo.
"""

from __future__ import annotations

from typing import Final

from ..lexer import AT, EOF, IDENT, KEYWORD, PLUS, Token, describe, is_ordinal, tokenize
from ..parsing import Once, Reader, parse_once
from ..problems import EventStormParseError, Problem
from .model import (
    KIND_EXAMPLE,
    KIND_LABEL,
    THE_WALL,
    Card,
    EventStorm,
    Lane,
    is_card_kind,
)

#: The words that are keywords rather than identifiers in an `.eventstorm` file.
#:
#: `level` is in the set although it is no longer part of the format: dropped
#: from it, an old file's `level process-modelling` line would lex as two
#: identifiers and the file would fail to open. See `parse_legacy_level`.
EVENTSTORM_KEYWORDS: Final[frozenset[str]] = frozenset(
    {
        "eventstorm",
        "product",
        "level",
        "lane",
        "event",
        "actor",
        "system",
        "hotspot",
        "opportunity",
        "command",
        "policy",
        "readmodel",
        "aggregate",
        "ui",
        "context",
        "note",
    }
)

LEGACY_LEVELS: Final[frozenset[str]] = frozenset(
    {"big-picture", "process-modelling", "software-design"}
)

_NOTE_EXAMPLE = 'note "Two departments mean different things here."'


def parse(source: str) -> EventStorm:
    """Read an event storm.

    Raises `EventStormParseError` carrying every problem found, not just the
    first.
    """
    storm, problems = parse_collecting(source)
    if problems:
        raise EventStormParseError(problems)
    return storm


def parse_collecting(source: str) -> tuple[EventStorm, list[Problem]]:
    """Read an event storm, returning whatever could be read and every problem.

    The entry point a validator wants: a file with four typos in it still
    yields a storm the doctrine can be run over, which is how one pass reports
    both the syntax and the reading.
    """
    problems: list[Problem] = []
    tokens = tokenize(
        source,
        problems,
        EVENTSTORM_KEYWORDS,
        noun="event storm",
        example='event "Order placed"',
    )
    return _EventStormReader(tokens, problems, source).parse_file(), problems


class _EventStormReader(Reader):
    def __init__(self, tokens: list[Token], problems: list[Problem], source: str) -> None:
        super().__init__(tokens=tokens, problems=problems, source=source, root="eventstorm")

    # -- cards --------------------------------------------------------------

    def parse_card(self, cards: list[Card]) -> bool:
        """One sticky note, of whichever of the ten kinds its keyword names.

        One function for all ten rather than ten near-identical ones, because
        they differ only in what the colour means. The keyword *is* the kind,
        so there is nothing to disambiguate and nothing to get wrong.
        """
        if not self.at(KEYWORD) or not is_card_kind(self.peek().value):
            return False
        keyword = self.advance()
        kind = keyword.value
        title = self.expect_string(
            kind, f"Written in the room's own words: {KIND_EXAMPLE[kind]}"
        )
        if title is None:
            self.synchronize()
            return True

        # `@column`, or the next square along from the last card written here.
        #
        # Optional on the way in. A run of events typed straight down a lane is
        # the common case and should not have to be numbered by hand; a card
        # that genuinely belongs at column 7 because that is when it happens
        # has to be able to say so.
        #
        # `@0` and below are refused rather than clamped. Columns are one-based
        # because they are positions on a wall, not array indices, and a
        # silently corrected coordinate is a card that is not where the file
        # says it is.
        column = _next_column(cards)
        written = False
        tags: list[str] = []

        while self.at(AT) or self.at(PLUS):
            if self.parse_tag(tags, KIND_LABEL[kind]):
                continue
            sigil = self.advance()
            if not is_ordinal(self.peek()):
                self.problem_at(
                    sigil,
                    f"Expected a column number after `@`, found {describe(self.peek())}.",
                    'A column is a whole number from 1: event "Order placed" @3',
                    code="expected-column",
                )
                continue
            ordinal = self.advance()
            value = int(ordinal.value)
            if value < 1:
                self.problem_at(
                    sigil,
                    "Columns start at 1.",
                    "Column 1 is the left-hand edge of the wall.",
                    code="column-below-one",
                )
                continue
            # The last written wins, which is what the grammar says and what
            # makes `@4 @5` a formatting oddity rather than a second error.
            column = value
            written = True

        notes: list[str] = []
        self.parse_body(KIND_LABEL[kind], lambda: self.parse_note(notes, _NOTE_EXAMPLE))
        cards.append(
            Card(
                kind=kind,
                title=title.value,
                column=column,
                notes=notes,
                tags=tags,
                line=keyword.line,
                col=keyword.column,
                width=keyword.length,
                column_written=written,
            )
        )
        return True

    # -- lanes --------------------------------------------------------------

    def parse_lane(self, lanes: list[Lane]) -> bool:
        """`lane "Customer"` - one swimlane.

        A lane may hold cards and notes and nothing else. Nesting one lane
        inside another would describe a hierarchy the board does not have: the
        board is a grid, and a lane is a row of it. `lane` is not admitted by
        the body below, so a nested one is reported as unexpected.
        """
        if not self.at(KEYWORD, "lane"):
            return False
        keyword = self.advance()
        title = self.expect_string("lane", 'A lane is quoted: lane "Customer"')
        if title is None:
            self.synchronize()
            return True

        notes: list[str] = []
        cards: list[Card] = []
        self.parse_body(
            "lane",
            lambda: self.parse_card(cards) or self.parse_note(notes, _NOTE_EXAMPLE),
        )
        lanes.append(
            Lane(
                title=title.value,
                cards=cards,
                notes=notes,
                line=keyword.line,
                col=keyword.column,
                width=keyword.length,
            )
        )
        return True

    # -- the retired level line ---------------------------------------------

    def parse_legacy_level(self, storm: EventStorm) -> bool:
        """`level process-modelling` - read, recorded, and never written again.

        **The level is no longer part of the format.** It is discovered from the
        cards on the wall - a storm holding a command is a process model, and
        nothing else has to say so.

        This branch is here only so a file written by the version that did
        declare it still opens. It is not an error: the line was correct when it
        was written, and greeting somebody's saved storm with a failure they did
        not cause is the worst of the available options. The doctrine reads it
        instead, and only says anything when the word and the wall disagree.

        Both tokens are consumed so the trailing word does not then read as a
        stray identifier, which *would* be an error.
        """
        if not self.at(KEYWORD, "level"):
            return False
        keyword = self.advance()
        if self.at(IDENT):
            word = self.advance()
            if storm.declared_level is None:
                storm.declared_level = word.value
                storm.declared_level_line = keyword.line
            if word.value not in LEGACY_LEVELS:
                self.problem_at(
                    word,
                    f"`{word.value}` is not a level.",
                    "One of: big-picture, process-modelling, software-design. "
                    "The line is retired in any case - the level is read off the cards.",
                    code="unknown-level",
                )
        return True

    # -- the file -----------------------------------------------------------

    def parse_file(self) -> EventStorm:
        self.skip_to_root('A file holds one event storm: eventstorm "Its title" { ... }')

        if self.at(EOF):
            if not self.problems:
                self.problem_at(
                    self.peek(),
                    "The file is empty.",
                    'An event storm starts with: eventstorm "Its title" { ... }',
                    code="empty-file",
                )
            return EventStorm(title="Untitled event storm")

        keyword = self.advance()
        storm = EventStorm(title="Untitled event storm", line=keyword.line, col=keyword.column, width=keyword.length)
        parsed = self.expect_string(
            "eventstorm", 'The storm is titled: eventstorm "Ordering a pizza"'
        )
        if parsed is not None:
            storm.title = parsed.value

        product = Once()
        lanes: list[Lane] = []
        # Cards written at the top level, before any `lane` line.
        #
        # Legal, and the shape a real file takes early: chaotic exploration
        # produces a heap of events long before anybody agrees where one stretch
        # of the wall ends and the next begins.
        loose: list[Card] = []

        self.parse_body(
            "eventstorm",
            lambda: parse_once(
                self,
                "product",
                product,
                'A product is its shortname, quoted: product "client-onboarding"',
                "The product is declared twice. An event storm is about one product.",
                "product-twice",
            )
            or self.parse_legacy_level(storm)
            or self.parse_lane(lanes)
            or self.parse_card(loose)
            or self.parse_note(storm.notes, _NOTE_EXAMPLE),
        )

        self.trailing_junk("event storm")

        # Loose cards go in a lane of their own, above the named ones. They were
        # written before anybody drew a lane, and appending them to somebody's
        # first lane would be claiming they belong to it.
        storm.product = product.value
        storm.lanes = (
            [Lane(title=THE_WALL, cards=loose, unnamed=True), *lanes] if loose else lanes
        )
        return storm


def _next_column(cards: list[Card]) -> int:
    """One past the rightmost column written so far in this lane, or 1."""
    return max((card.column for card in cards), default=0) + 1
