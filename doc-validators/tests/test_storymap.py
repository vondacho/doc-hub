"""The `.storymap` grammar, and the user-story-mapping doctrine over it."""

from __future__ import annotations

import unittest

from docdsl.problems import Severity, StoryMapParseError
from docdsl.storymap import doctrine, parse, parse_collecting


def codes(problems) -> list[str]:
    return [p.code for p in problems]


def read(source: str) -> list:
    story_map, problems = parse_collecting(source)
    assert not problems, codes(problems)
    return doctrine.read(story_map)


WORKED = """
storymap "Doc-Hub Onboarding" {
  product "client-onboarding"
  space "CLONB"

  delivery "Sprint 24" sprint #CLONB-S24
  delivery "Sprint 25" sprint #CLONB-S25
  delivery "MVP" release #CLONB-R1

  activity "Discover documentation" #CLONB-1 ~in-progress +search {
    persona "Business analyst"
    persona "Product manager"
    step "Search the catalog" #CLONB-10 ~in-progress {
      story "Full-text search" @"Sprint 24" #CLONB-42 ~in-progress +search {
        as "Business analyst"
        want "to search every product at once"
        so "I can answer a question without knowing which product owns it"
      }
      story "Filter by domain" @"Sprint 25" #CLONB-43 ~ready {
        as "Product manager"
        want "to narrow the catalogue to one domain"
        so "I review only the products my portfolio covers"
      }
      story "Saved searches"
    }
    step "Open a product" #CLONB-11 ~analysing
  }
}
"""


class TestGrammar(unittest.TestCase):
    def test_the_worked_example_parses(self):
        story_map = parse(WORKED)
        self.assertEqual(story_map.title, "Doc-Hub Onboarding")
        self.assertEqual(story_map.space, "CLONB")
        self.assertEqual(
            [d.title for d in story_map.deliveries], ["Sprint 24", "Sprint 25", "MVP"]
        )
        self.assertEqual([d.kind for d in story_map.deliveries], ["sprint", "sprint", "release"])
        self.assertEqual(len(story_map.stories), 3)

    def test_space_defaults_to_the_product(self):
        story_map = parse('storymap "A" { product "client-onboarding" }')
        self.assertIsNone(story_map.space)
        self.assertEqual(story_map.effective_space, "client-onboarding")

    def test_empty_cards_are_real(self):
        """A step with no stories, or an activity with no steps, keeps its
        place. Both are ordinary states mid-workshop."""
        story_map = parse(
            'storymap "A" { activity "Do a thing" { step "Named, no stories" } '
            'activity "Not broken down" }'
        )
        self.assertEqual(len(story_map.activities), 2)
        self.assertEqual(story_map.activities[0].steps[0].stories, [])
        self.assertEqual(story_map.activities[1].steps, [])

    def test_want_and_so_are_collapsed_to_one_line(self):
        story_map = parse(
            'storymap "A" { activity "Do" { step "s" { story "x" { '
            'want "to search\\n   every product" } } } }'
        )
        self.assertEqual(story_map.stories[0].want, "to search every product")


class TestDeliveries(unittest.TestCase):
    def test_declaration_order_is_timeline_order(self):
        story_map = parse(
            'storymap "A" { delivery "Two" sprint delivery "One" release }'
        )
        self.assertEqual([d.title for d in story_map.deliveries], ["Two", "One"])

    def test_the_kind_word_is_required(self):
        _, problems = parse_collecting('storymap "A" { delivery "Sprint 24" }')
        self.assertIn("expected-delivery-kind", codes(problems))

    def test_the_older_release_spelling_still_parses(self):
        """Refusing it would mean a tool upgrade silently broke files the tool
        itself wrote."""
        story_map, problems = parse_collecting('storymap "A" { release "MVP" #R1 }')
        self.assertEqual(problems, [])
        band = story_map.deliveries[0]
        self.assertEqual((band.title, band.kind, band.ticket, band.legacy), ("MVP", "release", "R1", True))

    def test_duplicate_band_titles_are_an_error(self):
        """`@MVP` resolves by title, so titles have to be unique for the
        reference to mean one thing."""
        _, problems = parse_collecting(
            'storymap "A" { delivery "MVP" sprint delivery "MVP" release }'
        )
        self.assertIn("sm-duplicate-delivery", codes(problems))

    def test_a_band_takes_no_status_and_no_delivery(self):
        _, problems = parse_collecting('storymap "A" { delivery "S" sprint ~ready }')
        self.assertTrue(problems)


