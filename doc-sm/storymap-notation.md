# Working with `.storymap` files

You are being asked to read, write or change a user story map — a plan for
*slicing* a product, kept as text, in a small declarative notation called
`.storymap`. This document is the whole of that notation. Follow it exactly: a
file that does not parse cannot be opened by the tools the map is kept for.

## The notation: `.storymap`

```
storymap "Title" {
  product "client-onboarding"      // optional; a registered product's shortname
  space "CLONB"                    // optional; the ticketing system's project key

  delivery "Sprint 24" sprint #CLONB-S24    // sprint | release
  delivery "MVP" release #CLONB-R1

  activity "Discover documentation" #CLONB-1 ~in-progress +search {
    persona "Business analyst"     // who does this; listed on the activity
    persona "Product manager"

    step "Search the catalog" #CLONB-10 ~in-progress {
      story "Full-text search" @"Sprint 24" #CLONB-42 ~in-progress +search +"needs an index" {
        as   "Business analyst"
        want "to search every product at once"
        so   "I can answer a question without knowing which product owns it"
        note "Prose. A trailing backslash\
              carries the string onto the next line."
      }
      story "Saved searches" {      // no delivery: not scheduled yet
        as   "Support engineer"
        want "to keep the searches I run every week"
        so   "I stop retyping the same query"
      }
    }

    step "Open a product" #CLONB-11 ~analysing    // a step with no stories is fine
  }
}
```

**Three kinds of card, and colour is kind.** `activity` is the backbone, read
left to right in the order the user does things. `step` divides an activity
into what the user actually does. `story` hangs under a step and is the unit of
work.

Annotations, in this order after the title:

- `@"Sprint 24"` — the delivery this story is in. It must name a `delivery`
  declared at the top. A story with no `@` is unscheduled, which is an ordinary
  state.
- `#CLONB-42` — the ticket. doc-sm does not own this value; the ticketing system
  does. Never invent one.
- `~ready` — the status: `open`, `analysing`, `ready`, `in-progress`,
  `done`, `closed`. Also owned by the ticketing system for a card that carries
  a ticket; `open` is the local placeholder for a card that carries none.
- `+search` — a tag. Unlike the three above it, a card may carry any number of
  them, and all three kinds take them. Use `+"needs an index"` when the label
  has spaces in it. The vocabulary is open — nothing validates a tag — so use
  the ones already on the map rather than inventing a parallel set for the same
  idea, and do not propose a tag where the honest answer is that the story is
  too big or the slice is wrong.

A story's three clauses are `as` / `want` / `so` — who, what, why. A
`persona` is listed on the activity it belongs to, one per line, and a story
may name a persona its own activity lists and no other.

A step with no stories, or an activity with no steps, keeps its place: both are
ordinary states mid-workshop. Comments are `//` to end of line.

## The grammar, formally

EBNF. `,` is sequence, `|` is alternation, `{ x }` is zero or more, `[ x ]` is
optional, `? … ?` is prose, and a quoted literal stands for itself.

```ebnf
File         = StoryMap , EOF ;
StoryMap     = 'storymap' , String , [ '{' , { Entry } , '}' ] ;
Entry        = Product | Space | Delivery | Activity | Note ;

Product      = 'product' , String ;
Space        = 'space' , String ;

Delivery     = 'delivery' , String , DeliveryKind , { Ticket } , [ '{' , { Note } , '}' ]
             | 'release'  , String ,                { Ticket } , [ '{' , { Note } , '}' ] ;
DeliveryKind = 'sprint' | 'release' ;

Activity     = 'activity' , String , { Ticket | Status | Tag } ,
               [ '{' , { Persona | Step | Note } , '}' ] ;
Persona      = 'persona' , String ;
Step         = 'step'     , String , { Ticket | Status | Tag } ,
               [ '{' , { Story | Note } , '}' ] ;
Story        = 'story'    , String , { Release | Ticket | Status | Tag } ,
               [ '{' , { As | Want | So | Note } , '}' ] ;

As           = 'as'   , String ;
Want         = 'want' , String ;
So           = 'so'   , String ;
Note         = 'note' , String ;

Release      = '@' , ( Ident | String ) ;
Ticket       = '#' , ( Ident | String ) ;
Status       = '~' , StatusWord ;
Tag          = '+' , ( Ident | String ) ;
StatusWord   = 'open' | 'analysing' | 'ready' | 'in-progress' | 'done' | 'closed' ;

String       = '"' , { Char | Escape | Splice } , '"' ;
Escape       = '\' , ( '"' | '\' | 'n' | 't' ) ;
Splice       = '\' , Newline , { ' ' | Tab } ;
Ident        = ( Letter | Digit | '_' ) , { Letter | Digit | '_' | '-' } ;
Comment      = '//' , { ? any character except a line break ? } ;

Char         = ? any character except '"', '\' or a line break ? ;
Newline      = ? LF, or CR followed by LF ? ;
Tab          = ? a horizontal tab ? ;
Digit        = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' ;
Letter       = ? A to Z, or a to z ? ;
```

Reading it:

