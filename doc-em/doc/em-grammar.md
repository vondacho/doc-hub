# The `.examplemap` format

The source-text DSL a doc-hub example map is written in. A map is a text file:
`doc-em` imports one, edits it, and exports it again. It belongs in the
repository of the product it describes, next to the feature file it produces.

The grammar lives in `doc-em/src/lib/examplemap/` — `lexer.ts`, `parser.ts`,
`model.ts`, `gherkin.ts` — and this document is a reference for it. The
technique itself is in `examplemapping.md` beside this file.

---

## 1. A worked example

```
// Example map exported by doc-em.

examplemap "Redeem a voucher" {
  product "client-onboarding"
  space "CLONB"

  delivery "Sprint 24" sprint #CLONB-S24 points 13
  delivery "Sprint 25" sprint #CLONB-S25 points 8
  delivery "2026.9" release #CLONB-R9

  story "Redeem a voucher" #CLONB-42 ~analysing @"2026.9" +payments {
    as "Returning customer"
    want "to apply a voucher code at checkout"
    so "I pay the price I was promised"
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
    example "A voucher expiring today is accepted" @"Sprint 25" +edge-case
    question "Is expiry checked when it is applied, or when the basket is paid?" +"ask finance"
  }

  rule "A voucher applies once per basket" {
    example "Applying the same voucher twice leaves one discount" @"2026.9"
  }

  rule "A voucher cannot take a basket below zero" +legal {
    note "The finance team asked for this in writing. Do not\
          change it without them."
    example "A 50 CHF voucher on a 30 CHF basket leaves a total of 0.00 CHF" @"Sprint 24" {
      given "a basket of 30 CHF"
      when "a 50 CHF voucher is applied"
      then "the basket total is 0.00 CHF"
    }
    example "The remaining 20 CHF is not carried to the next order"
  }

  rule "One voucher per basket" {
    question "Does that include the automatic loyalty voucher?"
  }
}
```

It is deliberately a map you would not estimate yet: two rules carry questions,
and `"One voucher per basket"` has no examples at all.

---

## 2. Grammar

EBNF. `{ x }` is zero or more, `[ x ]` is optional, `|` is alternation.

```
File       = ExampleMap , EOF ;
ExampleMap = 'examplemap' , String ,
             [ '{' , { Product | Space | Delivery | Story | Rule | Note } , '}' ] ;
Product    = 'product'  , String ;   (* at most one *)
Space      = 'space'    , String ;   (* at most one *)
Delivery   = 'delivery' , String , ( 'sprint' | 'release' ) ,
             { Ticket | Points } ,
             [ '{' , { Note } , '}' ] ;   (* order is timeline order *)
Points     = 'points'   , Integer ;   (* sprints only; at most one *)
Story      = 'story'    , String , { Ticket | Status | Ships | Tag } ,
             [ '{' , { As | Want | So | Question | Note } , '}' ] ;   (* at most one *)
As         = 'as'       , String ;   (* who the story is for; at most one *)
Want       = 'want'     , String ;   (* what they want; at most one *)
So         = 'so'       , String ;   (* the outcome; at most one *)
Rule       = 'rule'     , String , { Tag } ,
             [ '{' , { Example | Question | Note } , '}' ] ;
Example    = 'example'  , String , { Ships | Tag } ,
             [ '{' , { Step | Note } , '}' ] ;
Step       = ( 'given' | 'when' | 'then' ) , String ;   (* each repeatable *)
Question   = 'question' , String , { Tag } , [ '{' , { Note } , '}' ] ;
Note       = 'note'     , String ;
Ticket     = '#' , ( Ident | String ) ;   (* at most one *)
Status     = '~' , ( 'open' | 'analysing' | 'ready'
                   | 'in-progress' | 'done' | 'closed' ) ;   (* at most one *)
Ships      = '@' , ( Ident | String ) ;   (* names a Delivery; at most one *)
Tag        = '+' , ( Ident | String ) ;   (* any number; any card *)
String     = '"' , { Char | Escape | Splice } , '"' ;
Escape     = '\' , ( '"' | '\' | 'n' | 't' ) ;
Splice     = '\' , newline , { space } ;   (* carries the string on; is a break *)
Integer    = Digit , { Digit } ;
Ident      = ( Letter | Digit | '_' ) , { Letter | Digit | '_' | '-' } ;
Comment    = '//' , { Char } ;   (* trivia; discarded by the lexer *)
```

Parsing is two-phase: everything is read, then the whole-file checks run —
duplicate band titles and `@` references that name no declared delivery. That is
what lets a `delivery` be declared after the example that ships in it.

---

## 3. Lexical rules

**Braces, not indentation.** Whitespace is a formatting choice and never syntax.
A file that has been through a chat window, an editor with different tab
settings, or a copy-paste still parses. `\r\n` counts as one newline, so columns
are right on a file that came off Windows.

