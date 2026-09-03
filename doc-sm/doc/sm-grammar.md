# The `.storymap` format

The source-text DSL a doc-hub story map is written in. A story map is a text
file: `doc-sm` imports one, edits it, and exports it again. The file belongs in
the repository of the product it describes, where it diffs, reviews and merges
like everything else there.

The grammar lives in `doc-sm/src/lib/storymap/` — `lexer.ts`, `parser.ts`,
`model.ts` — and this document is a reference for it.

---

## 1. A worked example

```
// Story map exported by doc-sm.

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
        note "Domain comes from the registry entry, not a\
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
}
```

Two cards in it carry a point. `story "Saved searches"` has no `@`, so it sits
below the line — known, not committed to. `step "Open a product"` has no body at
all: a step that has been named and has no stories yet. Both are first-class
states.

---

## 2. Grammar

EBNF. `{ x }` is zero or more, `[ x ]` is optional, `|` is alternation.

```
File        = StoryMap , EOF ;
StoryMap    = 'storymap' , String ,
                           [ '{' , { Product | Space | Delivery | Activity | Note } , '}' ] ;
Product     = 'product'  , String ;   (* at most one *)
Space       = 'space'    , String ;   (* at most one; defaults to the product *)
Delivery    = 'delivery' , String , ( 'sprint' | 'release' ) , [ TicketRef ] ,
                           [ '{' , { Note } , '}' ] ;   (* order is timeline order *)
            | 'release'  , String , [ TicketRef ] ,
                           [ '{' , { Note } , '}' ] ;   (* older spelling, still read *)
Activity    = 'activity' , String , { TicketRef | StatusRef | Tag } ,
                           [ '{' , { Persona | Step | Note } , '}' ] ;
Persona     = 'persona'  , String ;   (* the activity's cast; unique within it *)
Step        = 'step'     , String , { TicketRef | StatusRef | Tag } ,
                           [ '{' , { Story | Note } , '}' ] ;
Story       = 'story'    , String , { DeliveryRef | TicketRef | StatusRef | Tag } ,
                           [ '{' , { As | Want | So | Note } , '}' ] ;
As          = 'as'       , String ;   (* a persona this activity lists *)
Want        = 'want'     , String ;   (* one clause, one line, however long *)
So          = 'so'       , String ;
Note        = 'note'     , String ;
DeliveryRef = '@' , ( Ident | String ) ;   (* at most one, any order *)
TicketRef   = '#' , ( Ident | String ) ;   (* at most one *)
StatusRef   = '~' , Ident ;                (* at most one *)
Tag         = '+' , ( Ident | String ) ;   (* any number; any card *)
String      = '"' , { Char | Escape | Splice } , '"' ;
Escape      = '\' , ( '"' | '\' | 'n' | 't' ) ;
Splice      = '\' , newline , { space } ;   (* carries the string on; is a break *)
Ident       = ( Letter | Digit | '_' ) , { Letter | Digit | '_' | '-' } ;
Comment     = '//' , { Char } ;   (* trivia; discarded by the lexer *)
```

The grammar is LL(1) — one token of lookahead — which is possible because every
user-supplied name is a quoted string and can therefore never collide with a
keyword.

---

## 3. Lexical rules

**Braces, not indentation.** Whitespace is a formatting choice and never syntax.
A file that has been through a chat window, an editor with different tab
settings, or a copy-paste still parses. Space, tab, form feed, vertical tab and
newlines are all trivia. `\r\n` counts as one newline, so columns are right on a
file that came off Windows.

**Comments** are `//` to end of line and are discarded by the lexer. They never
reach the parser.

**Keywords** — the words that are keywords rather than identifiers:

```
storymap  product  space  persona  as  want  so
delivery  sprint   release
activity  step     story  note
```

**Identifiers** start with a letter, a digit or `_`, and continue with letters,
digits, `_` or `-`. Digits are allowed at the start because a ticket id may be
numeric: `#42` is one token, and so is `#client-onboarding-42`.

**Sigils** are the four single characters `@ # ~ +`, plus `{` and `}`.

**Strings** are double-quoted.

- Escapes are `\"`, `\\`, `\n` and `\t`. Anything else after a backslash is
  reported as an unknown escape.
- A **bare newline ends an unterminated string**. This is the safety rule that
  stops one missing quote from swallowing the rest of the file into a single
  token.
