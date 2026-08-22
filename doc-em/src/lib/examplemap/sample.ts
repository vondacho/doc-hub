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
 * It names a product and a ticket, because the notation for both is otherwise
 * only described on the format page and this is what people copy from. The
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

  story "Redeem a voucher" #CLONB-42 ~analysing {
    question "Which currencies can a voucher be issued in?"
  }

  rule "A voucher must not be expired" {
    example "A voucher that expired yesterday is refused" {
      given "a voucher SUMMER10 that expired on 2026-08-21"
      given "a basket of 40 CHF"
      when "the voucher is applied"
      then "the voucher is refused"
      then "the basket total is still 40 CHF"
    }
    example "A voucher expiring today is accepted"
    question "Is expiry checked when it is applied, or when the basket is paid?"
  }

  rule "A voucher applies once per basket" {
    example "Applying the same voucher twice leaves one discount"
  }

  rule "A voucher cannot take a basket below zero" {
    note "The finance team asked for this in writing. Do not\\
         change it without them."
    example "A 50 CHF voucher on a 30 CHF basket leaves a total of 0.00 CHF" {
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
