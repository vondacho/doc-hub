"""
The tokenizer the three formats share.

One scanner for `.eventstorm`, `.storymap` and `.examplemap`, which is the
point: it knows about strings, braces, sigils and positions, and nothing about
any of the three domains. Its keyword set is a parameter, and swapping it is
the whole difference between reading a story map and reading an event storm.
The TypeScript side copies this module between the three boards; here it is
imported three times instead.

The language is brace-delimited and whitespace-insensitive, and that is the
most consequential decision in it. A file that arrives through a browser file
picker has been through an unknown editor - possibly a chat window, possibly a
copy-paste that re-tabbed every line. An indentation-sensitive grammar turns
all of that into a parse error; braces turn it into a formatting difference
nobody notices.

Every user-supplied name is a quoted string, so a title can never collide with
a keyword and the scanner needs no escaping rules beyond the string literal
itself. That is what keeps the grammars LL(1) with a single token of lookahead.

This module never raises. Three failures are recoverable, and recovering means
the rest of the file still gets read and the author sees every problem at once
rather than one per trip through the file dialog.

**One deliberate difference from the TypeScript.** Columns there are counted in
UTF-16 code units, because that is what a browser text editor addresses. Here
they are counted in code points, because that is what a terminal caret and
Python's own slicing address. The two agree on every ASCII file; they differ by
one per astral character (an emoji in a title) on the same line, and the
code-point count is the one that puts the caret in the right place here.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Final

from .problems import Problem, is_saturated, report

TokenKind = str  # one of the constants below

KEYWORD: Final[TokenKind] = "keyword"
STRING: Final[TokenKind] = "string"
IDENT: Final[TokenKind] = "ident"
AT: Final[TokenKind] = "at"
HASH: Final[TokenKind] = "hash"
TILDE: Final[TokenKind] = "tilde"
PLUS: Final[TokenKind] = "plus"
LBRACE: Final[TokenKind] = "lbrace"
RBRACE: Final[TokenKind] = "rbrace"
EOF: Final[TokenKind] = "eof"


@dataclass(frozen=True)
class Token:
    kind: TokenKind
    #: For a string, the *decoded* text - escapes already resolved.
    value: str
    #: 1-based.
    line: int
    #: 1-based, in code points.
    column: int
    #: 0-based index into the source.
    offset: int
    #: Raw source length, so an error caret can be the right width.
    length: int


#: Refuse anything larger before scanning a character of it.
#:
#: The file picker accepts whatever the visitor points it at, and a video file
#: would otherwise be scanned byte by byte into fifty thousand problems.
MAX_SOURCE_BYTES: Final[int] = 2 * 1024 * 1024

# Digits included at the start: a ticket id may be numeric (`#42`) as well as a
# project-keyed string (`#client-onboarding-42`), and both arrive after `#` as
# one token. `points 13` and `@3` read their number as an identifier too, and
# the parser is what checks it is all digits.
_IDENT_START = re.compile(r"[A-Za-z0-9_]")
_IDENT_PART = re.compile(r"[A-Za-z0-9_-]")

#: The one-character sigils, and the token each becomes.
#:
#: A table rather than a chain of conditionals. None of them mean anything to
#: the scanner: `+` is a tag on these grammars and could be a sum on another;
#: what it *is* is one character that stands alone, and that is the whole of
#: what this decides. `#` and `~` are unused by `.eventstorm` and are still
#: scanned, so its parser reports them as unexpected where they appear rather
#: than as an unknown character.
SIGIL: Final[dict[str, TokenKind]] = {"@": AT, "#": HASH, "~": TILDE, "+": PLUS}

_ESCAPES: Final[dict[str, str]] = {'"': '"', "\\": "\\", "n": "\n", "t": "\t"}

_NEWLINES: Final[str] = "\n\r"
_BLANKS: Final[str] = " \t\f\v"


def _eof(offset: int, line: int, column: int) -> Token:
    return Token(EOF, "", line, column, offset, 0)


def tokenize(
    source: str,
    problems: list[Problem],
    keywords: frozenset[str],
    *,
    noun: str = "document",
    example: str = 'storymap "Its title" { ... }',
) -> list[Token]:
    """Scan `source` into tokens, appending anything wrong to `problems`.

    Returns a token list that always ends with `eof`, even for input it could
    make no sense of at all - every parser is entitled to assume that.
    """
    tokens: list[Token] = []

    # A leading byte-order mark otherwise makes the first token "unexpected
    # character" on a file that looks perfect in every editor. Strip it before
    # anything else touches the text, and before the offsets everyone reports
    # are computed from.
    text = source[1:] if source[:1] == "﻿" else source

    if "\x00" in text:
        report(
            problems,
            Problem(
                message="This does not look like a text file.",
                hint=f"A {noun} is plain text. Pick a file exported from the board.",
                code="not-text",
            ),
        )
        return [_eof(len(text), 1, 1)]

    if len(text.encode("utf-8")) > MAX_SOURCE_BYTES:
        report(
            problems,
            Problem(
                message=f"The file is larger than {MAX_SOURCE_BYTES // 1024 // 1024} MiB.",
                hint=(
                    f"A {noun} is a handful of cards. A session that produced a "
                    "megabyte of them was not that session."
                ),
                code="too-large",
            ),
        )
        return [_eof(len(text), 1, 1)]

    index = 0
    line = 1
    line_start = 0
    size = len(text)

    def column() -> int:
        return index - line_start + 1

    def newline() -> None:
        """Advance one newline.

        A carriage-return/line-feed pair counts once - without this every line
        number after the first is right and every *column* is wrong on a file
        that came off Windows, which is the kind of bug that survives a whole
        afternoon.
        """
        nonlocal index, line, line_start
        if text[index] == "\r" and index + 1 < size and text[index + 1] == "\n":
            index += 1
        index += 1
        line += 1
        line_start = index

    def read_string() -> Token:
        nonlocal index
        start_offset = index
        start_column = column()
        start_line = line
        index += 1  # opening quote

        value: list[str] = []
        while index < size:
            char = text[index]

            if char == '"':
                index += 1
                return Token(
                    STRING,
                    "".join(value),
                    start_line,
                    start_column,
                    start_offset,
                    index - start_offset,
                )

            # A string never spans a line. Treating a newline as "unterminated"
            # here is what stops one missing quote from swallowing the rest of
            # the file into a single token.
            if char in _NEWLINES:
                break

            if char == "\\":
                escape = text[index + 1] if index + 1 < size else None

                # A backslash at end of line splices the string onto the next
                # one, and the split *is* a line break in the value. So a long
                # note is one string, spelled across as many lines as it needs,
                # and the file stays inside the same measure the text does.
                #
                # The safety rule is untouched: a *bare* newline still ends an
                # unterminated string, so one missing quote cannot swallow the
                # rest of the file. Only an explicit backslash carries on.
                #
                # Leading whitespace on the continuation is dropped, so the
                # second line can be indented to sit under the first without
                # that indentation leaking into the note.
                if escape in _NEWLINES:
                    index += 1
                    newline()
                    while index < size and text[index] in " \t":
                        index += 1
                    value.append("\n")
                    continue

                if escape in _ESCAPES:
                    value.append(_ESCAPES[escape])
                    index += 2
                    continue

                report(
                    problems,
                    Problem(
                        message=f"Unknown escape `\\{escape or ''}`.",
                        line=line,
                        column=column(),
                        length=1 if escape is None else 2,
                        hint='The escapes are \\" \\\\ \\n and \\t.',
                        code="unknown-escape",
                    ),
                )
                value.append("\\")
                index += 1
                continue

            value.append(char)
            index += 1

        # Unterminated. Report at the *opening* quote - that is where the
        # author has to go, and it is not where the scan stopped.
        report(
            problems,
            Problem(
                message='Unterminated title - no closing `"` before the end of the line.',
                line=start_line,
                column=start_column,
                length=1,
                hint=f"Titles are quoted: {example}",
                code="unterminated-string",
            ),
        )
        return Token(
            STRING,
            "".join(value),
            start_line,
            start_column,
            start_offset,
            index - start_offset,
        )

    while index < size and not is_saturated(problems):
        char = text[index]

        if char in _NEWLINES:
            newline()
            continue
        if char in _BLANKS:
            index += 1
            continue

        # Comments are trivia and are discarded here. They never reach the
        # parser, which is also why they cannot survive a round trip.
        if char == "/" and index + 1 < size and text[index + 1] == "/":
            while index < size and text[index] not in _NEWLINES:
                index += 1
            continue

        start_offset = index
        start_column = column()

        if char in "{}":
            index += 1
            tokens.append(
                Token(
                    LBRACE if char == "{" else RBRACE,
                    char,
                    line,
                    start_column,
                    start_offset,
                    1,
                )
            )
            continue

        sigil = SIGIL.get(char)
        if sigil is not None:
            index += 1
            tokens.append(Token(sigil, char, line, start_column, start_offset, 1))
            continue

        if char == '"':
            tokens.append(read_string())
            continue

        if _IDENT_START.match(char):
            index += 1
            while index < size and _IDENT_PART.match(text[index]):
                index += 1
            word = text[start_offset:index]
            tokens.append(
                Token(
                    KEYWORD if word in keywords else IDENT,
                    word,
                    line,
                    start_column,
                    start_offset,
                    index - start_offset,
                )
            )
            continue

        # Unknown character: record it and step over exactly one code point, so
        # the scan makes progress and the rest of the file is still read.
        report(
            problems,
            Problem(
                message=f"Unexpected character `{char}`.",
                line=line,
                column=start_column,
                length=1,
                code="unexpected-character",
            ),
        )
        index += 1

    tokens.append(_eof(index, line, column()))
    return tokens


def describe(token: Token) -> str:
    """How a token is named in an expected-vs-found message."""
    if token.kind == EOF:
        return "the end of the file"
    if token.kind == STRING:
        return f"the title {token.value!r}"
    return f"`{token.value}`"


_DIGITS = re.compile(r"^\d+$")


def is_ordinal(token: Token) -> bool:
    """An identifier that is all digits - how `@3` and `points 13` arrive."""
    return token.kind == IDENT and bool(_DIGITS.match(token.value))