class TestAnnotations(unittest.TestCase):
    def test_only_a_story_takes_a_delivery(self):
        _, problems = parse_collecting(
            'storymap "A" { delivery "S" sprint activity "Do a thing" @S }'
        )
        self.assertIn("sm-delivery-on-wrong-card", codes(problems))
        self.assertIn("spans every band", problems[0].hint)

    def test_a_repeat_is_an_error_not_last_one_wins(self):
        for annotation, code in (
            ('@"S" @"T"', "sm-two-deliveries"),
            ("#A #B", "sm-two-tickets"),
            ("~ready ~done", "sm-two-statuses"),
        ):
            _, problems = parse_collecting(
                f'storymap "A" {{ delivery "S" sprint delivery "T" sprint '
                f'activity "Do" {{ step "s" {{ story "x" {annotation} }} }} }}'
            )
            self.assertIn(code, codes(problems), annotation)

    def test_the_six_word_status_vocabulary(self):
        for status in ("open", "analysing", "ready", "in-progress", "done", "closed"):
            story_map, problems = parse_collecting(
                f'storymap "A" {{ activity "Do" ~{status} }}'
            )
            self.assertEqual(problems, [], status)
            self.assertEqual(story_map.activities[0].status, status)

    def test_any_other_word_after_tilde_lists_the_six(self):
        _, problems = parse_collecting('storymap "A" { activity "Do" ~nearly }')
        self.assertIn("unknown-status", codes(problems))
        self.assertIn("~in-progress", problems[0].hint)

    def test_the_default_status_is_open(self):
        story_map = parse('storymap "A" { activity "Do a thing" }')
        self.assertEqual(story_map.activities[0].status, "open")

    def test_annotations_come_in_any_order(self):
        story_map = parse(
            'storymap "A" { delivery "S" sprint activity "Do" { step "s" { '
            'story "x" +legal @S ~ready #T-1 +risk } } }'
        )
        story = story_map.stories[0]
        self.assertEqual(
            (story.delivery, story.status, story.ticket, story.tags),
            ("S", "ready", "T-1", ["legal", "risk"]),
        )


class TestReferences(unittest.TestCase):
    def test_a_delivery_may_be_declared_after_the_story_that_ships_in_it(self):
        story_map, problems = parse_collecting(
            'storymap "A" { activity "Do" { step "s" { story "x" @Late } } '
            'delivery "Late" sprint }'
        )
        self.assertEqual(problems, [])
        self.assertEqual(story_map.stories[0].delivery, "Late")

    def test_an_unknown_delivery_is_an_error_not_a_silent_unschedule(self):
        _, problems = parse_collecting(
            'storymap "A" { delivery "Sprint 24" sprint activity "Do" { step "s" { '
            'story "x" @"Sprint 25" } } }'
        )
        self.assertIn("sm-unknown-delivery", codes(problems))
        self.assertIn("Sprint 24", problems[0].hint)

    def test_a_near_miss_is_suggested(self):
        _, problems = parse_collecting(
            'storymap "A" { delivery "MVP" release activity "Do" { step "s" { '
            'story "x" @mvp } } }'
        )
        self.assertIn("Did you mean", problems[0].hint)

    def test_no_delivery_means_below_the_line(self):
        """Absence is the encoding, so there is no keyword to spell wrong."""
        story_map = parse('storymap "A" { activity "Do" { step "s" { story "x" } } }')
        self.assertFalse(story_map.stories[0].scheduled)
        self.assertEqual(len(story_map.unscheduled), 1)

    def test_a_persona_resolves_against_its_own_activity_only(self):
        _, problems = parse_collecting(
            """
            storymap "A" {
              activity "One" { persona "Analyst" }
              activity "Two" {
                persona "Manager"
                step "s" { story "x" { as "Analyst" } }
              }
            }
            """
        )
        self.assertIn("sm-unknown-persona", codes(problems))
        self.assertIn('It lists: "Manager"', problems[0].hint)

    def test_an_activity_with_no_cast_is_told_to_add_one(self):
        _, problems = parse_collecting(
            'storymap "A" { activity "One" { step "s" { story "x" { as "Analyst" } } } }'
        )
        self.assertIn('persona "Analyst"', problems[0].hint)

    def test_a_persona_may_be_listed_after_the_story_that_names_it(self):
        story_map, problems = parse_collecting(
            'storymap "A" { activity "One" { step "s" { story "x" { as "Analyst" } } } '
            'activity "Two" { persona "Analyst" } }'
        )
        # Still an error - the scope is the activity, not the map.
        self.assertIn("sm-unknown-persona", codes(problems))

    def test_duplicate_personas_within_an_activity(self):
        _, problems = parse_collecting(
            'storymap "A" { activity "One" { persona "Analyst" persona "Analyst" } }'
        )
        self.assertIn("sm-duplicate-persona", codes(problems))

    def test_a_story_names_one_persona(self):
        _, problems = parse_collecting(
            'storymap "A" { activity "One" { persona "A" persona "B" '
            'step "s" { story "x" { as "A" as "B" } } } }'
        )
        self.assertIn("sm-two-personas", codes(problems))


