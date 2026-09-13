"""
The recursive-descent scaffolding the three parsers share.

On the TypeScript side each board has its own `parser.ts` and the scaffolding -
`peek`, `at`, `expectString`, `synchronize`, `parseBody`, `parseTag` - is
near-identical in all three, because it is about braces and sigils rather than
about lanes or rules. Here it is one base class, and each grammar is the part
that differs: which keywords start a declaration, and what may appear inside
each block.

`Reader` deliberately carries no domain vocabulary. It knows the shape of a
declaration - a keyword, a quoted title, some annotations, an optional braced
body - and nothing about what any of them mean.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .lexer import (
    EOF,
    IDENT,
    KEYWORD,
    LBRACE,
    PLUS,
    RBRACE,
    STRING,
    Token,
    TokenKind,
    describe,
    tokenize,
)
from .problems import Problem, is_saturated, report


def article(noun: str) -> str:
    """`a story`, `an activity`. Crude, and right for every noun these three
    grammars have."""
    return f"{'an' if noun[:1].lower() in 'aeiou' else 'a'} {noun}"


def tag_key(tag: str) -> str:
    """The key a duplicate tag is detected by.

    Case does not make a second tag: `+Legal` and `+legal` are one label
    written twice. What is *stored* is what was typed - folding the value as
    well would mean the file could not say `+GDPR`, and an acronym flattened to
    `gdpr` on its way through a tool nobody asked to normalise it is the kind
    of small theft that makes people stop trusting a format.
    """
    return tag.strip().lower()


NOTE_WRAP_COLUMNS = 50


def wrap_note(text: str, columns: int = NOTE_WRAP_COLUMNS) -> str:
    """Break a note's text into lines of at most `columns` characters.

    **Idempotent**, which is what allows it to be applied in two places without
    the two fighting. Existing newlines are kept as hard breaks and each
    stretch between them is wrapped on its own, so a deliberate paragraph break
    survives. A single word longer than the measure is left to overflow rather
    than being cut - a URL broken in half is worse than a long line.

    Runs of whitespace collapse to one space: the result has to be
    deterministic, and note text is prose rather than layout.
    """
    return "\n".join(_wrap_line(line.strip(), columns) for line in text.split("\n"))


def _wrap_line(line: str, columns: int) -> str:
    if len(line) <= columns:
        return line
    out: list[str] = []
    current = ""
    for word in line.split():
        if not current:
            current = word
            continue
        if len(current) + 1 + len(word) <= columns:
            current += f" {word}"
        else:
            out.append(current)
            current = word
    if current:
        out.append(current)
    return "\n".join(out)


def collapse(text: str) -> str:
    """One clause of one sentence, whatever whitespace it was written with.

    `want`, `so`, `as` and a Gherkin step are each one line by construction, so
    a break inside one would be a break in the middle of a sentence.
    """
    return " ".join(text.split())


@dataclass
class Body:
    """Where a `{ ... }` block's braces are, for a caller that needs to know
    whether a declaration was written with a body at all."""

    open: int
    close: int


@dataclass
class Reader:
    """A cursor over the token list, plus the recovery policy.

    Subclassed once per grammar. Everything here is about punctuation.
    """

    tokens: list[Token]
    problems: list[Problem]
    source: str
    #: The keyword that opens the one top-level block: `storymap`, `eventstorm`
    #: or `examplemap`. Everything else that is a keyword can start a
    #: declaration, which is what `at_declaration` uses to recover.
    root: str = ""
    position: int = field(default=0, init=False)

    # -- the cursor ---------------------------------------------------------

    def peek(self, ahead: int = 0) -> Token:
        return self.tokens[min(self.position + ahead, len(self.tokens) - 1)]

    def at(self, kind: TokenKind, value: str | None = None) -> bool:
        token = self.peek()
        return token.kind == kind and (value is None or token.value == value)

    def at_any(self, *kinds: TokenKind) -> bool:
        return self.peek().kind in kinds

    def advance(self) -> Token:
        token = self.tokens[min(self.position, len(self.tokens) - 1)]
        self.position += 1
        return token

    def previous(self) -> Token:
        return self.tokens[max(0, min(self.position - 1, len(self.tokens) - 1))]

    def at_declaration(self) -> bool:
        return self.at(KEYWORD) and self.peek().value != self.root

    # -- reporting ----------------------------------------------------------

    def problem_at(
        self,
        token: Token,
        message: str,
        hint: str | None = None,
        code: str | None = None,
    ) -> None:
        report(
            self.problems,
            Problem(
                message=message,
                line=token.line,
                column=token.column,
                length=token.length,
                hint=hint,
                code=code,
            ),
        )

    # -- the shapes ---------------------------------------------------------

    def expect_string(self, after: str, hint: str) -> Token | None:
        """The quoted title that follows a keyword, as a token."""
        if not self.at(STRING):
            self.problem_at(
                self.peek(),
                f"Expected a quoted title after `{after}`, found {describe(self.peek())}.",
                hint,
                code="expected-title",
            )
            return None
        return self.advance()

    def synchronize(self) -> None:
        """Skip to something that can start a declaration.

        Panic-mode recovery, and the reason a file with six mistakes costs one
        trip through the file dialog rather than six.
        """
        depth = 0
        while not self.at(EOF) and not is_saturated(self.problems):
            if self.at(LBRACE):
                depth += 1
            elif self.at(RBRACE):
                if depth == 0:
                    return
                depth -= 1
            elif depth == 0 and self.at_declaration():
                return
            self.advance()

    def parse_body(self, owner: str, item) -> Body | None:
        """A `{ ... }` body. `None` means the declaration was written without one."""
        if not self.at(LBRACE):
            return None
        open_brace = self.advance()

        while not self.at(RBRACE) and not self.at(EOF) and not is_saturated(self.problems):
            if item():
                continue
            self.problem_at(
                self.peek(),
                f"Unexpected {describe(self.peek())} inside `{owner}`.",
                code="unexpected-in-body",
            )
            self.synchronize()
            if not self.at(RBRACE) and not self.at(EOF) and not self.at_declaration():
                self.advance()

        if self.at(RBRACE):
            close = self.advance()
            return Body(open_brace.offset, close.offset + close.length)

        self.problem_at(
            self.peek(),
            f"`{owner}` is not closed - no `}}` before the end of the file.",
            code="unclosed-block",
        )
        return Body(open_brace.offset, len(self.source))

    def parse_note(self, notes: list[str], example: str) -> bool:
        """`note "..."` - free prose, wrapped to the measure on the way in."""
        if not self.at(KEYWORD, "note"):
            return False
        self.advance()
        text = self.expect_string("note", f"A note is quoted: {example}")
        if text is None:
            self.synchronize()
            return True
        notes.append(wrap_note(text.value))
        return True

    def parse_tag(self, tags: list[str], owner: str) -> bool:
        """`+legal` - one tag, appended to `tags`.

        Returns False when the next token is not its sigil, so a caller can
        drop through to its other annotations rather than running a second loop
        beside this one. Order never matters: `+legal @4` and `@4 +legal` are
        the same card.

        Every failure here reports and carries on. A malformed tag is a bad
        label on a card that is otherwise fine, and swallowing the rest of the
        declaration over one would lose the card's own words.
        """
        if not self.at(PLUS):
            return False
        sigil = self.advance()

        if not self.at(IDENT) and not self.at(STRING):
            self.problem_at(
                sigil,
                f"Expected a tag after `+`, found {describe(self.peek())}.",
                'A tag is a word: +legal, or +"ask the payments team" when it has spaces in it.',
                code="expected-tag",
            )
            return True

        found = self.advance()
        value = found.value.strip()

        # `+""` parses and means nothing. Refused rather than dropped, because a
        # tag that vanishes on export is the round-trip failure these formats do
        # not have anywhere else.
        if not value:
            self.problem_at(
                found,
                "This tag has no text.",
                "Write what the tag says: +legal",
                code="empty-tag",
            )
            return True

        if any(tag_key(tag) == tag_key(value) for tag in tags):
            self.problem_at(
                sigil,
                f"This {owner} is tagged `{value}` twice.",
                "A tag is on a card or it is not. Saying it again says no more, "
                "and usually means a bad merge.",
                code="duplicate-tag",
            )
            return True

        tags.append(value)
        return True

    def parse_tags(self, owner: str) -> list[str]:
        """The tags on a card that takes no other annotation: a rule, a question."""
        tags: list[str] = []
        while self.parse_tag(tags, owner):
            pass
        return tags

    def skip_to_root(self, hint: str) -> None:
        """Skip anything before the one top-level block.

        A file that opens with a comment has already had it discarded by the
        lexer, so whatever is here is junk.
        """
        while not self.at(EOF) and not self.at(KEYWORD, self.root):
            self.problem_at(
                self.peek(),
                f"Expected `{self.root}`, found {describe(self.peek())}.",
                hint,
                code="expected-root",
            )
            self.synchronize()
            if self.at_declaration():
                break
            if not self.at(EOF) and not self.at(KEYWORD, self.root):
                self.advance()

    def trailing_junk(self, noun: str) -> None:
        """Everything after the one block has closed.

        A second block is an error rather than a merge - two maps in one file is
        almost always a bad paste, and merging them would bury it.
        """
        while not self.at(EOF):
            if self.at(KEYWORD, self.root):
                self.problem_at(
                    self.peek(),
                    f"A second `{self.root}` block.",
                    f"One file holds one {noun}. Split them into two files.",
                    code="second-root",
                )
            else:
                self.problem_at(
                    self.peek(),
                    f"Unexpected {describe(self.peek())} after the {noun}.",
                    code="trailing-junk",
                )
            self.synchronize()
            if not self.at(EOF) and not self.at(KEYWORD, self.root):
                self.advance()


@dataclass
class Once:
    """A declaration that may appear at most once.

    A second is an error rather than a last-one-wins overwrite: two
    declarations mean a bad merge, which is exactly the thing worth surfacing
    rather than silently resolving.
    """

    value: str | None = None
    token: Token | None = None


def parse_once(
    reader: Reader,
    word: str,
    state: Once,
    hint: str,
    twice: str,
    code: str,
) -> bool:
    if not reader.at(KEYWORD, word):
        return False
    keyword = reader.advance()
    value = reader.expect_string(word, hint)
    if value is None:
        reader.synchronize()
        return True
    if state.token is not None:
        reader.problem_at(
            keyword,
            twice,
            f"Already declared on line {state.token.line}.",
            code=code,
        )
        return True
    state.value = value.value
    state.token = keyword
    return True


def read_tokens(
    source: str,
    problems: list[Problem],
    keywords: frozenset[str],
    noun: str,
    example: str,
) -> list[Token]:
    return tokenize(source, problems, keywords, noun=noun, example=example)
