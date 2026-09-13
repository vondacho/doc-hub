"""The `.eventstorm` grammar, and the event-storming doctrine over it."""

from __future__ import annotations

import unittest

from docdsl.eventstorm import doctrine, parse, parse_collecting
from docdsl.problems import EventStormParseError, Severity


def codes(problems) -> list[str]:
    return [p.code for p in problems]


def read(source: str) -> list:
    storm, problems = parse_collecting(source)
    assert not problems, codes(problems)
    return doctrine.read(storm)


class TestGrammar(unittest.TestCase):
    def test_the_worked_example_parses(self):
        storm = parse(
            """
            eventstorm "Ordering a pizza" {
              product "client-onboarding"
              lane "Customer" {
                actor "Hungry customer" @1
                event "Menu opened" @1
                event "Order placed" @3 +revenue
              }
            }
            """
        )
        self.assertEqual(storm.title, "Ordering a pizza")
        self.assertEqual(storm.product, "client-onboarding")
        self.assertEqual([lane.title for lane in storm.lanes], ["Customer"])
        self.assertEqual(storm.lanes[0].cards[2].tags, ["revenue"])

    def test_an_empty_body_is_a_valid_empty_storm(self):
        storm = parse('eventstorm "Untitled event storm" { }')
        self.assertEqual(storm.lanes, [])

    def test_a_body_is_optional(self):
        self.assertEqual(parse('eventstorm "A"').lanes, [])

    def test_a_second_block_is_an_error_not_a_merge(self):
        _, problems = parse_collecting('eventstorm "A" { } eventstorm "B" { }')
        self.assertIn("second-root", codes(problems))

    def test_product_declared_twice(self):
        _, problems = parse_collecting(
            'eventstorm "A" { product "one" product "two" }'
        )
        self.assertIn("product-twice", codes(problems))
        self.assertIn("Already declared on line 1", problems[0].hint)

    def test_an_empty_file_says_so(self):
        _, problems = parse_collecting("")
        self.assertEqual(codes(problems), ["empty-file"])

    def test_a_file_that_is_not_a_storm_says_what_was_expected(self):
        _, problems = parse_collecting('storymap "A" { }')
        self.assertIn("expected-root", codes(problems))


class TestColumns(unittest.TestCase):
    def test_a_column_defaults_to_the_next_square(self):
        """A run of events typed straight down a lane needs no numbering."""
        storm = parse(
            'eventstorm "A" { lane "L" { event "one" event "two" event "three" } }'
        )
        self.assertEqual([c.column for c in storm.lanes[0].cards], [1, 2, 3])
        self.assertFalse(any(c.column_written for c in storm.lanes[0].cards))

    def test_an_explicit_column_moves_the_default_with_it(self):
        storm = parse('eventstorm "A" { lane "L" { event "one" @5 event "two" } }')
        self.assertEqual([c.column for c in storm.lanes[0].cards], [5, 6])

    def test_column_zero_is_refused_not_clamped(self):
        """A silently corrected coordinate is a card that is not where the file
        says it is."""
        _, problems = parse_collecting('eventstorm "A" { lane "L" { event "e" @0 } }')
        self.assertIn("column-below-one", codes(problems))

    def test_several_cards_may_share_one_square(self):
        storm = parse(
            'eventstorm "A" { lane "L" { actor "a" @4 system "s" @4 event "e" @4 } }'
        )
        self.assertEqual([c.kind for c in storm.column_of(4)], ["actor", "system", "event"])

    def test_a_column_needs_a_number(self):
        _, problems = parse_collecting('eventstorm "A" { lane "L" { event "e" @late } }')
        self.assertIn("expected-column", codes(problems))


class TestTags(unittest.TestCase):
    def test_any_number_in_any_order_around_the_column(self):
        storm = parse('eventstorm "A" { lane "L" { event "e" +legal @4 +risk } }')
        card = storm.lanes[0].cards[0]
        self.assertEqual((card.column, card.tags), (4, ["legal", "risk"]))

    def test_case_does_not_make_a_second_tag(self):
        _, problems = parse_collecting(
            'eventstorm "A" { lane "L" { event "e" +Legal +legal } }'
        )
        self.assertIn("duplicate-tag", codes(problems))

    def test_what_is_stored_is_what_was_typed(self):
        storm = parse('eventstorm "A" { lane "L" { event "e" +GDPR } }')
        self.assertEqual(storm.lanes[0].cards[0].tags, ["GDPR"])

    def test_an_empty_tag_is_refused_not_dropped(self):
        _, problems = parse_collecting('eventstorm "A" { lane "L" { event "e" +"" } }')
        self.assertIn("empty-tag", codes(problems))

    def test_the_vocabulary_is_open(self):
        """`+legel` is a tag rather than an error."""
        storm = parse('eventstorm "A" { lane "L" { event "e" +legel } }')
        self.assertEqual(storm.lanes[0].cards[0].tags, ["legel"])


