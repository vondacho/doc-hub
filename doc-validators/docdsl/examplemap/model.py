"""
The document model - an example map exactly as the `.examplemap` file spells it.

Example mapping is Matt Wynne's: a team takes one user story and breaks it into
four kinds of card.

    story      yellow   the story, and there is at most one
    rule       blue     a constraint that has to hold
    example    green    one concrete case that illustrates a rule
    question   red      something nobody in the room could answer

The story is the only card that carries a ticket. Breaking a story down does
not produce more tickets - that is the difference between this board and the
story map next door, where every row is a level in the tracker.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Final, Literal

Status = Literal["open", "analysing", "ready", "in-progress", "done", "closed"]

#: In workflow order. The ticketing system owns it; `~open` is what an unlinked
#: story reads as - a placeholder meaning nothing has been said yet, not a
#: claim - and the board writes no annotation for it.
STATUSES: Final[tuple[Status, ...]] = (
    "open",
    "analysing",
    "ready",
    "in-progress",
    "done",
    "closed",
)
DEFAULT_STATUS: Final[Status] = "open"

DeliveryKind = Literal["sprint", "release"]
DELIVERY_KINDS: Final[tuple[DeliveryKind, ...]] = ("sprint", "release")

StepClause = Literal["given", "when", "then"]

#: Given establishes context, When is the one action, Then is what must hold
#: afterwards. Write them in any order; this is the order they come back in,
#: because any other order is not a scenario.
STEP_CLAUSES: Final[tuple[StepClause, ...]] = ("given", "when", "then")


def is_status(value: str) -> bool:
    return value in STATUSES


def is_delivery_kind(value: str) -> bool:
    return value in DELIVERY_KINDS


@dataclass
class Delivery:
    """One band of the timeline. Declaration order is timeline order."""

    title: str
    kind: DeliveryKind = "sprint"
    ticket: str | None = None
    #: **Only a sprint is sized**, and **empty is not zero**: `0` says the
    #: sprint carries no estimable work, and leaving it out says nobody has
    #: sized it.
    points: int | None = None
    notes: list[str] = field(default_factory=list)
    line: int = 1
    col: int = 1
    #: Width of the keyword in the source, so an error caret can be the right
    #: length rather than one character wide.
    width: int = 0


@dataclass
class Question:
    """Red. A doubt raised before any rule exists belongs to the story; one
    raised while discussing a rule sits with that rule."""

    title: str
    tags: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    line: int = 1
    col: int = 1
    #: Width of the keyword in the source, so an error caret can be the right
    #: length rather than one character wide.
    width: int = 0


@dataclass
class Example:
    """Green. One concrete case that illustrates a rule.

    **An example belongs to a rule** and cannot float at the top level.
    """

    title: str
    delivery: str | None = None
    tags: list[str] = field(default_factory=list)
    given: list[str] = field(default_factory=list)
    when: list[str] = field(default_factory=list)
    then: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    line: int = 1
    col: int = 1
    #: Width of the keyword in the source, so an error caret can be the right
    #: length rather than one character wide.
    width: int = 0

    @property
    def steps(self) -> list[tuple[str, str]]:
        """Every step, in Gherkin's order, as (clause, text) pairs.

        There is no `and` keyword because `And` is how a repeat is *printed*:
        the second `given` in a row renders as `And` on the card and in the
        feature file. Storing it would make a line mean something different
        depending on the line above it.
        """
        return [
            (clause, text)
            for clause in STEP_CLAUSES
            for text in getattr(self, clause)
        ]

    @property
    def has_steps(self) -> bool:
        return bool(self.given or self.when or self.then)


@dataclass
class Rule:
    """Blue. A constraint or acceptance criterion.

    It takes tags and nothing else - no `#` and no `~` - and holds examples,
    questions and notes.
    """

    title: str
    tags: list[str] = field(default_factory=list)
    examples: list[Example] = field(default_factory=list)
    questions: list[Question] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    line: int = 1
    col: int = 1
    #: Width of the keyword in the source, so an error caret can be the right
    #: length rather than one character wide.
    width: int = 0


@dataclass
class Story:
    """Yellow, and there is at most one.

    The practice takes one story, so a map has at most one `story` line. A map
    with **no** story line is fine - a session that has not named its story
    yet.
    """

    title: str
    ticket: str | None = None
    status: Status = DEFAULT_STATUS
    delivery: str | None = None
    persona: str | None = None
    want: str | None = None
    so_that: str | None = None
    tags: list[str] = field(default_factory=list)
    questions: list[Question] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    line: int = 1
    col: int = 1
    #: Width of the keyword in the source, so an error caret can be the right
    #: length rather than one character wide.
    width: int = 0


@dataclass
class ExampleMap:
    title: str
    product: str | None = None
    space: str | None = None
    deliveries: list[Delivery] = field(default_factory=list)
    story: Story | None = None
    rules: list[Rule] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    line: int = 1
    col: int = 1
    #: Width of the keyword in the source, so an error caret can be the right
    #: length rather than one character wide.
    width: int = 0

    @property
    def effective_space(self) -> str | None:
        return self.space or self.product

    @property
    def examples(self) -> list[Example]:
        return [example for rule in self.rules for example in rule.examples]

    @property
    def questions(self) -> list[Question]:
        """Every red card, the story's and the rules'.

        Both are meaningful when you read the finished map - "this rule has
        three unanswered questions" says something different from "the board
        has three".
        """
        story_questions = self.story.questions if self.story else []
        return [*story_questions, *(q for rule in self.rules for q in rule.questions)]

    def delivery_named(self, title: str) -> Delivery | None:
        return next((band for band in self.deliveries if band.title == title), None)

    def index_of(self, title: str | None) -> int | None:
        """Where a band sits on the timeline. Declaration order is the order."""
        if title is None:
            return None
        for index, band in enumerate(self.deliveries):
            if band.title == title:
                return index
        return None
