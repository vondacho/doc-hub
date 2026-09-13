"""
The `.storymap` parser - recursive descent, then one resolution pass.

The grammar is LL(1) - one token of lookahead - which is possible because every
user-supplied name is a quoted string and can therefore never collide with a
keyword.

Parsing is two-phase. Everything is read into raw nodes carrying the position a
reference was written at, and the references are resolved once the whole file
has been read: `@"Sprint 24"` may name a band declared further down, and
`as "Business analyst"` may name a persona listed after the story that reads
it. Resolving as you go would make the file's order load-bearing for no reason
anybody asked for.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from ..lexer import AT, EOF, HASH, IDENT, KEYWORD, PLUS, STRING, TILDE, Token, describe, tokenize
from ..parsing import Once, Reader, article, collapse, parse_once
from ..problems import Problem, StoryMapParseError, report
from ..prose import near_miss, quote_list
from .model import (
    DELIVERY_KINDS,
    STORY_STATUSES,
    Activity,
    Delivery,
    Step,
    Story,
    StoryMap,
    is_delivery_kind,
    is_story_status,
)

#: The words that are keywords rather than identifiers in a `.storymap` file.
STORYMAP_KEYWORDS: Final[frozenset[str]] = frozenset(
    {
        "storymap",
        "product",
        "space",
        "persona",
        "as",
        "want",
        "so",
        # The time axis. `delivery` declares a band and `sprint`/`release` say
        # which kind it is - the same three words doc-em uses, so a band means
        # the same thing on both boards.
        "delivery",
        "sprint",
        "release",
        "activity",
        "step",
        "story",
        "note",
    }
)

_NOTE_EXAMPLE = 'note "Domain comes from the registry entry."'
_STATUS_LIST = ", ".join(f"~{status}" for status in STORY_STATUSES)


@dataclass
class _Ref:
    """A reference as written, kept with its position for phase two."""

    name: str
    line: int
    column: int
    length: int


def parse(source: str) -> StoryMap:
    """Read a story map.

    Raises `StoryMapParseError` carrying every problem found, not just the
    first.
    """
    story_map, problems = parse_collecting(source)
    if problems:
        raise StoryMapParseError(problems)
    return story_map


def parse_collecting(source: str) -> tuple[StoryMap, list[Problem]]:
    """Read a story map, returning whatever could be read and every problem."""
    problems: list[Problem] = []
    tokens = tokenize(
        source,
        problems,
        STORYMAP_KEYWORDS,
        noun="story map",
        example='activity "Discover documentation"',
    )
    reader = _StoryMapReader(tokens, problems, source)
    return reader.parse_file(), problems


class _Annotations:
    """What follows a card's title, in any order.

    Four annotations, and **a repeat of any of the first three is an error
    rather than last-one-wins**, because a repeat means a bad merge.
    """

    def __init__(self) -> None:
        self.delivery: _Ref | None = None
        self.ticket: str | None = None
        self.status: str | None = None
        self.tags: list[str] = []


class _StoryMapReader(Reader):
    def __init__(self, tokens: list[Token], problems: list[Problem], source: str) -> None:
        super().__init__(tokens=tokens, problems=problems, source=source, root="storymap")
        #: Every `@` written anywhere, resolved in phase two.
        self.delivery_refs: list[_Ref] = []
        #: Where each story's `as` was written, keyed by the story's identity.
        #: Carried separately from the node because the model is the document
        #: and a position is not part of it - but the message has to point at
        #: the `as` line rather than at the story's own.
        self.persona_refs: dict[int, _Ref] = {}

    # -- annotations --------------------------------------------------------

    def parse_annotations(self, noun: str, *, allow_delivery: bool) -> _Annotations:
        found = _Annotations()

        while self.at(AT) or self.at(HASH) or self.at(TILDE) or self.at(PLUS):
            if self.parse_tag(found.tags, noun):
                continue
            sigil = self.advance()

            if sigil.kind == AT:
                if not allow_delivery:
                    # An activity and a step span every band, so *when* the work
                    # happens is settled one level down. Putting a band on
                    # either is refused with that reason.
                    named = article(noun)
                    self.problem_at(
                        sigil,
                        f"{named[0].upper()}{named[1:]} is not in a delivery.",
                        "It spans every band; put the `@delivery` on its stories.",
                        code="sm-delivery-on-wrong-card",
                    )
                    if self.at(IDENT) or self.at(STRING):
                        self.advance()
                    continue
                if not self.at(IDENT) and not self.at(STRING):
                    self.problem_at(
                        sigil,
                        f"Expected a delivery name after `@`, found {describe(self.peek())}.",
                        'Write @MVP, or @"Q3 2026" when the name has spaces in it.',
                        code="expected-delivery",
                    )
                    continue
                name = self.advance()
                if found.delivery is not None:
                    self.problem_at(
                        sigil,
                        "This card names two deliveries.",
                        "A story sits in one band.",
                        code="sm-two-deliveries",
                    )
                    continue
                ref = _Ref(
                    name.value, sigil.line, sigil.column, sigil.length + name.length
                )
                found.delivery = ref
                self.delivery_refs.append(ref)
                continue

            if sigil.kind == HASH:
                if not self.at(IDENT) and not self.at(STRING):
                    self.problem_at(
                        sigil,
                        f"Expected a ticket id after `#`, found {describe(self.peek())}.",
                        "Write the id the ticketing system issued: #CLONB-42",
                        code="expected-ticket",
                    )
                    continue
                token = self.advance()
                if found.ticket is not None:
                    self.problem_at(
                        sigil,
                        "This card names two tickets.",
                        "A card links to one ticket.",
                        code="sm-two-tickets",
                    )
                    continue
                found.ticket = token.value
                continue

            # `~status`
            if not self.at(IDENT):
                self.problem_at(
                    sigil,
                    f"Expected a status after `~`, found {describe(self.peek())}.",
                    f"One of: {_STATUS_LIST}",
                    code="expected-status",
                )
                continue
            word = self.advance()
            if found.status is not None:
                self.problem_at(
                    sigil,
                    "This card names two statuses.",
                    "A card is in one state.",
                    code="sm-two-statuses",
                )
                continue
            if not is_story_status(word.value):
                self.problem_at(
                    word,
                    f"`{word.value}` is not a status.",
                    f"One of: {_STATUS_LIST}",
                    code="unknown-status",
                )
                continue
            found.status = word.value

        return found

    # -- the three cards ----------------------------------------------------

    def parse_story(self, stories: list[Story]) -> bool:
        if not self.at(KEYWORD, "story"):
            return False
        keyword = self.advance()
        title = self.expect_string("story", 'A story is quoted: story "Full-text search" @MVP')
        if title is None:
            self.synchronize()
            return True

        found = self.parse_annotations("story", allow_delivery=True)
        story = Story(
            title=title.value,
            delivery=found.delivery.name if found.delivery else None,
            ticket=found.ticket,
            status=found.status or "open",
            tags=found.tags,
            line=keyword.line,
            col=keyword.column,
            width=keyword.length,
        )
        def body() -> bool:
            if self.at(KEYWORD, "as"):
                word = self.advance()
                name = self.expect_string(
                    "as", 'A persona is quoted, and must be declared: as "Business analyst"'
                )
                if name is None:
                    self.synchronize()
                    return True
                if story.persona is not None:
                    # A story names **one** persona; a second is an error.
                    self.problem_at(
                        word,
                        "This story names two personas.",
                        "A story is written for one.",
                        code="sm-two-personas",
                    )
                    return True
                story.persona = name.value
                self.persona_refs[id(story)] = _Ref(
                    name.value, word.line, word.column, word.length
                )
                return True

            # `want` and `so` are the story's own words. Each is one clause of
            # one sentence and is collapsed to a single line whatever
            # whitespace it contains.
            for keyword_name, field_name, hint in (
                (
                    "want",
                    "want",
                    'What the persona wants, quoted: want "to search every product at once"',
                ),
                ("so", "so_that", 'The outcome, quoted: so "I can answer a question quickly"'),
            ):
                if self.at(KEYWORD, keyword_name):
                    word = self.advance()
                    value = self.expect_string(keyword_name, hint)
                    if value is None:
                        self.synchronize()
                        return True
                    if getattr(story, field_name) is not None:
                        self.problem_at(
                            word,
                            f"This story states `{keyword_name}` twice.",
                            "A story is written for one person, wanting one thing, "
                            "for one reason.",
                            code=f"sm-two-{keyword_name}",
                        )
                        return True
                    setattr(story, field_name, collapse(value.value))
                    return True

            return self.parse_note(story.notes, _NOTE_EXAMPLE)

        self.parse_body("story", body)
        stories.append(story)
        return True

    def parse_step(self, steps: list[Step]) -> bool:
        if not self.at(KEYWORD, "step"):
            return False
        keyword = self.advance()
        title = self.expect_string("step", 'A step is quoted: step "Search the catalog"')
        if title is None:
            self.synchronize()
            return True

        found = self.parse_annotations("step", allow_delivery=False)
        step = Step(
            title=title.value,
            ticket=found.ticket,
            status=found.status or "open",
            tags=found.tags,
            line=keyword.line,
            col=keyword.column,
            width=keyword.length,
        )
        # **Empty cards are real.** A step with no stories keeps its place; it
        # is an ordinary state mid-workshop.
        self.parse_body(
            "step",
            lambda: self.parse_story(step.stories) or self.parse_note(step.notes, _NOTE_EXAMPLE),
        )
        steps.append(step)
        return True

    def parse_activity(self, activities: list[Activity]) -> bool:
        if not self.at(KEYWORD, "activity"):
            return False
        keyword = self.advance()
        title = self.expect_string(
            "activity", 'An activity is quoted: activity "Discover documentation"'
        )
        if title is None:
            self.synchronize()
            return True

        found = self.parse_annotations("activity", allow_delivery=False)
        activity = Activity(
            title=title.value,
            ticket=found.ticket,
            status=found.status or "open",
            tags=found.tags,
            line=keyword.line,
            col=keyword.column,
            width=keyword.length,
        )

        def body() -> bool:
            if self.at(KEYWORD, "persona"):
                word = self.advance()
                name = self.expect_string("persona", 'A persona is quoted: persona "Business analyst"')
                if name is None:
                    self.synchronize()
                    return True
                if name.value in activity.personas:
                    # A title is the key a story's `as` resolves against, so it
                    # has to name one thing. A repeat means a bad merge.
                    self.problem_at(
                        word,
                        f'This activity lists the persona "{name.value}" twice.',
                        code="sm-duplicate-persona",
                    )
                    return True
                activity.personas.append(name.value)
                return True
            return self.parse_step(activity.steps) or self.parse_note(
                activity.notes, _NOTE_EXAMPLE
            )

        self.parse_body("activity", body)
        activities.append(activity)
        return True

    # -- the timeline -------------------------------------------------------

    def parse_delivery(self, deliveries: list[Delivery]) -> bool:
        """`delivery "Sprint 24" sprint [#ticket]` - one band of the timeline.

        `release "MVP"` is the older spelling and still parses, meaning
        `delivery "MVP" release`. Refusing it would mean a tool upgrade
        silently broke files the tool itself wrote, which is the one thing a
        format that promises a round trip must not do. Nothing writes it any
        more, so it is a migration path rather than a dialect the format keeps.
        """
        legacy = self.at(KEYWORD, "release")
        if not legacy and not self.at(KEYWORD, "delivery"):
            return False
        keyword = self.advance()
        title = self.expect_string(
            "release" if legacy else "delivery",
            'A release is quoted: release "MVP"'
            if legacy
            else 'A delivery is quoted: delivery "Sprint 24" sprint',
        )
        if title is None:
            self.synchronize()
            return True

        # The old spelling names its own kind, so it takes no kind word. The new
        # one requires it: a defaulted kind would make the meaning of a bare
        # `delivery` line depend on a choice made months ago.
        kind = "release"
        if not legacy:
            if not self.at(KEYWORD) or not is_delivery_kind(self.peek().value):
                self.problem_at(
                    self.peek(),
                    f"Expected {' or '.join(DELIVERY_KINDS)} after the delivery's name, "
                    f"found {describe(self.peek())}.",
                    'A delivery says which it is: delivery "1.0" release',
                    code="expected-delivery-kind",
                )
            else:
                kind = self.advance().value

        # `#ticket`, on either spelling. A band takes no `~status` - where a
        # sprint is in its own lifecycle is the tracker's business - and no `@`,
        # because a delivery is a point on the timeline rather than a thing
        # placed on one.
        ticket: str | None = None
        while self.at(HASH):
            sigil = self.advance()
            if not self.at(IDENT) and not self.at(STRING):
                self.problem_at(
                    sigil,
                    f"Expected a ticket id after `#`, found {describe(self.peek())}.",
                    "Write the id the ticketing system issued: #CLONB-S24",
                    code="expected-ticket",
                )
                continue
            token = self.advance()
            if ticket is not None:
                self.problem_at(
                    sigil,
                    "This delivery names two tickets.",
                    "A delivery links to one ticket.",
                    code="sm-two-tickets",
                )
                continue
            ticket = token.value

        delivery = Delivery(
            title=title.value,
            kind=kind,
            ticket=ticket,
            line=keyword.line,
            col=keyword.column,
            width=keyword.length,
            legacy=legacy,
        )
        self.parse_body(
            "release" if legacy else "delivery",
            lambda: self.parse_note(delivery.notes, _NOTE_EXAMPLE),
        )
        deliveries.append(delivery)
        return True

    # -- the file -----------------------------------------------------------

    def parse_file(self) -> StoryMap:
        self.skip_to_root('A file holds one story map: storymap "Its title" { ... }')

        if self.at(EOF):
            # Distinguish "nothing here" from "something here that is not a
            # map". They are different claims and they need different fixes.
            if not self.problems:
                self.problem_at(
                    self.peek(),
                    "The file is empty.",
                    'A story map starts with: storymap "Its title" { ... }',
                    code="empty-file",
                )
            return StoryMap(title="Untitled story map")

        keyword = self.advance()
        story_map = StoryMap(
            title="Untitled story map", line=keyword.line, col=keyword.column, width=keyword.length
        )
        parsed = self.expect_string(
            "storymap", 'The map is titled: storymap "Doc-Hub Onboarding"'
        )
        if parsed is not None:
            story_map.title = parsed.value

        product = Once()
        space = Once()

        self.parse_body(
            "storymap",
            lambda: parse_once(
                self,
                "product",
                product,
                'A product is its shortname, quoted: product "client-onboarding"',
                "The product is declared twice. A story map is about one product.",
                "product-twice",
            )
            or parse_once(
                self,
                "space",
                space,
                'A ticketing space is quoted: space "CLONB"',
                "The ticketing space is declared twice. A ticket is raised into one space.",
                "space-twice",
            )
            or self.parse_delivery(story_map.deliveries)
            or self.parse_activity(story_map.activities)
            or self.parse_note(story_map.notes, _NOTE_EXAMPLE),
        )

        self.trailing_junk("story map")

        story_map.product = product.value
        story_map.space = space.value
        self._resolve(story_map)
        return story_map

    # -- phase two ----------------------------------------------------------

    def _resolve(self, story_map: StoryMap) -> None:
        """The checks that need the whole file: duplicate bands, dangling
        references, personas scoped to their own activity."""
        declared: dict[str, Delivery] = {}
        for delivery in list(story_map.deliveries):
            first = declared.get(delivery.title)
            if first is not None:
                # **Band titles must be unique.** A story refers to a band by
                # title, which is what keeps card identifiers out of the file
                # entirely - so the two decisions stand or fall together.
                report(
                    self.problems,
                    Problem(
                        message=f'The delivery "{delivery.title}" is declared twice.',
                        line=delivery.line,
                        column=delivery.col,
                        length=delivery.width,
                        hint=f"Already declared on line {first.line}. A story refers to "
                        "a delivery by its title, so the titles have to differ.",
                        code="sm-duplicate-delivery",
                    ),
                )
                story_map.deliveries.remove(delivery)
                continue
            declared[delivery.title] = delivery

        # An `@` naming a band that was never declared is a hard error, not a
        # silent demotion to unscheduled. The author plainly meant to commit the
        # story to something; dropping that quietly would lose the intent and
        # lose it invisibly, which is the worst combination.
        for ref in self.delivery_refs:
            if ref.name in declared:
                continue
            near = near_miss(ref.name, declared)
            report(
                self.problems,
                Problem(
                    message=f'No delivery is called "{ref.name}".',
                    line=ref.line,
                    column=ref.column,
                    length=ref.length,
                    hint=f'Did you mean "{near}"? Delivery names are case-sensitive.'
                    if near
                    else (
                        'Declare it first: delivery "Sprint 24" sprint'
                        if not declared
                        else f"Declared: {quote_list(declared)}."
                    ),
                    code="sm-unknown-delivery",
                ),
            )

        for story in story_map.stories:
            if story.delivery is not None and story.delivery not in declared:
                story.delivery = None

        # A story may name a persona **its own activity** lists, and no other.
        # Scoped to the activity because that is where the cast is declared;
        # resolving against every persona on the board would let a story quietly
        # belong to an activity that never mentioned its reader, which is
        # exactly the disagreement the listing exists to surface.
        refs = self.persona_refs
        for activity in story_map.activities:
            for story in activity.stories:
                if story.persona is None or story.persona in activity.personas:
                    continue
                ref = refs.get(id(story))
                near = near_miss(story.persona, activity.personas)
                report(
                    self.problems,
                    Problem(
                        message=f'The activity "{activity.title}" does not list a '
                        f'persona called "{story.persona}".',
                        line=ref.line if ref else story.line,
                        column=ref.column if ref else story.col,
                        length=ref.length if ref else 0,
                        hint=(
                            f'This activity lists no personas. Add one to it: '
                            f'persona "{story.persona}"'
                            if not activity.personas
                            else f'Did you mean "{near}"? Persona names are case-sensitive.'
                            if near
                            else f"It lists: {quote_list(activity.personas)}."
                        ),
                        code="sm-unknown-persona",
                    ),
                )
                story.persona = None