class TestLanesAndKinds(unittest.TestCase):
    def test_all_ten_kinds(self):
        kinds = (
            "event actor system hotspot opportunity context "
            "command policy readmodel aggregate ui"
        ).split()
        body = " ".join(f'{kind} "x{index}"' for index, kind in enumerate(kinds))
        storm = parse(f'eventstorm "A" {{ lane "L" {{ {body} }} }}')
        self.assertEqual([c.kind for c in storm.lanes[0].cards], kinds)

    def test_a_lane_inside_a_lane_is_refused(self):
        _, problems = parse_collecting(
            'eventstorm "A" { lane "outer" { lane "inner" { } } }'
        )
        self.assertIn("unexpected-in-body", codes(problems))

    def test_loose_cards_go_in_a_lane_of_their_own_above_the_named_ones(self):
        """Appending them to somebody's first lane would claim they belong to it."""
        storm = parse('eventstorm "A" { event "loose" lane "Named" { event "in" } }')
        self.assertTrue(storm.lanes[0].unnamed)
        self.assertEqual(storm.lanes[0].cards[0].title, "loose")
        self.assertEqual(storm.lanes[1].title, "Named")

    def test_notes_are_wrapped_to_fifty_columns(self):
        long = "word " * 30
        storm = parse(f'eventstorm "A" {{ note "{long.strip()}" }}')
        self.assertTrue(all(len(line) <= 50 for line in storm.notes[0].split("\n")))

    def test_notes_go_on_the_storm_a_lane_and_a_card(self):
        storm = parse(
            'eventstorm "A" { note "map" lane "L" { note "lane" '
            'event "e" { note "card" } } }'
        )
        self.assertEqual(storm.notes, ["map"])
        self.assertEqual(storm.lanes[0].notes, ["lane"])
        self.assertEqual(storm.lanes[0].cards[0].notes, ["card"])


class TestRetiredLevel(unittest.TestCase):
    def test_an_old_file_still_opens(self):
        """The line was correct when it was written. Greeting somebody's saved
        storm with an error they did not cause is the worst option."""
        storm, problems = parse_collecting(
            'eventstorm "A" { level process-modelling lane "L" { command "c" } }'
        )
        self.assertEqual(problems, [])
        self.assertEqual(storm.declared_level, "process-modelling")

    def test_an_unknown_level_word_is_still_reported(self):
        _, problems = parse_collecting('eventstorm "A" { level sideways }')
        self.assertIn("unknown-level", codes(problems))

    def test_the_level_is_read_off_the_cards(self):
        big = parse('eventstorm "A" { lane "L" { event "e" context "c" } }')
        process = parse('eventstorm "A" { lane "L" { event "e" command "c" } }')
        design = parse('eventstorm "A" { lane "L" { event "e" aggregate "a" } }')
        self.assertEqual(big.deepest_level, "big-picture")
        self.assertEqual(process.deepest_level, "process-modelling")
        self.assertEqual(design.deepest_level, "software-design")

    def test_a_card_no_declared_level_admits_is_not_an_error(self):
        """The level is retired, so the cards win - and the disagreement is a
        reading rather than a refusal."""
        storm, problems = parse_collecting(
            'eventstorm "A" { level big-picture lane "L" { command "c" } }'
        )
        self.assertEqual(problems, [])
        findings = doctrine.read(storm)
        disagreement = next(f for f in findings if f.code == "es-level-disagrees")
        self.assertEqual(disagreement.severity, Severity.WARNING)


class TestErrorRecovery(unittest.TestCase):
    def test_problems_are_collected_not_fatal(self):
        """Failing on the first problem would mean one trip through a file
        dialog per typo."""
        _, problems = parse_collecting(
            """
            eventstorm "A" {
              lane "L" {
                event "e" @0
                event "f" +""
                event "g" +x +X
              }
            }
            """
        )
        self.assertEqual(
            codes(problems), ["column-below-one", "empty-tag", "duplicate-tag"]
        )

    def test_parse_raises_with_every_problem(self):
        with self.assertRaises(EventStormParseError) as caught:
            parse('eventstorm "A" { lane "L" { event "e" @0 event "f" +"" } }')
        self.assertEqual(len(caught.exception.problems), 2)


