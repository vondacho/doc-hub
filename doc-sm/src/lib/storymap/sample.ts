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
 * The clauses are prose, so the 50-column measure breaks the longer ones across
 * two lines, which is also what makes this example show the continuation form
 * rather than describing it.
 *
 * Two of its cards are carrying a point. `story "Saved searches"` has no `@` and
 * is therefore below the line — known, not committed to. `step "Open a product"`
 * has no body at all: a step that has been identified and has no stories yet.
 * Both are first-class states, and an example that omitted them would suggest
 * they were not.
 */

export const SAMPLE_FILENAME = 'doc-hub-onboarding.storymap';

export const SAMPLE_SOURCE = `// Story map exported by doc-sm.
// Comments and blank lines in an imported file are not preserved: the board
// is the source, this file is a render of it.

storymap "Doc-Hub Onboarding" {
  product "client-onboarding"
  space "CLONB"

  release "MVP"
  release "R2"
  release "Later"

  activity "Discover documentation" {
    persona "Business analyst"
    persona "Product manager"
    persona "Support engineer"
    step "Search the catalog" {
      story "Full-text search" @MVP #CLONB-42 ~in-progress {
        as "Business analyst"
        want "to search every product at once"
        so "I can answer a question without knowing which"
           "product owns it"
      }
      story "Filter by domain" @R2 #CLONB-43 ~ready {
        as "Product manager"
        want "to narrow the catalogue to one domain"
        so "I review only the products my portfolio covers"
        note "Domain comes from the registry entry, not a"
             "free-text field that anyone can mistype."
      }
      story "Saved searches" {
        as "Support engineer"
        want "to keep the searches I run every week"
        so "I stop retyping the same query"
      }
    }
    step "Open a product"
  }

  activity "Judge what I am reading" {
    persona "Support engineer"
    persona "Documentation owner"
    step "Check how current it is" {
      story "Show the age of the docs" @MVP #CLONB-51 ~done {
        as "Support engineer"
        want "to see when a page was last updated"
        so "I can judge whether to trust it"
      }
      story "Flag anything over 90 days" @R2 ~analysing {
        as "Documentation owner"
        want "stale pages called out for me"
        so "I fix them before somebody is misled"
      }
    }
    step "Check who owns it" {
      story "Name the owning squad" @MVP {
        as "Support engineer"
        want "to see which squad owns a product"
        so "I can route an incident without guessing"
      }
      story "Link the squad's channel" @Later {
        as "Support engineer"
        want "to reach the owning squad in one click"
        so "I can ask while the incident is still open"
      }
    }
  }

  activity "Register a new product" {
    persona "Registrar"
    persona "Product owner"
    step "Fill the registration form" {
      story "Validate the repository URL" @MVP {
        as "Registrar"
        want "a bad repository link refused at entry"
        so "the catalogue never points at nothing"
      }
      story "Reject a duplicate slug" @MVP {
        as "Registrar"
        want "a shortname that is already taken refused"
        so "two products can never share an address"
      }
    }
    step "Confirm it landed" {
      story "Show the entry in the catalog" @R2 {
        as "Product owner"
        want "to see my product listed straight after"
             "registering"
        so "I know the registration actually took"
      }
      story "Mail the owner a receipt" @Later {
        as "Product owner"
        want "a written record of what I registered"
        so "I can correct it if it is wrong"
      }
    }
  }
}
`;