- A **trailing backslash splices** the string onto the next line, and that split
  *is* a line break in the value. Leading whitespace on the continuation is
  dropped, so a note can be indented to sit under its opening quote without that
  indentation leaking into the text:

  ```
  note "Domain comes from the registry entry, not a\
        free-text field that anyone can mistype."
  ```

  One pair of quotes for the whole note, however many lines it runs to.

**Refused before scanning**: a file containing a NUL byte ("this does not look
like a text file") and a file larger than 2 MiB. A leading byte-order mark is
stripped rather than reported.

---

## 4. The constructs

### `storymap "Title" { … }`

One per file. A second `storymap` block is an error rather than a merge — two
maps in one file is almost always a bad paste, and merging them would bury it.
The body is optional; `storymap "Untitled story map" { }` is a valid empty map.

### `product "shortname"`

At most one. The registry **shortname**, not the display name: the name is
editable in the CMS, the shortname is the identity, so it is what survives a
rename. Declaring it twice is an error, because two declarations mean a bad
merge.

### `space "CLONB"`

At most one. Where tickets are raised — a Jira project key, or whatever the
tracker calls the container an issue belongs to. **Left out when it is simply
the product shortname**, which is the common case.

### `delivery "Sprint 24" sprint [#ticket]`

One band of the timeline. **Declaration order is timeline order** — there is no
index and no date. An index drifts out of step with the file; a date is the one
thing here that would go stale on its own. The tracker holds the calendar, this
holds the sequence.

- The kind word is required and is one of `sprint` or `release`. A sprint is a
  kind of delivery, not a different thing: both behave identically and the word
  is for reading. "Four sprints and a release" says something five equal bands
  do not.
- A band carries its own `#ticket` — a sprint has a number in the tracker, a
  release has a version. It takes no `~status` and no `@`.
- **Band titles must be unique.** A story refers to a band by title, which is
  what keeps card identifiers out of the file entirely. A band's own `#ticket`
  is not such an identifier: nothing resolves against it.
- `release "MVP"` is the older spelling and still parses, meaning
  `delivery "MVP" release`. Nothing writes it any more — one trip through the
  board converts a file, which makes it a migration path rather than a dialect
  the format keeps.

### `activity "…"`, `step "…"`, `story "…"`

Three kinds of card, and the only three. They line up with the three levels
every tracker has:

| Card | Row | Raises | Takes `@delivery` |
|---|---|---|---|
| `activity` | the backbone | a **capability** | no |
| `step` | what the user does | an **epic** | no |
| `story` | the unit of work | a **story** | yes |

Only a story takes a `@delivery`: an activity and a step span every band, so
*when* the work happens is settled one level down. Putting a band on either is
refused with that reason.

**Empty cards are real.** A step with no stories, or an activity with no steps,
keeps its place. Both are ordinary states mid-workshop.

### `persona "…"`

Listed inside the activity it belongs to, one per line, unique within that
activity. An activity is where "who is doing this?" actually gets asked — once
per thing people do, not once per product.

### `as` / `want` / `so`

Every story states its need in the formal story language, modelled as three
fields rather than one sentence of prose:

```
story "Full-text search" {
  as "Business analyst"
  want "to search every product at once"
  so "I can answer a question without knowing which product owns it"
}
```

- `as` is a **reference**: it must name a persona its own activity lists, and no
  other. If a story is written for somebody the activity never mentioned, one of
  the two is wrong, and the parser says which activity and what it does list.
- `want` and `so` are the story's own words. Each is one clause of one sentence
  and is **collapsed to a single line** whatever whitespace it contains.
- A story names **one** persona; a second `as` is an error.
- All three are optional and independently so. A story with only a title is
  where every card starts.

### `note "…"`

Free prose. Allowed on the map itself, on a delivery, and on any card. A note is
**wrapped to 50 columns** on the way in — prose is read in lines of roughly that
length, and it keeps the file legible in a diff, which is where notes are
actually reviewed. Wrapping is idempotent, a deliberate paragraph break
survives, and a single word longer than the measure is left to overflow rather
than cut in half.

---

## 5. Annotations

Four annotations may follow a card's title, in **any order** — there is no
reading in which one order is more correct.

| | Says | Per card | On |
|---|---|---|---|
| `@"Sprint 24"` | the one band it sits in | at most one | story |
| `#CLONB-42` | the one thing it is | at most one | activity, step, story, delivery |
| `~in-progress` | the one place it has got to | at most one | activity, step, story |
| `+search` | something that is *also* true | any number | activity, step, story |

A repeat of any of the first three is an error rather than last-one-wins,
because a repeat means a bad merge.

### `@delivery` — the band

Must name a `delivery` declared at the top. **No `@` means below the line**: a
story that is known and not committed to. Absence is the encoding, so there is
no keyword to spell wrong.

Written bare when the name is one word and quoted when it is not — `@MVP`,
`@"Q3 2026"`. The two forms mean the same thing; the board picks the right one
on export.

### `#ticket` — the id

**The ticketing system issues ids and doc-sm never invents one.** A card carries
the id that system issued, whole, after a `#`. No `#` means not linked, which is
where every story starts.

### `~status` — the state

One of, in workflow order:

```
~open  ~analysing  ~ready  ~in-progress  ~done  ~closed
```

**The default is `open` and is never written to the file.** Once a card carries
a ticket the ticketing system is the truth and anything stored here is a cached
copy of it. Any other word after `~` is an error listing the six.

### `+tag` — the free label

`+legal`, `+risk`, `+"needs the payments team"`. A bare word or a quoted string,
exactly as `@` and `#` take their argument.

- **The vocabulary is open.** Nothing validates a tag beyond the shape of the
  word, so `+legel` is a tag rather than an error. A closed set would have to be
  decided once for every team that will ever map a product, and the useful tags
  are exactly the ones nobody could have guessed — the squad that owns it, the
  regulation that applies, the platform it only affects.
- **Case does not make a second tag.** `+Legal` and `+legal` are one label
  written twice; the duplicate check folds case and the parser refuses the
  second. What is *stored* is what was typed, so the file can still say `+GDPR`.
- `+""` is refused rather than dropped — a tag that vanished on export would be
  a round-trip failure the format does not have anywhere else.

---

## 6. Semantic rules

Checked after parsing, each reported with a line, a column and a hint:

- `product` declared at most once.
- `space` declared at most once.
- Delivery titles unique across the map.
- Every `@` resolves to a declared delivery. Names are case-sensitive; a
  near-miss is suggested.
- Every `as` resolves to a persona **its own activity** lists. Names are
  case-sensitive; a near-miss is suggested, and an activity with no cast is
  told to add one.
- Persona names unique within an activity.
- One `@`, one `#` and one `~` per card, and `~` from the six-word vocabulary.
- Tags unique per card, case-insensitively, and non-empty.
- One `storymap` block per file.

---

## 7. What the board writes

**The file is the artefact, and the board is a projection of it.** Every gesture
— a drag, a rename, a status change — is compiled into a replacement of the one
span it is actually about, so everything outside that span comes back
byte-identical: comments, blank lines, and somebody's own alignment all survive
an edit. Nothing re-renders the whole document.

When the board does write a span, it writes in one style:

- Two spaces of indentation per level, spaces never tabs.
- `~open` omitted, being the default; setting a card back to Open removes the
  annotation rather than spelling it.
- `@Bare` where the delivery name is a single word that is not a keyword,
  `@"Quoted"` otherwise. The two forms mean the same thing.
- Notes wrapped to 50 columns and carried on with a trailing backslash; a `\n`
  escape read from a file is written back as such a splice.
- `delivery`, never the legacy `release "…"` spelling — so one trip through the
  board converts an old file.
- `{ }` omitted on a card with an empty body.
- Each of `@`, `#` and `~` is its own span, so changing a card's status does not
  disturb the ticket sitting next to it on the same line.

A stale position is refused rather than applied to whatever now sits at that
index: an edit that does not resolve against the document last parsed returns
the source unchanged.

## 8. Errors

Parse errors are **collected, not fatal** — up to 50, each with a line, a column,
the width of the offending token and a hint showing the correct form. These
files are written in an editor with no language server and imported through a
file picker; failing on the first problem would mean one trip through a file
dialog per typo. Past 50 the parser stops and says so. A failed import leaves
the board on screen untouched.

---

*Exported from `doc-hub/doc-sm` — the `/dsl` reference page (`src/pages/dsl.astro`),
`src/lib/storymap/lexer.ts`, `src/lib/storymap/parser.ts`, `src/lib/storymap/model.ts`
and `src/lib/storymap/problems.ts`.*
