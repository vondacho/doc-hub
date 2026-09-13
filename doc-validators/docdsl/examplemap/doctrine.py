"""
Reading an example map - the doctrine, as checks.

Example mapping is Matt Wynne's. Everything in this module comes from
`doc-em/examplemap-doctrine.md`, and every reading here is a **warning or a
reading, never an error**.

The doctrine's central claim governs the module: **the red cards are the
output.** A session that produced no questions did not discover anything - it
either had nothing to discuss or, far more often, assumed its way past the
parts nobody actually agreed on. So an absent question is a warning here, and a
pile of them is a reading that says the story is not ready to estimate, which
is the single most useful thing this map does.

Four of the doctrine's instructions are about what *not* to do, and they are
honoured by omission rather than by a check:

  - **Do not answer the red cards.** No reading here proposes an answer to one.
  - **Do not invent examples to make a rule look covered.** Nothing here
    suggests an example to add; a rule with no examples is reported as one.
  - **Do not turn a question into a tag.** No reading suggests a `+`anything
    in place of a red card.
  - **Do not write Gherkin during the conversation.** Nothing here asks for
    steps on a card; an example that is a title alone is a reading, not a
    defect.
"""

from __future__ import annotations

from ..problems import Problem, Severity
from ..prose import count, is_concrete, is_denial, overlap, quote_list, verb
from .model import Example, ExampleMap, Question, Rule, Story

#: More rules than this and the story is too big.
TOO_MANY_RULES = 7

#: More examples under one rule than this and the rule is usually two rules
#: wearing one sentence.
CROWDED_RULE = 6

#: More questions than this and the map is saying "not ready to estimate".
MANY_QUESTIONS = 4

#: How much of an example's title may already be in its rule's before it is
#: the rule again rather than a case of it.
RESTATEMENT = 0.8

#: Few cards and a quick session means the story is ready. That is a real
#: finding, not a failure to find work.
READY_RULES = 4


def read(example_map: ExampleMap) -> list[Problem]:
    """Every doctrine reading of this map."""
    findings: list[Problem] = []
    findings += _shape(example_map)
    findings += _questions(example_map)
    findings += _rules(example_map)
    findings += _examples(example_map)
    findings += _timeline(example_map)
    findings += _need(example_map)
    findings += _gherkin(example_map)
    return findings


def _at(
    node: ExampleMap | Story | Rule | Example | Question,
    message: str,
    hint: str,
    code: str,
    severity: Severity,
) -> Problem:
    return Problem(
        message=message,
        line=node.line,
        column=node.col,
        length=node.width,
        hint=hint,
        severity=severity,
        code=code,
    )


# -- the shape of it --------------------------------------------------------


def _shape(example_map: ExampleMap) -> list[Problem]:
    findings: list[Problem] = []

    if example_map.story is None:
        findings.append(
            _at(
                example_map,
                "This map has not named its story.",
                "A session that has not named its story yet is a legal map - the board "
                'shows it as "To be defined". If naming it is hard, that is the first '
                "finding.",
                "em-no-story",
                Severity.INFO,
            )
        )

    findings.append(
        _at(
            example_map,
            f"{count(len(example_map.rules), 'rule')}, "
            f"{count(len(example_map.examples), 'example')}, "
            f"{count(len(example_map.questions), 'question')}.",
            "The vote is the output, not the cards. These counts are what the room "
            "votes on.",
            "em-shape",
            Severity.INFO,
        )
    )

    if (
        example_map.rules
        and not example_map.questions
        and len(example_map.rules) <= READY_RULES
        and all(rule.examples for rule in example_map.rules)
    ):
        findings.append(
            _at(
                example_map,
                "Few cards, every rule illustrated, and nothing left open.",
                "Few cards and a quick session means the story is ready. That is a "
                "real finding, not a failure to find work.",
                "em-reads-as-ready",
                Severity.INFO,
            )
        )
    return findings


# -- the red cards ----------------------------------------------------------


