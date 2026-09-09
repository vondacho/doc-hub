/**
 * What Claude is told before it is shown a wall.
 *
 * This is the feature. The API call around it is fifty lines of plumbing; the
 * difference between a useful answer and a plausible one is here.
 *
 * ba-ddd-mapper's `src/lib/agent/guide.ts`, in shape and in argument. Three
 * sections, in this order and for this reason: the **notation**, because a model
 * that guesses the grammar produces a file that does not parse; the
 * **doctrine**, because a tool whose whole point is that a wall's most valuable
 * card is the one nobody can settle cannot ask for advice from something that
 * does not know that; and the **contract**, because an answer nobody can act on
 * is a chat log.
 *
 * The doctrine is lifted from `src/lib/eventstorm/model.ts` rather than invented
 * for the prompt. That module already argues for every kind it defines, and a
 * second, drifting statement of the same opinions is exactly the duplication
 * this port refuses everywhere else.
 *
 * ## Five of these sections leave the tab
 *
 * `GRAMMAR`, `TAGS`, `EBNF`, `DOCTRINE` and `EDITING` are exported, because the
 * board can now write them to disk as instruction documents for a session
 * running somewhere else — see src/lib/board/instructions.ts and the two
 * reference destinations in the export catalogue. `EBNF` is the one of the five
 * the panel itself does not use; the note above it says why.
 *
 * That is the same refusal to duplicate, applied one level out. The obvious way
 * to produce those files is to write the notation and the doctrine out again in
 * a Markdown template, and it is wrong for the reason every other copy here is
 * wrong: the notation is defined by the parser, this file is what already
 * tracks it, and a second statement would be the one that quietly kept
 * describing the `level` line for a year after it was removed. (The two
 * documents under `doc/` did exactly that, which is why they are not the
 * source.)
 *
 * `ROLE` and `CONTRACT` stay private, and deliberately. Both describe *this
 * panel* — a narrow column beside a wall, and a fenced block that is parsed out
 * of the reply and offered as a diff. Neither is true of a model editing an
 * `.eventstorm` file in a terminal three repositories away, and shipping them
 * as instructions would be telling that session to follow a protocol nothing at
 * the other end implements.
 */

/** What the tool is, and what an answer is for. */
const ROLE = `You are helping someone think about an event storm inside ba-hub's
doc-es. They are looking at one wall, written in a small declarative notation,
drawn as a grid of coloured notes beside it.

Event storming is Alberto Brandolini's. You are talking to a facilitator or a
business analyst who was in the room and knows the domain far better than you
do. Assume the domain facts on the wall are true. What you have to offer is the
reading: whether the timeline holds together, whether the cards are the kind
they claim to be, and whether the wall is honest about what nobody has settled.`;

export const GRAMMAR = `## The notation: \`.eventstorm\`

\`\`\`
eventstorm "Title" {
  product "client-onboarding"      // optional; a registered product's shortname

  lane "Customer" {                // a swimlane: a department, an actor, a subsystem
    actor "Hungry customer" @1     // @column is where along the timeline it sits
    event "Menu opened" @1
    event "Order placed" @3 +revenue    // +tag is a free label; any number of them
    event "Basket emptied and started again" @2 {
      note "Prose about this card. A trailing backslash\\
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
\`\`\`

**The board is a grid: lanes down, time across.** \`@4\` is the same moment in
every lane, which is what lets two cards side by side mean *simultaneous* and
lets a lane show a visible gap where its neighbour is busy. Several cards may
share one square — a moment often involves an actor, a system and an event at
once — and they keep the order they are written in.

A card with no \`@\` takes the square after the last one written in its lane.
Prefer writing the number: the coordinate is the fact.

**\`+tags\` are free labels**, and every kind of card takes any number of them.
Write \`+"ask payments"\` when the label has spaces in it. Nothing validates a
tag, so use the ones already on the wall rather than inventing a parallel set
for the same idea — and never offer a tag in place of a hotspot. A tag labels
something the room has said; a hotspot is something the room could not settle,
and turning the second into the first is how a wall stops being honest.

**The keyword is the colour.** There is no separate type or colour annotation.

| keyword | card | level |
| --- | --- | --- |
| \`event\` | domain event, orange — the backbone | big picture |
| \`actor\` | a person or role, yellow | big picture |
| \`system\` | external system, magenta | big picture |
| \`hotspot\` | a problem or disagreement, red | big picture |
| \`opportunity\` | the other side of a hotspot, green | big picture |
| \`context\` | a bounded context, slate | big picture |
| \`command\` | a request to do something, blue | process modelling |
| \`policy\` | "whenever X, do Y", violet | process modelling |
| \`readmodel\` | what somebody needs to decide, teal | process modelling |
| \`aggregate\` | accepts commands, emits events | software design |
| \`ui\` | a screen somebody decides on | software design |

**The levels are cumulative.** A process model is a big picture *with* commands
and policies on it; a software design is a process model *with* aggregates on it.

**There is no \`level\` line — never write one.** The level is discovered from the
cards: a wall holding a \`command\` is a process model, and nothing has to say so.
On the board it is a lens the reader chooses, which dims the notes a shallower
level does not cover; it changes nothing in the text. So place whichever kind the
wall actually needs, and let the level follow.

Comments are \`//\` to end of line. Cards may be written before any lane, and are
gathered into one unnamed lane.`;

