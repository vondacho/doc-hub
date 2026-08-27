/**
 * The worked example, in the shape the serializer emits.
 *
 * It is dev-hub's own voucher story, taken from the practice page this component
 * was built against, so a reader who arrives from there recognises it — and so
 * the Gherkin this board writes can be compared against the feature file printed
 * on that page.
 *
 * It is deliberately a map you would *not* estimate yet. Two rules carry
 * questions, and "One voucher per basket" has no examples at all, which the
 * practice calls the sign that nobody understands the rule. A tidy example would
 * teach the notation and hide the point of the technique, which is that the
 * shape of the map tells you what to do next.
 *
 * It states its need — as a … I want … so that … — because that is the sentence
 * an example mapping session spends its length interrogating, and a sample whose
 * story was a bare title would suggest the board had no place to put it.
 *
 * It names a product, a ticket and a timeline, because the notation for all
 * three is otherwise only described on the format page and this is what people
 * copy from. Two sprints and one release, which is the shape the time axis is
 * for: the examples land across the sprints, and the story is done at the
 * release. Each band carries its own tracker id, because a sprint is a real
 * object over there and the notation for saying so is otherwise invisible. The
 * two sprints are sized and the release is not, which is the rule rather than a
 * gap in the example: a release is delivered by the sprints before it.
 *
 * Two of the six examples are left unscheduled on purpose. That is what a real
 * plan looks like — the cases everyone agreed on have been placed, the rest are
 * below the line, and "The remaining 20 CHF is not carried" is exactly the kind
 * of case nobody has committed to yet. The
 * status is `analysing` rather than `ready` for the same reason the map is
 * untidy: a story with an unanswered question against it and a rule with no
 * examples is not ready, and a sample that said so would be teaching the wrong
 * thing about what the board is for.
 *
 * Two of the five examples carry Given/When/Then and the rest are titles alone,
 * which is also deliberate. That is what a real map looks like an hour after the
 * session: the cards everyone agreed on have been made precise, and the others
 * are still one line in the room's own words. One of the two accumulates — two
 * `given` and two `then` — so the `And` the board and the feature file both
 * render is visible in the sample rather than only described.
 */

export const SAMPLE_FILENAME = 'redeem-a-voucher.examplemap';

export const SAMPLE_SOURCE = `// Example map exported by doc-em.
// Comments and blank lines in an imported file are not preserved: the board
// is the source, this file is a render of it.

examplemap "Redeem a voucher" {
  product "client-onboarding"
  space "CLONB"

  delivery "Sprint 24" sprint #CLONB-S24 points 13
  delivery "Sprint 25" sprint #CLONB-S25 points 8
  delivery "2026.9" release #CLONB-R9

  story "Redeem a voucher" #CLONB-42 ~analysing @"2026.9" {
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
    example "A voucher expiring today is accepted" @"Sprint 25"
    question "Is expiry checked when it is applied, or when the basket is paid?"
  }

  rule "A voucher applies once per basket" {
    example "Applying the same voucher twice leaves one discount" @"2026.9"
  }

  rule "A voucher cannot take a basket below zero" {
    note "The finance team asked for this in writing. Do not\\
          change it without them."
    example "A 50 CHF voucher on a 30 CHF basket leaves a total of 0.00 CHF" @"Sprint 24" {
      given "a basket of 30 CHF"
      when "a 50 CHF voucher is applied"
      then "the basket total is 0.00 CHF"
    }
    example "The remaining 20 CHF is not carried to the next order"
  }

  rule "One voucher per basket" {
    question "Does that include the automatic loyalty voucher?"
  }
}
`;

/**
 * An empty map, as text.
 *
 * The board opens on this. It has to be a real, parseable file rather than an
 * empty string, because the text is the document now: a gesture needs somewhere
 * to splice, and "add the first rule" needs a `{` to put it inside.
 *
 * No story and no rules, deliberately. The island shows the choice — load the
 * example, or start a map — rather than a grid nobody asked for.
 */
export const EMPTY_SOURCE = `examplemap "Untitled example map" {
}
`;

/**
 * A fresh document under a name of its own.
 *
 * What the New button opens. `EMPTY_SOURCE` is the same thing under the default
 * name; this is that with a title, so pressing New twice leaves two drafts in
 * the store rather than one overwritten.
 */
export function freshSource(title: string): string {
	return `examplemap ${JSON.stringify(title)} {\n}\n`;
}
