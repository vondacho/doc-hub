# The `.eventstorm` format

The source-text DSL a doc-hub event storm is written in. A storm is a text file:
`doc-es` imports one, edits it, and exports it again. The file belongs in the
repository of the product it describes, where it diffs, reviews and merges like
everything else there.

The grammar lives in `doc-es/src/lib/eventstorm/` — `lexer.ts`, `parser.ts`,
`model.ts` — and this document is a reference for it. The technique itself is in
`eventstorming.md` beside this file.

---

## 1. A worked example

```
// Event storm exported by doc-es.

eventstorm "Ordering a pizza" {
  product "client-onboarding"
  level process-modelling

  lane "Customer" {
    actor "Hungry customer" @1
    event "Menu opened" @1
    event "Pizza added to the basket" @2
    event "Basket emptied and started again" @2 {
      note "Happens more than anybody expected. Worth\
            understanding before it is designed away."
    }
    event "Order placed" @3 +revenue
    event "Pizza delivered" @8
  }

  lane "Payments" {
    command "Take the payment" @3
    event "Payment requested" @4
    system "Payment provider" @4
    policy "Whenever a payment is refused, hold the order" @5
    event "Payment refused" @5 +revenue
    event "Payment accepted" @5
    hotspot "Nobody agrees whether a refused payment cancels the order" @5 +"ask payments" +revenue
  }

  lane "Kitchen" {
    readmodel "Orders waiting" @6
    event "Order sent to the kitchen" @6
    actor "Kitchen staff" @6
    event "Pizza put in the oven" @6
    opportunity "Tell the customer when it goes in the oven" @6
    event "Pizza handed to the driver" @7
  }
}
```

A process model: three lanes over one timeline, notes stacked at column 5, a gap
in the customer's lane while the others are busy, and a hotspot nobody has
resolved. The payment lane carries the level's whole point — a command, the
event it causes, and the policy that reacts to it.

---

## 2. Grammar

EBNF. `{ x }` is zero or more, `[ x ]` is optional, `|` is alternation.

```
File       = EventStorm , EOF ;
EventStorm = 'eventstorm' , String ,
             [ '{' , { Product | Level | Lane | Card | Note } , '}' ] ;
Product    = 'product'  , String ;   (* at most one *)
Level      = 'level'    , ( 'big-picture' | 'process-modelling'
                          | 'software-design' ) ;   (* at most one; default big-picture *)
Lane       = 'lane'     , String , [ '{' , { Card | Note } , '}' ] ;
Card       = Kind , String , { Column | Tag } , [ '{' , { Note } , '}' ] ;
Column     = '@' , Integer ;   (* one-based; defaults to the next square *)
Tag        = '+' , ( Ident | String ) ;   (* any number; any kind of note *)
Kind       = 'event' | 'actor' | 'system' | 'hotspot' | 'opportunity'
           | 'context'                                     (* big picture *)
           | 'command' | 'policy' | 'readmodel'            (* process modelling *)
           | 'aggregate' | 'ui' ;                          (* software design *)
Note       = 'note'     , String ;
String     = '"' , { Char | Escape | Splice } , '"' ;
Escape     = '\' , ( '"' | '\' | 'n' | 't' ) ;
Splice     = '\' , newline , { space } ;   (* carries the string on; is a break *)
Integer    = Digit , { Digit } ;
Ident      = ( Letter | Digit | '_' ) , { Letter | Digit | '_' | '-' } ;
Comment    = '//' , { Char } ;   (* trivia; discarded by the lexer *)
```

There is no reference to resolve and no second phase: nothing in this grammar
points at anything else, so everything is decided as it is read. The one
whole-file check is the level (§6).

---

## 3. Lexical rules

**Braces, not indentation.** Whitespace is a formatting choice and never syntax.
A file that has been through a chat window, an editor with different tab
settings, or a copy-paste still parses. Space, tab, form feed, vertical tab and
newlines are all trivia; `\r\n` counts as one newline, so columns are right on a
file that came off Windows.

**Comments** are `//` to end of line and are discarded by the lexer. They never
reach the parser.

**Keywords** — the words that are keywords rather than identifiers:

```
eventstorm  product  level  lane  note
event  actor  system  hotspot  opportunity  context
command  policy  readmodel
aggregate  ui
```

**Identifiers** start with a letter, a digit or `_`, and continue with letters,
digits, `_` or `-`. A column ordinal arrives as an identifier of digits and is
checked to be numeric by the parser.

