# doc-es

The **event storming** board of the living documentation hub. Domain events along
a timeline, the actors and systems around them, and the disagreements nobody
could settle — read from and written to an `.eventstorm` file.

The third of the three workshop boards, after `doc-sm` (story mapping) and
`doc-em` (example mapping). It reuses their lexer, their error reporting, their
board history and their local-storage layer; what is its own is the notation and
the shape of a wall.

## Three levels, one board

Event storming runs at three levels, and each **adds** to the one before it:

| Level | Adds | Colours |
|---|---|---|
| **Big picture** | domain event, actor, external system, hotspot, opportunity, bounded context | 6 |
| **Process modelling** | command, policy, read model | 9 |
| **Software design** | aggregate, screen (`ui`) | 11 |

That containment is why this is one board with a setting rather than three
boards. A process model is a big picture with commands and policies on it; a
software design is a process model with aggregates on it. Raising the level never
invalidates what is already on the wall.

**The legend grows with the level.** Choosing a deeper one makes the list longer,
which is the honest way to present a cumulative notation — the new colours appear
beneath the ones already there rather than replacing a diagram. The `+` strip on
each square offers exactly the kinds the current level admits, so the control and
the legend can never disagree.

**The level is declared, not inferred.** It is a statement of intent: a session
that has decided it is modelling a process decided that before placing its first
command. Inferring it would mean the level changed under the room as somebody
added a card, and a facilitator could never set one up in advance. Omitting it
means big picture, which is where the practice starts — and is why files written
before the setting existed still open.

The two directions are enforced from both sides. A card whose kind the declared
level does not admit is a **parse error**, naming the level that would admit it.
And the board will not let the level be **lowered** past the notes already on the
wall: the picker disables those levels and says how many notes are in the way,
because a board must not hold a state the file it writes could not describe.

Going deeper is always allowed, and orphans nothing.

### On the source

The practice is written up at `/doc/practices/event-storming/` in the development
hub, and the format's own source is [eventstorming.com](https://eventstorming.com).
Alberto Brandolini defined both the workshop and the note colours; neither was
ours to choose.

**The bounded context is a big-picture card**, and it sat at software design in
the first draft. That was the wrong reading of the practice. Finding the seams is
the *last phase of a big picture* — "clusters of events that share a language and
change together are candidate boundaries; this is the output the architecture
uses". A room that has just discovered two departments mean different things by
"account" has found a boundary, and needs somewhere to write it down long before
anybody talks about aggregates. Software design is where you go *inside* one of
them, which is why the aggregate arrives there — together with the **screen**,
written `ui`, which is the missing half of the human path process modelling
draws: a policy that needs a person becomes `read model → screen → command`, and
without somewhere to put the screen that chain has a hole in it where the person
goes.

It is called a *screen* on the board and `ui` in the file. The practice's own
word is "UI", which is right in a room and wrong in a legend — two letters of
jargon where the reader wants a noun. The keyword stays `ui` because that is what
somebody hand-editing will type.

One note on fidelity: the physical notation draws a bounded context as a line
around a region rather than as a note. It is a card on this board because there
is no way to draw a region here — a limitation worth knowing rather than a
reading of the practice.

## The board is a chessboard

Squares, addressed by (lane, column). The two axes mean different things, and
that is the whole layout.

**Horizontal is time.** Column 4 is the same moment in every lane, which is the
one thing this arrangement says that a list of events cannot: two notes side by
side are simultaneous, and a lane that is empty where its neighbour is busy has a
visible hole in it.

**Vertical is parallel tracks**, plus depth. A lane is a department, an actor, a
subsystem — whatever the room is separating — and within one square the notes
stack, because a moment often turns out to involve an actor, a system and an
event at once.

Square cards, on a squared surface. This is the one board of the three that does
not read as columns of text: a wall of sticky notes is a grid of roughly equal
squares, and any other shape would stop the arrangement looking like the thing it
is a picture of. The text inside is small and clamped for the same reason — a
note that grew to fit its words would push its neighbours out of alignment and
the grid would stop being a grid. That is also a nudge the practice makes: a
domain event is three or four words, and a note that does not fit is usually two
notes.

### Endless in the direction that matters