- **Every body is optional.** `step "Open a product"` with no braces is a legal
  empty step, an activity may have no steps, and both are ordinary states
  mid-workshop.
- **Annotations interleave in any order** after a title, and a card may carry
  any number of `Tag` — but at most one `Release`, one `Ticket` and one
  `Status`. A second of any of those three is an error, not a last-one-wins.
- **Only a story takes `@`.** An activity and a step span every band, so a
  release on one is refused with the advice to put it on the stories. A
  `delivery` takes neither `@` nor `~` nor a tag: it is a point on the
  timeline, not a card placed on one.
- **`release "MVP"` is the old spelling of `delivery "MVP" release`** and still
  parses, because `.storymap` files live in product repositories where nobody
  is watching for a grammar change. Never write it: the serializer only emits
  `delivery`, so one trip through the board converts a file.
- **`Splice` puts a line break in the value** and drops the indentation after
  it, so a long note is one string spelled across as many lines as it needs. A
  *bare* newline inside a string is an unterminated string, which is what stops
  one missing quote from swallowing the rest of the file.
- **`Comment` and whitespace are trivia**, discarded by the lexer, and never
  reach the parser. The language is brace-delimited: indentation is a formatting
  choice and never syntax, so a file that has been through a chat window or an
  editor with different tab settings still parses.
- **Three rules need the whole file** and are checked after it is read:
  every `@` must name a `delivery` that is declared; two deliveries may not
  share a title, because `@` refers to one by its title; and a story's `as`
  must name a `persona` its own activity lists. Everything else is decided as
  it is read.
- **One file holds one `storymap` block**, and `product` and `space` are
  declared at most once each. A second of either is a bad merge, and is reported
  rather than silently resolved.

A source over 2 MB is refused before a character of it is scanned.

## Tags, and the ones worth agreeing on

The tag vocabulary is open on purpose. The useful labels on a real map are the
ones nobody could have guessed — the squad that owns it, the regulation that
applies, the platform it only affects, the thing that went wrong last time — so
a closed set decided by this notation would be wrong for every team and would
make the right answer unspellable. The price is that `+serach` is a tag rather
than an error.

Three mechanical rules, and then the conventions:

- **A tag is the only annotation a card may carry more than one of.** `@`, `#`
  and `~` each answer a question that has one answer, and a second of any of
  them is an error. A card may wear any number of tags, and all three kinds
  take them.
- **Case does not make a second tag.** `+Legal` and `+legal` are one label, and
  writing both on one card is refused. What is *stored* is what was typed, so a
  file can still say `+GDPR`.
- **A card wears a tag once.** Repeating it says no more, and usually means a
  bad merge.

### `+skeleton` — the stories that make the first slice walk

Alistair Cockburn's **walking skeleton**, which Patton reaches for when he
describes slicing a map: the smallest system you could build that gives you end
to end functionality.

It is not the same as "in the first delivery". A delivery is a band, and a band
holds whatever the room committed to; the skeleton is the subset of it that has
to exist for the product to work at all. That is a different fact, the notation
has no keyword for it, and it is the fact the whole slicing argument turns on —
so it is a tag.

Mark it sparingly, and **across the backbone rather than down one activity**.
The point of a skeleton is that it reaches every activity thinly. A
`+skeleton` that lights up two columns out of five is telling you the first
slice is a prefix rather than a slice, which is the failure the doctrine names
second.

### `+ask <team>` — who could settle it

On the card whose scope nobody in the room can settle, or whose `so` nobody
can defend: `+"ask payments"`, quoted because the label has a space in it. It
names who could answer, which is the difference between a question that closes
next week and one that is still open at the next planning session.

The same spelling on all three boards in this estate, so a label written during
an event storm still means the same thing on the map that comes out of it.

Anything else is the map's own vocabulary. Before inventing a tag, read the ones
already on the map: two spellings of one idea is exactly the split that tagging
exists to prevent.

## Changing somebody's map

A map is a plan a room agreed on, and you are editing it in their absence. Every
rule below follows from that.

- **The whole document**, not a fragment, not a diff, not the changed activity.
  It replaces the file.
- **Change only what was asked for.** Everything else comes back byte-identical
  — comments, blank lines, alignment, the order of the activities. The result is
  read as a diff, and a diff full of reformatting is a diff nobody reads.
- **Keep the comments.** They are the author's reasoning and are not yours to
  tidy.
- **Never invent a `#ticket` or change a `~status`.** Both belong to the
  ticketing system. Removing or inventing one makes the file lie about work that
  exists somewhere else.
- **It must parse.** In particular, every `@` must name a `delivery` that is
  declared, and a story's `as` must name a persona its own activity lists. A
  document that does not parse is not a smaller version of one that does; it is
  a file nobody can open.

Read `storymap-doctrine.md` before adding or re-slicing cards. This notation will
happily let you write a map that parses perfectly and plans nothing.

---

*Exported from doc-sm, the story-mapping board these come from. It is a
snapshot of what that tool's own assistant is told, it does not update itself,
and nothing in it was generated from the map that happened to be
open. The grammar itself is defined by `src/lib/storymap/` in doc-sm: where a map and these rules disagree, the parser is right and this file is old.*
