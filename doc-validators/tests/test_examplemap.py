"""The `.examplemap` grammar, and the example-mapping doctrine over it."""

from __future__ import annotations

import unittest

from docdsl.examplemap import doctrine, parse, parse_collecting
from docdsl.problems import ExampleMapParseError, Severity


def codes(problems) -> list[str]:
    return [p.code for p in problems]


def read(source: str) -> list:
    example_map, problems = parse_collecting(source)
    assert not problems, codes(problems)
    return doctrine.read(example_map)


WORKED = """
examplemap "Redeem a voucher" {
  product "client-onboarding"
  space "CLONB"

  delivery "Sprint 24" sprint #CLONB-S24 points 13
  delivery "2026.9" release #CLONB-R9

  story "Redeem a voucher" #CLONB-42 ~analysing @"2026.9" +payments {
    as "Returning customer"
    want "to apply a voucher code at checkout"
    so "I pay the price I was promised"
    question "Which currencies can a voucher be issued in?"
  }

  rule "A voucher must not be expired" {
    example "A voucher that expired yesterday is refused" @"Sprint 24" {
      given "a voucher SUMMER10 that expired on 2026-08-21"
      given "a basket of 40 CHF"
      when "the voucher is applied"
      then "the voucher is refused"
      then "the basket total is still 40 CHF"
    }
  }
}
"""


class TestGrammar(unittest.TestCase):
    def test_the_worked_example_parses(self):
        example_map = parse(WORKED)
        self.assertEqual(example_map.title, "Redeem a voucher")
        self.assertEqual(example_map.story.ticket, "CLONB-42")
        self.assertEqual(example_map.story.status, "analysing")
        self.assertEqual(len(example_map.rules), 1)
        self.assertEqual(len(example_map.examples), 1)
        self.assertEqual(len(example_map.questions), 1)

    def test_a_map_has_at_most_one_story(self):
        """Two stories on one map is two sessions, and merging them would hide
        that."""
        _, problems = parse_collecting(
            'examplemap "A" { story "one" story "two" }'
        )
        self.assertIn("em-two-stories", codes(problems))
        self.assertIn("a second is a second session", problems[0].hint)

    def test_a_map_with_no_story_is_fine(self):
        example_map, problems = parse_collecting('examplemap "A" { rule "r" }')
        self.assertEqual(problems, [])
        self.assertIsNone(example_map.story)

    def test_an_example_belongs_to_a_rule(self):
        """Examples cannot float at the top level."""
        _, problems = parse_collecting('examplemap "A" { example "e" }')
        self.assertIn("unexpected-in-body", codes(problems))

    def test_a_question_hangs_on_the_story_or_on_a_rule(self):
        example_map = parse(
            'examplemap "A" { story "s" { question "before any rule" } '
            'rule "r" { question "while discussing it" } }'
        )
        self.assertEqual([q.title for q in example_map.story.questions], ["before any rule"])
        self.assertEqual(
            [q.title for q in example_map.rules[0].questions], ["while discussing it"]
        )
        self.assertEqual(len(example_map.questions), 2)

    def test_only_the_story_takes_a_ticket_and_a_status(self):
        _, problems = parse_collecting('examplemap "A" { rule "r" #T-1 }')
        self.assertTrue(problems)

    def test_space_defaults_to_the_product(self):
        example_map = parse('examplemap "A" { product "client-onboarding" }')
        self.assertEqual(example_map.effective_space, "client-onboarding")