**Comments** are `//` to end of line and are discarded by the lexer.

**Keywords**:

```
examplemap  product  space
delivery    sprint   release  points
story       as       want     so
rule        example  question  note
given       when     then
```

**Identifiers** start with a letter, a digit or `_`, and continue with letters,
digits, `_` or `-`. Digits are allowed at the start because a ticket id may be
numeric, and because `points 13` reads its number as one.

**Sigils** are `@ # ~ +`, plus `{` and `}`.

**Strings** are double-quoted.

- Escapes are `\"`, `\\`, `\n` and `\t`. Anything else after a backslash is
  reported as an unknown escape.
- A **bare newline ends an unterminated string** — the safety rule that stops one
  missing quote from swallowing the rest of the file.
- A **trailing backslash splices** the string onto the next line, and that split
  *is* a line break in the value. Leading whitespace on the continuation is
  dropped:

  ```
  note "The finance team asked for this in writing. Do not\
        change it without them."
  ```

**Refused before scanning**: a file containing a NUL byte and a file larger than
2 MiB. A leading byte-order mark is stripped rather than reported.

---

## 4. The map

### `examplemap "Title" { … }`

One per file. A second `examplemap` block is an error rather than a merge — two
maps in one file is almost always a bad paste. The body is optional.

### `product "shortname"`

At most one. The `slug` doc-registry assigns, not the display name: a map that
recorded "Client Onboarding" would stop matching its product the day somebody
fixed the capitalisation. A second declaration is an error, because two
declarations mean a bad merge.

### `space "CLONB"`

At most one. The ticketing container — a Jira project key, or whatever your
tracker calls one. **Leave it out and the product shortname stands in.** They
come apart often enough to be separate: a key of `CLONB` against a product of
`client-onboarding` is ordinary.

### `delivery "Sprint 24" sprint #CLONB-S24 points 13`

One band of the timeline. **Declaration order is timeline order** — there is no
date and no index. A date is the one thing here that would go stale on its own,
and an index is a second copy of what the list already says: re-order the plan by
moving a band, not by editing a number.

- The kind word is **required** and is one of `sprint` or `release`. A defaulted
  kind would make the meaning of a bare `delivery` line depend on a choice made
  months ago. A sprint is a kind of delivery, not a different thing — both
  behave identically, and the word is for reading: "four sprints and a release"
  says something five equal bands do not.
- `#ticket` and `points N` may follow the kind in **either order**. A sprint is
  a real object in the tracker and so is a release — one has a number, the other
  a version.
- **Only a sprint is sized.** `points` on a release is an error rather than a
  value quietly dropped: a release is delivered by the sprints before it, so
  sizing it would either double-count them or state a competing number for the
  same work. Switching a sized sprint to a release on the board clears the
  estimate for the same reason.
- Points are a **non-negative whole number**, and **empty is not zero**: `0` says
  the sprint carries no estimable work, and leaving it out says nobody has sized
  it. Examples are never given points — the practice does not ask anyone to, and
  a number on every green card would invite a different meeting than the one this
  board is for.
- A band takes **no `~status`** — where a sprint is in its own lifecycle is the
  tracker's business — and **no `@`**, because a delivery is a point on the
  timeline, not a thing placed on one.
- **Band titles must be unique.** `@` names a band by its title, so a duplicate
  would make the reference meaningless. The two decisions stand or fall together.

---

## 5. The four cards

### `story "…"` — yellow, and there is one

The practice takes one story, so a map has **at most one** `story` line. A second
is an error rather than a list: two stories on one map is two sessions, and
merging them would hide that. A map with **no** story line is fine — a session
that has not named its story yet, which the board shows as "To be defined".

It is the only card that carries a ticket:

```
story "Redeem a voucher" #CLONB-42 ~analysing @"2026.9" +payments
```

Rules, examples and questions take neither `#` nor `~`. Breaking a story down
does not produce more tickets — that is the difference between this board and the
story map next door, where every row is a level in the tracker.

**The story states its need**, in the formal story language:

```
story "Redeem a voucher" {
  as   "Returning customer"
  want "to apply a voucher code at checkout"
  so   "I pay the price I was promised"
}
```

Three fields rather than prose in a note. The title says what to build and the
need says why anyone should; the `so` clause is the half that gets dropped first
and missed most, and a session spends its whole length interrogating that
sentence. All three are optional and independently so, and each may appear at
most once.

**The persona is free text here, and a reference in `doc-sm`.** There a story may
only name a persona its own activity lists. There is no cast on this board:
example mapping takes one story some other conversation already chose, and a map
that had to declare its personas before naming one would be inventing structure
the technique does not have.

### `rule "…"` — blue

A constraint or acceptance criterion, written at the top level of the map. It
takes tags and nothing else, and holds examples, questions and notes.

