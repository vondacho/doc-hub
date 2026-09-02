/**
 * The example story map, in the shape the serializer emits.
 *
 * It is here rather than in a fixtures directory because it is shown to people:
 * /dsl renders it as the worked example of the format, and the board offers it
 * as "load the example" so that a first-time visitor sees a populated board
 * instead of an empty grid and a file picker.
 *
 * Its `product` names a product from doc-registry's seed, so the picker shows it
 * selected rather than flagged as unknown on a stock local cluster.
 *
 * Its `space` is deliberately *not* the product shortname. A tracker whose
 * project key is CLONB while the registry calls the product client-onboarding is
 * the ordinary case, and an example where the two matched would suggest they
 * always do — and would hide the fact that ticket ids come from the space, not
 * from the product.
 *
 * **Every row carries its ticket**: a capability on each activity (CLONB-1..3),
 * an epic on each step (CLONB-10..15), a story id on the stories (CLONB-42 and
 * up). Three ranges for the three levels, in the order a tracker hands them out
 * — an example where they overlapped would suggest the numbers mean nothing.
 * Each status is consistent with the row beneath it, for the same reason.
 *
 * Its stories carry the two states worth showing side by side: some are linked
 * to a ticket and some are not. `story "Saved searches"` has no `#` and no `~`,
 * which is what every story looks like before the ticketing system has heard of
 * it — unlinked, and open by default. `story "Flag anything over 90 days"` has a
 * status but no ticket, which is legal and means somebody recorded where the
 * work stands before a ticket existed for it.
 *
 * **Every activity lists its cast, and every story carries its need**, written
 * in the formal story language: as a <persona>, I want <capability>, so that
 * <outcome>. The title says what to build and the need says why anyone should; a
 * map of titles alone is a to-do list that has forgotten what it was for, and
 * the `so that` clause is the half that gets dropped first and missed most.
 *
 * The three activities deliberately have overlapping but different casts.
 * "Support engineer" appears in two of them and "Registrar" in only one, which
 * is what a real board looks like — and it is the thing a map of titles alone
 * can never show you.
 *
 * The clauses are one line each, however long: `want` and `so` hold one clause of
 * one sentence, so there is nothing in them to break. A note is one string spelled
 * across as many lines as its text needs, carried on by a trailing backslash — one
 * pair of quotes for the whole note, and the file inside the same 50-column measure
 * as the text.
 *
 * Two of its cards are carrying a point. `story "Saved searches"` has no `@` and
 * is therefore below the line — known, not committed to. `step "Open a product"`
 * has no body at all: a step that has been identified and has no stories yet.
 * Both are first-class states, and an example that omitted them would suggest
 * they were not.
 *
 * **Its timeline is two sprints leading to a release**, which is the shape the
 * kinds exist to express — five equal bands would say nothing about which is a
 * step towards which. Two of the three carry a tracker id and one does not,
 * because a band that nobody has raised in the tracker yet is an ordinary state
 * and the example should show it.
 */

export const SAMPLE_FILENAME = 'doc-hub-onboarding.storymap';

/*
 * Note the doubled backslashes below. This is a template literal, and JavaScript
 * splices a line ending in a single backslash exactly as the DSL does — so `\\`
 * here is the one backslash a `.storymap` file contains, and a single one would
 * be eaten before the parser ever saw it.
 */

