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
