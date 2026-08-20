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

There is no database, no volume and no autosave. A story map is a `.storymap`
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

The one consequence worth knowing: work you have not exported lives only in the
browser tab. The board warns you before you close it, and undo goes back 100
steps, but neither survives the tab.

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

The actions are icon buttons: undo and redo, then add-activity / add-release /
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

## The DSL

Full reference at `/dsl`; the grammar lives in `src/lib/storymap/`.

```
storymap "Doc-Hub Onboarding" {
  product "client-onboarding"

  release "MVP"
  release "R2"

  activity "Discover documentation" {
    step "Search the catalog" {
      story "Full-text search" @MVP
      story "Filter by domain" @R2 {
        note "Domain comes from the registry entry."
      }
      story "Saved searches"
    }
    step "Open a product"
  }
}
```

Seven decisions the format makes, each argued where it is implemented:

- **One product, by shortname.** A map names its product with doc-registry's
  `slug`, not the display name — the name is editable in the CMS, the slug is
  the identity, so the slug is what survives a rename. Declaring it twice is an
  error, because two declarations mean a bad merge.
- **Braces, not indentation.** Whitespace is never syntax, so a file that has
  been through a chat window or a different editor still parses.
- **Release order is band order.** No ordinal to drift out of step with the file.
- **No `@release` means below the line.** Absence is the encoding; there is no
  keyword to spell wrong.
- **Release titles are unique.** A story refers to a release by title, which is
  what keeps identifiers out of the file entirely.
- **Empty cards are real.** A step with no stories keeps its column.
- **Comments do not survive the board.** Import, export, and they are gone.

### What round-trips

| Preserved | Not preserved |
|---|---|
| Map title | Comments — every one of them |
| The product shortname | Blank lines |
| Release set and band order | Indentation width and style |
| Structure and order of every card | `@"Bare"` vs `@Bare` (normalised) |
| Priority order within a cell | `{ }` on an empty card (omitted) |
| Release assignment, and unassignment | `release` interleaved with activities |
| Notes, and their order | (`product` and `release` are hoisted to the top) |

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

Two browser-facing links and one in-cluster call. The split is the one
`doc-portal` already draws: a link is resolved by the visitor's browser and must
be an address the browser can reach; a call is made by this server and must not
be, or it leaves the cluster to come back in to a Service one DNS name away.

| Variable | Default | Used by |
|---|---|---|
| `DOC_PORTAL_URL` | `http://doc-portal.localhost` | the board's footer |
| `REGISTRY_URL` | `http://doc-registry.localhost` | the footer, and the picker's "register one" link |
| `REGISTRY_API_URL` | `http://localhost:1337` | **in-cluster**: the product picker's list |
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