def _questions(example_map: ExampleMap) -> list[Problem]:
    """The red cards are the output.

    A session that produced no questions did not discover anything. Many
    questions means the story is **not ready to estimate**, and saying so is
    the single most useful thing this map does.
    """
    findings: list[Problem] = []
    questions = example_map.questions

    if not questions and example_map.rules:
        findings.append(
            _at(
                example_map,
                "This map has no questions on it.",
                "A session that produced no questions did not discover anything - it "
                "either had nothing to discuss or, far more often, assumed its way "
                "past the parts nobody actually agreed on.",
                "em-no-questions",
                Severity.WARNING,
            )
        )

    if len(questions) >= MANY_QUESTIONS:
        findings.append(
            _at(
                example_map,
                f"{count(len(questions), 'question')} "
                f"{verb(len(questions), 'is', 'are')} open.",
                "Many questions means the story is not ready to estimate, and saying "
                "so is the single most useful thing this map does. Every one is an "
                "assumption somebody would otherwise have made silently.",
                "em-not-ready-to-estimate",
                Severity.WARNING,
            )
        )

    for rule in example_map.rules:
        if len(rule.questions) >= 2 and not rule.examples:
            findings.append(
                _at(
                    rule,
                    f'The rule "{rule.title}" has '
                    f"{count(len(rule.questions), 'question')} and no examples.",
                    "Nobody has agreed what this rule means yet, and the open "
                    "questions say why. They are the room's to close, not this tool's.",
                    "em-rule-is-all-questions",
                    Severity.WARNING,
                )
            )
    return findings


# -- the blue cards ---------------------------------------------------------


def _rules(example_map: ExampleMap) -> list[Problem]:
    """A rule with no examples is a rule nobody understands yet. That is the
    first thing to look for, every time.

    Many rules means the story is **too big**, and the rules are where to split
    it. Many examples under one rule usually means the rule is two rules
    wearing one sentence.
    """
    findings: list[Problem] = []

    for rule in example_map.rules:
        if not rule.examples:
            findings.append(
                _at(
                    rule,
                    f'The rule "{rule.title}" has no examples.',
                    "A rule with no examples is a rule nobody understands yet. It is "
                    "also the one card that contributes nothing to the feature file: "
                    "what a runner executes is the examples.",
                    "em-rule-without-examples",
                    Severity.WARNING,
                )
            )
        elif len(rule.examples) >= CROWDED_RULE:
            findings.append(
                _at(
                    rule,
                    f'The rule "{rule.title}" holds '
                    f"{count(len(rule.examples), 'example')}.",
                    "Many examples under one rule usually means the rule is two rules "
                    "wearing one sentence. Read them and see where they split.",
                    "em-crowded-rule",
                    Severity.WARNING,
                )
            )

    if len(example_map.rules) >= TOO_MANY_RULES:
        findings.append(
            _at(
                example_map,
                f"This map has {count(len(example_map.rules), 'rule')}.",
                "Many rules means the story is too big, and the rules are where to "
                "split it.",
                "em-story-too-big",
                Severity.WARNING,
            )
        )
    return findings


# -- the green cards --------------------------------------------------------


def _examples(example_map: ExampleMap) -> list[Problem]:
    """An example is a **single concrete case**, not a restatement of its rule.

    "A voucher that expired yesterday is refused" is an example; "expired
    vouchers are refused" is the rule again. Numbers, dates and names are what
    make a `given` testable.
    """
    findings: list[Problem] = []

    for rule in example_map.rules:
        for example in rule.examples:
            if overlap(example.title, rule.title) >= RESTATEMENT:
                findings.append(
                    _at(
                        example,
                        f'The example "{example.title}" restates its rule.',
                        f'The rule says "{rule.title}". An example is a single '
                        "concrete case of it - real numbers, real dates, real names. "
                        "A restatement makes an unexamined rule look examined.",
                        "em-example-restates-rule",
                        Severity.WARNING,
                    )
                )
                continue

            if not example.has_steps:
                findings.append(
                    _at(
                        example,
                        f'The example "{example.title}" is a title alone.',
                        "Steps are optional, and a session that produced ten titles "
                        "and no steps did example mapping correctly. Worth knowing "
                        "because its scenario will pass without asserting anything.",
                        "em-example-without-steps",
                        Severity.INFO,
                    )
                )
                continue

            if not any(is_concrete(text) for _, text in example.steps):
                findings.append(
                    _at(
                        example,
                        f'No step of "{example.title}" carries a number, date or name.',
                        "Numbers, dates and names are what make a `given` testable. "
                        "Two people who agree on a rule often disagree on an example "
                        "of it, and that only surfaces once the example is concrete.",
                        "em-example-not-concrete",
                        Severity.WARNING,
                    )
                )

            if example.then and all(is_denial(text) for text in example.then):
                findings.append(
                    _at(
                        example,
                        f'Every `then` in "{example.title}" says a thing did not happen.',
                        "A `then` that says a thing did not happen, with no `then` "
                        "saying what did, usually hides the case that actually "
                        "matters. What does the customer see instead?",
                        "em-only-denials",
                        Severity.WARNING,
                    )
                )

            if not example.when:
                findings.append(
                    _at(
                        example,
                        f'The example "{example.title}" has no `when`.',
                        "When is the one action. Given establishes context and Then is "
                        "what must hold afterwards - without the action between them "
                        "the scenario has no trigger.",
                        "em-no-when",
                        Severity.INFO,
                    )
                )
    return findings


