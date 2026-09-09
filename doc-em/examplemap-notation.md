# Working with `.examplemap` files

You are being asked to read, write or change an example map — the record of
a Three Amigos conversation, kept as text, in a small declarative notation
called `.examplemap`. This document is the whole of that notation. Follow it
exactly: a file that does not parse cannot be opened by the tools the map is
kept for.

## The notation: `.examplemap`

```
examplemap "Title" {
  product "client-onboarding"      // optional; a registered product's shortname
  space "CLONB"                    // optional; the ticketing system's project key

  delivery "Sprint 24" sprint #CLONB-S24 points 13   // sprint | release
  delivery "2026.9" release #CLONB-R9

  story "Redeem a voucher" #CLONB-42 ~analysing @"2026.9" +payments {
    as   "Returning customer"
    want "to apply a voucher code at checkout"
    so   "I pay the price I was promised"
    question "Which currencies can a voucher be issued in?"
  }

  rule "A voucher must not be expired" +legal +risk {
    example "A voucher that expired yesterday is refused" @"Sprint 24" {
      given "a voucher SUMMER10 that expired on 2026-08-21"
      given "a basket of 40 CHF"
      when  "the voucher is applied"
      then  "the voucher is refused"
      then  "the basket total is still 40 CHF"
    }
    example "A voucher expiring today is accepted" @"Sprint 25"   // title alone is legal
    question "Is expiry checked when it is applied, or when the basket is paid?" +"ask finance"
    note "Prose about this rule. A trailing backslash\
          carries the string onto the next line."
  }
}
```

**Four cards, and colour is kind.** `story` is the yellow one at the top and
there is exactly one. `rule` is blue — a constraint or an acceptance criterion.
`example` is green — one concrete case that illustrates a rule. `question` is
red — anything nobody in the room could answer, and it may hang off the story or
off a rule.

An example's body is `given` / `when` / `then`, repeatable, and is what
becomes a Gherkin scenario. An example with a title and no body is legal and
ordinary: somebody named the case before anybody wrote it out.

Annotations after a title: `#CLONB-42` is the ticket, `~analysing` is the
status (`open`, `analysing`, `ready`, `in-progress`, `done`, `closed`),
and `@"Sprint 24"` names a `delivery` declared at the top. The ticket and the
status belong to the ticketing system; doc-em does not own either. **Only the
story takes a ticket or a status.**

`+legal` is a tag, and every card takes any number of them —
`+"needs the payments team"` when the label has spaces in it. The vocabulary
is open: there is no list of permitted tags, so use the ones already on the map
rather than inventing a parallel set for the same idea. Do not propose a tag as
a substitute for a question. A tag is a label on something the room has said; a
red card is something the room could not answer, and turning the second into
the first is how a map stops being useful.

Comments are `//` to end of line.

## The grammar, formally

EBNF. `,` is sequence, `|` is alternation, `{ x }` is zero or more, `[ x ]` is
optional, `? … ?` is prose, and a quoted literal stands for itself.

```ebnf
File         = ExampleMap , EOF ;
ExampleMap   = 'examplemap' , String , [ '{' , { Entry } , '}' ] ;
Entry        = Product | Space | Delivery | Story | Rule | Note ;

Product      = 'product' , String ;
Space        = 'space' , String ;

Delivery     = 'delivery' , String , DeliveryKind , { Ticket | Points } ,
               [ '{' , { Note } , '}' ] ;
DeliveryKind = 'sprint' | 'release' ;
Points       = 'points' , Integer ;

Story        = 'story'    , String , { Release | Ticket | Status | Tag } ,
               [ '{' , { As | Want | So | Question | Note } , '}' ] ;
Rule         = 'rule'     , String , { Tag } ,
               [ '{' , { Example | Question | Note } , '}' ] ;
Example      = 'example'  , String , { Release | Tag } ,
               [ '{' , { Step | Note } , '}' ] ;
Question     = 'question' , String , { Tag } , [ '{' , { Note } , '}' ] ;

As           = 'as'   , String ;
Want         = 'want' , String ;
So           = 'so'   , String ;
Step         = ( 'given' | 'when' | 'then' ) , String ;
Note         = 'note' , String ;

Release      = '@' , ( Ident | String ) ;
Ticket       = '#' , ( Ident | String ) ;
Status       = '~' , StatusWord ;
Tag          = '+' , ( Ident | String ) ;
StatusWord   = 'open' | 'analysing' | 'ready' | 'in-progress' | 'done' | 'closed' ;

String       = '"' , { Char | Escape | Splice } , '"' ;
Escape       = '\' , ( '"' | '\' | 'n' | 't' ) ;
Splice       = '\' , Newline , { ' ' | Tab } ;
Integer      = Digit , { Digit } ;
Ident        = ( Letter | Digit | '_' ) , { Letter | Digit | '_' | '-' } ;
Comment      = '//' , { ? any character except a line break ? } ;

Char         = ? any character except '"', '\' or a line break ? ;
Newline      = ? LF, or CR followed by LF ? ;
Tab          = ? a horizontal tab ? ;
Digit        = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' ;
Letter       = ? A to Z, or a to z ? ;
```

Reading it:

