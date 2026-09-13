"""
The document model - a story map exactly as the `.storymap` file spells it.

User story mapping is Jeff Patton's: a **backbone** of activities read left to
right, each broken into **steps**, with the **stories** that deliver them hung
underneath, and horizontal lines drawn across the whole thing to say what ships
when.

Three kinds of card, and the only three. They line up with the three levels
every tracker has:

    activity   the backbone       raises a capability   spans every band
    step       what the user does raises an epic        spans every band
    story      the unit of work   raises a story        sits in one band

Only a story takes a `@delivery`: an activity and a step span every band, so
*when* the work happens is settled one level down.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Final, Literal

StoryStatus = Literal["open", "analysing", "ready", "in-progress", "done", "closed"]

#: In workflow order. The default is `open` and is never written to the file:
#: once a card carries a ticket the ticketing system is the truth and anything
#: stored here is a cached copy of it.
STORY_STATUSES: Final[tuple[StoryStatus, ...]] = (
    "open",
    "analysing",
    "ready",
    "in-progress",
    "done",
    "closed",
)
DEFAULT_STORY_STATUS: Final[StoryStatus] = "open"

DeliveryKind = Literal["sprint", "release"]
DELIVERY_KINDS: Final[tuple[DeliveryKind, ...]] = ("sprint", "release")


def is_story_status(value: str) -> bool:
    return value in STORY_STATUSES


def is_delivery_kind(value: str) -> bool:
    return value in DELIVERY_KINDS


@dataclass
class Delivery:
    """One band of the timeline.

    **Declaration order is timeline order** - there is no index and no date. An
    index drifts out of step with the file; a date is the one thing here that
    would go stale on its own. The tracker holds the calendar, this holds the
    sequence.
    """

    title: str
    kind: DeliveryKind = "release"
    ticket: str | None = None
    notes: list[str] = field(default_factory=list)
    line: int = 1
    col: int = 1
    #: Width of the keyword in the source, so an error caret can be the right
    #: length rather than one character wide.
    width: int = 0
    #: True when the band was written with the older `release "MVP"` spelling,
    #: which still parses and means `delivery "MVP" release`.
    legacy: bool = False


@dataclass
class Story:
    """The unit of work, and the only card that sits in one band."""

    title: str
    delivery: str | None = None
    ticket: str | None = None
    status: StoryStatus = DEFAULT_STORY_STATUS
    tags: list[str] = field(default_factory=list)
    #: The persona this story is written for. A **reference**: it must name a
    #: persona its own activity lists, and no other.
    persona: str | None = None
    want: str | None = None
    so_that: str | None = None
    notes: list[str] = field(default_factory=list)
    line: int = 1
    col: int = 1
    #: Width of the keyword in the source, so an error caret can be the right
    #: length rather than one character wide.
    width: int = 0

    @property
    def scheduled(self) -> bool:
        """**No `@` means below the line**: known, and not committed to.

        Absence is the encoding, so there is no keyword to spell wrong.
        """
        return self.delivery is not None


@dataclass
class Step:
    """What the user does. A step spans every band."""

    title: str
    ticket: str | None = None
    status: StoryStatus = DEFAULT_STORY_STATUS
    tags: list[str] = field(default_factory=list)
    stories: list[Story] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    line: int = 1
    col: int = 1
    #: Width of the keyword in the source, so an error caret can be the right
    #: length rather than one character wide.
    width: int = 0


@dataclass
class Activity:
    """The backbone. An activity spans every band."""

    title: str
    ticket: str | None = None
    status: StoryStatus = DEFAULT_STORY_STATUS
    tags: list[str] = field(default_factory=list)
    #: The activity's cast, unique within it. An activity is where "who is
    #: doing this?" actually gets asked - once per thing people do, not once
    #: per product.
    personas: list[str] = field(default_factory=list)
    steps: list[Step] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    line: int = 1
    col: int = 1
    #: Width of the keyword in the source, so an error caret can be the right
    #: length rather than one character wide.
    width: int = 0

    @property
    def stories(self) -> list[Story]:
        return [story for step in self.steps for story in step.stories]


@dataclass
class StoryMap:
    title: str
    product: str | None = None
    #: Where tickets are raised. **Left out when it is simply the product
    #: shortname**, which is the common case.
    space: str | None = None
    deliveries: list[Delivery] = field(default_factory=list)
    activities: list[Activity] = field(default_factory=list)
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
    def steps(self) -> list[Step]:
        return [step for activity in self.activities for step in activity.steps]

    @property
    def stories(self) -> list[Story]:
        return [story for step in self.steps for story in step.stories]

    def stories_in(self, delivery: str) -> list[Story]:
        return [story for story in self.stories if story.delivery == delivery]

    @property
    def unscheduled(self) -> list[Story]:
        """The stories below the line.

        Not a backlog to be tidied away: they are the map saying what the plan
        currently leaves out, and that is worth reading before anybody adds
        another sprint.
        """
        return [story for story in self.stories if not story.scheduled]

    @property
    def personas(self) -> list[str]:
        """Every persona named anywhere, in first-appearance order."""
        seen: list[str] = []
        for activity in self.activities:
            for persona in activity.personas:
                if persona not in seen:
                    seen.append(persona)
        return seen
