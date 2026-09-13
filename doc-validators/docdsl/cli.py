"""
The command line: `docdsl-validate map.examplemap`.

Two output shapes, because there are two consumers. The default is a caret
report meant to be read in a terminal next to the file, in the same
expected-vs-found-with-a-hint style the boards use. `--json` is one object per
file, for a CI job that wants to count things or annotate a diff.

Exit codes are the part worth getting right:

    0  every file parses (and, under --strict, carries no doctrine warnings)
    1  at least one file has a grammar error
    2  --strict, everything parses, and at least one doctrine warning stands
    3  the invocation itself was wrong - no such file, unknown format

`2` is separate from `1` on purpose. "This is not a valid story map" and "this
story map's first slice leaves an activity empty" are different claims, and a
pipeline that blocks on the first and reports the second wants to tell them
apart without parsing the output.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .api import FORMATS, Result, validate_file
from .problems import Severity

_COLOUR = {
    Severity.ERROR: "\033[31m",
    Severity.WARNING: "\033[33m",
    Severity.INFO: "\033[36m",
}
_RESET = "\033[0m"
_DIM = "\033[2m"


def _paint(text: str, code: str, colour: bool) -> str:
    return f"{code}{text}{_RESET}" if colour else text


def _caret_report(result: Result, source_lines: list[str], *, colour: bool, quiet: bool) -> str:
    """One finding per stanza: the position, the message, the offending line
    with a caret under it, and the hint.

    The caret is the reason the parsers carry a token's length around rather
    than recomputing it: reconstructing the width later means re-lexing.
    """
    out: list[str] = []
    for finding in result.findings:
        if quiet and finding.severity is Severity.INFO:
            continue
        head = _paint(finding.severity.value, _COLOUR[finding.severity], colour)
        where = f"{result.path}:{finding.line}:{finding.column}" if result.path else (
            f"{finding.line}:{finding.column}"
        )
        tail = _paint(f" [{finding.code}]", _DIM, colour) if finding.code else ""
        out.append(f"{where} {head}: {finding.message}{tail}")

        if 1 <= finding.line <= len(source_lines):
            text = source_lines[finding.line - 1]
            if text.strip():
                out.append(f"  {_paint(text.rstrip(), _DIM, colour)}")
                pad = " " * (finding.column - 1)
                out.append(
                    f"  {pad}{_paint('^' * max(1, finding.length), _COLOUR[finding.severity], colour)}"
                )
        if finding.hint:
            out.append(f"  {_paint(finding.hint, _DIM, colour)}")
        out.append("")
    return "\n".join(out)


def _as_json(result: Result) -> dict:
    return {
        "path": result.path,
        "format": result.format,
        "parses": result.parses,
        "counts": {
            "errors": len(result.errors),
            "warnings": len(result.warnings),
            "readings": len(result.infos),
        },
        "findings": [
            {
                "severity": finding.severity.value,
                "code": finding.code,
                "line": finding.line,
                "column": finding.column,
                "length": finding.length,
                "message": finding.message,
                "hint": finding.hint,
            }
            for finding in result.findings
        ],
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="docdsl-validate",
        description=(
            "Validate doc-hub's three source-text DSLs against their BNF grammars "
            "and read their doctrines over them."
        ),
        epilog=(
            "Grammar findings are errors and come from doc-*/doc/*-grammar.md. "
            "Doctrine findings are warnings and readings and come from "
            "doc-*/*-doctrine.md; they never fail a run unless you pass --strict."
        ),
    )
    parser.add_argument(
        "paths",
        nargs="+",
        metavar="FILE",
        help="files to validate, or directories to walk for .eventstorm/.storymap/.examplemap",
    )
    parser.add_argument(
        "--format",
        choices=FORMATS,
        help="read every file as this format instead of detecting it",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="fail (exit 2) when a doctrine warning stands",
    )
    parser.add_argument(
        "--grammar-only",
        action="store_true",
        help="skip the doctrine entirely and report only grammar errors",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="suppress the INFO readings; show errors and warnings only",
    )
    parser.add_argument("--json", action="store_true", help="one JSON object per file")
    parser.add_argument(
        "--no-color", action="store_true", help="never colourise, even on a terminal"
    )
    return parser


def _collect(paths: list[str]) -> tuple[list[Path], list[str]]:
    files: list[Path] = []
    missing: list[str] = []
    for raw in paths:
        location = Path(raw)
        if location.is_dir():
            for suffix in (".eventstorm", ".storymap", ".examplemap"):
                files.extend(sorted(location.rglob(f"*{suffix}")))
        elif location.exists():
            files.append(location)
        else:
            missing.append(raw)
    return files, missing


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    colour = not args.no_color and sys.stdout.isatty()

    files, missing = _collect(args.paths)
    for raw in missing:
        print(f"docdsl-validate: no such file or directory: {raw}", file=sys.stderr)
    if missing:
        return 3
    if not files:
        print("docdsl-validate: nothing to validate", file=sys.stderr)
        return 3

    results: list[Result] = []
    for location in files:
        result = validate_file(location, args.format)
        if args.grammar_only:
            result.readings = []
        results.append(result)

    if args.json:
        for result in results:
            print(json.dumps(_as_json(result), indent=2))
    else:
        for result in results:
            try:
                lines = Path(result.path).read_text(encoding="utf-8").splitlines()
            except (OSError, UnicodeDecodeError, TypeError):
                lines = []
            report = _caret_report(result, lines, colour=colour, quiet=args.quiet)
            if report.strip():
                print(report, end="")
            print(result.summary())

    if any(not result.parses for result in results):
        return 1
    if args.strict and any(result.warnings for result in results):
        return 2
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
