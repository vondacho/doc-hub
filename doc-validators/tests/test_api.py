"""The one entry point, the two severity levels, and the command line."""

from __future__ import annotations

import io
import json
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

from docdsl import Severity, detect_format, validate, validate_file
from docdsl.cli import main

SAMPLES = Path(__file__).resolve().parent.parent / "samples"


class TestDetection(unittest.TestCase):
    def test_by_extension(self):
        self.assertEqual(detect_format("x.eventstorm"), "eventstorm")
        self.assertEqual(detect_format("x.storymap"), "storymap")
        self.assertEqual(detect_format("x.examplemap"), "examplemap")

    def test_by_opening_keyword_when_the_name_says_nothing(self):
        """A `.txt` somebody renamed still says `examplemap` on its first
        line, and refusing to read it over a file name would be pedantry."""
        self.assertEqual(
            detect_format("notes.txt", '// header\n\nexamplemap "A" { }'), "examplemap"
        )

    def test_neither(self):
        self.assertIsNone(detect_format("notes.txt", "hello"))
        self.assertIsNone(detect_format("notes.txt"))


class TestValidate(unittest.TestCase):
    def test_the_two_levels_are_kept_apart(self):
        result = validate('eventstorm "A" { lane "L" { event "Order placed" } }', "eventstorm")
        self.assertTrue(result.parses)
        self.assertEqual(result.problems, [])
        self.assertTrue(result.readings)
        self.assertNotIn(Severity.ERROR, [r.severity for r in result.readings])

    def test_the_doctrine_still_runs_on_a_file_that_did_not_parse_cleanly(self):
        """Parse errors are recovered from, so a map with a typo in it still
        has a backbone worth reading."""
        result = validate(
            'eventstorm "A" { lane "L" { event "Order placed" @0 } }', "eventstorm"
        )
        self.assertFalse(result.parses)
        self.assertTrue(result.readings)

    def test_findings_are_worst_first_then_in_file_order(self):
        result = validate(
            """
            eventstorm "A" {
              lane "L" {
                event "Place order"
                event "e" +x +X
              }
            }
            """,
            "eventstorm",
        )
        ranks = [f.severity for f in result.findings]
        self.assertEqual(ranks, sorted(ranks, key=lambda s: ["error", "warning", "info"].index(s.value)))

    def test_strict_is_what_makes_a_warning_fail(self):
        result = validate('eventstorm "A" { lane "L" { event "Order placed" } }', "eventstorm")
        self.assertTrue(result.ok())
        self.assertFalse(result.ok(strict=True))

    def test_an_unknown_format_is_a_programming_error(self):
        with self.assertRaises(ValueError):
            validate("", "featurefile")  # type: ignore[arg-type]

    def test_summary_counts_in_the_singular(self):
        """A finding that says "1 warnings" reads as a tool that was not
        finished, and a reader who notices stops trusting the sentence."""
        result = validate('storymap "A" { activity "Search" }', "storymap")
        self.assertEqual(len(result.warnings), 1)
        self.assertIn("1 warning,", result.summary())
        self.assertNotIn("1 warnings", result.summary())


class TestFiles(unittest.TestCase):
    def test_the_three_worked_examples_parse(self):
        for name in (
            "ordering-a-pizza.eventstorm",
            "doc-hub-onboarding.storymap",
            "redeem-a-voucher.examplemap",
        ):
            result = validate_file(SAMPLES / name)
            self.assertTrue(result.parses, f"{name}: {[e.message for e in result.errors]}")

    def test_a_binary_file_is_one_error_not_a_crash(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "photo.storymap"
            path.write_bytes(b"\xff\xd8\xff\xe0JFIF")
            result = validate_file(path)
            self.assertEqual([e.code for e in result.errors], ["not-utf8"])

    def test_an_unrecognisable_name_says_so(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "notes.txt"
            path.write_text("hello", encoding="utf-8")
            result = validate_file(path)
            self.assertEqual([e.code for e in result.errors], ["unknown-format"])


class TestCli(unittest.TestCase):
    def run_cli(self, *argv: str) -> tuple[int, str, str]:
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = main(list(argv))
        return code, out.getvalue(), err.getvalue()

    def test_a_directory_is_walked(self):
        code, out, _ = self.run_cli(str(SAMPLES), "--no-color", "--quiet")
        self.assertEqual(code, 0)
        self.assertEqual(out.count("parses."), 3)

    def test_strict_exits_two_when_only_warnings_stand(self):
        code, _, _ = self.run_cli(str(SAMPLES), "--no-color", "--strict")
        self.assertEqual(code, 2)

    def test_a_grammar_error_exits_one(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "broken.storymap"
            path.write_text('storymap "A" { activity "Do" ~nope }', encoding="utf-8")
            code, out, _ = self.run_cli(str(path), "--no-color")
        self.assertEqual(code, 1)
        self.assertIn("does not parse", out)

    def test_a_missing_file_exits_three(self):
        code, _, err = self.run_cli("/nowhere/at/all.storymap")
        self.assertEqual(code, 3)
        self.assertIn("no such file", err)

    def test_grammar_only_drops_the_doctrine(self):
        code, out, _ = self.run_cli(
            str(SAMPLES / "redeem-a-voucher.examplemap"), "--no-color", "--grammar-only"
        )
        self.assertEqual(code, 0)
        self.assertIn("0 warnings, 0 readings", out)

    def test_json_is_one_object_per_file(self):
        _, out, _ = self.run_cli(
            str(SAMPLES / "redeem-a-voucher.examplemap"), "--json", "--no-color"
        )
        payload = json.loads(out)
        self.assertEqual(payload["format"], "examplemap")
        self.assertTrue(payload["parses"])
        self.assertTrue(payload["findings"])
        self.assertIn("severity", payload["findings"][0])

    def test_a_node_level_caret_is_the_width_of_its_keyword(self):
        """A finding about a whole declaration underlines its keyword, not one
        character of it - which is what the `width` on every node is for."""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "dup.storymap"
            path.write_text(
                'storymap "A" {\n  delivery "S" sprint\n  delivery "S" release\n}\n',
                encoding="utf-8",
            )
            _, out, _ = self.run_cli(str(path), "--no-color", "--quiet")
        caret = next(line for line in out.splitlines() if set(line.strip()) == {"^"})
        self.assertEqual(caret.strip(), "^" * len("delivery"))

    def test_a_tag_finding_names_the_card_without_a_doubled_article(self):
        result = validate(
            'storymap "A" { activity "Do a thing" { step "s" { '
            'story "x" +legal +Legal } } }',
            "storymap",
        )
        self.assertEqual(result.errors[0].message, "This story is tagged `Legal` twice.")

    def test_the_caret_sits_under_the_offending_token(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "broken.eventstorm"
            path.write_text(
                'eventstorm "A" {\n  lane "L" {\n    event "e" @0\n  }\n}\n',
                encoding="utf-8",
            )
            _, out, _ = self.run_cli(str(path), "--no-color")
        lines = out.splitlines()
        source = next(index for index, line in enumerate(lines) if 'event "e"' in line)
        caret = lines[source + 1]
        self.assertEqual(caret.index("^"), lines[source].index("@"))


if __name__ == "__main__":
    unittest.main()
