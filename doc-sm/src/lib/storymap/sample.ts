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

  release "MVP"
  release "R2"
  release "Later"

  activity "Discover documentation" {
    step "Search the catalog" {
      story "Full-text search" @MVP
      story "Filter by domain" @R2 {
        note "Domain comes from the registry entry, not a free-text field."
      }
      story "Saved searches"
    }
    step "Open a product"
  }

  activity "Judge what I am reading" {
    step "Check how current it is" {
      story "Show the age of the docs" @MVP
      story "Flag anything over 90 days" @R2
    }
    step "Check who owns it" {
      story "Name the owning squad" @MVP
      story "Link the squad's channel" @Later
    }
  }

  activity "Register a new product" {
    step "Fill the registration form" {
      story "Validate the repository URL" @MVP
      story "Reject a duplicate slug" @MVP
    }
    step "Confirm it landed" {
      story "Show the entry in the catalog" @R2
      story "Mail the owner a receipt" @Later
    }
  }
}
`;