# -- the time axis ----------------------------------------------------------


def _timeline(example_map: ExampleMap) -> list[Problem]:
    """**A late example is only a warning.**

    An example scheduled *after* the story ships still parses - you move the
    release first and the examples after, and a parser that refused that
    intermediate state would make replanning impossible in the tool that exists
    to plan.
    """
    findings: list[Problem] = []
    story = example_map.story
    if story is None or story.delivery is None:
        return findings

    ships = example_map.index_of(story.delivery)
    if ships is None:
        return findings

    for example in example_map.examples:
        at = example_map.index_of(example.delivery)
        if at is None or at <= ships:
            continue
        findings.append(
            _at(
                example,
                f'The example "{example.title}" ships in "{example.delivery}", after '
                f'the story ships in "{story.delivery}".',
                "Declaration order is timeline order. This is an ordinary intermediate "
                "state while replanning - move the release first and the examples "
                "after - so it is a reading rather than an error.",
                "em-late-example",
                Severity.WARNING,
            )
        )

    sized = [band for band in example_map.deliveries if band.points is not None]
    if sized:
        findings.append(
            _at(
                example_map,
                f"{count(len(sized), 'sprint')} "
                f"{verb(len(sized), 'is', 'are')} sized: "
                + ", ".join(f'"{band.title}" {band.points}' for band in sized)
                + ".",
                "Only a sprint is sized, and empty is not zero: 0 says the sprint "
                "carries no estimable work, and leaving it out says nobody has sized "
                "it.",
                "em-points",
                Severity.INFO,
            )
        )
    return findings


# -- the yellow card -------------------------------------------------------


def _need(example_map: ExampleMap) -> list[Problem]:
    """The `so` clause is the half that gets dropped first and missed most, and
    a session spends its whole length interrogating that sentence."""
    findings: list[Problem] = []
    story = example_map.story
    if story is None:
        return findings

    if story.want and story.so_that and overlap(story.so_that, story.want) >= RESTATEMENT:
        findings.append(
            _at(
                story,
                "The story's `so` restates its `want`.",
                "The title says what to build and the need says why anyone should. "
                "A `so` that repeats the `want` has not said why.",
                "em-so-restates-want",
                Severity.WARNING,
            )
        )
    elif story.title and not (story.persona or story.want or story.so_that):
        findings.append(
            _at(
                story,
                "The story states no need.",
                "All three of `as`, `want` and `so` are optional and independently "
                "so. Worth knowing, because the `so` clause is what a session spends "
                "its whole length interrogating.",
                "em-no-need",
                Severity.INFO,
            )
        )
    return findings


# -- what crosses into the feature file ------------------------------------


def _gherkin(example_map: ExampleMap) -> list[Problem]:
    """Where this becomes a feature file, and what does not survive the trip.

    **The questions have no Gherkin.** An open question is not a specification,
    so the feature file is quietly missing every red card on the map. That is
    not a bug in the generator - it is the reason the map is the document and
    the feature file is an output of it. So the `.examplemap` is the artefact to
    keep under version control, and the `.feature` is regenerated.
    """
    findings: list[Problem] = []
    questions = example_map.questions
    if not questions:
        return findings

    missing = len(questions)
    findings.append(
        _at(
            example_map,
            f"{count(missing, 'question')} will not appear in the generated "
            "feature file.",
            "An open question is not a specification, so it cannot be written as one. "
            "Keep the `.examplemap` under version control and regenerate the "
            "`.feature` - the map is the document, and the feature file is an output "
            "of it.",
            "em-questions-do-not-cross",
            Severity.INFO,
        )
    )

    orphan = [rule.title for rule in example_map.rules if not rule.examples]
    if orphan:
        findings.append(
            _at(
                example_map,
                f"{count(len(orphan), 'rule')} "
                f"{verb(len(orphan), 'contributes', 'contribute')} nothing to the "
                f"feature file: {quote_list(orphan)}.",
                "What a runner executes is the examples. The generator says so in a "
                "comment rather than omitting the rule, which is the same finding "
                "arriving a second time.",
                "em-rules-without-scenarios",
                Severity.INFO,
            )
        )
    return findings
