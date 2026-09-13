"""
One entry point for all three formats.

The three grammars have nothing to do with each other, and validating one is
the same three steps every time: read the file, parse it collecting problems
rather than raising, then read the doctrine over whatever came back. This
module is those three steps, once, with the format as a parameter.

**The doctrine runs on a file that did not parse cleanly**, which is
deliberate. Parse errors are recovered from - a card with a malformed tag is
still a card - so a map with two typos in it still has a backbone worth
reading, and reporting the syntax and the reading in one pass is what makes the
validator worth running at all. The only case the doctrine is skipped is a file
that produced nothing to read.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Final, Literal

from .eventstorm import doctrine as es_doctrine
from .eventstorm import parser as es_parser
from .examplemap import doctrine as em_doctrine
from .examplemap import parser as em_parser
from .problems import Problem, Severity
from .prose import count
from .storymap import doctrine as sm_doctrine
from .storymap import parser as sm_parser

Format = Literal["eventstorm", "storymap", "examplemap"]

FORMATS: Final[tuple[Format, ...]] = ("eventstorm", "storymap", "examplemap")

#: The file extension each format is written in, and the keyword each file
#: opens with - which is what lets a file with the wrong extension still be
#: recognised.
_EXTENSION: Final[dict[str, Format]] = {
    ".eventstorm": "eventstorm",
    ".storymap": "storymap",
    ".examplemap": "examplemap",
}

_NOUN: Final[dict[Format, str]] = {
    "eventstorm": "event storm",
    "storymap": "story map",
    "examplemap": "example map",
}

_PARSE: Final[dict[Format, Callable[[str], tuple[object, list[Problem]]]]] = {
    "eventstorm": es_parser.parse_collecting,
    "storymap": sm_parser.parse_collecting,
    "examplemap": em_parser.parse_collecting,
}

_READ: Final[dict[Format, Callable[[object], list[Problem]]]] = {
    "eventstorm": es_doctrine.read,
    "storymap": sm_doctrine.read,
    "examplemap": em_doctrine.read,
}


@dataclass
class Result:
    """What a validation found, with the two levels kept apart."""

    format: Format
    #: The document, as far as it could be read. `None` only when there was
    #: nothing there at all.
    document: object | None = None
    path: str | None = None
    #: Grammar findings. Every one of these is an error.
    problems: list[Problem] = field(default_factory=list)
    #: Doctrine findings: warnings and readings, never errors.
    readings: list[Problem] = field(default_factory=list)

    @property
    def noun(self) -> str:
        return _NOUN[self.format]

    @property
    def findings(self) -> list[Problem]:
        """Everything, worst first, then in file order."""
        rank = {Severity.ERROR: 0, Severity.WARNING: 1, Severity.INFO: 2}
        return sorted(
            [*self.problems, *self.readings],
            key=lambda finding: (rank[finding.severity], finding.line, finding.column),
        )

    @property
    def errors(self) -> list[Problem]:
        return [f for f in self.findings if f.severity is Severity.ERROR]

    @property
    def warnings(self) -> list[Problem]:
        return [f for f in self.findings if f.severity is Severity.WARNING]

    @property
    def infos(self) -> list[Problem]:
        return [f for f in self.findings if f.severity is Severity.INFO]

    @property
    def parses(self) -> bool:
        return not self.errors

    def ok(self, *, strict: bool = False) -> bool:
        """Whether this file passes.

        `strict` is what makes a doctrine warning fail a build. It is opt-in
        because a wall with no hotspots on it is a valid file, and a team that
        has read the warning and decided to ship anyway is making a call this
        package is not entitled to overrule.
        """
        return self.parses and (not strict or not self.warnings)

    def summary(self) -> str:
        where = f"{self.path}: " if self.path else ""
        if not self.parses:
            return (
                f"{where}{count(len(self.errors), 'error')} - "
                f"this {self.noun} does not parse."
            )
        return (
            f"{where}parses. {count(len(self.warnings), 'warning')}, "
            f"{count(len(self.infos), 'reading')}."
        )


def detect_format(path: str | Path, source: str | None = None) -> Format | None:
    """Which of the three this file is.

    The extension first, because that is what the boards write. Failing that,
    the keyword the file opens with: a `.txt` somebody renamed, or a heredoc in
    a test, still says `examplemap` on its first line, and refusing to read it
    over a file name would be pedantry.
    """
    suffix = Path(path).suffix.lower()
    if suffix in _EXTENSION:
        return _EXTENSION[suffix]
    if source is None:
        return None
    for line in source.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("//"):
            continue
        for candidate in FORMATS:
            if stripped.startswith(candidate):
                return candidate
        return None
    return None


def validate(source: str, fmt: Format, *, path: str | None = None) -> Result:
    """Parse `source` as `fmt`, then read the doctrine over it."""
    if fmt not in FORMATS:
        raise ValueError(f"Unknown format {fmt!r}. One of: {', '.join(FORMATS)}.")

    document, problems = _PARSE[fmt](source)
    readings = _READ[fmt](document) if document is not None else []
    return Result(
        format=fmt,
        document=document,
        path=path,
        problems=problems,
        readings=readings,
    )


def validate_file(path: str | Path, fmt: Format | None = None) -> Result:
    """Read a file and validate it, detecting the format from its name.

    A file that cannot be decoded as UTF-8 comes back as one error rather than
    an exception, for the same reason the lexer refuses a NUL byte with a
    message: somebody pointed a file picker at the wrong thing, and that is not
    a crash.
    """
    location = Path(path)
    try:
        source = location.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return Result(
            format=fmt or "storymap",
            path=str(location),
            problems=[
                Problem(
                    message="This file is not UTF-8 text.",
                    hint="These formats are plain text. Pick a file exported from the board.",
                    code="not-utf8",
                )
            ],
        )

    detected = fmt or detect_format(location, source)
    if detected is None:
        return Result(
            format="storymap",
            path=str(location),
            problems=[
                Problem(
                    message=f"Cannot tell which format {location.name} is.",
                    hint="Name it .eventstorm, .storymap or .examplemap, or pass the "
                    "format explicitly.",
                    code="unknown-format",
                )
            ],
        )
    return validate(source, detected, path=str(location))