export const SAMPLE_SOURCE = `// Story map exported by doc-sm.
// Comments and blank lines in an imported file are not preserved: the board
// is the source, this file is a render of it.

storymap "Doc-Hub Onboarding" {
  product "client-onboarding"
  space "CLONB"

  delivery "Sprint 24" sprint #CLONB-S24
  delivery "Sprint 25" sprint #CLONB-S25
  delivery "MVP" release #CLONB-R1

  activity "Discover documentation" #CLONB-1 ~in-progress +search {
    persona "Business analyst"
    persona "Product manager"
    persona "Support engineer"
    step "Search the catalog" #CLONB-10 ~in-progress {
      story "Full-text search" @"Sprint 24" #CLONB-42 ~in-progress +search +"needs an index" {
        as "Business analyst"
        want "to search every product at once"
        so "I can answer a question without knowing which product owns it"
      }
      story "Filter by domain" @"Sprint 25" #CLONB-43 ~ready {
        as "Product manager"
        want "to narrow the catalogue to one domain"
        so "I review only the products my portfolio covers"
        note "Domain comes from the registry entry, not a\\
              free-text field that anyone can mistype."
      }
      story "Saved searches" {
        as "Support engineer"
        want "to keep the searches I run every week"
        so "I stop retyping the same query"
      }
    }
    step "Open a product" #CLONB-11 ~analysing
  }

  activity "Judge what I am reading" #CLONB-2 ~analysing {
    persona "Support engineer"
    persona "Documentation owner"
    step "Check how current it is" #CLONB-12 ~in-progress {
      story "Show the age of the docs" @"Sprint 24" #CLONB-51 ~done +trust {
        as "Support engineer"
        want "to see when a page was last updated"
        so "I can judge whether to trust it"
      }
      story "Flag anything over 90 days" @"Sprint 25" ~analysing {
        as "Documentation owner"
        want "stale pages called out for me"
        so "I fix them before somebody is misled"
      }
    }
    step "Check who owns it" #CLONB-13 ~ready +trust {
      story "Name the owning squad" @"Sprint 24" {
        as "Support engineer"
        want "to see which squad owns a product"
        so "I can route an incident without guessing"
      }
      story "Link the squad's channel" @MVP {
        as "Support engineer"
        want "to reach the owning squad in one click"
        so "I can ask while the incident is still open"
      }
    }
  }

  activity "Register a new product" #CLONB-3 ~ready {
    persona "Registrar"
    persona "Product owner"
    step "Fill the registration form" #CLONB-14 ~ready {
      story "Validate the repository URL" @"Sprint 24" {
        as "Registrar"
        want "a bad repository link refused at entry"
        so "the catalogue never points at nothing"
      }
      story "Reject a duplicate slug" @"Sprint 24" {
        as "Registrar"
        want "a shortname that is already taken refused"
        so "two products can never share an address"
      }
    }
    step "Confirm it landed" #CLONB-15 ~analysing {
      story "Show the entry in the catalog" @"Sprint 25" {
        as "Product owner"
        want "to see my product listed straight after registering"
        so "I know the registration actually took"
      }
      story "Mail the owner a receipt" @MVP {
        as "Product owner"
        want "a written record of what I registered"
        so "I can correct it if it is wrong"
      }
    }
  }
}
`;

/**
 * An empty map, as text.
 *
 * The board opens on this. It has to be a real, parseable file rather than an
 * empty string, because the text is the document now: a gesture needs somewhere
 * to splice, and "add the first activity" needs a `{` to put it inside.
 *
 * No activity, deliberately. A map with one is a map somebody has started, and
 * the island shows the choice — load the example, or start a map — rather than a
 * grid of empty squares nobody asked for.
 */
export const EMPTY_SOURCE = `storymap "Untitled story map" {
}
`;

/**
 * A fresh document under a name of its own.
 *
 * What the New button opens, and it opens a map with its first activity on it rather than the choice of
 * how to start one. `EMPTY_SOURCE` is the empty state — no title of its own and
 * nothing on it — which is right for arriving at a page nobody has used yet and
 * wrong for a gesture that has already said what it wants. Somebody who presses
 * New has chosen; asking again is a step that answers a question they just
 * answered.
 *
 * So it comes with one activity, named badly on purpose and waiting to be
 * renamed: ba-ddd-mapper's `freshMap`, which writes one domain for the same
 * reason. Pressing New twice still leaves two drafts in the store rather than
 * one overwritten, because each takes a title nothing is using.
 */
export function freshSource(title: string): string {
	return `storymap ${JSON.stringify(title)} {\n  activity "New activity" {\n  }\n}\n`;
}
