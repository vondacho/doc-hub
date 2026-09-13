"""The scanner's own rules, which are the same for all three formats."""

from __future__ import annotations

import unittest

from docdsl.lexer import EOF, IDENT, KEYWORD, MAX_SOURCE_BYTES, STRING, tokenize
from docdsl.problems import MAX_PROBLEMS, Problem, report
from docdsl.storymap.parser import STORYMAP_KEYWORDS


def scan(source: str) -> tuple[list, list[Problem]]:
    problems: list[Problem] = []
    return list(tokenize(source, problems, STORYMAP_KEYWORDS)), problems


class TestTrivia(unittest.TestCase):
    def test_whitespace_is_never_syntax(self):
        """Braces, not indentation. A file re-tabbed by a chat window parses."""
        tight, _ = scan('storymap "A"{activity "B"{}}')
        loose, _ = scan('storymap   "A"\n\t{\n\n\tactivity "B" {\v}\f}')
        self.assertEqual(
            [(t.kind, t.value) for t in tight],
            [(t.kind, t.value) for t in loose],
        )

    def test_comments_never_reach_the_parser(self):
        tokens, problems = scan('// a note to self\nstorymap "A"')
        self.assertEqual(problems, [])
        self.assertEqual([t.value for t in tokens], ["storymap", "A", ""])

    def test_crlf_counts_once(self):
        """Without this every line number is right and every column is wrong
        on a file that came off Windows."""
        tokens, _ = scan('storymap "A"\r\nproduct "b"')
        product = tokens[2]
        self.assertEqual((product.line, product.column), (2, 1))

    def test_bom_is_stripped_not_reported(self):
        tokens, problems = scan('﻿storymap "A"')
        self.assertEqual(problems, [])
        self.assertEqual(tokens[0].kind, KEYWORD)
        self.assertEqual(tokens[0].column, 1)


class TestStrings(unittest.TestCase):
    def test_escapes(self):
        tokens, problems = scan(r'storymap "a\"b\\c\nd\te"')
        self.assertEqual(problems, [])
        self.assertEqual(tokens[1].value, 'a"b\\c\nd\te')

    def test_unknown_escape_is_reported_and_recovered(self):
        tokens, problems = scan(r'storymap "a\qb"')
        self.assertEqual(len(problems), 1)
        self.assertEqual(problems[0].code, "unknown-escape")
        # The scan carries on, so the rest of the file is still read.
        self.assertEqual(tokens[-1].kind, EOF)

    def test_bare_newline_ends_an_unterminated_string(self):
        """The safety rule: one missing quote cannot swallow the rest of the
        file into a single token."""
        tokens, problems = scan('storymap "A\nproduct "b"\n')
        self.assertEqual(problems[0].code, "unterminated-string")
        # Reported at the *opening* quote, which is where the author has to go.
        self.assertEqual((problems[0].line, problems[0].column), (1, 10))
        self.assertIn("product", [t.value for t in tokens])

    def test_trailing_backslash_splices_and_is_a_break(self):
        tokens, problems = scan('note "first\\\n      second"')
        self.assertEqual(problems, [])
        self.assertEqual(tokens[1].value, "first\nsecond")

    def test_a_title_can_never_collide_with_a_keyword(self):
        """Every user-supplied name is quoted, which is what keeps the grammars
        LL(1)."""
        tokens, problems = scan('storymap "story"')
        self.assertEqual(problems, [])
        self.assertEqual((tokens[1].kind, tokens[1].value), (STRING, "story"))


class TestIdentifiers(unittest.TestCase):
    def test_digits_may_start_an_identifier(self):
        """A ticket id may be numeric, and `#42` arrives as one token."""
        tokens, problems = scan("#42")
        self.assertEqual(problems, [])
        self.assertEqual((tokens[1].kind, tokens[1].value), (IDENT, "42"))

    def test_hyphens_continue_one(self):
        tokens, _ = scan("#client-onboarding-42")
        self.assertEqual(tokens[1].value, "client-onboarding-42")

    def test_keywords_are_keywords(self):
        tokens, _ = scan("activity persona notaword")
        self.assertEqual(
            [t.kind for t in tokens[:3]], [KEYWORD, KEYWORD, IDENT]
        )


class TestRefusals(unittest.TestCase):
    def test_nul_byte_is_not_a_text_file(self):
        tokens, problems = scan("storymap \x00")
        self.assertEqual(problems[0].code, "not-text")
        self.assertEqual([t.kind for t in tokens], [EOF])

    def test_oversized_file_is_refused_before_scanning(self):
        tokens, problems = scan("a" * (MAX_SOURCE_BYTES + 1))
        self.assertEqual(problems[0].code, "too-large")
        self.assertEqual([t.kind for t in tokens], [EOF])

    def test_unknown_character_makes_progress(self):
        tokens, problems = scan('storymap ? "A"')
        self.assertEqual(len(problems), 1)
        self.assertEqual(problems[0].code, "unexpected-character")
        self.assertEqual(tokens[-2].value, "A")

    def test_problems_are_capped(self):
        """Without a ceiling, a JPEG in the file picker produces tens of
        thousands of entries.

        The scanner checks saturation at the top of its loop, so it stops
        *at* the cap rather than adding the overflow note itself - the note
        belongs to whoever tries to report the fifty-first problem.
        """
        _, problems = scan("?" * 500)
        self.assertEqual(len(problems), MAX_PROBLEMS)

    def test_the_fifty_first_problem_says_so(self):
        problems = [Problem(message="x") for _ in range(MAX_PROBLEMS)]
        report(problems, Problem(message="one more", line=9, column=3))
        self.assertEqual(len(problems), MAX_PROBLEMS + 1)
        self.assertEqual(problems[-1].code, "too-many-problems")
        self.assertIn("Fix these first", problems[-1].message)
        # And everything after it is refused.
        report(problems, Problem(message="and another"))
        self.assertEqual(len(problems), MAX_PROBLEMS + 1)


if __name__ == "__main__":
    unittest.main()
