# Working with `.eventstorm` files

You are being asked to read, write or change an event storm — a workshop
wall kept as text, in a small declarative notation called `.eventstorm`. This
document is the whole of that notation. Follow it exactly: a file that does not
parse cannot be opened by the tools the storm is kept for.

## The notation: `.eventstorm`

```
eventstorm "Title" {
  product "client-onboarding"      // optional; a registered product's shortname

  lane "Customer" {                // a swimlane: a department, an actor, a subsystem
    actor "Hungry customer" @1     // @column is where along the timeline it sits
    event "Menu opened" @1
    event "Order placed" @3 +revenue    // +tag is a free label; any number of them
    event "Basket emptied and started again" @2 {
      note "Prose about this card. A trailing backslash\
            carries the string onto the next line."
    }
  }

  lane "Payments" {
    command  "Take the payment" @3
    event    "Payment requested" @4
    system   "Payment provider" @4
    policy   "Whenever a payment is refused, hold the order" @5
    hotspot  "Nobody agrees whether a refused payment cancels the order" @5 +"ask payments"
    readmodel "Orders waiting" @6
    opportunity "Tell the customer when it goes in the oven" @6
  }
}
```

**The board is a grid: lanes down, time across.** `@4` is the same moment in
every lane, which is what lets two cards side by side mean *simultaneous* and
lets a lane show a visible gap where its neighbour is busy. Several cards may
share one square — a moment often involves an actor, a system and an event at
once — and they keep the order they are written in.

A card with no `@` takes the square after the last one written in its lane.
Prefer writing the number: the coordinate is the fact.

**`+tags` are free labels**, and every kind of card takes any number of them.
Write `+"ask payments"` when the label has spaces in it. Nothing validates a
tag, so use the ones already on the wall rather than inventing a parallel set
for the same idea — and never offer a tag in place of a hotspot. A tag labels
something the room has said; a hotspot is something the room could not settle,
and turning the second into the first is how a wall stops being honest.

**The keyword is the colour.** There is no separate type or colour annotation.

| keyword | card | level |
| --- | --- | --- |
| `event` | domain event, orange — the backbone | big picture |
| `actor` | a person or role, yellow | big picture |
| `system` | external system, magenta | big picture |
| `hotspot` | a problem or disagreement, red | big picture |
| `opportunity` | the other side of a hotspot, green | big picture |
| `context` | a bounded context, slate | big picture |
| `command` | a request to do something, blue | process modelling |
| `policy` | "whenever X, do Y", violet | process modelling |
| `readmodel` | what somebody needs to decide, teal | process modelling |
| `aggregate` | accepts commands, emits events | software design |
| `ui` | a screen somebody decides on | software design |

**The levels are cumulative.** A process model is a big picture *with* commands
and policies on it; a software design is a process model *with* aggregates on it.

**There is no `level` line — never write one.** The level is discovered from the
cards: a wall holding a `command` is a process model, and nothing has to say so.
On the board it is a lens the reader chooses, which dims the notes a shallower
level does not cover; it changes nothing in the text. So place whichever kind the
wall actually needs, and let the level follow.

Comments are `//` to end of line. Cards may be written before any lane, and are
gathered into one unnamed lane.

## The grammar, formally

EBNF. `,` is sequence, `|` is alternation, `{ x }` is zero or more, `[ x ]` is
optional, `? … ?` is prose, and a quoted literal stands for itself.

```ebnf
File        = [ EventStorm ] , EOF ;
EventStorm  = 'eventstorm' , String , [ '{' , { Entry } , '}' ] ;
Entry       = Product | Lane | Card | Note | LegacyLevel ;

Product     = 'product' , String ;
Lane        = 'lane' , String , [ '{' , { Card | Note } , '}' ] ;
Card        = Kind , String , { Column | Tag } , [ '{' , { Note } , '}' ] ;
Note        = 'note' , String ;

Column      = '@' , Integer ;
Tag         = '+' , ( Ident | String ) ;

Kind        = 'event' | 'actor' | 'system' | 'hotspot' | 'opportunity' | 'context'
            | 'command' | 'policy' | 'readmodel'
            | 'aggregate' | 'ui' ;

LegacyLevel = 'level' , [ Ident ] ;

String      = '"' , { Char | Escape | Splice } , '"' ;
Escape      = '\' , ( '"' | '\' | 'n' | 't' ) ;
Splice      = '\' , Newline , { ' ' | Tab } ;
Integer     = Digit , { Digit } ;
Ident       = ( Letter | Digit | '_' ) , { Letter | Digit | '_' | '-' } ;
Comment     = '//' , { ? any character except a line break ? } ;

Char        = ? any character except '"', '\' or a line break ? ;
Newline     = ? LF, or CR followed by LF ? ;
Tab         = ? a horizontal tab ? ;
Digit       = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' ;
Letter      = ? A to Z, or a to z ? ;
```

Reading it:

- **Every body is optional.** `lane "Customer"` with no braces is a legal empty
  lane, and so is a card with no note block. So is a storm with no body at all.