class TestDoctrine(unittest.TestCase):
    def test_a_backbone_of_feature_names(self):
        findings = read(
            'storymap "A" { activity "Search" activity "Admin" activity "Reporting" }'
        )
        flagged = [f for f in findings if f.code == "sm-backbone-reads-as-features"]
        self.assertEqual(len(flagged), 3)
        self.assertEqual(flagged[0].severity, Severity.WARNING)

    def test_a_narrative_backbone_passes(self):
        findings = read(
            'storymap "A" { activity "Discover documentation" '
            'activity "Choosing a product" activity "Register an account" }'
        )
        self.assertNotIn("sm-backbone-reads-as-features", codes(findings))

    def test_a_release_is_a_slice_not_a_prefix(self):
        findings = read(
            """
            storymap "A" {
              delivery "Sprint 1" sprint
              activity "Discover a product" { step "s" { story "x" @"Sprint 1" } }
              activity "Register an account" { step "t" { story "y" } }
            }
            """
        )
        finding = next(f for f in findings if f.code == "sm-slice-is-a-prefix")
        self.assertIn('"Register an account"', finding.message)
        self.assertIn("the room's call", finding.hint)

    def test_a_whole_slice_passes(self):
        findings = read(
            """
            storymap "A" {
              delivery "Sprint 1" sprint
              activity "Discover a product" { step "s" { story "x" @"Sprint 1" } }
              activity "Register an account" { step "t" { story "y" @"Sprint 1" } }
            }
            """
        )
        self.assertNotIn("sm-slice-is-a-prefix", codes(findings))

    def test_a_step_with_one_story_is_usually_not_a_step(self):
        findings = read(
            'storymap "A" { activity "Discover a product" { step "s" { story "x" } } }'
        )
        finding = next(f for f in findings if f.code == "sm-thin-step")
        self.assertIn("doing no work", finding.hint)

    def test_a_crowded_step_is_usually_two_steps(self):
        stories = " ".join(f'story "x{n}"' for n in range(8))
        findings = read(
            f'storymap "A" {{ activity "Discover a product" {{ step "s" {{ {stories} }} }} }}'
        )
        self.assertIn("sm-crowded-step", codes(findings))

    def test_a_so_that_restates_its_want(self):
        findings = read(
            'storymap "A" { activity "Discover a product" { persona "P" step "s" { '
            'story "Full-text search" { as "P" want "to search every product" '
            'so "I can search every product" } story "y" } } }'
        )
        finding = next(f for f in findings if f.code == "sm-so-restates-want")
        self.assertIn("worth building", finding.hint)

    def test_a_real_justification_passes(self):
        findings = read(
            'storymap "A" { activity "Discover a product" { persona "P" step "s" { '
            'story "Full-text search" { as "P" want "to search every product at once" '
            'so "I can answer a question without knowing which product owns it" } '
            'story "y" } } }'
        )
        self.assertNotIn("sm-so-restates-want", codes(findings))

    def test_unscheduled_stories_are_named_not_tidied_away(self):
        findings = read(
            'storymap "A" { delivery "S" sprint activity "Discover a product" { '
            'step "s" { story "x" @S story "Saved searches" } } }'
        )
        finding = next(f for f in findings if f.code == "sm-below-the-line")
        self.assertEqual(finding.severity, Severity.INFO)
        self.assertIn("Saved searches", finding.message)
        self.assertIn("not a backlog", finding.hint)

    def test_the_worked_example_carries_no_warnings(self):
        findings = doctrine.read(parse(WORKED))
        self.assertEqual([f for f in findings if f.severity is Severity.WARNING], [])

    def test_no_reading_is_ever_an_error(self):
        findings = read('storymap "A" { activity "Search" }')
        self.assertNotIn(Severity.ERROR, [f.severity for f in findings])


class TestRaising(unittest.TestCase):
    def test_parse_raises_with_every_problem(self):
        with self.assertRaises(StoryMapParseError) as caught:
            parse('storymap "A" { activity "Do" ~nope ~alsonope }')
        self.assertGreaterEqual(len(caught.exception.problems), 1)
        self.assertIn("story map", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