There is always one empty column past the rightmost note, and a control to add a
lane under the last one. Reaching the end creates the next square, so the surface
never runs out from under the workshop.

It is not literally unbounded. The grid renders what is used plus one, with a
floor so a fresh board looks like a board rather than one lonely square. Genuine
infinity means a virtualised grid, which is a great deal of machinery for a wall
that in practice runs to a few dozen columns — and it would cost the thing that
makes a wall readable, which is seeing all of it at once.

`cells` is sparse, which is what makes the surface affordable: an empty grid
costs nothing at all, and only occupied squares are stored.

### Placing and moving

Every square carries a `+` per kind on hover — the legend and the control in one,
so the notation is taught at the moment somebody is choosing a colour. Dragging a
note sideways changes when it happens, up or down changes whose lane it is on,
and diagonally does both: one gesture, one action, one undo step.

**Hovering a `+` shows the note it would make.** Ten swatches the size of a
fingernail are a fast control once you know the notation and an unreadable one
until then — and the notation is exactly what a first-time visitor lacks. A
`title` tooltip says the right words in the browser's smallest type, after a
delay, away from the colour it describes. So the preview shows the real card at a
readable size, in its own colour, carrying the very words the click will put on
it, with the name and the meaning underneath. It is the legend arriving at the
moment somebody is choosing rather than at the top of the page where they read it
ten minutes ago.

The words come from `newCardTitle` in the model, which the reducer also uses when
it creates the card — so the preview cannot promise a note you will not get. That
equality is asserted for all ten kinds rather than assumed.

The preview is portalled and positioned `fixed`, because the squares live in an
`overflow: auto` scroller that would slice one in half near the right-hand edge
and cut off one on the bottom row. It is `aria-hidden`: a screen reader already
has the full name read out on focus, and a second copy in a floating box is
noise. This exists for the eye.

**Re-colouring a note is one click**, and it is the commonest correction there
is: half of what a wall does in its second hour is discovering that a note is the
wrong colour. On paper you rewrite it on a different sticky; here it keeps its
words and its square.

## Light or dark, for the board alone

The page follows your operating system, as every page in the hub does. The board
carries its own optional override — the usual night/day switch, scoped to one
panel — because a wall on a projector in a lit room wants to be white while the
rest of the screen stays as you set it.

Three states, and the third is the default:

| | |
|---|---|
| **Following the page** | what a board does until somebody says otherwise |
| **Pinned light** | the switch, clicked while the board is dark |
| **Pinned dark** | the switch, clicked while the board is light |

The icon is what you would *get*, not what you have. Shift-clicking hands the
board back to the page; that is on a modifier rather than a third press because a
three-way button whose third state is invisible is one nobody can predict, and
the accessible name says so out loud. The choice is remembered in this browser,
under a key of its own — it belongs to the browser rather than to any one storm,
and it survives opening a different one.

**One mechanism, not two.** `global.css` defines a `@custom-variant dark` that
resolves against the nearest ancestor carrying `data-theme`: dark applies when
the OS says so *and* nothing has opted out, or when something has opted in. The
board sets that one attribute on its outer element and every component beneath
follows, without any of them knowing a board theme exists. A page with no
attribute anywhere behaves byte-for-byte as it did before this was added.

That is also what this file asked for before it existed — the note in
`global.css` said that if a toggle ever arrived, it should be a `@custom-variant`
driven by a data attribute "rather than scattering a second mechanism through the
components".

### The rule that makes the override sound

**Every themed root states its own foreground and background.** The board's stage
carries `bg-white text-ink dark:bg-night dark:text-slate-100`, and so does each
portalled root.

That is not decoration. Anything inside the board that does not set a colour
inherits one, and the nearest used to be on `<body>` — whose `dark:` resolves at
body level, where there is no `data-theme`, so it follows the operating system.
Pinning the board to daylight on a machine in dark mode turned the board's own
surfaces white while every unstyled string inside them stayed near-white,
inherited from a body that had never heard of the override. The swimlane names
went first, being the largest text on the board with no colour class of its own.

Restating the pair stops the inheritance at the boundary. The values are the ones
`<body>` uses, so a board that is not pinned looks exactly as it did before.