- **`Column` and `Tag` interleave in any order**, and a card takes any number of
  tags. `event "Order placed" +revenue @4` and `event "Order placed" @4 +revenue`
  are the same card.
- **Columns are one-based.** `@0` and below are refused rather than clamped: a
  column is a position on a wall, not an array index. A card with no `@` takes
  the square after the last card written in the same lane — so a run of events
  typed straight down a lane needs no numbers, and a card that belongs at column
  7 because that is when it happens can say so.
- **A `Card` may be written directly inside the storm block**, before any
  `lane`. Those are gathered into one unnamed lane, which is the shape a real
  file has early: chaotic exploration produces a heap of events long before
  anybody agrees where one stretch of the wall ends and the next begins.
- **`Splice` puts a line break in the value** and drops the indentation after it,
  so a long note is one string spelled across as many lines as it needs. A
  *bare* newline inside a string is an unterminated string — that is what stops
  one missing quote from swallowing the rest of the file.
- **`LegacyLevel` is read and thrown away. Never write one.** It is in the
  grammar only so a file written before the level was removed still opens; the
  level is discovered from the cards, as the notation section above says.
- **There is no ticket sigil.** The scanner also recognises `#` and `~` because
  it is shared with the story-map tool next door, and no production here uses
  them. Writing one is an error.
- **`Comment` and whitespace are trivia**, discarded by the lexer, and never
  reach the parser. The language is brace-delimited: indentation is a formatting
  choice and never syntax, so a file that has been through a chat window or an
  editor with different tab settings still parses.
- **Nothing refers to anything else.** There are no identifiers to resolve and no
  second pass; everything is decided as it is read. The only whole-file rules are
  that one file holds one `eventstorm` block, and that a storm declares
  `product` at most once — a second is a bad merge, and is reported rather than
  silently resolved.

A source over 2 MB is refused before a character of it is scanned.

## Tags, and the ones worth agreeing on

The tag vocabulary is open on purpose. The useful labels on a real wall are the
ones nobody could have guessed — the squad that owns it, the regulation that
applies, the platform it only affects, the thing that went wrong last time — so
a closed set decided by this notation would be wrong for every team and would
make the right answer unspellable. The price is that `+legel` is a tag rather
than an error.

Two mechanical rules, and then the conventions:

- **Case does not make a second tag.** `+Legal` and `+legal` are one label, and
  writing both on one card is refused. What is *stored* is what was typed, so a
  file can still say `+GDPR`.
- **A card wears a tag once.** Repeating it says no more, and usually means a
  bad merge.

### `+pivotal` — where the timeline changes phase

Brandolini's pivotal events: the few domain events that close one stretch of the
story and open the next. `Order placed`, `Payment accepted`, `Pizza handed to
the driver`. They are the wall's own structure, and marking them is what turns a
long run of events into something with sections.

Mark them sparingly. Five or six across a wall of forty is a structure; twenty
is a wall with no structure and twenty tags. If two candidates sit next to each
other, only one of them is the seam.

**This is the seam to a story map.** In story mapping the backbone is a row of
**activities**, each broken into steps — Jeff Patton's shape, and the keywords
doc-sm uses next door. The run of events between two pivotal events *is* an
activity, and the pivotal event is where it ends. So a wall with its pivotal
events marked can be cut into a backbone by reading the tags; one without them
has to be re-read from the beginning by whoever runs the mapping session, which
is the room least likely to still have everybody who was at the storm.

Pivotal events give you the backbone. Where the release bands fall is a separate
decision, made in that room and not on this wall.

### `+ask <team>` — who could settle a hotspot

Written on the hotspot itself: `+"ask payments"`, quoted because the label has a
space in it. A hotspot says the room could not settle something; this says who
could. It never stands in for the hotspot, and the card stays red until somebody
actually answers.

Anything else is the wall's own vocabulary. Before inventing a tag, read the
ones already on the storm: two spellings of one idea is exactly the split that
tagging exists to prevent.

## Changing somebody's storm

A storm is a document a room wrote together, and you are editing it in their
absence. Every rule below follows from that.

- **The whole document**, not a fragment, not a diff, not the changed lane. It
  replaces the file.
- **Change only what was asked for.** Everything else comes back byte-identical
  — comments, blank lines, column alignment, the order of the lanes. The result
  is read as a diff, and a diff full of reformatting is a diff nobody reads.
- **Keep the comments.** They are the author's reasoning and are not yours to
  tidy.
- **Do not renumber columns you were not asked to move.** A column is a
  coordinate: shifting one silently moves a card to a different moment.
- **It must parse.** A document that does not is not a smaller version of one
  that does; it is a file nobody can open.

Read `eventstorm-doctrine.md` before adding or re-typing cards. This notation will
happily let you write a wall that parses perfectly and says nothing true.

---

*Exported from doc-es, the event-storming board these come from. It is a
snapshot of what that tool's own assistant is told, it does not update itself,
and nothing in it was generated from the storm that happened to be
open. The grammar itself is defined by `src/lib/eventstorm/` in doc-es: where a storm and these rules disagree, the parser is right and this file is old.*
