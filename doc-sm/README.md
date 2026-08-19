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

There is no database, no volume, no registry call and no autosave. A story map
is a `.storymap` file: you import one, edit it, and export it again. The file
belongs in the repository of the product it describes, where it diffs, reviews
and merges like everything else there.

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
| `/` | The board. Prerendered shell; the board itself is a React island |
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

## The DSL

Full reference at `/dsl`; the grammar lives in `src/lib/storymap/`.

```
storymap "Doc-Hub Onboarding" {
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

Six decisions the format makes, each argued where it is implemented:

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
| Release set and band order | Blank lines |
| Structure and order of every card | Indentation width and style |
| Priority order within a cell | `@"Bare"` vs `@Bare` (normalised) |
| Release assignment, and unassignment | `{ }` on an empty card (omitted) |
| Notes, and their order | `release` interleaved with activities (hoisted) |

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

Both values are browser-facing links. doc-sm calls nothing, so there is no
in-cluster address here — unlike `doc-portal`, which needs one for the registry.

| Variable | Default | Used by |
|---|---|---|
| `DOC_PORTAL_URL` | `http://doc-portal.localhost` | the board's footer |
| `REGISTRY_URL` | `http://doc-registry.localhost` | the board's footer |
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
- **No persistence, by design.** If boards ever need to be shared rather than
  committed, that is a conversation about where the file lives, not a reason to
  put a story map in Strapi.
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