/**
 * The tag vocabulary: why it is open, and the two labels worth agreeing on.
 *
 * `GRAMMAR` says what a tag *is* — a sigil, a word, any number of them, on any
 * kind of card. This says what to write, which is a different question and the
 * one somebody actually has. Nothing validates a tag, by design and for the
 * reasons restated below, so every shared label is a convention; a convention
 * nobody has written down is one that half the wall spells differently.
 *
 * ## `+pivotal` earns its place here
 *
 * It is the only tag that answers a question about the wall's *shape* rather
 * than about one card's subject matter. Brandolini's pivotal events are where
 * the timeline changes phase, and they are what a storm is usually carried into
 * the next room to find: the run of events between two of them is an activity
 * on a story map, which is doc-sm's backbone. Marking them is a two-second
 * gesture during the workshop and a re-read of the whole wall afterwards if
 * nobody did.
 *
 * It is a tag rather than a keyword, and it should stay one. A `pivotal` card
 * kind would be a twelfth colour for something that is not a twelfth kind of
 * note — a pivotal event is a domain event, orange, that happens to matter more
 * than its neighbours — and a `pivotal` *flag* on the card would be a second
 * annotation syntax for something the tag syntax already expresses. See the
 * note beside `parseCard` on why there is no `~kind` annotation either.
 *
 * ## This one is in the panel prompt
 *
 * Unlike `EBNF`. A convention has no parser to correct a model that has not
 * heard of it: an assistant that does not know `+pivotal` will invent
 * `+milestone` for the same idea, and the invented one is indistinguishable
 * from a label somebody in the room actually chose. The formal grammar could be
 * left out because the parser enforces it; nothing enforces this.
 */
export const TAGS = `## Tags, and the ones worth agreeing on

The tag vocabulary is open on purpose. The useful labels on a real wall are the
ones nobody could have guessed — the squad that owns it, the regulation that
applies, the platform it only affects, the thing that went wrong last time — so
a closed set decided by this notation would be wrong for every team and would
make the right answer unspellable. The price is that \`+legel\` is a tag rather
than an error.

Two mechanical rules, and then the conventions:

- **Case does not make a second tag.** \`+Legal\` and \`+legal\` are one label, and
  writing both on one card is refused. What is *stored* is what was typed, so a
  file can still say \`+GDPR\`.
- **A card wears a tag once.** Repeating it says no more, and usually means a
  bad merge.

### \`+pivotal\` — where the timeline changes phase

Brandolini's pivotal events: the few domain events that close one stretch of the
story and open the next. \`Order placed\`, \`Payment accepted\`, \`Pizza handed to
the driver\`. They are the wall's own structure, and marking them is what turns a
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

### \`+ask <team>\` — who could settle a hotspot

Written on the hotspot itself: \`+"ask payments"\`, quoted because the label has a
space in it. A hotspot says the room could not settle something; this says who
could. It never stands in for the hotspot, and the card stays red until somebody
actually answers.

Anything else is the wall's own vocabulary. Before inventing a tag, read the
ones already on the storm: two spellings of one idea is exactly the split that
tagging exists to prevent.`;