A rule with **no examples is legal**, and is the practice's own warning sign:
nobody has agreed what that rule means yet.

### `example "…"` — green

**An example belongs to a rule.** Examples are written inside the rule they
illustrate and cannot float at the top level.

It takes `@delivery` and tags. Its body holds steps and notes:

```
example "A voucher that expired yesterday is refused" @"Sprint 24" {
  given "a voucher SUMMER10 that expired on 2026-08-21"
  given "a basket of 40 CHF"
  when  "the voucher is applied"
  then  "the voucher is refused"
  then  "the basket total is still 40 CHF"
}
```

- **Steps repeat, and `and` does not exist.** Any of `given`, `when` and `then`
  may be written more than once — that is how a scenario accumulates context.
  There is no `and` keyword because `And` is how a repeat is *printed*: the
  second `given` in a row renders as `And` on the card and in the feature file.
  Storing it would make a line mean something different depending on the line
  above it.
- **Steps come back in Gherkin's order.** Given establishes context, When is the
  one action, Then is what must hold afterwards. Write them in any order; export
  puts them back in that one, because any other order is not a scenario. It costs
  nothing to normalise, since the three are separate buckets with no order
  between them to lose.
- **An example may be a title alone.** Steps are optional. A session that
  produced ten example titles and no steps did example mapping correctly — the
  steps get written by whoever makes a card precise, which is often later and
  often not in the room.

### `question "…"` — red

**A question hangs on the story or on a rule.** A doubt raised before any rule
exists belongs to the story; one raised while discussing a rule sits with that
rule. Both are meaningful when you read the finished map — "this rule has three
unanswered questions" says something different from "the board has three".

It takes tags, and may carry notes.

---

## 6. Annotations

| | Says | Per card | On |
|---|---|---|---|
| `@"Sprint 24"` | the band it ships in | at most one | story, example |
| `#CLONB-42` | the ticket | at most one | story, delivery |
| `~analysing` | the state | at most one | story |
| `+legal` | something that is *also* true | any number | story, rule, example, question |

### `@delivery` — the time axis

`@` places a card on the timeline. Written bare when the name is one word,
quoted when it is not — `@Sprint1`, `@"Sprint 24"` — and the two are the same
reference written two ways.

**The story ships in a release; examples ship in sprints.** An example is the
smallest thing on the board with business value attached, which is why the time
axis crosses the rules rather than ordering them: a rule is a constraint, and a
constraint is not delivered in a sprint. The concrete cases that satisfy it are,
one at a time.

**Unscheduled is the absence of a `@`** — no sentinel to spell wrong. An example
with no `@` sits below the line: agreed, and not committed to. That is where most
examples are born, and where they return if you delete the band they were in;
deleting a sprint never deletes the work planned into it.

### `#ticket` — set here, and only here

The board shows the ticket id and will not let you retype it. An example mapping
session refines a story; it does not re-address one, and a mistyped id silently
points a whole map of rules at somebody else's ticket. Changing it is an edit to
this file, where it is deliberate and shows up in a diff. A delivery's own id is
read-only on the board for the same reason.

### `~status` — a cache, never the truth

One of, in workflow order:

```
~open  ~analysing  ~ready  ~in-progress  ~done  ~closed
```

The ticketing system owns it. `~open` is what an unlinked story reads as — a
placeholder meaning nothing has been said yet, not a claim — and the board writes
no annotation for it. Unlike the `#id` beside it, the status is what a session
changes, so it is one click on the card menu as well as a word here.

### `+tag` — the free label

`+legal`, `+"needs the payments team"`. A bare word or a quoted string.

- **Every kind takes them, and any number** — story, rule, example and question.
  The `#id` says which one thing this is and the `~status` says the one place it
  has got to, where a tag says something that is *also* true.
- **The vocabulary is open.** Nothing validates a tag beyond the shape of the
  word, so `+legel` is a tag rather than an error. A fixed vocabulary would have
  to be chosen once for every team that will ever run a session, and the useful
  tags are exactly the ones nobody could have guessed.
- **Case does not make a second tag.** The duplicate check folds case and the
  parser refuses the second; what is *stored* is what was typed, so the file can
  still say `+GDPR`.
- `+""` is refused rather than dropped.
- **Tags are not coloured, and will not be.** Colour is already this board's
  notation — the four card kinds *are* the four colours.

---

## 7. `note "…"`

Free prose. Allowed on the map, on a delivery, and on any card. A note is
**wrapped to 50 columns** on the way in — a reading measure, and it keeps the file
legible in a diff, which is where notes are actually reviewed. A blank line
separates one note from the next.

---

## 8. Semantic rules

Checked as the file is read, or in the second phase where the whole file is
needed:

- One `examplemap` block per file; at most one `story` inside it.
- `product` and `space` declared at most once each.
- At most one `#`, one `~` and one `@` per card, and `~` from the six-word
  vocabulary.