- **Every body is optional.** `example "A voucher expiring today is accepted"`
  with no braces is legal and ordinary — somebody named the case before anybody
  wrote it out — and so is a rule with nothing under it, which is the first
  thing the doctrine tells you to look for.
- **Which annotations a card takes is the whole of the difference between
  them.** Only `Story` takes a ticket or a status. `Example` takes a delivery
  and tags; `Rule` and `Question` take tags alone. A rule is not a thing the
  tracker knows about, and an example is what makes the story true rather than a
  work item of its own.
- **Annotations interleave in any order** after a title, and a card may carry
  any number of `Tag` — but at most one `Release`, one `Ticket` and one
  `Status`. A second of any of those three is an error, not a last-one-wins.
- **There is exactly one `Story`**, and it is optional. A map with rules and no
  story is a session that has not named what it is about yet.
- **A `Step` may be repeated within one example**, and repetition is the whole
  notation: a second `given` is what Gherkin prints as `And`. There is
  deliberately no `and` keyword — `And` is how a repeat is *printed*, not a
  fourth kind of step. The lines may be written in any order; the serializer
  puts them back in Gherkin's order on the way out.
- **`Points` is a sprint's size**, and only a sprint's. Points on a release are
  refused: a release is not a unit of capacity.
- **`Splice` puts a line break in the value** and drops the indentation after
  it, so a long note is one string spelled across as many lines as it needs. A
  *bare* newline inside a string is an unterminated string, which is what stops
  one missing quote from swallowing the rest of the file. A step's own line
  breaks are collapsed to spaces — a Gherkin step is one line by definition.
- **`Comment` and whitespace are trivia**, discarded by the lexer, and never
  reach the parser. The language is brace-delimited: indentation is a formatting
  choice and never syntax.
- **Two rules need the whole file** and are checked after it is read: every
  `@` must name a `delivery` that is declared, and two deliveries may not
  share a title, because `@` refers to one by its title. Everything else is
  decided as it is read.
- **One file holds one `examplemap` block**, and `product` and `space` are
  declared at most once each.

A source over 2 MB is refused before a character of it is scanned.

## Tags, and the ones worth agreeing on

The tag vocabulary is open on purpose. The useful labels on a real map are the
ones nobody could have guessed — the team that owns the answer, the regulation
that applies, the system it only affects, the thing that went wrong last time —
so a closed set decided by this notation would be wrong for every team and would
make the right answer unspellable. The price is that `+legal` is a tag rather
than an error.

Three mechanical rules, and then the conventions:

- **A tag is the only annotation every kind takes**, and the only one a card may
  carry more than one of. `#` and `~` are the story's alone and `@` is the
  story's and the example's; a tag goes on any of the four, any number of times.
- **Case does not make a second tag.** `+Legal` and `+legal` are one label, and
  writing both on one card is refused. What is *stored* is what was typed, so a
  file can still say `+GDPR`.
- **A card wears a tag once.** Repeating it says no more, and usually means a
  bad merge.

### `+ask <team>` — who could answer a red card

On the question itself: `+"ask finance"`, quoted because the label has a space
in it. A red card says the room could not answer something; this says who could,
which is the difference between a question that closes before the next session
and one that is still on the map at it.

It never stands in for the question and it never closes one. The card stays red
until somebody actually answers.

The same spelling on all three boards in this estate, so a label written during
an event storm still means the same thing on the example map that comes out of
it.

### `+edge-case` — a green card that is not the happy path

An example map earns its keep at the boundaries: the voucher that expires today,
the basket that goes to exactly zero, the same code applied twice. Those are the
cases a room finds by arguing, and they are the ones somebody most wants to find
again six weeks later.

It is a reading aid rather than a category — every green card is a concrete
case, and nothing about one is treated differently because it wears this. What
it buys is the negative: a rule whose examples are **all** happy paths is a rule
nobody has probed yet, and that is only visible if the edges say so.

Anything else is the map's own vocabulary. Before inventing a tag, read the ones
already on the map: two spellings of one idea is exactly the split that tagging
exists to prevent.

## Changing somebody's map

A map is the record of a conversation a room had, and you are editing it in
their absence. Every rule below follows from that.

- **The whole document**, not a fragment, not a diff, not the changed rule. It
  replaces the file.
- **Change only what was asked for.** Everything else comes back byte-identical
  — comments, blank lines, alignment, the order of the rules. The result is read
  as a diff, and a diff full of reformatting is a diff nobody reads.
- **Keep the comments.** They are the author's reasoning and are not yours to
  tidy.
- **Never answer a `question` by deleting it.** A question is closed by the
  room, not by the tool. If you think you know the answer, say so in prose and
  leave the card where it is.
- **Never invent a `#ticket` or change a `~status`.** Both belong to the
  ticketing system.
- **It must parse.** In particular, every `@` must name a `delivery` that is
  declared. A document that does not parse is not a smaller version of one that
  does; it is a file nobody can open.

Read `examplemap-doctrine.md` before adding or rewriting cards. This notation will
happily let you write a map that parses perfectly and discovers nothing.

---

*Exported from doc-em, the example-mapping board these come from. It is a
snapshot of what that tool's own assistant is told, it does not update itself,
and nothing in it was generated from the map that happened to be
open. The grammar itself is defined by `src/lib/examplemap/` in doc-em: where a map and these rules disagree, the parser is right and this file is old.*
