# doc-es

The **event storming** board of the living documentation hub. Domain events along
a timeline, the actors and systems around them, and the disagreements nobody
could settle — read from and written to an `.eventstorm` file.

The third of the three workshop boards, after `doc-sm` (story mapping) and
`doc-em` (example mapping). It reuses their lexer, their error reporting, their
board history and their local-storage layer; what is its own is the notation and
the shape of a wall.

## Only Big Picture, on purpose

Event storming runs at three levels, and each adds elements to the one before it:

| Level | Adds |
|---|---|
| **Big Picture** | domain event, actor, external system, hotspot, opportunity |
| Process modelling | command, policy, read model |
| Software design | aggregate |

**This board has the Big Picture five and nothing else.** The deeper levels are
named in the source in prose rather than half-built in code: a `command` with no
grammar behind it is a card you can place and cannot mean anything by, which is
worse than one that is not offered yet. They are additive when they arrive — new
members of `CardKind`, new keywords, new swatches — and nothing in the model has
to change shape to admit them.

The practice is written up at
`/doc/practices/event-storming/` in the development hub, and the format's own
source is [eventstorming.com](https://eventstorming.com). Alberto Brandolini
defined both the workshop and the note colours; neither was ours to choose.

## The wall

Phases across, cards down. Time runs left to right, which is the one rule the
practice states as an instruction — "arrange all domain events on a single
timeline from left to right" — and a phase is a stretch of that line.

Columns rather than one long row, which is what a physical wall actually is. A
row of sixty events is eight metres of paper in a room and a horizontal scrollbar
on a screen, and a screen has the vertical space a wall does not. So the timeline
is folded: across the phases, down within one. `doc-sm` and `doc-em` fold the
same way, which also means all three boards read alike.

**A phase is a stretch of wall, not a bounded context.** The practice's last step
is finding the seams; a phase is where you record one once the room agrees.
Calling it a context would be claiming the workshop's output before the workshop
has produced it.

### The empty board is a row of `+`

A fresh storm is one unnamed phase holding nothing, and what it shows is one
dashed square per kind, each with a `+` and each tinted with that kind's own
colour. That is the legend and the first move in the same control: the five
colours *are* the notation, and somebody who has never seen the board learns them
by adding one.

The strip stays at the foot of every phase for the whole life of the board. On a
wall you never run out of somewhere to stick a note, and a `+` that appeared only
on hover would hide the thing a chaotic-exploration phase does over and over.

**Re-colouring a card is one click**, and it is the commonest correction there
is: half of what a wall does in its second hour is discovering that a note is the
wrong colour. On paper you rewrite it on a different sticky; here the card keeps
its words and its place.

## The header

The product picker and the map title, and that is all. There is **no ticketing
space**, where `doc-sm` and `doc-em` both have one: a space is where work is
raised, and an event storm does not produce work. It produces a shared picture
and a set of seams, and the story map next door is where the work is cut.

There is no deliveries sidebar either, for the same reason.

## The DSL

`.eventstorm`. Braces rather than indentation, so a file that has been through a
chat window or a different editor still parses.

```
eventstorm "Ordering a pizza" {
  product "client-onboarding"

  phase "Paying" {
    event "Payment requested"
    system "Payment provider"
    event "Payment refused"
    hotspot "Nobody agrees whether a refused payment cancels the order"
  }
}
```

```ebnf
File       = EventStorm , EOF ;
EventStorm = 'eventstorm' , String ,
             [ '{' , { Product | Phase | Card | Note } , '}' ] ;
Product    = 'product'  , String ;   (* at most one *)
Phase      = 'phase'    , String , [ '{' , { Card | Note } , '}' ] ;
Card       = Kind , String , [ '{' , { Note } , '}' ] ;
Kind       = 'event' | 'actor' | 'system' | 'hotspot' | 'opportunity' ;
Note       = 'note'     , String ;
```

- **The keyword is the colour.** There is no separate type annotation, because a
  card whose keyword said one thing and whose annotation said another would be a
  state the file could express and the board could not.
- **Declaration order is time**, left to right and top to bottom within a phase.
  No index and no timestamp: an ordinal is a second copy of what the list already
  says, and the copy is what drifts.
- **Cards may be written before any phase.** Chaotic exploration produces a heap
  of events long before anybody agrees where one stretch of wall ends, so a card
  is legal at the top level. Every such card is gathered into one unnamed phase
  on import, and export writes that phase out explicitly — the one place this
  format normalises rather than renders, and the reason the *second* export is a
  fixed point where the first is not.
- **A storm always has a wall.** Deleting the last phase clears it instead of
  removing it: a board with no phase has nowhere to put a card and no `+` to
  press.

### What round-trips

Preserved: the title, the product, the phases in order, their cards in order and
kind, and every note.

Normalised: cards written before the first phase, which come back inside one.

Lost: comments, blank lines and your indentation. The board is the source, the
file is a render of it.

## Persistence

The same as the other two boards: `localStorage`, a second after you stop
changing it, keyed `<product>_<title>` — the stem the export filename uses. Save
and Open are in the toolbar; autosave and Save go through one code path. It is
this browser only, it is insurance rather than an artefact, and the file you
export is still the wall.

## Configuration

| Variable | Default | Used by |
|---|---|---|
| `DOC_PORTAL_URL` | `http://doc-portal.localhost` | the board's footer |
| `PRACTICE_URL` | `http://dev-portal.localhost/doc/practices/event-storming/` | the header and `/dsl` |
| `REGISTRY_URL` | `http://doc-registry.localhost` | the "register one" links beside the product picker |
| `REGISTRY_API_URL` | `http://localhost:1337` | the product picker's list, read per request |
| `STORY_MAPPER_URL` | `http://doc-sm.localhost` | the footer — where the seams become work |
| `HOST` / `PORT` | `0.0.0.0` / `4324` | the standalone `@astrojs/node` server |

Read at call time through `src/lib/links.ts`. `REGISTRY_API_URL` is the one this
server resolves itself and must be an in-cluster address; the rest are resolved
by the visitor's browser.

## What is not built

- **The two deeper levels.** See above. This is the first slice.
- **No link from `doc-portal`, and none from `doc-sm`.** Both are deferred.
- **No seam export.** The practice says the clusters found here become bounded
  contexts and registered events; turning a phase into either is a conversation
  about a contract with `doc-registry`, not a button.
- **No tests.** Matching the rest of the repo, which has none and no runner. The
  fixed-point property above is what a suite would assert first.
- **Still no shared package for the three boards.** `lexer.ts`, `problems.ts`,
  `board/history.ts`, `files.ts`, `storage.ts`, `products.ts`, `ProductPicker`,
  `Card`, `CardMenu`, `Icon`, `IconButton` and `OpenDialog` now exist three
  times. `doc-sm`'s README predicted the second copy and `doc-em`'s predicted the
  third; this is it, and the argument for extracting them no longer needs making.