class TestDoctrine(unittest.TestCase):
    def test_a_wall_with_no_hotspots_has_not_been_honest_yet(self):
        findings = read('eventstorm "A" { lane "L" { event "Order placed" } }')
        finding = next(f for f in findings if f.code == "es-no-hotspots")
        self.assertEqual(finding.severity, Severity.WARNING)

    def test_a_hotspot_silences_it(self):
        findings = read(
            'eventstorm "A" { lane "L" { event "Order placed" hotspot "nobody agrees" } }'
        )
        self.assertNotIn("es-no-hotspots", codes(findings))

    def test_an_event_in_the_imperative_reads_as_a_command(self):
        findings = read('eventstorm "A" { lane "L" { event "Place order" } }')
        finding = next(f for f in findings if f.code == "es-event-reads-as-command")
        self.assertIn("Place order", finding.message)

    def test_a_past_tense_event_passes(self):
        for title in (
            "Order placed",
            "Payment refused",
            "Pizza put in the oven",
            "Order sent to the kitchen",
        ):
            findings = read(f'eventstorm "A" {{ lane "L" {{ event "{title}" }} }}')
            self.assertNotIn("es-event-reads-as-command", codes(findings), title)
            self.assertNotIn("es-event-not-past-tense", codes(findings), title)

    def test_a_command_that_already_happened(self):
        findings = read('eventstorm "A" { lane "L" { command "Payment taken" } }')
        self.assertIn("es-command-not-imperative", codes(findings))

    def test_a_policy_with_no_command_after_it_has_a_hole(self):
        findings = read(
            'eventstorm "A" { lane "L" { event "Payment refused" @1 '
            'policy "Whenever payment is refused, hold the order" @2 } }'
        )
        finding = next(f for f in findings if f.code == "es-policy-chain-hole")
        self.assertIn("no command after it", finding.message)

    def test_a_whole_causal_chain_passes(self):
        findings = read(
            """
            eventstorm "A" {
              lane "L" {
                event "Payment refused" @1
                policy "Whenever payment is refused, hold the order" @2
                command "Hold the order" @3
                hotspot "who tells the customer" @3
              }
            }
            """
        )
        self.assertNotIn("es-policy-chain-hole", codes(findings))

    def test_a_run_of_events_nobody_owns(self):
        findings = read(
            'eventstorm "A" { lane "L" { event "one happened" event "two happened" '
            'event "three happened" event "four happened" } }'
        )
        self.assertIn("es-unowned-run", codes(findings))

    def test_an_actor_nearby_claims_the_run(self):
        findings = read(
            'eventstorm "A" { lane "L" { actor "Clerk" @1 event "one happened" @2 '
            'event "two happened" @3 event "three happened" @4 event "four happened" @5 } }'
        )
        self.assertNotIn("es-unowned-run", codes(findings))

    def test_a_sequential_lane_is_not_off_the_clock(self):
        """A kitchen lane running columns 6-7 under a customer lane running 1-8
        has a timing relationship to it. Only a lane whose whole stretch sits
        outside everybody else's is a list drawn on a timeline."""
        findings = read(
            """
            eventstorm "A" {
              lane "Customer" { event "one happened" @1 event "last happened" @8 }
              lane "Kitchen" { event "cooked" @6 event "handed over" @7 }
              lane "Later" { event "archived" @20 event "purged" @21 }
            }
            """
        )
        off = [f for f in findings if f.code == "es-lane-off-the-clock"]
        self.assertEqual([f.message.split('"')[1] for f in off], ["Later"])

    def test_an_opportunity_with_no_hotspot_near_it(self):
        findings = read(
            'eventstorm "A" { lane "L" { hotspot "h" @1 opportunity "answer" @1 '
            'opportunity "orphan" @9 } }'
        )
        orphans = [f for f in findings if f.code == "es-opportunity-without-hotspot"]
        self.assertEqual(len(orphans), 1)
        self.assertIn("orphan", orphans[0].message)

    def test_no_reading_is_ever_an_error(self):
        """The doctrine is not decidable, so it never refuses a file."""
        findings = read('eventstorm "A" { lane "L" { event "Place order" } }')
        self.assertTrue(findings)
        self.assertNotIn(Severity.ERROR, [f.severity for f in findings])

    def test_an_empty_wall_is_a_reading_not_a_finding(self):
        findings = read('eventstorm "A" { }')
        self.assertEqual(codes(findings), ["es-empty-wall"])
        self.assertEqual(findings[0].severity, Severity.INFO)


if __name__ == "__main__":
    unittest.main()
