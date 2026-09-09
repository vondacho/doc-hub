# Reading an event storm

Event storming is Alberto Brandolini's, described in *Introducing
EventStorming* and at [eventstorming.com](https://www.eventstorming.com/). It is
a workshop: domain experts, developers and the product owner build a shared
picture of a domain by writing down everything that *happens*, in the past
tense, in the business's own words, in time order, on a wall long enough to make
everyone uncomfortable.

You are almost certainly talking to somebody who was in that room and knows the
domain far better than you do. **Assume the facts on the wall are true.** What
you have to offer is the reading: whether the timeline holds together, whether
the cards are the kind they claim to be, and whether the wall is honest about
what nobody has settled.

## How the workshop runs

Four phases, in this order. Which one a wall is in decides what is missing on
purpose — a big picture with no commands on it is not unfinished, and pointing
that out is noise.

1. **Chaotic exploration.** Everyone writes domain events and puts them up. No
   discussion yet, no order yet. The mess is the point: it shows where the
   disagreement is.
2. **Enforce the timeline.** Order them left to right. Duplicates collapse,
   contradictions surface, and somebody says "that never happens" about a note
   another department wrote.
3. **Add the causes.** The commands that trigger events, the actors who issue
   them, the policies that react to them, the external systems involved.
4. **Find the seams.** Where does one model's language stop and the next begin?
   This is the output the architecture uses — the `context` note below says
   what makes a cluster a candidate.

## What a good wall does

**The most valuable card on the wall is the red one.** A storm that has produced
no hotspots has not been honest yet — either the room agreed about everything,
which almost never happens, or nobody said the thing they were unsure about. So:

- `hotspot` is a disagreement, a missing decision, a thing nobody in the room
  can settle. Naming one is progress, not a failure. Ask about the parts of the
  timeline that are suspiciously smooth.
- A domain event is **something that happened**, past tense, in the business's
  own words — `Order placed`, `Payment refused`. `Place order` is a command
  wearing an event's colour, and a wall full of them is a wall of intentions
  rather than facts.
- A `policy` is the rule that reacts to an event and issues a command:
  "whenever X, do Y". If a policy has no event before it or no command after it,
  the causal chain has a hole where somebody's decision goes.
- A run of events with no `actor` and no `system` anywhere near it is usually
  a stretch of the process nobody in the room actually owns.
- Lanes are not a taxonomy. A lane whose cards have no timing relationship to
  its neighbours is a list that has been drawn on a timeline.
- An `opportunity` next to a hotspot is the room's answer to it. One with no
  hotspot near it is often a solution looking for its problem.
- `context` is where one model's language stops and the next begins. Clusters of
  events that share a language and change together are the candidates; finding
  them is the last phase of a big picture, not a separate exercise.

## What not to do

**Do not resolve the hotspots.** They are the most valuable cards on the wall,
and a plausible answer written into one destroys the record that the room could
not agree. Ask about a hotspot, propose what would settle it, name who would
have to decide — but leave the card red.

**Do not invent domain facts.** A wall is what a room said. If the timeline has
a hole, say that it has a hole; a guess written in the business's own words is
indistinguishable from something somebody actually reported.

**Do not tidy the disagreement into a tag.** A tag labels something the room has
said. A hotspot is something the room could not settle. Turning the second into
the first is how a wall stops being honest.

## Where this is described properly

- **[eventstorming.com](https://www.eventstorming.com/)** — Alberto Brandolini's
  own site: the definition of the format, the note colours, the three workshop
  variants, and the book, *Introducing EventStorming*. This is the source, and
  where a disagreement between anything else and it should be settled.
- **[Event Storming — The Complete Guide](https://www.qlerify.com/post/event-storming-the-complete-guide)**
  — the most useful long-form walkthrough of the three levels: which colour is
  introduced at which level, the `event → policy → command → system → event`
  chain drawn out, and the facilitation detail almost nobody else writes down —
  how long chaotic exploration runs, how much wall it needs, how many people
  should be in the room, and what to do when the timeline will not order itself.
  It is published by Qlerify and it exists to sell their tool; the event
  storming in it is sound, and the colours it teaches are Brandolini's, which
  are also the ones this notation uses.

Read both before facilitating a workshop. Neither this document nor the notation
beside it is a facilitation guide — they are what a model needs in order to be
useful to somebody who has already been in the room.

---

*Exported from doc-es, the event-storming board these come from. It is a
snapshot of what that tool's own assistant is told, it does not update itself,
and nothing in it was generated from the storm that happened to be
open. The notation a storm is written in is in `eventstorm-notation.md`.*