class TestSteps(unittest.TestCase):
    def test_steps_repeat_and_and_does_not_exist(self):
        example_map = parse(
            'examplemap "A" { rule "r" { example "e" { given "one" given "two" '
            'when "act" then "first" then "second" } } }'
        )
        example = example_map.examples[0]
        self.assertEqual(example.given, ["one", "two"])
        self.assertEqual(example.then, ["first", "second"])

    def test_steps_come_back_in_gherkins_order(self):
        """Write them in any order; export puts them back in that one, because
        any other order is not a scenario."""
        example_map = parse(
            'examplemap "A" { rule "r" { example "e" { then "t" when "w" given "g" } } }'
        )
        self.assertEqual(
            example_map.examples[0].steps,
            [("given", "g"), ("when", "w"), ("then", "t")],
        )

    def test_an_example_may_be_a_title_alone(self):
        example_map = parse('examplemap "A" { rule "r" { example "e" } }')
        self.assertFalse(example_map.examples[0].has_steps)

    def test_a_step_is_collapsed_to_one_line(self):
        example_map = parse(
            'examplemap "A" { rule "r" { example "e" { given "a basket\\n   of 40 CHF" } } }'
        )
        self.assertEqual(example_map.examples[0].given, ["a basket of 40 CHF"])

    def test_and_is_not_a_keyword(self):
        _, problems = parse_collecting(
            'examplemap "A" { rule "r" { example "e" { given "g" and "more" } } }'
        )
        self.assertTrue(problems)


class TestDeliveries(unittest.TestCase):
    def test_ticket_and_points_in_either_order(self):
        one = parse('examplemap "A" { delivery "S" sprint #T-1 points 13 }')
        two = parse('examplemap "A" { delivery "S" sprint points 13 #T-1 }')
        for parsed in (one, two):
            band = parsed.deliveries[0]
            self.assertEqual((band.ticket, band.points), ("T-1", 13))

    def test_only_a_sprint_is_sized(self):
        """A release is delivered by the sprints before it, so sizing it would
        either double-count them or state a competing number."""
        _, problems = parse_collecting('examplemap "A" { delivery "1.0" release points 8 }')
        self.assertIn("em-points-on-release", codes(problems))

    def test_empty_is_not_zero(self):
        sized = parse('examplemap "A" { delivery "S" sprint points 0 }')
        unsized = parse('examplemap "A" { delivery "S" sprint }')
        self.assertEqual(sized.deliveries[0].points, 0)
        self.assertIsNone(unsized.deliveries[0].points)

    def test_points_must_be_a_whole_number(self):
        _, problems = parse_collecting('examplemap "A" { delivery "S" sprint points many }')
        self.assertIn("expected-points", codes(problems))

    def test_a_sprint_is_sized_once(self):
        _, problems = parse_collecting(
            'examplemap "A" { delivery "S" sprint points 8 points 13 }'
        )
        self.assertIn("em-two-estimates", codes(problems))

    def test_the_kind_word_is_required(self):
        _, problems = parse_collecting('examplemap "A" { delivery "S" }')
        self.assertIn("expected-delivery-kind", codes(problems))

    def test_a_delivery_may_be_declared_after_the_example_that_ships_in_it(self):
        """That is what the second phase is for."""
        example_map, problems = parse_collecting(
            'examplemap "A" { rule "r" { example "e" @Late } delivery "Late" sprint }'
        )
        self.assertEqual(problems, [])
        self.assertEqual(example_map.examples[0].delivery, "Late")

    def test_duplicate_band_titles_are_an_error(self):
        _, problems = parse_collecting(
            'examplemap "A" { delivery "S" sprint delivery "S" release }'
        )
        self.assertIn("em-duplicate-delivery", codes(problems))

    def test_a_reference_to_nothing_is_an_error_not_a_silent_drop(self):
        """Dropping it would quietly unschedule somebody's work and the export
        would then make that permanent."""
        _, problems = parse_collecting(
            'examplemap "A" { delivery "Sprint 1" sprint rule "r" { example "e" @Sprint2 } }'
        )
        self.assertIn("em-unknown-delivery", codes(problems))
        self.assertIn("Sprint 1", problems[0].hint)

    def test_the_hint_says_what_the_reference_was_for(self):
        _, problems = parse_collecting('examplemap "A" { rule "r" { example "e" @S } }')
        self.assertIn("this example ships in it", problems[0].message)


