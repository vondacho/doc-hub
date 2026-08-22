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

There is no database, no volume and no autosave. A map is an `.examplemap` file:
you import one, edit it, and export it again. The file belongs in the repository
of the product it describes, next to the feature file it produces — which is the
same rule doc-portal states for the rest of the hub, the repository stays the
source of truth.

Nothing about a map reaches this server. The board is `client:only`, so the
parser, the reducer, the readings and both exporters run in the tab that opened
it. This component makes no outbound call of any kind: unlike `doc-sm` it has no
registry to read and no ticketing adapter to raise anything against, and its
chart accordingly has no Secret and no in-cluster address.

The corollary, and the reason the page warns before unload: work that was never
exported existed only in that tab.

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
| show / hide notes | every card's notes at once; individually via the caret beside each title |
| zoom, fullscreen | 100 %–160 %, and the board alone filling the screen |

Everything a card can do is on the card: click the title to rename it, the caret
to show its notes, the menu at the end of the row for adding, moving and
deleting. Drag with the pointer or lift with the keyboard — space to pick up,
arrows to move, space to drop — and every move is announced.

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
| few cards, nothing open | the story looks ready — the outcome the session is for |

They are readings, not verdicts. Each one names the count and the cards it is
talking about, so a person can disagree with it out loud. The thresholds are
named constants at the top of `src/lib/board/reading.ts` for the same reason.

## Two exports, and only one of them round-trips

**`.examplemap`** is the file this board reads and writes. Import it, edit it,
export it, and you have the map back.

**`.feature`** is Gherkin, and it is a one-way door. Three of the four colours
have a Gherkin keyword — story is `Feature:`, rule is `Rule:`, example is
`Example:` — and the fourth has none, because an open question is not a
specification. So the feature file cannot carry the red cards, and the board
says how many it is about to drop before it writes one.

A rule with no examples still emits its `Rule:`, followed by a comment saying
nobody has agreed what it means. Dropping it silently would lose the most useful
thing on the board.

```gherkin
Feature: Redeem a voucher

  Rule: A voucher must not be expired

    Example: A voucher that expired yesterday is refused

    Example: A voucher expiring today is accepted

  Rule: One voucher per basket

    # No examples yet — nobody has agreed what this rule means.
```

The examples are titles, not steps. Turning `A voucher that expired yesterday is
refused` into Given/When/Then is the work of writing the test, and a tool that
guessed at it would produce steps nobody wrote and nobody trusts.

## The DSL

`.examplemap`. Braces rather than indentation, so a file that has been through a
chat window or a different editor still parses.

```
// Example map exported by doc-em.

examplemap "Redeem a voucher" {
  story "Redeem a voucher" {
    question "Which currencies can a voucher be issued in?"
  }

  rule "A voucher must not be expired" {
    example "A voucher that expired yesterday is refused"
    example "A voucher expiring today is accepted"
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
ExampleMap = 'examplemap' , String , [ '{' , { Story | Rule | Note } , '}' ] ;
Story      = 'story'    , String , [ '{' , { Question | Note } , '}' ] ;   (* exactly one *)
Rule       = 'rule'     , String , [ '{' , { Example | Question | Note } , '}' ] ;
Example    = 'example'  , String , [ '{' , { Note } , '}' ] ;
Question   = 'question' , String , [ '{' , { Note } , '}' ] ;
Note       = 'note'     , String ;
String     = '"' , { Char | Escape | Splice } , '"' ;
Escape     = '\' , ( '"' | '\' | 'n' | 't' ) ;
Splice     = '\' , newline , { space } ;
Comment    = '//' , { Char } ;
```

What the grammar decides, each of which the source states its reason for:

- **One story.** A second is an error, not a list.
- **An example belongs to a rule** and cannot float. A rule with no examples is
  legal, and is the practice's own warning sign.
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

Preserved: the title, the story, the rules in order, their examples and
questions in order, and every note.

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

Three variables, and all three are browser-facing links. There is no in-cluster
address here at all, because this server calls nothing.

| Variable | Default | Used by |
|---|---|---|
| `DOC_PORTAL_URL` | `http://doc-portal.localhost` | the board's footer |
| `PRACTICE_URL` | `http://dev-portal.localhost/doc/practices/example-mapping/` | the header and `/dsl` |
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
of `helm/doc-sm` minus everything that existed for the registry and the
ticketing adapter.

## What is not built

- **No link from doc-portal, and none from doc-sm.** Both are deferred to their
  own change. The doc-sm one is the more interesting: "open this story in an
  example map" is the real workflow, and it needs a way to carry a story's title
  across, which is a question about a URL contract rather than about this board.
- **No Given/When/Then.** Examples stay titles. See above — writing the steps is
  writing the test.
- **No persistence and no sharing.** If maps ever need to be shared rather than
  committed, that is a conversation about where the file lives, not a reason to
  put an example map in Strapi.
- **No card ids in the file.** Same position as `doc-sm`, for the same reason,
  and the lexer reserves `#` the same way.
- **Still no shared package for the sibling boards.** This component is the
  second copy `doc-sm`'s README predicted, and it makes the case concrete:
  `lexer.ts` (its keyword set is already a parameter), `problems.ts`,
  `board/history.ts` and `files.ts` now exist twice, byte-for-byte apart from
  their keyword sets and error class names. The trigger `doc-sm` named was "the
  first bug found in one of them"; the honest reading now is that `doc-es` should
  not be allowed to become a third copy. `Card.tsx`, `CardMenu.tsx`, `Icon.tsx`
  and `IconButton.tsx` are a second, weaker candidate — they diverged here to
  drop the ticket and persona rows, so extracting them means a props union rather
  than a move.
- **No tests.** Matching the rest of the repo, which has none and no runner. The
  fixed-point property above is what a suite would assert first.
