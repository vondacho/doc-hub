"""
What went wrong, and where.

Deliberately free of domain vocabulary: this module knows about positions,
messages and severities, not about lanes or rules. It is the Python counterpart
of `problems.ts`, which the three TypeScript parsers share verbatim, and it
keeps that module's two load-bearing decisions.

**Problems are collected, not fatal.** These files are hand-edited in an editor
with no language server and imported through a file picker, so failing on the
first problem would mean one trip through a file dialog per typo.

**Fifty is the ceiling.** Without one, a JPEG pointed at the validator produces
tens of thousands of "unexpected character" entries. Fifty is far more than
anyone fixes in one pass.

The one thing added here that the boards do not have: a **severity**. The
boards refuse a file or open it, so everything they report is an error. A
validator is also asked "is this map any good?", which is the doctrine's
question and never a parse failure — a rule with no examples is valid
`.examplemap` and the single most useful thing an example map can tell you. So
grammar findings are errors and doctrine findings are warnings or readings, and
the two are counted separately.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Severity(str, Enum):
    """How much a finding means.

    ERROR    the file breaks the grammar; a board would refuse to open it.
    WARNING  the file parses and the doctrine says to look at this.
    INFO     a reading. Not a defect — often the map doing its job.
    """

    ERROR = "error"
    WARNING = "warning"
    INFO = "info"

    def __str__(self) -> str:  # pragma: no cover - display only
        return self.value


@dataclass(frozen=True)
class Problem:
    """One finding, with somewhere to put a caret."""

    message: str
    line: int = 1
    column: int = 1
    #: Width of the offending token in the source, so a caret can be the right
    #: length. Carried rather than recomputed: reconstructing it later means
    #: re-lexing.
    length: int = 0
    #: What the correct form looks like. Shown under the message, never instead
    #: of it.
    hint: str | None = None
    severity: Severity = Severity.ERROR
    #: A stable kebab-case identifier, so a finding can be grepped for, counted
    #: across a repository, or muted by a team that has decided it disagrees.
    code: str | None = None

    @property
    def is_error(self) -> bool:
        return self.severity is Severity.ERROR

    def format(self, path: str | None = None) -> str:
        where = f"{path}:" if path else ""
        head = f"{where}{self.line}:{self.column} {self.severity.value}: {self.message}"
        if self.code:
            head = f"{head} [{self.code}]"
        return f"{head}\n    {self.hint}" if self.hint else head


#: The ceiling on collected parse problems.
MAX_PROBLEMS = 50


def is_saturated(problems: list[Problem]) -> bool:
    """True once the cap is reached; callers stop scanning rather than appending."""
    return len(problems) >= MAX_PROBLEMS


def report(problems: list[Problem], problem: Problem) -> None:
    """Append unless the cap is reached, in which case append one final note
    and refuse everything after it."""
    if len(problems) < MAX_PROBLEMS:
        problems.append(problem)
        return
    if len(problems) == MAX_PROBLEMS:
        problems.append(
            Problem(
                message=f"Stopped after {MAX_PROBLEMS} problems. Fix these first.",
                line=problem.line,
                column=problem.column,
                code="too-many-problems",
            )
        )


def errors(problems: list[Problem]) -> list[Problem]:
    return [p for p in problems if p.severity is Severity.ERROR]


def format_problems(problems: list[Problem], noun: str) -> str:
    if not problems:
        return f"The {noun} file could not be read."
    lines = [f"{p.line}:{p.column} {p.message}" for p in problems]
    head = (
        f"The {noun} file has a problem:"
        if len(problems) == 1
        else f"The {noun} file has {len(problems)} problems:"
    )
    return "\n".join([head, *lines])


class DslParseError(Exception):
    """Raised by a `parse()` entry point, and by nothing else.

    Carries every problem found rather than just the first, which is the whole
    point of collecting them.
    """

    noun = "document"

    def __init__(self, problems: list[Problem], *, noun: str | None = None) -> None:
        self.problems: list[Problem] = list(problems)
        if noun is not None:
            self.noun = noun
        super().__init__(format_problems(self.problems, self.noun))


class EventStormParseError(DslParseError):
    noun = "event storm"


class StoryMapParseError(DslParseError):
    noun = "story map"


class ExampleMapParseError(DslParseError):
    noun = "example map"