class TestNeed(unittest.TestCase):
    def test_three_fields_each_at_most_once(self):
        for word in ("as", "want", "so"):
            _, problems = parse_collecting(
                f'examplemap "A" {{ story "s" {{ {word} "one" {word} "two" }} }}'
            )
            self.assertIn(f"em-two-{word}", codes(problems), word)

    def test_all_three_are_independently_optional(self):
        example_map, problems = parse_collecting(
            'examplemap "A" { story "s" { want "to redeem a voucher" } }'
        )
        self.assertEqual(problems, [])
        self.assertIsNone(example_map.story.persona)
        self.assertEqual(example_map.story.want, "to redeem a voucher")

    def test_the_persona_is_free_text_here(self):
        """There is no cast on this board: example mapping takes one story some
        other conversation already chose."""
        example_map, problems = parse_collecting(
            'examplemap "A" { story "s" { as "Anybody at all" } }'
        )
        self.assertEqual(problems, [])
        self.assertEqual(example_map.story.persona, "Anybody at all")


class TestTags(unittest.TestCase):
    def test_every_kind_takes_them(self):
        example_map = parse(
            'examplemap "A" { story "s" +a rule "r" +b { example "e" +c '
            'question "q" +d } }'
        )
        self.assertEqual(example_map.story.tags, ["a"])
        self.assertEqual(example_map.rules[0].tags, ["b"])
        self.assertEqual(example_map.rules[0].examples[0].tags, ["c"])
        self.assertEqual(example_map.rules[0].questions[0].tags, ["d"])

    def test_case_does_not_make_a_second_tag(self):
        _, problems = parse_collecting('examplemap "A" { rule "r" +Legal +legal }')
        self.assertIn("duplicate-tag", codes(problems))


