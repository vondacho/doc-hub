"""
Validators for the three doc-hub source-text DSLs.

`doc-es`, `doc-sm` and `doc-em` each keep their board's artefact as a text file
in the repository of the product it describes, where it diffs, reviews and
merges like everything else there. Three grammars, one per board:

    .eventstorm   an event storming wall      doc-es
    .storymap     a user story map            doc-sm
    .examplemap   an example mapping session  doc-em

Each is validated on **two levels**, and keeping them apart is the one design
decision in this package worth arguing about.

**The grammar** is decidable. `@0` is wrong, a duplicate tag is wrong, an `@`
naming a band nobody declared is wrong, and there is nothing to discuss. These
are errors, they come from the BNF in `doc-*/doc/*-grammar.md`, and they are
the same errors the boards' own TypeScript parsers raise - the same messages,
the same hints, the same fifty-problem ceiling.

**The doctrine** is not decidable. A wall with no hotspots on it, a rule with no
examples under it, a first slice that leaves an activity empty - all three are
valid files, and all three are the first thing their doctrine tells you to look
at. These are warnings and readings, they come from
`doc-*/​*-doctrine.md`, and they are phrased as questions to ask the room
because the person holding the file was in that room and knows the domain far
better than this package does.

So `validate()` returns both and labels which is which, and `--strict` is what
makes the second kind fail a build. A team that wants the grammar enforced in
CI and the doctrine read by a human gets that by default.

Usage:

    from docdsl import validate, validate_file

    result = validate_file("map.examplemap")
    if result.errors:
        ...              # the file does not parse
    for finding in result.findings:
        print(finding.format(result.path))
"""

from __future__ import annotations

from .api import (
    FORMATS,
    Format,
    Result,
    detect_format,
    validate,
    validate_file,
)
from .problems import (
    DslParseError,
    EventStormParseError,
    ExampleMapParseError,
    Problem,
    Severity,
    StoryMapParseError,
)

__all__ = [
    "FORMATS",
    "DslParseError",
    "EventStormParseError",
    "ExampleMapParseError",
    "Format",
    "Problem",
    "Result",
    "Severity",
    "StoryMapParseError",
    "detect_format",
    "validate",
    "validate_file",
]

__version__ = "0.1.0"