/**
 * The same notation, stated formally.
 *
 * `GRAMMAR` above is a worked example and a set of rules in prose, which is what
 * a model needs in order to *write* a storm. This is the production set, which
 * is what it needs in order to be sure — the difference between "tags look like
 * this" and "a tag is `'+' , ( Ident | String )`, and it may appear any number
 * of times, interleaved with the column, in either order".
 *
 * ## It sits here rather than with the document that ships it
 *
 * Because it is a statement about the notation, and this file is what tracks the
 * notation. Beside `GRAMMAR` means a change to one is made under the eyes of the
 * other; in the exporting module it would be a second description of the same
 * subject in a file whose stated job is framing — which is how `doc/es-grammar.md`
 * came to document a `level` line the parser had already stopped writing.
 *
 * ## It is not in the panel prompt
 *
 * `guideFor` does not include it, and that is a judgement rather than an
 * oversight. The assistant in the panel is given a worked example and is
 * corrected by a parser the moment it gets something wrong — a proposal that
 * does not parse is shown with its errors and cannot be applied — so the formal
 * grammar buys precision it can already get by other means, at the cost of a
 * page of tokens on every request. A session reading the exported document has
 * no such loop: nothing there will tell it that `@0` is refused until somebody
 * tries to open the file.
 *
 * Every production below was read off `lexer.ts` and `parser.ts` rather than
 * from the older document under `doc/`, which is wrong in exactly the place it
 * matters.
 */
export const EBNF = `## The grammar, formally

EBNF. \`,\` is sequence, \`|\` is alternation, \`{ x }\` is zero or more, \`[ x ]\` is
optional, \`? … ?\` is prose, and a quoted literal stands for itself.

\`\`\`ebnf
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
Escape      = '\\' , ( '"' | '\\' | 'n' | 't' ) ;
Splice      = '\\' , Newline , { ' ' | Tab } ;
Integer     = Digit , { Digit } ;
Ident       = ( Letter | Digit | '_' ) , { Letter | Digit | '_' | '-' } ;
Comment     = '//' , { ? any character except a line break ? } ;

Char        = ? any character except '"', '\\' or a line break ? ;
Newline     = ? LF, or CR followed by LF ? ;
Tab         = ? a horizontal tab ? ;
Digit       = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' ;
Letter      = ? A to Z, or a to z ? ;
\`\`\`

Reading it:

- **Every body is optional.** \`lane "Customer"\` with no braces is a legal empty
  lane, and so is a card with no note block. So is a storm with no body at all.
- **\`Column\` and \`Tag\` interleave in any order**, and a card takes any number of
  tags. \`event "Order placed" +revenue @4\` and \`event "Order placed" @4 +revenue\`
  are the same card.
- **Columns are one-based.** \`@0\` and below are refused rather than clamped: a
  column is a position on a wall, not an array index. A card with no \`@\` takes
  the square after the last card written in the same lane — so a run of events
  typed straight down a lane needs no numbers, and a card that belongs at column
  7 because that is when it happens can say so.
- **A \`Card\` may be written directly inside the storm block**, before any
  \`lane\`. Those are gathered into one unnamed lane, which is the shape a real
  file has early: chaotic exploration produces a heap of events long before
  anybody agrees where one stretch of the wall ends and the next begins.
- **\`Splice\` puts a line break in the value** and drops the indentation after it,
  so a long note is one string spelled across as many lines as it needs. A
  *bare* newline inside a string is an unterminated string — that is what stops
  one missing quote from swallowing the rest of the file.
- **\`LegacyLevel\` is read and thrown away. Never write one.** It is in the
  grammar only so a file written before the level was removed still opens; the
  level is discovered from the cards, as the notation section above says.
- **There is no ticket sigil.** The scanner also recognises \`#\` and \`~\` because
  it is shared with the story-map tool next door, and no production here uses
  them. Writing one is an error.
- **\`Comment\` and whitespace are trivia**, discarded by the lexer, and never
  reach the parser. The language is brace-delimited: indentation is a formatting
  choice and never syntax, so a file that has been through a chat window or an
  editor with different tab settings still parses.
- **Nothing refers to anything else.** There are no identifiers to resolve and no
  second pass; everything is decided as it is read. The only whole-file rules are
  that one file holds one \`eventstorm\` block, and that a storm declares
  \`product\` at most once — a second is a bad merge, and is reported rather than
  silently resolved.

A source over 2 MB is refused before a character of it is scanned.`;