**Sigils.** The scanner recognises four — `@ # ~ +` — plus `{` and `}`. Only `@`
and `+` mean anything in this grammar; `#` and `~` are inherited from the shared
scanner and are reported as unexpected wherever they appear.

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
  note "Happens more than anybody expected. Worth\
        understanding before it is designed away."
  ```

  One pair of quotes for the whole note, however many lines it runs to.

**Refused before scanning**: a file containing a NUL byte ("this does not look
like a text file") and a file larger than 2 MiB. A leading byte-order mark is
stripped rather than reported.

---

## 4. The constructs

### `eventstorm "Title" { … }`

One per file. A second `eventstorm` block is an error rather than a merge — two
walls in one file is almost always a bad paste. The body is optional;
`eventstorm "Untitled event storm" { }` is a valid empty storm.

### `product "shortname"`

At most one. The registry **shortname**, not the display name: the name is
editable in the CMS, the shortname is the identity, so it is what survives a
rename. `null` — no line at all — is an ordinary state, because a workshop often
runs before anything has been registered. A second declaration is an error,
because two declarations mean a bad merge.

There is no `space` beside it, unlike `doc-sm` and `doc-em`. A ticketing space is
where work is raised, and an event storm does not produce work — it produces a
shared picture and a set of seams. The story map next door is where the work is
cut.

### `level big-picture | process-modelling | software-design`

At most one, and **omitting it means `big-picture`** — which is where the
practice starts, and why files written before this setting existed still open.

The level is **declared, not inferred**. It is a statement of intent: a session
that has decided it is modelling a process decided that before placing its first
command. Inferring it from the cards would mean the level changed under the room
as somebody added one, and a facilitator could never set it up in advance.

It may be written anywhere in the storm — the check runs once the whole file has
been read — so `level` at the bottom is as good as `level` at the top.

### `lane "Customer" { … }`

One horizontal swimlane: a department, an actor, a subsystem, whatever the room
is separating. A lane may hold cards and notes and nothing else; nesting one
lane inside another would describe a hierarchy the board does not have.

**Lanes do not have their own clocks.** Column 4 is the same moment in every
lane, which is the whole reason to draw them as rows rather than as separate
walls. Declaration order is top-to-bottom order, and *that* is a list, so it has
no index — see `@column` for why the horizontal axis is different.

A storm with no lane at all parses to no lanes. It is a wall nobody has drawn
on yet, and the board offers the choice — load the example, or put up the wall —
rather than inventing a lane to hold the emptiness.

### Cards

A card is written with the **keyword of its kind**, and there is no separate
colour or type annotation. A card whose keyword said one thing and whose
annotation said another would be a state the file could express and the board
could not.

**Cards may be written before any lane.** Chaotic exploration produces a heap of
events long before anybody agrees which lane they belong to, so a card is legal
at the top level. Every such card is gathered into one unnamed lane — *The wall*
— placed above the named ones, because appending them to somebody's first lane
would be claiming they belong to it.

---

## 5. The ten kinds

The notation is Brandolini's, not a palette, and it is **cumulative**: each
level admits everything the shallower ones do. A process model still has domain
events and hotspots on it — it has *more*, never different.

### Big picture

| Keyword | On the board | What it is |
|---|---|---|
| `event` | Domain event, orange | Something that happened, in the past tense and in the business's words |
| `actor` | Actor, yellow | A person or role who does something |
| `system` | External system, magenta | Something outside the boundary that events come from or go to |
| `hotspot` | Hotspot, red | A problem or disagreement nobody in the room can settle |
| `opportunity` | Opportunity, green | Something worth doing that the timeline has made visible |
| `context` | Bounded context, slate | Where one model's language stops and the next begins |

`context` is a **big-picture** card, not a software-design one. Finding the seams
is the last phase of a big picture: a room that has just spent an afternoon
discovering two departments mean different things by "account" has found a
context boundary, and it needs somewhere to write it down long before anybody
talks about aggregates. (The physical notation draws a context as a boundary
*around* notes rather than as a note. It is a card here because this board has no
way to draw a region — a limitation worth knowing rather than a reading of the
practice.)

### Process modelling adds three

| Keyword | On the board | What it is |
|---|---|---|
| `command` | Command, blue | A request to do something, in the imperative |
| `policy` | Policy, violet | The rule that reacts to an event: whenever this, do that |
| `readmodel` | Read model, teal | The information somebody needs in order to decide |

Together with the event and the external system, these are the causal chain the
level exists to draw: `event → policy → command → system → event`.

### Software design adds two

| Keyword | On the board | What it is |
|---|---|---|
| `aggregate` | Aggregate, pale yellow | The component that accepts commands and emits events |
| `ui` | Screen, white | What a person looks at to decide, and acts through |

`ui` completes the human path the level before it draws: a policy that needs a
person becomes `read model → screen → command`, and without somewhere to put the
screen that chain has a hole in it where the person goes. It is called a
*screen* on the board and `ui` in the file — the practice's own word is "UI",
which is right in a room and wrong in a legend, and the keyword stays `ui`
because that is what somebody hand-editing the file will type.

---

## 6. Annotations

Two annotations may follow a card's title, in **any order**.

| | Says | Per card |
|---|---|---|
| `@5` | which column of the timeline it sits at | at most one, and the last written wins |
| `+revenue` | something that is *also* true of it | any number |

### `@column` — the coordinate

One-based; time runs left to right. `@0` and below are refused rather than
clamped — columns are positions on a wall, not array indices, and a silently
corrected coordinate is a card that is not where the file says it is.

**A column is a coordinate, not a list position.** This is why cards carry `@3`
where the sibling boards refuse index fields: there a card's position *was* its
place in a list, so an index would have been a second copy of the same fact.
Here the board is two-dimensional and the column is the only record of *when* a
note happens — and it is the only way to say the two things a wall says
constantly and a list cannot:

- two notes in different lanes at the same column are **simultaneous**;
- a lane with nothing at column 3 and something at column 4 has a **gap**, which
  on a wall is a visible hole.

**Several notes may share one square.** A moment often turns out to involve an
actor, a system and an event at once, so notes stack at one point of one lane.
They are written with the same `@column` and keep the order they appear in —
the only record of a stacking order there is.

**`@column` may be left out.** A card with no `@` takes the square after the
highest one written so far in its lane, so a run of events typed straight down
needs no numbering.

### `+tag` — the free label

`+revenue`, `+"ask payments"`. A bare word or a quoted string.

- **Every kind takes them, and any number.** The keyword says what a note *is* —
  one answer per card — where a tag says something that is also true of it.
- **The vocabulary is open.** Nothing validates a tag beyond the shape of the
  word, so `+legel` is a tag rather than an error. A closed set would have to be
  decided once for every room that will ever run a storm, and the useful tags
  are exactly the ones nobody could have guessed — the team who has to be asked,
  the system nobody owns any more, the workshop day it came from.
- **Case does not make a second tag.** `+Legal` and `+legal` are one label
  written twice; the duplicate check folds case and the parser refuses the
  second. What is *stored* is what was typed, so the file can still say `+GDPR`.
- `+""` is refused rather than dropped.
- Tags need not be adjacent: `+legal @4 +risk` is legal.

### Why tags are not coloured

On this board colour is *everything*. The ten kinds are Brandolini's ten
colours, they were never ours to choose, and somebody who has stood at one of
these walls has to recognise this one without being told. A second colour system
laid over that would not merely compete with the notation — it would destroy it.
So a tag is a small word in a plain outline that borrows the note's own ink, and
staying quiet is the point of it.

---

## 7. `note "…"`

Free prose. Allowed on the storm itself, on a lane, and on any card. A note is
**wrapped to 50 columns** on the way in — a reading measure, not a screen
measure, and it keeps the file legible in a diff, which is where notes are
actually reviewed. Wrapping is idempotent, existing newlines are kept as hard
breaks, and a single word longer than the measure is left to overflow rather
than cut in half. A blank line separates one note from the next.

---

## 8. Semantic rules

Checked while parsing, each reported with a line, a column and a hint:

- One `eventstorm` block per file.
- `product` declared at most once.
- `level` declared at most once, and one of the three words.
- **A card the declared level does not admit is an error**, not a silent
  promotion. Quietly deepening the level because somebody wrote one `command`
  would change what the file claims about itself without anybody deciding to.
  The message names the level that *would* admit the card, so the fix is one
  word and the error says which. The board enforces the same rule from the other
  side: it will not let the level be lowered past the notes already on the wall.
- `@` takes a whole number of 1 or more.
- Tags unique per card, case-insensitively, and non-empty.
- A lane holds cards and notes only; a lane inside a lane is refused.

---

## 9. What the board writes

**The file is the artefact, and the board is a projection of it.** Every gesture
— a drag, a rename, a change of kind — is compiled into a replacement of the one
span it is actually about, so everything outside that span comes back
byte-identical: comments, blank lines, and somebody's own column alignment all
survive an edit. Nothing re-renders the whole document.

When the board does write a span, it writes in one style:

- Two spaces of indentation per level, spaces never tabs.
- A card it creates or moves is written with an explicit `@column` — the
  coordinate is the fact, and a card whose square depended on the order of the
  lines around it would move when somebody rewrote a neighbour. A card
  hand-written without `@` keeps its implicit column until it is moved, at which
  point the annotation is inserted after the title.
- Each of `@column` and the tags is its own span, which keeps a hand-written
  `+legal @4 +risk` from having its column rewritten out of the middle.
- Notes wrapped to 50 columns and carried on with a trailing backslash.
- `{ }` omitted on a card with no notes.
- Cards are written in column order, and within one column in stacking order.

A stale position is refused rather than applied to whatever now sits at that
index: an edit that does not resolve against the document last parsed returns
the source unchanged.

**The one normalisation** is the loose card. Cards written before the first
`lane` are gathered into the unnamed lane on import, so a file that used them
comes back with that lane written out — which is why the *second* export of such
a file is a fixed point where the first is not.

---

## 10. Errors

Parse errors are **collected, not fatal** — up to 50, each with a line, a column,
the width of the offending token and a hint showing the correct form. These
files are hand-edited in an editor with no language server and imported through
a file picker; failing on the first problem would mean one trip through a file
dialog per typo. Past 50 the parser stops and says so. A failed import leaves
the board on screen untouched.

---

*Exported from `doc-hub/doc-es` — the `/dsl` reference page (`src/pages/dsl.astro`),
`src/lib/eventstorm/lexer.ts`, `src/lib/eventstorm/parser.ts`,
`src/lib/eventstorm/model.ts` and `src/lib/eventstorm/problems.ts`.*