class TestDoctrine(unittest.TestCase):
    def test_a_rule_with_no_examples_is_the_first_thing_to_look_for(self):
        findings = read('examplemap "A" { rule "One voucher per basket" }')
        finding = next(f for f in findings if f.code == "em-rule-without-examples")
        self.assertEqual(finding.severity, Severity.WARNING)
        self.assertIn("nobody understands yet", finding.hint)

    def test_a_session_with_no_questions_discovered_nothing(self):
        findings = read(
            'examplemap "A" { rule "r" { example "40 CHF becomes 0.00 CHF" '
            '{ given "a basket of 40 CHF" when "a 50 CHF voucher is applied" '
            'then "the total is 0.00 CHF" } } }'
        )
        finding = next(f for f in findings if f.code == "em-no-questions")
        self.assertEqual(finding.severity, Severity.WARNING)

    def test_many_questions_means_not_ready_to_estimate(self):
        questions = " ".join(f'question "q{n}?"' for n in range(4))
        findings = read(f'examplemap "A" {{ rule "r" {{ {questions} }} }}')
        finding = next(f for f in findings if f.code == "em-not-ready-to-estimate")
        self.assertIn("not ready to estimate", finding.hint)

    def test_many_rules_means_the_story_is_too_big(self):
        rules = " ".join(f'rule "r{n}" {{ example "e{n} 1 CHF" }}' for n in range(7))
        findings = read(f'examplemap "A" {{ {rules} }}')
        finding = next(f for f in findings if f.code == "em-story-too-big")
        self.assertIn("where to split it", finding.hint)

    def test_a_crowded_rule_is_two_rules_wearing_one_sentence(self):
        examples = " ".join(f'example "case {n} at {n} CHF"' for n in range(6))
        findings = read(f'examplemap "A" {{ rule "r" {{ {examples} }} }}')
        self.assertIn("em-crowded-rule", codes(findings))

    def test_an_example_that_restates_its_rule(self):
        findings = read(
            'examplemap "A" { rule "Expired vouchers are refused" '
            '{ example "Expired vouchers are refused" } }'
        )
        finding = next(f for f in findings if f.code == "em-example-restates-rule")
        self.assertIn("look examined", finding.hint)

    def test_a_concrete_example_of_the_same_rule_passes(self):
        findings = read(
            'examplemap "A" { rule "Expired vouchers are refused" { '
            'example "A voucher that expired on 2026-08-21 is refused" { '
            'given "a voucher SUMMER10 that expired on 2026-08-21" '
            'when "it is applied" then "the basket total is still 40 CHF" } } }'
        )
        self.assertNotIn("em-example-restates-rule", codes(findings))
        self.assertNotIn("em-example-not-concrete", codes(findings))

    def test_an_example_with_no_numbers_dates_or_names(self):
        findings = read(
            'examplemap "A" { rule "Vouchers expire" { example "an old voucher" { '
            'given "a voucher that is old" when "it is applied" '
            'then "something reasonable happens" } } }'
        )
        finding = next(f for f in findings if f.code == "em-example-not-concrete")
        self.assertIn("testable", finding.hint)

    def test_a_then_that_only_denies(self):
        findings = read(
            'examplemap "A" { rule "Vouchers expire" { '
            'example "A voucher from 2020 is refused" { '
            'given "a voucher issued in 2020" when "it is applied" '
            'then "the voucher is refused" then "no discount is applied" } } }'
        )
        finding = next(f for f in findings if f.code == "em-only-denials")
        self.assertIn("hides the case that actually matters", finding.hint)

    def test_a_late_example_is_only_a_warning(self):
        """You move the release first and the examples after, and a parser that
        refused that intermediate state would make replanning impossible."""
        findings = read(
            """
            examplemap "A" {
              delivery "2026.8" release
              delivery "Sprint 30" sprint
              story "s" @"2026.8"
              rule "r" { example "a 40 CHF basket" @"Sprint 30" }
            }
            """
        )
        finding = next(f for f in findings if f.code == "em-late-example")
        self.assertEqual(finding.severity, Severity.WARNING)

    def test_an_example_before_the_story_ships_is_not_late(self):
        findings = read(
            """
            examplemap "A" {
              delivery "Sprint 30" sprint
              delivery "2026.9" release
              story "s" @"2026.9"
              rule "r" { example "a 40 CHF basket" @"Sprint 30" }
            }
            """
        )
        self.assertNotIn("em-late-example", codes(findings))

    def test_the_questions_do_not_cross_into_the_feature_file(self):
        findings = read('examplemap "A" { rule "r" { question "q?" } }')
        finding = next(f for f in findings if f.code == "em-questions-do-not-cross")
        self.assertIn("the map is the document", finding.hint)

    def test_few_cards_and_a_quick_session_means_ready(self):
        findings = read(
            'examplemap "A" { rule "A voucher expires after 30 days" { '
            'example "A voucher issued on 2026-01-01 is refused on 2026-03-01" { '
            'given "a voucher issued on 2026-01-01" when "it is applied on 2026-03-01" '
            'then "it is refused" then "the basket total is 40 CHF" } } }'
        )
        finding = next(f for f in findings if f.code == "em-reads-as-ready")
        self.assertEqual(finding.severity, Severity.INFO)
        self.assertIn("not a failure to find work", finding.hint)

    def test_no_reading_is_ever_an_error(self):
        findings = read('examplemap "A" { rule "r" }')
        self.assertTrue(findings)
        self.assertNotIn(Severity.ERROR, [f.severity for f in findings])


class TestRaising(unittest.TestCase):
    def test_parse_raises_with_every_problem(self):
        with self.assertRaises(ExampleMapParseError) as caught:
            parse('examplemap "A" { delivery "R" release points 8 rule "r" +x +X }')
        self.assertEqual(
            codes(caught.exception.problems), ["em-points-on-release", "duplicate-tag"]
        )
        self.assertIn("example map", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
