# doc-em

The **example mapping** board of the living documentation hub. One story at the
top in yellow, the rules that govern it in blue underneath, the examples that
illustrate each rule in green below it, and — in red, wherever they were raised —
the questions nobody in the room could answer.

The technique is Matt Wynne's, and dev-hub writes it up at
[/doc/practices/example-mapping/](http://dev-portal.localhost/doc/practices/example-mapping/).
Twenty-five minutes, one story, four colours of index card. This board is that
wall, with the counting done for you.

It is the second of three sibling modelling boards — `doc-sm`, `doc-em` and
`doc-es` (story mapping, example mapping, event storming). It reuses `doc-sm`'s
layout, its gestures and four of its files; see
[What is not built](#what-is-not-built) for which, and for when they should
finally be extracted into a package.

`doc-sm` is upstream of this one. A story map is where a story gets *chosen*;
this is where that one story gets understood well enough to estimate.

## The board keeps nothing

There is no database and no volume, and nothing about a map reaches the
server. A map is an `.examplemap` file:
you import one, edit it, and export it again. The file belongs in the repository
of the product it describes, next to the feature file it produces — which is the
same rule doc-portal states for the rest of the hub, the repository stays the
source of truth.

Nothing about a map reaches this server. The board is `client:only`, so the
parser, the reducer, the readings and both exporters run in the tab that opened
it.

This component makes one outbound call, and it is not about your map: the board
page reads the list of registered products from `doc-registry` so the product
picker has something to offer. The map itself is never sent anywhere. Unlike
`doc-sm` there is still no ticketing adapter to raise anything against — doc-em
records which ticket the story is and what state it is in, and never issues one —
so the chart has no Secret.

The corollary, and the reason the page still warns before unload: work that was
never exported is not in a file yet. The browser keeps a copy — see below — but a
copy in one browser is not the artefact.


## The board saves itself, in your browser

The board keeps a copy in `localStorage`, a second after you stop changing it.
Close the tab, sleep the laptop, crash the browser — reopen the page and the
board you had open comes back.

What is stored is **the file**, byte for byte the same text the export button
hands you. Not the board model, not JSON with the board inside it. The format
already round-trips, so a restored board is a parsed file and cannot be a shape
the parser has never seen; there is no second serialisation to keep in step with
the first; and an entry is recoverable by hand — copy it out of devtools and it
is simply the `.examplemap` file.

The key is `<product>_<title>`, the same stem the export filename uses, so the
entry in `localStorage` and the file in your downloads folder are recognisably
the same board. Renaming the map, or pointing it at another product, *moves* the
entry rather than forking it. A map about no registered product is keyed by its
title alone.

The toolbar has **Save** (write now) and **Open** (the boards this browser is
keeping, with a two-step delete). Autosave and Save go through one code path, so
they cannot disagree.

**This is insurance, not an artefact.** It is this browser only — not a server,
not your other machines, not your colleagues. The file you export is still the
map, it is still what belongs in the product's repository, and the board still
warns before you close it with unexported changes. Blocked storage or a full
quota costs you the copy and nothing else: the board works exactly as it did
before this existed, and says so in the toolbar rather than failing quietly.

An entry that no longer parses is **kept**, not dropped. It is the only copy, and
silently discarding somebody's session because this version reads the format
differently would be the worst thing this feature could do.

## A board starts with a story

Not with an empty page. The session is defined as taking one story, so the card
that names it exists before anything else does, reading **To be defined** until
somebody writes it. Starting blank would make the first move "add a story",
which is not a move anyone in the room makes.

The same rule holds in the format: a `.examplemap` file with no `story` line is
not an error, it is a session that has not named its story yet. A file with
*two* is an error — two stories on one map is two sessions, and quietly merging
them would hide that.

## Pages

| Route | What it is |
|---|---|
| `/` | the board |
| `/dsl` | the `.examplemap` format: a worked example, the grammar, and what the format decides for you |
| `/healthz` | `{"status":"UP"}` for the kubelet |

## The toolbar

| Control | What it does |
|---|---|
| undo / redo | whole-board snapshots; `⌘Z` / `⇧⌘Z` work outside a text field too |
| add a rule | appends a blue card; examples and questions are added from a card's own menu |
| load the example | the voucher map from the practice page, replacing the board |
| import | reads an `.examplemap` file; a parse failure leaves the board untouched |
| preview | the `.examplemap` text this board would export — editable, and applicable back onto the board |
| write the feature file | the Gherkin (see below) |
| export | the `.examplemap` file |
| show / hide notes | every card's hidden half at once — notes, and the scenario on an example; individually via the caret beside each title |
| zoom, fullscreen | 100 %–160 %, and the board alone filling the screen |

Everything a card can do is on the card: click the title to rename it, the caret
to show what is hidden — its notes, and on an example its scenario — the menu at
the end of the row for adding, moving and deleting. Drag with the pointer or lift
with the keyboard — space to pick up, arrows to move, space to drop — and every
move is announced.

## Reading the shape of the map

The practice says to look at the wall before anyone discusses it, and lists what
the shapes mean. That part is mechanical, so the board does it and shows what it
saw above the cards:

| Shape | Reading |
|---|---|
| 3 or more red cards | not ready to estimate — each one is an assumption somebody would otherwise make silently |
| 6 or more blue cards | the story is probably too big, and usually splits along its rules |
| a blue card with no green | nobody has agreed what that rule means yet |
| 5 or more green on one blue | that rule is often really two rules |
| the story ships in a sprint | usually a mis-schedule: a story is delivered in a release, with sprints as the steps towards it |
| an example scheduled after the story ships | contradictory — the story would be done before the thing that makes it true |
| few cards, nothing open | the story looks ready — the outcome the session is for |

They are readings, not verdicts. Each one names the count and the cards it is
talking about, so a person can disagree with it out loud. The thresholds are
named constants at the top of `src/lib/board/reading.ts` for the same reason.

## The time dimension

Deliveries are the rows: a `sprint` or a `release`, in the order they happen. The
story ships in a release; the examples under each rule ship in the sprints along
the way, and the cell where a rule meets a band is the whole statement of "this
case, under that rule, in that sprint".

The unit is deliberate. **An example is the smallest thing on this board with
business value attached** — a rule is a constraint, and a constraint is not
delivered in a sprint; the concrete cases that satisfy it are, one at a time, and
a rule is finished when the last of them lands. That is why the axis crosses the
rules rather than ordering them.

Questions stay out of the grid. A question is not delivered, it is answered, so
it sits in a strip under its rule's header above every band.

Dragging a card sideways re-files it under another rule, downwards reschedules
it, and diagonally does both — one gesture, one action, one undo step. Nothing on
the card records where it is: the cell *is* the assignment, and the `@delivery`
in the file is derived from it on the way out. The argument for that is at the
top of `src/lib/board/state.ts`.

Each band carries its own tracker id — a sprint is a real object over there, not
just a word on this board. It is shown on the rail and set only in the file, the
same rule the story's id follows.

Sprints also carry a size in story points, edited in the rail. That one *is*
editable on the board: an estimate is decided in the room while the conversation
is happening, where an id is issued elsewhere and only recorded here. Releases
are not sized — a release is delivered by the sprints before it — so the field is
absent on those rows rather than disabled, the parser refuses `points` on a
release, and changing a sized sprint into one clears the estimate so the export
cannot produce a file that will not read back.

Nothing here carries a date. The tracker holds the calendar; this holds the
sequence.

## The formal language on an example card

A rule and a question are prose. An example is not, or not for long: it is a
concrete case, and the notation for a concrete case is Gherkin. So an example
card carries its own **Given / When / Then**, the way a story card in `doc-sm`
carries *As a… I want… so that…*.

Expand any example and the scenario is there, in grey, before anybody has typed:

```
Given some context
When something happens
Then an outcome
```

That is the guidance. A blank text box teaches nothing; a formal sentence with
the words missing teaches the notation and asks for the words in one gesture.
Click a line to write it, Enter to commit, clear it to delete it.

**Any clause may be written more than once.** `Given` genuinely accumulates —
"a voucher that expired yesterday" *and* "a basket of 40 CHF" — and so does
`Then`. Add another from the card's menu, and the guidance follows:

```
Given a voucher SUMMER10 that expired on 2026-08-21
And a basket of 40 CHF
When the voucher is applied
Then the voucher is refused
And the basket total is still 40 CHF
```

**`And` is rendered, never stored.** The model keeps three lists, and the second
step of a clause is *printed* as `And` — on the card and in the feature file
alike. Delete the first `Given` and the second becomes `Given` on its own.
Storing the word would make each line's meaning depend on the line above it, so
reordering two lines would silently change what they assert.

**Steps are optional, and staying optional is the point.** A session that
produced ten example titles and no steps did example mapping correctly; the
technique is twenty-five minutes of conversation, not a test-writing exercise.
The steps are for whoever makes a card precise afterwards.

## Two exports, and only one of them round-trips

**`.examplemap`** is the file this board reads and writes. Import it, edit it,
export it, and you have the map back.

**`.feature`** is Gherkin, and it is a one-way door. Three of the four colours
have a Gherkin keyword — story is `Feature:`, rule is `Rule:`, example is
`Scenario:` — and the fourth has none, because an open question is not a
specification. So the feature file cannot carry the red cards, and the board
says how many it is about to drop before it writes one.

An example's steps are written out verbatim. Nothing is guessed: an example that
is still a title alone produces a scenario with no steps, and a comment saying
so. A stepless scenario is not an error in Gherkin — it parses, runs and passes —
which is exactly why it is called out, because a green suite that asserted
nothing is worse than a red one.

A rule with no examples still emits its `Rule:`, followed by a comment saying
nobody has agreed what it means. Dropping it silently would lose the most useful
thing on the board.

```gherkin
Feature: Redeem a voucher

  Rule: A voucher must not be expired

    Scenario: A voucher that expired yesterday is refused
      Given a voucher SUMMER10 that expired on 2026-08-21
      And a basket of 40 CHF
      When the voucher is applied
      Then the voucher is refused
      And the basket total is still 40 CHF

    Scenario: A voucher expiring today is accepted
      # No steps yet — this scenario would pass without asserting anything.

  Rule: One voucher per basket

    # No examples yet — nobody has agreed what this rule means.
```

## The DSL

`.examplemap`. Braces rather than indentation, so a file that has been through a
chat window or a different editor still parses.

```
// Example map exported by doc-em.

examplemap "Redeem a voucher" {
  product "client-onboarding"
  space "CLONB"

  delivery "Sprint 24" sprint #CLONB-S24 points 13
  delivery "Sprint 25" sprint #CLONB-S25 points 8
  delivery "2026.9" release #CLONB-R9

  story "Redeem a voucher" #CLONB-42 ~analysing @"2026.9" {
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

  rule "A voucher cannot take a basket below zero" {
    note "The finance team asked for this in writing. Do not\
         change it without them."
    example "A 50 CHF voucher on a 30 CHF basket leaves a total of 0.00 CHF"
  }

  rule "One voucher per basket" {
    question "Does that include the automatic loyalty voucher?"
  }
}
```

```ebnf
File       = ExampleMap , EOF ;
ExampleMap = 'examplemap' , String ,
             [ '{' , { Product | Space | Delivery | Story | Rule | Note } , '}' ] ;
Product    = 'product'  , String ;   (* at most one *)
Space      = 'space'    , String ;   (* at most one *)
Delivery   = 'delivery' , String , ( 'sprint' | 'release' ) ,
             { Ticket | Points } ,
             [ '{' , { Note } , '}' ] ;   (* order is timeline order *)
Points     = 'points'   , Integer ;   (* sprints only; at most one *)
Story      = 'story'    , String , { Ticket | Status | Ships } ,
             [ '{' , { Question | Note } , '}' ] ;   (* exactly one *)
Ticket     = '#' , ( Ident | String ) ;   (* at most one *)
Status     = '~' , ( 'open' | 'analysing' | 'ready'
                   | 'in-progress' | 'done' | 'closed' ) ;   (* at most one *)
Ships      = '@' , ( Ident | String ) ;   (* names a Delivery *)
Rule       = 'rule'     , String , [ '{' , { Example | Question | Note } , '}' ] ;
Example    = 'example'  , String , [ Ships ] , [ '{' , { Step | Note } , '}' ] ;
Step       = ( 'given' | 'when' | 'then' ) , String ;   (* each repeatable *)
Question   = 'question' , String , [ '{' , { Note } , '}' ] ;
Note       = 'note'     , String ;
String     = '"' , { Char | Escape | Splice } , '"' ;
Escape     = '\' , ( '"' | '\' | 'n' | 't' ) ;
Splice     = '\' , newline , { space } ;
Comment    = '//' , { Char } ;
```

What the grammar decides, each of which the source states its reason for:

- **One story.** A second is an error, not a list.
- **Declaration order is timeline order.** `delivery` lines are the time axis,
  earliest first, with no date field and no index: a date is the one thing here
  that would go stale on its own, and an index is a second copy of what the list
  already says. A sprint and a release are the same structure — the word is for
  reading, and "four sprints and a release" says something five equal bands do
  not.
- **A band carries a ticket of its own.** A sprint has a number in the tracker
  and a release has a version, so `delivery "Sprint 24" sprint #CLONB-S24` says
  which. Set in the file and read-only on the board, the same rule the story's id
  follows and for the same reason. No `~status` on a band: its lifecycle belongs
  to the tracker, and caching it would be claiming to know something never asked.
- **Only a sprint is sized.** `points 13` is a sprint's estimate in story
  points; a release takes none, and writing one is an error rather than a value
  quietly dropped — a release is delivered by the sprints before it, so sizing it
  would state a competing number for the same work. Unlike the `#id` beside it
  this is editable on the board, because an estimate is decided in the room
  rather than issued by the tracker. `0` and omitted are different answers.
- **The story ships in a release, its examples in the sprints before it.** `@`
  places a card on the timeline. An example is the smallest unit on this board
  with business value attached, which is why the axis *crosses* the rules rather
  than ordering them: a rule is a constraint and a constraint is not delivered,
  the concrete cases that satisfy it are.
- **No `@` means below the line** — agreed, not committed to. Absence is the
  encoding; there is no `@none` to spell wrong. Deleting a band drops its
  examples back there rather than deleting them, because cancelling a sprint does
  not cancel the work planned into it.
- **A duplicate band title is an error, a late example is a warning.** The first
  because `@` names a band by its title, so a duplicate makes every reference to
  it meaningless. The second because you move the release first and the examples
  after, and a parser that refused that intermediate state would make replanning
  impossible in the tool that exists to plan.
- **Only the story carries a ticket.** `#id` and `~status` may follow its title
  in either order; rules, examples and questions take neither. Breaking a story
  down does not produce more tickets — that is the difference between this board
  and `doc-sm`, where each of three rows is a level in the tracker.
- **The id is editable here and nowhere else.** The board shows it read-only. A
  session refines a story rather than re-addressing one, and a mistyped id
  silently re-homes a whole map of rules with no symptom on screen; an edit to
  the file is deliberate and shows up in a diff. The `~status` beside it is the
  opposite case — that is what a session changes, so it is also one click on the
  card menu.
- **A status is a cache, never the truth.** The ticketing system owns it. `~open`
  is what an unlinked story reads as — a placeholder, not a claim — and is
  omitted on export for that reason; a linked story always writes its status,
  because there it is an answer rather than the absence of one.
- **`product` is a shortname, `space` falls back to it.** The product is
  doc-registry's `slug`, not the display name, so a map does not stop matching
  its product the day somebody fixes the capitalisation. Omit `space` and the
  shortname stands in; state it when the tracker's key differs, which is
  ordinary.
- **An example belongs to a rule** and cannot float. A rule with no examples is
  legal, and is the practice's own warning sign.
- **`given`, `when` and `then` each repeat**, and there is no `and` keyword. See
  above: `And` is a rendering of a repeat, not a fourth kind of step.
- **Steps come back in Gherkin's order** however they were typed. Given before
  When before Then is not a style preference — any other order is not a scenario,
  and the file would produce a feature no Cucumber accepts. Normalising costs
  nothing, because the three are separate fields with no order between them to
  lose.
- **A question hangs on the story or on one rule.** A doubt raised before any
  rule exists belongs to the story; one raised while discussing a rule sits with
  it. Both readings are different, which is why the format keeps them apart —
  and why a question can be dragged from one to the other when the room realises
  which it really was.
- **Notes wrap at 50 characters.** A trailing `\` carries a string onto the next
  line, and *that split is the break* — one pair of quotes for the whole note.
- **No card ids.** Identity is position and title; nothing outside the board
  refers to a card.

### What round-trips

Preserved: the title, the product and space, the deliveries in timeline order
with their tickets and sprint sizes, the story with its ticket, status and release, the rules in order, their examples
and questions in order with the delivery each ships in, every note, and every
step.

Normalised: the order steps were typed in, and `~open` on an unlinked story,
which is the default and is omitted. Dropped: a step line opened from the menu
and never written — on the board it is a placeholder waiting for words, and
`given ""` in a file asserts nothing.

Lost: comments, blank lines and your indentation. Export emits two-space indent
and a canonical order. So a hand-edited file loses its comments the first time
somebody round-trips it through the board — the board is the source, the file is
a render of it.

### Errors

Collected, not fatal. These files are hand-edited in an editor with no language
server and imported through a file picker, so stopping at the first problem costs
one trip through a file dialog per typo. The parser recovers to the next keyword
or closing brace, caps the list at 50, and the board renders every problem with
its line, column and a hint. **A failed import leaves the board untouched.**

## Configuration

Five variables. Four are browser-facing links, resolved by the visitor's
browser; `REGISTRY_API_URL` is the one this server resolves itself, and it must
be an in-cluster address rather than an ingress host.

| Variable | Default | Used by |
|---|---|---|
| `DOC_PORTAL_URL` | `http://doc-portal.localhost` | the board's footer |
| `PRACTICE_URL` | `http://dev-portal.localhost/doc/practices/example-mapping/` | the header and `/dsl` |
| `REGISTRY_URL` | `http://doc-registry.localhost` | the "register one" links beside the product picker |
| `REGISTRY_API_URL` | `http://localhost:1337` | the product picker's list, read per request |
| `STORY_MAPPER_URL` | `http://doc-sm.localhost` | the footer — the board upstream of this one |
| `HOST` / `PORT` | `0.0.0.0` / `4323` | the standalone `@astrojs/node` server |
| `NODE_ENV`, `NODE_OPTIONS` | `production`, unset | Dockerfile / chart |

Read at call time through `src/lib/links.ts`, `process.env` first and
`import.meta.env` second, each falling back to the same default the chart ships —
so an unset value and the default look identical, and neither looks broken.

## Develop

```
npm install
npm run dev        # http://localhost:4321 in dev; the image serves 4323
npm run check      # astro check — types across .astro, .ts and .tsx
npm run build
```

The parser, the serializer, the Gherkin writer, the readings and the reducer are
plain modules with no React and no Astro in them, so all of them can be exercised
straight from a shell:

```
node --experimental-strip-types --no-warnings - <<'EOF'
import { parse } from './src/lib/examplemap/parser.ts';
import { serialize } from './src/lib/examplemap/serialize.ts';
import { SAMPLE_SOURCE } from './src/lib/examplemap/sample.ts';
const once = serialize(parse(SAMPLE_SOURCE));
console.log(once === serialize(parse(once)) ? 'fixed point holds' : 'FIXED POINT BROKEN');
EOF
```

That separation is deliberate: `src/lib/examplemap/` and `src/lib/board/` are the
tool, and `src/components/board/` is a way to drive it.

## Container

```
docker build -t doc-em:dev .
docker run --rm -p 4323:4323 doc-em:dev
```

Same shape as `doc-portal`'s image: `node:22-alpine`, `WORKDIR /app` in both
stages because the adapter bakes session paths in at build time, and an
unprivileged `app` user at uid/gid 10001 matching the chart's `securityContext`.
Port 4323 follows doc-portal's 4321 and doc-sm's 4322.

`react`, `react-dom` and `@astrojs/react` are runtime dependencies, not
build-only ones — the built server entry imports the React renderer even though
`client:only` means the server never renders with it.

## Deploy

```
./helm/doc-em/deploy.sh          # build, upgrade, restart, helm test
```

then <http://doc-em.localhost>. The chart is `helm/doc-em`, structurally a copy
of `helm/doc-sm` minus everything that existed for the ticketing adapter — the
registry entries are the same two, because the product picker is the same
control.

## What is not built

- **No link from doc-portal, and none from doc-sm.** Both are deferred to their
  own change. The doc-sm one is the more interesting: "open this story in an
  example map" is the real workflow, and it needs a way to carry a story's title
  across, which is a question about a URL contract rather than about this board.
- **No persistence and no sharing.** If maps ever need to be shared rather than
  committed, that is a conversation about where the file lives, not a reason to
  put an example map in Strapi.
- **No card ids in the file.** Same position as `doc-sm`, for the same reason.
  `#` is spelled the same way in both and means the same thing in both: a ticket
  the tracker issued, never a card this board invented.
- **No ticket is ever created from here.** doc-em records which ticket the story
  is; it does not raise one. `#id` is written by editing the `.examplemap` file,
  which is why there is no `TICKETING_API_URL`, no `/api/ticket` route and no
  publish dialog — all three exist in `doc-sm`, where three rows of cards each
  become an issue. Here there is one story, and it already had a ticket before
  anybody booked the session. If that changes, `doc-sm/src/lib/ticketing.ts` is
  the module to copy; it wants a ticket *kind*, and here that is the constant
  `'story'` rather than the three-way choice `doc-sm` has to make. There is no
  placeholder for it in `examplemap/model.ts` — a type with one value and no
  caller is a guess about a feature nobody has asked for.
- **Still no shared package for the sibling boards.** This component is the
  second copy `doc-sm`'s README predicted, and it makes the case concrete:
  `lexer.ts` (its keyword set is already a parameter), `problems.ts`,
  `board/history.ts` and `files.ts` now exist twice, byte-for-byte apart from
  their keyword sets and error class names. `lib/products.ts` and
  `ProductPicker.tsx` joined them when the picker landed here, and
  `lib/products.ts` is the worse case of the two: it is a third near-copy, after
  `doc-portal`'s. The trigger `doc-sm` named was "the
  first bug found in one of them"; the honest reading now is that `doc-es` should
  not be allowed to become a third copy. `Card.tsx`, `CardMenu.tsx`, `Icon.tsx`
  and `IconButton.tsx` are a second, weaker candidate — they diverged here to
  drop the persona row and to make the ticket read-only, so extracting them means
  a props union rather than a move. `DeliveryRail.tsx` is the newest instance and
  the most quietly duplicated: it is doc-sm's `BandRail.tsx` with a kind toggle
  added, and the sticky/opaque/z-index rules in its header comment are the same
  three bugs solved twice.
- **No tests.** Matching the rest of the repo, which has none and no runner. The
  fixed-point property above is what a suite would assert first.