- At most one `as`, one `want` and one `so` on the story.
- **Two deliveries with the same title is an error** — `@` names a band by its
  title, and a duplicate makes the reference meaningless.
- **A `@` that names no declared delivery is an error**, not a silent drop.
  Dropping it would quietly unschedule somebody's work and the export would make
  that permanent. It is reported at the `@`, and the hint lists what was actually
  declared.
- `points` only on a sprint, at most once, a non-negative whole number.
- Tags unique per card, case-insensitively, and non-empty.

**A late example is only a warning.** An example scheduled *after* the story
ships still parses — the board says so in its readings instead. You move the
release first and the examples after, and a parser that refused that intermediate
state would make replanning impossible in the tool that exists to plan. The
board's other readings are the practice's own: many questions means not ready to
estimate, many rules means the story is too big, a rule with no examples means
nobody understands it yet.

---

## 9. What the board writes

**The file is the artefact, and the board is a projection of it.** Every gesture
is compiled into a replacement of the one span it is actually about, so
everything outside that span comes back byte-identical: comments, blank lines and
somebody's own alignment all survive an edit. Nothing re-renders the whole
document.

When the board does write a span, it writes in one style:

- Two spaces of indentation per level, spaces never tabs.
- `~open` removed rather than spelled — setting a story back to Open deletes the
  annotation.
- `@Bare` where the delivery name is a single word that is not a keyword,
  `@"Quoted"` otherwise.
- Notes wrapped to 50 columns and carried on with a trailing backslash.
- `{ }` omitted on a card with an empty body.
- `@`, `#` and `~` each have their own span and sit next to the title, ahead of
  the tags, so changing one does not disturb the others.

A stale position is refused rather than applied to whatever now sits at that
index.

---

## 10. And the Gherkin it writes

Three of the four colours have a Gherkin keyword of their own; the fourth has
none.

| Card | Gherkin |
|---|---|
| `story` | `Feature:` — one per file |
| `rule` | `Rule:` — a real keyword since Gherkin 6 |
| `example` | `Scenario:` — Gherkin's synonym for `Example:`, and the word nearly every reader uses |
| `question` | *nothing* |

**This is a one-way door.** An open question is not a specification, so it cannot
be written as one. Anything that wrote the red cards into the file — as comments,
or as tags — would be inventing a convention no Cucumber reads and quietly
claiming the map is recoverable from it. So the Gherkin is written and never
read: the `.examplemap` file is the one that round-trips, and the board says so
before it hands the feature file over.

```gherkin
  Rule: A voucher must not be expired

    Scenario: A voucher that expired yesterday is refused
      Given a voucher SUMMER10 that expired on 2026-08-21
      And a basket of 40 CHF
      When the voucher is applied
      Then the voucher is refused
      And the basket total is still 40 CHF

    Scenario: A voucher expiring today is accepted
      # No steps yet — this scenario would pass without asserting anything.
```

- **Steps are written verbatim**, with the second of a clause rendered as `And`.
  Nothing is guessed: an example that is still a title alone produces a scenario
  with no steps and a comment saying so — because a scenario with no steps
  parses, runs, and passes, and a green suite that asserted nothing is worse than
  a red one.
- **A rule with no examples is said, not skipped**: `# No examples yet — nobody
  has agreed what this rule means.` A feature file that silently omitted the rule
  would hide it at exactly the moment it matters.
- **Tags cross cleanly**, as Gherkin's own `@tag` above the Feature, Rule or
  Scenario they belong to — that is what `--tags @legal` selects on. They are
  spelled to match Gherkin rather than the board: whitespace becomes a hyphen and
  anything that is not a letter, digit, hyphen or underscore is dropped, so
  `+"ask finance"` comes out as `@ask-finance`. Lossy in the direction this file
  is already lossy in.
- **`@delivery`, `#ticket`, `~status` and `points` do not cross.** They are
  planning facts, and a feature file is not a plan.
- The filename is the story's title slugified — `redeem-a-voucher.feature` — or
  the map's title when no story has been named.

---

## 11. Errors

Parse errors are **collected, not fatal** — up to 50, each with a line, a column,
the width of the offending token and a hint showing the correct form. These files
are hand-edited in an editor with no language server and imported through a file
picker; failing on the first problem would mean one trip through a file dialog
per typo. Past 50 the parser stops and says so. A failed import leaves the board
on screen untouched.

---

*Exported from `doc-hub/doc-em` — the `/dsl` reference page (`src/pages/dsl.astro`),
`src/lib/examplemap/lexer.ts`, `src/lib/examplemap/parser.ts`,
`src/lib/examplemap/model.ts`, `src/lib/examplemap/gherkin.ts` and
`src/lib/examplemap/problems.ts`.*
