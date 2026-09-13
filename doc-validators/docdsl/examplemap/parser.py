"""
The `.examplemap` parser - recursive descent, then the whole-file checks.

Parsing is two-phase: everything is read, then the checks that need the whole
file run - duplicate band titles, and `@` references that name no declared
delivery. That is what lets a `delivery` be declared after the example that
ships in it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from ..lexer import AT, EOF, HASH, IDENT, KEYWORD, PLUS, STRING, TILDE, Token, describe, is_ordinal, tokenize
from ..parsing import Once, Reader, collapse, parse_once
from ..problems import ExampleMapParseError, Problem, report
from ..prose import near_miss, quote_list
from .model import (
    DELIVERY_KINDS,
    STATUSES,
    STEP_CLAUSES,
    Delivery,
    Example,
    ExampleMap,
    Question,
    Rule,
    Story,
    is_delivery_kind,
    is_status,
)

#: The words that are keywords rather than identifiers in an `.examplemap` file.
EXAMPLEMAP_KEYWORDS: Final[frozenset[str]] = frozenset(
    {
        "examplemap",
        "product",
        "space",
        # The time axis. `sprint` and `release` are keywords rather than free
        # text so a typo is caught where it is written instead of becoming a
        # third kind nobody notices.
        "delivery",
        "sprint",
        "release",
        # How big a band is. A keyword rather than a fourth sigil: `#`, `~` and
        # `@` are taken, and `points 13` reads as what it is.
        "points",
        "story",
        "as",
        "want",
        "so",
        "rule",
        "example",
        "question",
        "note",
        # The three Gherkin clauses. Each may be repeated inside one example;
        # there is deliberately no `and`, because `And` is how a repeat is
        # *printed*, not a fourth kind of step.
        "given",
        "when",
        "then",
    }
)

_NOTE_EXAMPLE = 'note "The finance team asked for this in writing."'
_STATUS_LIST = ", ".join(f"~{status}" for status in STATUSES)

_STEP_EXAMPLE: Final[dict[str, str]] = {
    "given": "a voucher SUMMER10 that expired on 2026-08-21",
    "when": "the voucher is applied",
    "then": "the voucher is refused",
}


@dataclass
class _Ref:
    """An `@` as written, kept with its position for phase two."""

    name: str
    line: int
    column: int
    length: int
    #: What the reference was for, so the message can say "but this example
    #: ships in a delivery".
    what: str


def parse(source: str) -> ExampleMap:
    """Read an example map.

    Raises `ExampleMapParseError` carrying every problem found, not just the
    first.
    """
    example_map, problems = parse_collecting(source)
    if problems:
        raise ExampleMapParseError(problems)
    return example_map


def parse_collecting(source: str) -> tuple[ExampleMap, list[Problem]]:
    """Read an example map, returning whatever could be read and every problem."""
    problems: list[Problem] = []
    tokens = tokenize(
        source,
        problems,
        EXAMPLEMAP_KEYWORDS,
        noun="example map",
        example='rule "A voucher must not be expired"',
    )
    return _ExampleMapReader(tokens, problems, source).parse_file(), problems


class _ExampleMapReader(Reader):
    def __init__(self, tokens: list[Token], problems: list[Problem], source: str) -> None:
        super().__init__(tokens=tokens, problems=problems, source=source, root="examplemap")
        self.refs: list[_Ref] = []
        self.deliveries: list[tuple[Delivery, Token]] = []

    # -- references ---------------------------------------------------------

    def parse_reference(self, sigil: Token, owner: str) -> str | None:
        """One `@delivery` reference: the name, recorded for phase 2 to check.

        Returns `None` when there was nothing usable after the sigil, and the
        caller carries on: a card with a malformed reference is still a card,
        and the rest of it is still worth reading.
        """
        if not self.at(IDENT) and not self.at(STRING):
            self.problem_at(
                sigil,
                f"Expected a delivery name after `@`, found {describe(self.peek())}.",
                'Write @Sprint1, or @"Sprint 24" when the name has spaces in it.',
                code="expected-delivery",
            )
            return None
        name = self.advance()
        self.refs.append(
            _Ref(
                name.value,
                sigil.line,
                sigil.column,
                sigil.length + name.length,
                f"{owner} ships in it",
            )
        )
        return name.value

    # -- the four cards -----------------------------------------------------

    def parse_question(self, questions: list[Question]) -> bool:
        if not self.at(KEYWORD, "question"):
            return False
        keyword = self.advance()
        title = self.expect_string(
            "question",
            'A question is quoted: question "Is the expiry checked at apply or at pay?"',
        )
        if title is None:
            self.synchronize()
            return True
        question = Question(
            title=title.value,
            tags=self.parse_tags("question"),
            line=keyword.line,
            col=keyword.column,
            width=keyword.length,
        )
        self.parse_body("question", lambda: self.parse_note(question.notes, _NOTE_EXAMPLE))
        questions.append(question)
        return True

    def parse_step(self, example: Example) -> bool:
        """`given "..."`, `when "..."`, `then "..."` - each repeatable.

        Repetition is the whole notation: a second `given` is what Gherkin
        prints as `And`. The file says which clause each line belongs to, so
        the lines can be written in any order without changing meaning.
        """
        clause = next(
            (candidate for candidate in STEP_CLAUSES if self.at(KEYWORD, candidate)), None
        )
        if clause is None:
            return False
        self.advance()
        text = self.expect_string(clause, f'A step is quoted: {clause} "{_STEP_EXAMPLE[clause]}"')
        if text is None:
            self.synchronize()
            return True
        # A step is one line of a scenario, so its own breaks are not
        # meaningful; collapse them rather than writing a Gherkin file that
        # will not parse.
        getattr(example, clause).append(collapse(text.value))
        return True

    def parse_example(self, examples: list[Example]) -> bool:
        if not self.at(KEYWORD, "example"):
            return False
        keyword = self.advance()
        title = self.expect_string(
            "example",
            'An example is quoted, with real values: '
            'example "A voucher that expired yesterday is refused"',
        )
        if title is None:
            self.synchronize()
            return True

        example = Example(title=title.value, line=keyword.line, col=keyword.column, width=keyword.length)
        # `@delivery` is the only annotation an example takes. It carries no
        # ticket and no status: an example is not a thing the tracker knows
        # about, it is what makes the story true.
        while self.at(AT) or self.at(PLUS):
            if self.parse_tag(example.tags, "example"):
                continue
            sigil = self.advance()
            name = self.parse_reference(sigil, "this example")
            if name is None:
                continue
            if example.delivery is not None:
                self.problem_at(
                    sigil,
                    "This example names two deliveries.",
                    "An example ships once.",
                    code="em-two-deliveries",
                )
                continue
            example.delivery = name

        # **An example may be a title alone.** Steps are optional: a session
        # that produced ten example titles and no steps did example mapping
        # correctly.
        self.parse_body(
            "example",
            lambda: self.parse_step(example) or self.parse_note(example.notes, _NOTE_EXAMPLE),
        )
        examples.append(example)
        return True

    def parse_rule(self, rules: list[Rule]) -> bool:
        if not self.at(KEYWORD, "rule"):
            return False
        keyword = self.advance()
        title = self.expect_string("rule", 'A rule is quoted: rule "A voucher must not be expired"')
        if title is None:
            self.synchronize()
            return True
        rule = Rule(
            title=title.value,
            tags=self.parse_tags("rule"),
            line=keyword.line,
            col=keyword.column,
            width=keyword.length,
        )
        self.parse_body(
            "rule",
            lambda: self.parse_example(rule.examples)
            or self.parse_question(rule.questions)
            or self.parse_note(rule.notes, _NOTE_EXAMPLE),
        )
        rules.append(rule)
        return True

    def parse_story(self, state: _StoryState) -> bool:
        if not self.at(KEYWORD, "story"):
            return False
        keyword = self.advance()
        title = self.expect_string("story", 'A story is quoted: story "Redeem a voucher"')
        if title is None:
            self.synchronize()
            return True

        story = Story(title=title.value, line=keyword.line, col=keyword.column, width=keyword.length)
        # A story's status defaults to `open` and `open` is also a word somebody
        # may write, so "has a status already" cannot be read off the value.
        status_written = False
        while self.at(AT) or self.at(HASH) or self.at(TILDE) or self.at(PLUS):
            if self.parse_tag(story.tags, "story"):
                continue
            sigil = self.advance()

            if sigil.kind == AT:
                name = self.parse_reference(sigil, "this story")
                if name is None:
                    continue
                if story.delivery is not None:
                    self.problem_at(
                        sigil,
                        "This story names two deliveries.",
                        "A story ships once.",
                        code="em-two-deliveries",
                    )
                    continue
                story.delivery = name
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
                if story.ticket is not None:
                    self.problem_at(
                        sigil,
                        "This story names two tickets.",
                        "A story links to one ticket.",
                        code="em-two-tickets",
                    )
                    continue
                story.ticket = token.value
                continue

            if not self.at(IDENT):
                self.problem_at(
                    sigil,
                    f"Expected a status after `~`, found {describe(self.peek())}.",
                    f"One of: {_STATUS_LIST}",
                    code="expected-status",
                )
                continue
            word = self.advance()
            if status_written:
                self.problem_at(
                    sigil,
                    "This story names two statuses.",
                    "A story is in one state.",
                    code="em-two-statuses",
                )
                continue
            if not is_status(word.value):
                self.problem_at(
                    word,
                    f"`{word.value}` is not a status.",
                    f"One of: {_STATUS_LIST}",
                    code="unknown-status",
                )
                continue
            story.status = word.value
            status_written = True

        seen: set[str] = set()

        def body() -> bool:
            # The story states its need, in the formal story language. Three
            # fields rather than prose in a note: the title says what to build
            # and the need says why anyone should.
            for word, field_name, hint in (
                ("as", "persona", 'Who it is for, quoted: as "Returning customer"'),
                ("want", "want", 'What they want, quoted: want "to redeem a voucher at checkout"'),
                ("so", "so_that", 'The outcome, quoted: so "the discount comes off the basket"'),
            ):
                if not self.at(KEYWORD, word):
                    continue
                keyword_token = self.advance()
                value = self.expect_string(word, hint)
                if value is None:
                    self.synchronize()
                    return True
                if word in seen:
                    # A repeat is an error rather than a last-one-wins. A story
                    # written for two personas is two stories, and a session
                    # that produced one has found something worth stopping for.
                    self.problem_at(
                        keyword_token,
                        f"This story states `{word}` twice.",
                        "A story is written for one person, wanting one thing, "
                        "for one reason.",
                        code=f"em-two-{word}",
                    )
                    return True
                seen.add(word)
                setattr(story, field_name, collapse(value.value))
                return True

            return self.parse_question(story.questions) or self.parse_note(
                story.notes, _NOTE_EXAMPLE
            )

        self.parse_body("story", body)

        if state.token is not None:
            # The practice takes one story. A second is an error rather than a
            # list: two stories on one map is two sessions, and merging them
            # would hide that.
            self.problem_at(
                keyword,
                "This map has two stories.",
                f"Already given on line {state.token.line}. Example mapping takes one "
                "story; a second is a second session.",
                code="em-two-stories",
            )
            return True
        state.value = story
        state.token = keyword
        return True

    # -- the timeline -------------------------------------------------------

    def parse_delivery(self) -> bool:
        """`delivery "Sprint 24" sprint #CLONB-S24 points 13`.

        The kind is **required** rather than defaulted: a defaulted kind would
        make the meaning of a bare `delivery` line depend on a choice made
        months ago. `#ticket` and `points N` may follow it in either order.
        """
        if not self.at(KEYWORD, "delivery"):
            return False
        keyword = self.advance()
        title = self.expect_string("delivery", 'A delivery is quoted: delivery "Sprint 1" sprint')
        if title is None:
            self.synchronize()
            return True

        kind = "sprint"
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

        delivery = Delivery(
            title=title.value, kind=kind, line=keyword.line, col=keyword.column, width=keyword.length
        )

        while self.at(HASH) or self.at(KEYWORD, "points"):
            if self.at(HASH):
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
                if delivery.ticket is not None:
                    self.problem_at(
                        sigil,
                        "This delivery names two tickets.",
                        "A delivery links to one ticket.",
                        code="em-two-tickets",
                    )
                    continue
                delivery.ticket = token.value
                continue

            word = self.advance()

            # A release is a date, and the work in it is the sprints leading
            # there. Sizing it would either double-count those or state a
            # competing number for the same work - so this is refused rather
            # than ignored.
            if kind != "sprint":
                self.problem_at(
                    word,
                    "Only a sprint is sized in story points.",
                    "A release is delivered by the sprints before it; size those instead.",
                    code="em-points-on-release",
                )
                if self.at(IDENT):
                    self.advance()
                continue

            if not is_ordinal(self.peek()):
                self.problem_at(
                    word,
                    f"Expected a whole number of story points, found {describe(self.peek())}.",
                    "Points are a non-negative whole number: points 13",
                    code="expected-points",
                )
                if self.at(IDENT) or self.at(STRING):
                    self.advance()
                continue

            ordinal = self.advance()
            if delivery.points is not None:
                self.problem_at(
                    word,
                    "This sprint is sized twice.",
                    "A sprint has one estimate.",
                    code="em-two-estimates",
                )
                continue
            delivery.points = int(ordinal.value)

        self.parse_body("delivery", lambda: self.parse_note(delivery.notes, _NOTE_EXAMPLE))
        self.deliveries.append((delivery, keyword))
        return True

    # -- the file -----------------------------------------------------------

    def parse_file(self) -> ExampleMap:
        self.skip_to_root('A file holds one example map: examplemap "Redeem a voucher" { ... }')

        if self.at(EOF):
            if not self.problems:
                self.problem_at(
                    self.peek(),
                    "The file is empty.",
                    'An example map starts with: examplemap "Its title" { ... }',
                    code="empty-file",
                )
            return ExampleMap(title="Untitled example map")

        keyword = self.advance()
        example_map = ExampleMap(
            title="Untitled example map", line=keyword.line, col=keyword.column, width=keyword.length
        )
        parsed = self.expect_string(
            "examplemap", 'The map is titled: examplemap "Redeem a voucher"'
        )
        if parsed is not None:
            example_map.title = parsed.value

        product = Once()
        space = Once()
        story = _StoryState()

        self.parse_body(
            "examplemap",
            lambda: parse_once(
                self,
                "product",
                product,
                'A product is its shortname, quoted: product "client-onboarding"',
                "The product is declared twice. An example map is about one product.",
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
            or self.parse_delivery()
            or self.parse_story(story)
            or self.parse_rule(example_map.rules)
            or self.parse_note(example_map.notes, _NOTE_EXAMPLE),
        )

        self.trailing_junk("example map")

        example_map.product = product.value
        example_map.space = space.value
        # A map with no `story` line is not an error: it is a session that has
        # not named its story yet, which is exactly what a fresh board is. It
        # stays absent rather than becoming a placeholder card nobody wrote.
        example_map.story = story.value
        example_map.deliveries = self._resolve()
        return example_map

    def _resolve(self) -> list[Delivery]:
        """The two checks that need the whole file: duplicate bands, dangling
        references.

        **Duplicate titles are an error**, and that decision is what licenses
        storing a reference as a title at all. If two bands could be called
        "Sprint 1" then `@"Sprint 1"` would not name one of them, and every
        reader would have to guess.
        """
        seen: dict[str, Token] = {}
        kept: list[Delivery] = []
        for delivery, token in self.deliveries:
            first = seen.get(delivery.title)
            if first is not None:
                self.problem_at(
                    token,
                    f"Two deliveries are called {delivery.title!r}.",
                    f"Already declared on line {first.line}. `@` names a delivery by "
                    "its title, so titles have to be unique.",
                    code="em-duplicate-delivery",
                )
                continue
            seen[delivery.title] = token
            kept.append(delivery)

        # **A reference to a delivery that was never declared is an error**
        # rather than a silent drop. Dropping it would quietly unschedule
        # somebody's work and the export would then make that permanent, which
        # is the one failure mode a round-tripping format must not have.
        for ref in self.refs:
            if ref.name in seen:
                continue
            near = near_miss(ref.name, seen)
            report(
                self.problems,
                Problem(
                    message=f"No delivery is called {ref.name!r}, but {ref.what}.",
                    line=ref.line,
                    column=ref.column,
                    length=ref.length,
                    hint=f'Did you mean "{near}"? Delivery names are case-sensitive.'
                    if near
                    else (
                        'Declare it first: delivery "Sprint 1" sprint'
                        if not seen
                        else f"Declared: {quote_list(seen)}."
                    ),
                    code="em-unknown-delivery",
                ),
            )
        return kept


@dataclass
class _StoryState:
    """The one story, and where it was written - so a second can say where the
    first was."""

    value: Story | None = None
    token: Token | None = None
