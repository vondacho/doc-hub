# doc-sm

The **story mapping** board of the living documentation hub — the one place in
doc-hub where you *make* something rather than read it. Activities across the
top, the steps people take underneath them left to right, and the stories
stacked into the release that will carry them.

The hub's pitch gives doc-hub two capabilities: **create** and **search**.
`doc-portal` is search. This is create.

It is the first of three sibling modelling boards — `doc-sm`, `doc-em` and
`doc-es` (story mapping, event modeling, event storming). Where a decision here
could be reused by the other two it has been kept free of story-map vocabulary;
see [What is not built](#what-is-not-built) for which files those are and when
to extract them.

## The board keeps nothing

There is no database and no volume, and nothing about a map reaches the
server. A story map is a `.storymap`
file: you import one, edit it, and export it again. The file belongs in the
repository of the product it describes, where it diffs, reviews and merges like
everything else there.

doc-sm makes exactly one request, and the map is not in it: the board reads the
registered products from `doc-registry` to fill the picker that says which
product a map is about. Nothing about the map itself is ever sent anywhere. If
that read fails the picker becomes a plain text box and everything else works —
the registry fills one control, it is not what the page is about.

That is not a limitation, it is the same position `doc-portal` takes about C4 and
events, in its `src/lib/product-sections.ts`:

> Rebuilding either here would only produce a staler second view over the same
> model.

A story map held in the registry would be exactly that staler second view. The
registry holds product identity; the repository holds the model.

The one consequence worth knowing: work you have not exported is not in a file
yet. The board warns you before you close it, undo goes back 100 steps, and the
browser keeps a copy of the map — see below — but undo does not survive the tab,
and a copy in one browser is not the artefact.


## The board saves itself, in your browser

The board keeps a copy in `localStorage`, a second after you stop changing it.
Close the tab, sleep the laptop, crash the browser — reopen the page and the
board you had open comes back.

What is stored is **the file**, byte for byte the same text the export button
hands you. Not the board model, not JSON with the board inside it. The format
already round-trips, so a restored board is a parsed file and cannot be a shape
the parser has never seen; there is no second serialisation to keep in step with
the first; and an entry is recoverable by hand — copy it out of devtools and it
is simply the `.storymap` file.

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

## Pages

| Route | What it is |
|---|---|
| `/` | The board. Server-rendered shell with the product list; the board itself is a React island |
| `/dsl` | The `.storymap` format — a worked example, the rules, the grammar |
| `/healthz` | `{"status":"UP"}` for the chart's probes |
| `/404` | Two links, because doc-sm has two pages |

## This is the repo's only client-side JavaScript

`doc-portal` ships none, and argues the position in its `SearchBar.astro`: a
search is a GET form because the query belongs in the URL, and type-ahead waits
until scanning stops working.

That argument does not reach a story map. A board is direct manipulation — pick
a card up, put it somewhere else — and there is no URL, no form and no round trip
that expresses *"this story moved from R2 to MVP and above the one below it"*.

So React is here for exactly one component, `<StoryMapBoard client:only>`. Every
other page is server-rendered HTML with no script attached. The day a second
island appears is the day to ask whether this is still a documentation site.

## The toolbar

The actions are icon buttons: undo and redo, then add-activity / add-sprint /
add-release /
load-the-example, then import, preview and export, with a rule between the
groups. Eight labelled pills wrapped onto two lines on a laptop and pushed the
board below the fold, which on a tool whose point is seeing a wall of cards at
once is a real cost.

An icon is never the only signal, for the same reason colour is never the only
signal on a card. Every button carries its words in an `aria-label`, and a
tooltip that appears on hover **and on keyboard focus** — a `title` attribute
alone is mouse-only, and the person who cannot see a pointer resting on a button
is exactly the person who needs the label. The small in-board controls (the band
rail's move and delete) do use `title`, because they sit inside the board's
scroll container where an absolutely positioned tooltip would be clipped, and
because every one of them is also reachable from a card's menu.

## Personas and the need

**Each activity lists its cast.** Personas are declared inside the activity they
belong to, one `persona` per line, and the backbone card shows them as a
multi-line note. An activity is where "who is doing this?" actually gets asked —
once per thing people do, not once per product — and putting the answer on the
backbone means the top row of the board tells you whose map this is, which a row
of bare titles never does.

**A story may name a persona its own activity lists, and no other.** That is what
keeps the list a real cast rather than a decoration: if a story is written for
somebody the activity never mentioned, one of the two is wrong, and the parser
says which activity and what it does list.

**Every story states its need** in the formal story language:

```
story "Full-text search" @MVP #CLONB-42 ~in-progress {
  as "Business analyst"
  want "to search every product at once"
  so "I can answer a question without knowing which"
     "product owns it"
}
```

Three fields rather than one sentence of prose, because the three are different
kinds of thing. `as` is a *reference*, so it cannot drift from the cast; `want`
and `so` are the story's own words. The card composes them — *As a Business
analyst, I want …, so that …* — rather than storing the sentence, so the fields
stay the single record and cannot disagree with a cached copy.

All three are optional and independently so. A story with only a title is where
every card starts, and a partial need composes as far as it has been thought
through rather than hiding until somebody fills in the third box.

The `so that` clause earns its place in the model rather than in prose:
doc-portal's product view already promises to keep it "intact from the story
file", and a field is what makes that promise keepable.

**Moving work between activities carries its readers with it.** A story may only
name a persona its own activity lists, so dragging a step — or a card, or
promoting a step to an activity — into somewhere that never mentioned its reader
would export a file that will not parse: the board would look fine and the file
would be broken, which is the worst pairing. The destination's cast is extended
instead of the story's persona being cleared, because that is what actually
happened — work for a business analyst now lives under this activity, so this
activity serves business analysts.

One detail with a reason: a `note` may genuinely be several lines and carries
its breaks as escapes, while `want` and `so` are collapsed to a single line
whatever they contain. The board composes the three clauses into one sentence,
and a stray newline inside one would show up in the middle of it.

### Reading a wide board

Three things make a large map readable, and all three are layout rather than
tricks.

**Notes wrap at 50 characters.** A note is prose, and prose is read in lines of
roughly that length in every typeset thing there has ever been — it also keeps a
`.storymap` file legible in a diff, which is where these notes are actually
reviewed. The breaks are carried by the text, not faked in CSS, so the file and
the card show the same thing. Wrapping is idempotent, a deliberate paragraph
break survives, and a single word longer than the measure is left to overflow
rather than cut in half; a URL broken in two is worse than a long line.

In the DSL a **trailing backslash carries the string onto the next line**, and
that split is the break:

```
note "Domain comes from the registry entry, not a\
     free-text field that anyone can mistype."
```

One pair of quotes for the whole note, however many lines it runs to — so there
is only one place to leave a quote off — and the file stays inside the same
50-column measure the text does. Continuation lines are indented to sit under
the opening quote; the lexer drops that indentation, so it is presentation and
nothing else.

The safety rule is untouched: a **bare** newline still ends an unterminated
string, so one missing quote cannot swallow the rest of the file. Only an
explicit backslash carries a string on. A `\n` escape is still read too, for
anything writing these files by machine, and is written back as a splice.

`want` and `so` are never wrapped at all. Each is one clause of one sentence,
so there is nothing in them to break, and a long clause is simply a long line.

**Detail is collapsed by default.** A card shows its title; its cast, its need
and its notes are behind a toggle, and every card starts closed. That is what
keeps a board of eighty stories the size of eighty titles — the thing the
narrow columns and the zoom were both reaching for.

The toggle is a **caret immediately right of the title** — pointing down when
closed, up when open. Beside the thing it discloses rather than below it, where
it would read as the first line of the content it is meant to be hiding.

It is **always visible** when a card has something to show, never hover-only: it
is the only sign that a card is hiding anything, and a card whose contents can
only be found by accident is a card whose contents are lost. It carries no
words, but its accessible name says what it hides — *cast* on an activity,
*need* on a story, *notes* elsewhere — along with `aria-expanded`.

Putting it there moved the card's action menu out of the top-right corner and
into the same row: two controls cannot share one corner. The menu now reserves
its space instead of being absolutely positioned, so revealing it on hover no
longer nudges the title.

One button in the toolbar opens or closes them all. It reads the board rather
than remembering a mode: if anything is open it closes everything, otherwise it
opens everything, so its meaning is always the opposite of what you can see. It
is disabled — with the reason — on a board where nothing has been written yet.

Opening a card is not an edit: it is not undoable, it never reaches the exported
file, and two people reading the same map may reasonably have different things
open.

### Editing notes

The free notes on any card are editable in place, the way titles are — click the
text, type, click away. One difference, and it is the point: **Enter inserts a
line break**. A title is one line and Enter means "done"; notes are prose, and a
prose box where Return commits is a box you cannot write a list in. Committing
moves to blur and to Cmd/Ctrl+Enter, and Escape still abandons without
dispatching.

**A blank line separates one note from the next.** That is the whole rule. A
single newline stays inside its note, which is what makes a wrapped sentence —
or a list — one note rather than four. The renderer joins by the same rule that
the parser splits by, so the block you type is the block you see, and each note
is wrapped to the 50-column measure on the way in exactly as if it had been read
from a file.

A card with nothing written shows no caret — a caret means "there is more here",
and one on an empty card is a promise of nothing — so **Add a note** lives in the
card's menu. It seeds a placeholder the way a new card does, which makes the
caret appear and the text clickable.

### Editing the need

A story's need is drawn as **three lines, one per clause**, each wrapping on its
own:

```
As a Business analyst,
I want to search every product at once,
so that I can answer a question without knowing which product owns it.
```

A line per clause rather than one composed sentence, because that is how the DSL
models them — and because a sentence can only be replaced whole, where three
lines can each be corrected on their own. Unwritten clauses show a muted
placeholder, so a story with nothing written is still an invitation rather than
a blank.

`want` and `so` edit in place, and here **Enter commits** — the opposite of the
notes editor, for the opposite reason. Each is one clause of one sentence, never
several lines; a break inside one would be a break in the middle of it. The file
still wraps them to the measure, because that wrapping belongs to the file.

The persona is a **`select`, not a text box**, over exactly the personas its
activity lists. Free text there would let a story be written for somebody the
activity never mentioned — a file that then fails to re-import, which is the one
failure the whole persona design exists to prevent. An activity with no cast
gets a disabled control saying so, rather than an empty dropdown that would read
as "there are no personas" instead of "none have been listed here".

Every story card is expandable for this reason, whether or not anything is
written yet: a story exists to answer *who wants this, and why*, so the way in
belongs on the card.

**Still not editable on the card**: an activity's cast, which is a list of
declared names its stories resolve against. Change it in the DSL — the preview is
editable and applies straight back to the board.

**Narrow cards.** A story map is read *across*: the useful question is how many
steps fit on screen, and every rem of card width costs one. So the column is
narrow and titles and notes wrap instead — trading vertical space, which is
cheap, for horizontal space, which is not. **Notes are never clamped**: a note
that runs to five lines runs to five lines. Truncating it would hide the one
sentence somebody wrote down to be remembered.

**Zoom**, on a fixed ladder from 100% to 160%; the percentage is a button that
resets to 100%. The range only goes up: it used to start at 60%, on the theory
that shrinking is how a wide board fits on a screen, but the board has since
grown two better answers to that — narrow columns, and detail that stays
collapsed until asked for. Neither costs any legibility, and shrinking below a
readable size costs nothing else. It is implemented by scaling the board's font size, with every
width, gap and padding measured in `em` against it — *not* by `transform:
scale()`. A transformed ancestor breaks `position: sticky`, which the header rows
and the band rail depend on, and confuses dnd-kit's hit-testing, which every drag
depends on. Scaling the layout keeps both honest.

**Fullscreen**, on the board and its toolbar together. Anything outside the
fullscreen element is not painted, so fullscreening the grid alone would take the
controls with it — no zoom, and no way back except Escape — and would make a
dragged card vanish on pickup, since the DragOverlay renders beside the grid. The
dialogs are unaffected: `showModal()` puts them in the browser's top layer, which
paints above a fullscreen element. State follows `fullscreenchange` rather than
the click, because Escape and the browser's own chrome exit without asking.

**Preview** (the eye) opens the `.storymap` file this board would export, in a
dialog, with copy and apply buttons. It is a native `<dialog>` — focus trap,
inert background and Escape come with it rather than being hand-written.

The text is **editable**, and applying it replaces the board. For some changes
that is plainly the better tool: renaming six stories, or reordering a whole
activity, is a find-and-replace there and twelve drags out here. The draft is
seeded when the dialog opens and belongs to you from then on — closing without
applying discards it, which the footer says.

Applying is **undoable**. It uses `applyText` rather than `import` precisely so
the history survives (see the action's comment in `src/lib/board/reducer.ts`):
rewriting a board by hand is the largest single edit the tool offers and should
be the easiest to take back. A parse failure changes nothing — the problems
appear above the text, with line and column, and the board is untouched.

### The product line is ignored on apply

`product "…"` round-trips through the preview text like everything else, and
editing it there does nothing. The product is owned by the picker, which chose
it from the registry; text typed into a box is validated against nothing, and
letting it win would put an unregistered or misspelled shortname into a file
with nothing to catch it. The dialog says so up front rather than leaving it to
be discovered by an edit that appears to have been ignored — because it has.

The asymmetry with **file import** is deliberate: a `.storymap` file on disk
*does* set the product, because naming its product is how the shortname travels
between people at all. `applyText` in `src/lib/board/convert.ts` is the one
place that difference lives.

Copying tries `navigator.clipboard` and falls back to `execCommand`, because the
modern API needs a secure context and doc-sm is served over plain HTTP through
the ingress. That works on a local cluster — browsers trust `*.localhost` — and
would quietly stop working the first time this is deployed somewhere real
without TLS. If both fail the text is selected and the dialog says which keys to
press, rather than leaving a button that silently did nothing.

The two buttons on the empty board keep their words. They are the onboarding
path, and two unexplained circles on an otherwise blank page would be a riddle.

## Tickets and statuses

**Every row of the board carries a ticket and a status**, and the three rows line
up with the three levels every tracker has:

| Row | Raises | In the sample |
|---|---|---|
| Activity | a **capability** | `CLONB-1..3` |
| Step | an **epic** | `CLONB-10..15` |
| Story | a **story** | `CLONB-42` and up |

That is not a coincidence being exploited — it is why a story map is worth
keeping next to a backlog at all. Only a story takes a `@delivery`: an activity
and a step span every band, so *when* the work happens is settled one level
down, and putting a band on either is refused with that reason.

**doc-sm owns neither the id nor the status.**

- **The ticketing system issues ids.** There is no action anywhere in this
  component that generates one — a board minting its own would hand out names
  that collide with real tickets. Ids arrive from a file, from an edit in the
  preview, or from the ticketing system when a ticket is raised.
- **An empty id is not shown.** A story with no ticket shows no badge at all,
  not a placeholder. Until the ticketing system has heard of it there is nothing
  true to display, and an empty slot on eighty cards is eighty pieces of noise.
- **Status defaults to Open** and is always shown. `Open`, `Analysing`, `Ready`,
  `In progress`, `Done`, `Closed`, in workflow order.
- **The ticketing system stays the truth.** You can set a status here and in the
  DSL, because a file has to carry one and a board is useful offline — but once a
  story is linked, that is a cache of what the tracker last said. The card menu
  says so: on a linked story the entries read "Mark Done *here only*".

### The ticketing space

Where tickets land — a Jira project key, or whatever the tracker calls the
container an issue belongs to. Stated with `space`, and **left out when it is
simply the product shortname**, which is the common case; writing the same word
twice on every map would make that case noisy to serve the uncommon one.

Picking a product on a board that has no space **initialises** it to the
shortname. Changing the product afterwards leaves a settled space alone: tickets
already raised carry keys from it, and silently re-pointing the map at another
space would strand them.

### Publishing

The paper-aeroplane button raises a ticket for every story that has none. It is
the only control in doc-sm that changes something outside doc-sm, and the only
one that cannot be undone — the board's history would happily roll back the
ticket *ids* while the real tickets stayed exactly where they were, which is
worse than offering no undo at all.

So it is **confirmed twice, with two different questions** — two identical "are
you sure?" prompts only train people to click through both:

1. **Review** — every story that would get a ticket, by name, with the space they
   land in. This catches the mistake that actually happens, which is not
   mis-clicking but publishing the right board into the wrong space.
2. **Commit** — type the space name. A deliberate act no stray Return can
   produce, which also re-reads the most consequential field on the way past.

The primary button is not focused on either step.

Tickets are raised **one at a time, and recorded as each returns**. A failure at
story seventeen leaves sixteen real tickets already written down, rather than
sixteen tickets in somebody's tracker that this board has no record of — the
worst outcome the operation has. Failures do not stop the run; they are reported
by name, and publishing again retries exactly those, because everything that
succeeded now has a ticket and is no longer unbound.

### The connected system

`TICKETING_API_URL` is global configuration, and **empty by default — which is a
working state.** With nothing configured every story is unlinked, reads Open, and
"Create a ticket" is disabled with the reason on it. A guessed default would turn
*not configured* into *configured wrongly*, which is much harder to diagnose.

It must name an **adapter**, not a tracker's own API. doc-sm speaks two calls:

```
POST {base}/tickets          { product, title }  ->  { id, status }
GET  {base}/tickets/{id}                         ->  { id, status }
```

Jira, GitHub and Azure DevOps each spell issue creation differently and each want
credentials. An adapter in front keeps a vendor SDK, a secret, and an opinion
about which tracker a team uses out of this component — which is why the chart
still has no Secret. The calls go through doc-sm's own `/api/ticket` route, so
the in-cluster address is never handed to a browser.

A status the adapter returns that doc-sm does not recognise is reported, not
guessed at. A story a tracker calls "Awaiting UAT" is not Open, and saying so
would be a false statement about somebody's work.

### Why the status badge has no colour

`global.css` reserves four colours for status and says nothing else may borrow
them — those four mean *health*, and a workflow state is not health. Nor is a
seventh, eighth and ninth hue invented: this board's primary encoding is already
colour (magenta, blue, yellow for the card kinds), and a second colour system on
top would wreck the first. The status is a word, with weight and fill separating
work in flight from work that is finished.

## The DSL

Full reference at `/dsl`; the grammar lives in `src/lib/storymap/`.

```
storymap "Doc-Hub Onboarding" {
  product "client-onboarding"
  space "CLONB"

  delivery "Sprint 24" sprint #CLONB-S24
  delivery "Sprint 25" sprint #CLONB-S25
  delivery "MVP" release #CLONB-R1

  activity "Discover documentation" {
    persona "Business analyst"
    persona "Product manager"

    step "Search the catalog" {
      story "Full-text search" @"Sprint 24" #CLONB-42 ~in-progress {
        as "Business analyst"
        want "to search every product at once"
        so "I can answer a question without knowing which"
           "product owns it"
      }
      story "Saved searches"
    }
    step "Open a product"
  }
}
```

Ten decisions the format makes, each argued where it is implemented:

- **One ticketing space**, stated with `space` and left out when it is just the
  product shortname. Picking a product on a board that has none sets it.

- **Tickets come from the ticketing system.** A story carries the id that system
  issued, whole, after a `#`. doc-sm never mints one. No `#` means not linked,
  which is where every story starts.
- **Status defaults to Open** and is never written when it is the default. One
  of `~open`, `~analysing`, `~ready`, `~in-progress`, `~done`, `~closed`.

- **One product, by shortname.** A map names its product with doc-registry's
  `slug`, not the display name — the name is editable in the CMS, the slug is
  the identity, so the slug is what survives a rename. Declaring it twice is an
  error, because two declarations mean a bad merge.
- **Braces, not indentation.** Whitespace is never syntax, so a file that has
  been through a chat window or a different editor still parses.
- **Declaration order is timeline order.** A `delivery` line adds a band —
  `delivery "Sprint 24" sprint`, `delivery "MVP" release` — and no ordinal or
  date drifts out of step with the file. The tracker holds the calendar; this
  holds the sequence.
- **A sprint is a kind of delivery, not a different thing.** Both kinds are the
  same structure; the word is for reading, and "four sprints and a release" says
  something five equal bands do not. The same three words mean the same in
  `doc-em`, so a band keeps its meaning when a story is carried between boards.
- **A band carries its own `#ticket`.** A sprint has a number in the tracker and
  a release a version. Editable on the board here — unlike `doc-em`, doc-sm
  *issues* tickets through its publish flow, so refusing to store what came back
  would be refusing its own output.
- **`release "MVP"` still opens.** It means `delivery "MVP" release`. Nothing
  writes that spelling any more, so one trip through the board converts a file:
  a migration path, not a dialect the format keeps.
- **No `@delivery` means below the line.** Absence is the encoding; there is no
  keyword to spell wrong.
- **Band titles are unique.** A story refers to a band by title, which is what
  keeps card identifiers out of the file entirely. A band's own `#ticket` is not
  such an identifier — it names the band elsewhere, and nothing resolves
  against it.
- **Empty cards are real.** A step with no stories keeps its column.
- **Each activity lists its cast**, one `persona` per line, and a story may name
  a persona its own activity lists and no other.
- **Every story states its need** — `as` / `want` / `so`, the formal story
  language modelled in three fields rather than written as prose.
- **Notes wrap at 50 characters**, and a trailing `\` carries the string onto
  the next line — one pair of quotes for the whole note.
- **Comments do not survive the board.** Import, export, and they are gone.

### What round-trips

| Preserved | Not preserved |
|---|---|
| Map title | Comments — every one of them |
| The product shortname | Blank lines |
| The ticketing space, when stated | An unstated space, which stays unstated |
| Ticket ids, and being unlinked | `~open`, the default, written back as nothing |
| Bands: order, kind and ticket | Indentation width and style |
| Structure and order of every card | `@"Bare"` vs `@Bare` (normalised) |
| Priority order within a cell | `{ }` on an empty card (omitted) |
| Band assignment, and unassignment | `delivery` interleaved with activities |
| | the older `release "MVP"` spelling, rewritten as `delivery` |
| Notes, their order and their line breaks | A `\n` escape in a note, which becomes a real line break |

The contract the serializer holds to is stronger than "text round-trips":

```
serialize(parse(serialize(d))) === serialize(d)
```

Its output is a fixed point, which is what makes *export, hand-edit, re-import*
safe.

### Errors

Parse errors are **collected, not fatal** — up to 50, each with a line, a column
and a hint. These files are written in an editor with no language server and
imported through a file picker; failing on the first problem would mean one trip
through a file dialog per typo. A failed import leaves the board on screen
untouched.

## Configuration

Four browser-facing links and two in-cluster calls. The split is the one
`doc-portal` already draws: a link is resolved by the visitor's browser and must
be an address the browser can reach; a call is made by this server and must not
be, or it leaves the cluster to come back in to a Service one DNS name away.

| Variable | Default | Used by |
|---|---|---|
| `DOC_PORTAL_URL` | `http://doc-portal.localhost` | the board's footer |
| `PRACTICE_URL` | `http://dev-portal.localhost/doc/practices/story-mapping/` | the header and `/dsl` |
| `REGISTRY_URL` | `http://doc-registry.localhost` | the footer, and the picker's "register one" link |
| `REGISTRY_API_URL` | `http://localhost:1337` | **in-cluster**: the product picker's list |
| `TICKETING_API_URL` | *(empty)* | **in-cluster**: raising tickets. Empty is a working state |
| `BA_PORTAL_URL` | `http://ba-portal.localhost` | the assistant's link to the full prompt set |
| `HOST` / `PORT` | `0.0.0.0` / `4322` | the standalone `@astrojs/node` server |
| `NODE_ENV`, `NODE_OPTIONS` | `production`, unset | Dockerfile / chart |

Read at call time through `src/lib/links.ts`, `process.env` first and
`import.meta.env` second, each falling back to the same default the chart ships.

## Develop

```
npm install
npm run dev        # http://localhost:4321 in dev; the image serves 4322
npm run check      # astro check — types across .astro, .ts and .tsx
npm run build
```

The parser and the board reducer are plain modules with no React and no Astro in
them, so both can be exercised straight from a shell:

```
node --experimental-strip-types --no-warnings - <<'EOF'
import { parse } from './src/lib/storymap/parser.ts';
import { serialize } from './src/lib/storymap/serialize.ts';
import { SAMPLE_SOURCE } from './src/lib/storymap/sample.ts';
const once = serialize(parse(SAMPLE_SOURCE));
console.log(once === serialize(parse(once)) ? 'fixed point holds' : 'FIXED POINT BROKEN');
EOF
```

That separation is deliberate: `src/lib/storymap/` and `src/lib/board/` are the
tool, and `src/components/board/` is a way to drive it.

## Container

```
docker build -t doc-sm:dev .
docker run --rm -p 4322:4322 doc-sm:dev
```

Same shape as `doc-portal`'s image: `node:22-alpine`, `WORKDIR /app` in both
stages because the adapter bakes session paths in at build time, and an
unprivileged `app` user at uid/gid 10001 matching the chart's `securityContext`.

`react`, `react-dom` and `@astrojs/react` are runtime dependencies, not
build-only ones — the built server entry imports the React renderer even though
`client:only` means the server never renders with it.

## What is not built

- **No link from doc-portal.** Deferred to its own change. When it lands, the
  pattern is the one `modelC4Url` already uses: an accessor in the portal's
  `links.ts`, a `/go/<target>` key, and an `app.*` value in its chart. Not a
  per-product deep link — the board has no notion of a product, and a link that
  404s the day it deploys is worse than no link.
- **No persistence, by design.** The registry supplies the product list and
  nothing else; a story map is never written to it. If boards ever need to be
  shared rather than committed, that is a conversation about where the file
  lives, not a reason to put a story map in Strapi.
- **Nothing is written back to the registry.** Choosing a product records its
  shortname in the file; it does not tell doc-registry anything. The metric that
  would close that loop (`metrics.roadmapItemsInFlight`) is written by pipelines,
  not by a browser.
- **No card ids in the file.** Identity is position and title. The lexer already
  reserves `#`, and the parser rejects it with a message saying so, so adding
  ids later is a parser change and not a format break. The trigger is the
  portal's `epics` panel actually needing to point at a slice of a map.
- **No shared package for the sibling boards yet.** Four files here are written
  free of story-map vocabulary and are what `doc-em` and `doc-es` will want:
  `src/lib/storymap/lexer.ts` (its keyword set is a parameter),
  `src/lib/storymap/problems.ts`, `src/lib/board/history.ts` and
  `src/lib/files.ts`. The grid, the cells and the reducer only *look* shareable —
  event modeling is a timeline and event storming is an unstructured wall.
  Extract when `doc-em` makes the lexer a second copy and the first bug is found
  in one of them, not before.
- **No tests.** Matching the rest of the repo, which has none and no runner. The
  fixed-point property above is what a suite would assert first.