Two components need it twice over, because their content is **portalled to the
body** and so sits outside the board's subtree entirely: `CardMenu` and the `+`
preview in `KindPalette`. Both read `data-theme` off their own trigger — which
*is* inside the board — and both restate the colour pair.

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

  level process-modelling

  lane "Customer" {
    actor "Hungry customer" @1
    event "Menu opened" @1
    event "Order placed" @3
  }

  lane "Payments" {
    command "Take the payment" @3
    event "Payment requested" @4
    policy "Whenever a payment is refused, hold the order" @5
    hotspot "Nobody agrees whether a refused payment cancels the order" @5
  }
}
```

```ebnf
File       = EventStorm , EOF ;
EventStorm = 'eventstorm' , String ,
             [ '{' , { Product | Level | Lane | Card | Note } , '}' ] ;
Product    = 'product'  , String ;   (* at most one *)
Level      = 'level'    , ( 'big-picture' | 'process-modelling'
                          | 'software-design' ) ;   (* default big-picture *)
Lane       = 'lane'     , String , [ '{' , { Card | Note } , '}' ] ;
Card       = Kind , String , [ Column ] , [ '{' , { Note } , '}' ] ;
Column     = '@' , Integer ;   (* one-based; defaults to the next square *)
Kind       = 'event' | 'actor' | 'system' | 'hotspot' | 'opportunity'
           | 'context'                                     (* big picture *)
           | 'command' | 'policy' | 'readmodel'            (* process modelling *)
           | 'aggregate' | 'ui' ;                          (* software design *)
Note       = 'note'     , String ;
```

- **The keyword is the colour.** There is no separate type annotation, because a
  card whose keyword said one thing and whose annotation said another would be a
  state the file could express and the board could not.
- **A card the level does not admit is an error**, not a silent promotion of the
  level. The message names the level that *would* admit it, so the fix is one
  word and the error says which.
- **A column is a coordinate, not a list position.** Which is why cards carry
  `@3` where the other two boards refuse index fields. There, a card's position
  *was* its place in a list, so an index would have been a second copy of the
  same fact and the copy is what drifts. Here the board is two-dimensional and
  the column is the only record of *when* a note happens — and it is the only way
  to say the two things a wall says constantly: that two notes are simultaneous,
  and that a lane has a gap. Lane order is still a list, and still has no index.
- **`@column` may be left out, and is always written back.** A card with no `@`
  takes the square after the last one written in its lane, so a run of events
  typed straight down needs no numbering. Export always writes the number: the
  coordinate is the fact, and leaving it implicit would make a file's meaning
  depend on the order of the lines around it.
- **Several notes may share one square**, written with the same `@column`. They
  keep the order they appear in, which is the only record of a stacking order
  there is.
- **Cards may be written before any lane.** Chaotic exploration produces a heap
  of events long before anybody agrees which lane they belong to, so a card is
  legal at the top level. Every such card is gathered into one unnamed lane on
  import, and export writes that lane out explicitly — the one place this format
  normalises rather than renders, and the reason the *second* export is a fixed
  point where the first is not.
- **A storm always has a lane.** Deleting the last one clears it instead of
  removing it: a board with no lane has no square to place anything on.

### What round-trips

Preserved: the title, the product, the level, the lanes in order, and every note
with its kind, its words, its column and its place in a stack.

Normalised: cards written before the first lane, which come back inside one; and
every card's `@column`, which is written out even where it was inferred.

Dropped: `level big-picture`, which is the default — omitted and declared parse
back to the same document.

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

- **No link from `doc-portal`, and none from `doc-sm`.** Both are deferred.
- **No seam export.** The practice says the clusters found here become bounded
  contexts and registered events; turning a lane or a stretch of one into
  either is a conversation
  about a contract with `doc-registry`, not a button.
- **No tests.** Matching the rest of the repo, which has none and no runner. The
  fixed-point property above is what a suite would assert first.
- **Still no shared package for the three boards.** `lexer.ts`, `problems.ts`,
  `board/history.ts`, `files.ts`, `storage.ts`, `products.ts`, `ProductPicker`,
  `Card`, `CardMenu`, `Icon`, `IconButton` and `OpenDialog` now exist three
  times. `doc-sm`'s README predicted the second copy and `doc-em`'s predicted the
  third; this is it, and the argument for extracting them no longer needs making.