export const DOCTRINE = `## What a good wall does

**The most valuable card on the wall is the red one.** A storm that has produced
no hotspots has not been honest yet — either the room agreed about everything,
which almost never happens, or nobody said the thing they were unsure about. So:

- \`hotspot\` is a disagreement, a missing decision, a thing nobody in the room
  can settle. Naming one is progress, not a failure. Ask about the parts of the
  timeline that are suspiciously smooth.
- A domain event is **something that happened**, past tense, in the business's
  own words — \`Order placed\`, \`Payment refused\`. \`Place order\` is a command
  wearing an event's colour, and a wall full of them is a wall of intentions
  rather than facts.
- A \`policy\` is the rule that reacts to an event and issues a command:
  "whenever X, do Y". If a policy has no event before it or no command after it,
  the causal chain has a hole where somebody's decision goes.
- A run of events with no \`actor\` and no \`system\` anywhere near it is usually
  a stretch of the process nobody in the room actually owns.
- Lanes are not a taxonomy. A lane whose cards have no timing relationship to
  its neighbours is a list that has been drawn on a timeline.
- An \`opportunity\` next to a hotspot is the room's answer to it. One with no
  hotspot near it is often a solution looking for its problem.
- \`context\` is where one model's language stops and the next begins. Clusters of
  events that share a language and change together are the candidates; finding
  them is the last phase of a big picture, not a separate exercise.`;

/**
 * The rules for changing somebody else's storm.
 *
 * Facts about the format and about whose file it is, not about this panel. A
 * model editing an `.eventstorm` in a terminal has to honour every one of them,
 * which is why they are their own constant and why they are exported: the
 * contract below quotes them, and so does the notation document the export
 * dialog writes. Two copies worded differently would be one copy that keeps the
 * comments and one that quietly tidies them away.
 */
export const EDITING = `- **The whole document**, not a fragment, not a diff, not the changed lane. It
  replaces the file.
- **Change only what was asked for.** Everything else comes back byte-identical
  — comments, blank lines, column alignment, the order of the lanes. The result
  is read as a diff, and a diff full of reformatting is a diff nobody reads.
- **Keep the comments.** They are the author's reasoning and are not yours to
  tidy.
- **Do not renumber columns you were not asked to move.** A column is a
  coordinate: shifting one silently moves a card to a different moment.
- **It must parse.** A document that does not is not a smaller version of one
  that does; it is a file nobody can open.`;

/**
 * What an answer has to look like to be usable.
 *
 * The fence is the whole contract: prose streams to a reader, and a proposal is
 * pulled out of it, parsed, and offered as a diff — see `protocol.ts`. A
 * proposal that arrives as a fragment or a patch cannot be applied, because
 * splicing a model's guess into somebody's file is how a good suggestion
 * becomes a corrupt document.
 */
const CONTRACT = `## How to answer

Write for someone reading in a narrow panel beside their wall. Be brief and
concrete. Refer to cards by their text, and to lanes and columns by name and
number. Lead with the answer; no preamble, no restatement of the question.

**If the demand asks a question, answer it in prose and stop.** Do not attach a
document. "This timeline holds together, and here is why" is a complete and
valuable answer — say it when it is true rather than inventing work.

**If the demand asks for a change**, write the prose first — what you changed and
why — and then exactly one fenced block:

\`\`\`\`
\`\`\`eventstorm
<the complete document, from the first line to the last>
\`\`\`
\`\`\`\`

Rules for that block, all of them load-bearing:

${EDITING}
- **One block.** If you want to illustrate something in passing, describe it in
  prose instead. A block that does not parse is shown to the visitor with its
  errors and cannot be applied.`;

/**
 * The system prompt, plus whatever standing instructions the visitor has
 * written in the settings panel.
 *
 * Theirs go last so they win. Somebody who runs their storms in French, or
 * whose shop calls a hotspot something else, should not have to argue with this
 * file.
 */
export function guideFor(guidance: string): string {
	const parts = [ROLE, GRAMMAR, TAGS, DOCTRINE, CONTRACT];

	const extra = guidance.trim();
	if (extra !== '') {
		parts.push(
			`## From the person you are helping\n\nThese are their standing instructions. Where they conflict with anything above, follow these.\n\n${extra}`,
		);
	}

	return parts.join('\n\n---\n\n');
}
