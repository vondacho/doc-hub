"""
The text heuristics the three doctrine readings share.

Everything here is a **heuristic**, and that word is load-bearing. The grammar
checks in the parsers are decidable: `@0` is wrong, a duplicate tag is wrong,
and there is nothing to argue about. Nothing in this module is decidable.
Whether `"Place order"` is a command wearing an event's colour is a judgement
about English, and a judgement about English made by a word list is going to be
wrong sometimes.

So two rules hold for every reading built on this module:

1. **It is never an error.** The worst it may be is a warning, and most of it is
   an INFO - a reading, phrased as a question to ask the room rather than a
   defect to fix. `--strict` is opt-in for exactly this reason.
2. **It is phrased so that being wrong costs nothing.** "This reads as an
   imperative" invites a look; "this is not a domain event" would be a claim
   this module cannot support.

The doctrines are explicit that the person holding the file was in the room and
knows the domain far better than the tool does. These heuristics exist to point
at the suspicious parts of a wall, never to overrule anybody about them.
"""

from __future__ import annotations

import re
from typing import Final, Iterable

#: Words that carry no content for an overlap comparison.
STOPWORDS: Final[frozenset[str]] = frozenset(
    """
    a an and any are as at be been being but by can cannot could did do does
    for from had has have i if in into is it its me my no not of on one only
    or so than that the their them then there these they this those to too
    up upon us was we were what when where which while who whom will with
    would you your
    """.split()
)

#: Irregular past participles common in the business language a wall is written
#: in. An event is written in the past tense, and `-ed` catches most of it; this
#: is the rest. Deliberately short - a long list of rare verbs would add noise
#: without catching anything a room actually writes.
IRREGULAR_PARTICIPLES: Final[frozenset[str]] = frozenset(
    """
    become begun bought brought built burnt caught chosen come cut dealt done
    drawn driven eaten fallen felt fled flown forbidden forgotten found frozen
    given gone got grown held hidden hit hurt kept known laid left lent let
    lost made meant met paid put quit read refunded risen run said seen sent
    set shown shut sold sought spent split spoken stolen struck taken taught
    thrown told understood undone withdrawn won written
    """.split()
)

#: Verbs a room reaches for when it writes a command. A command is imperative:
#: `Place the order`, `Take the payment`.
IMPERATIVE_VERBS: Final[frozenset[str]] = frozenset(
    """
    accept activate add allocate apply approve archive assign authorise
    authorize block book calculate cancel capture check choose clear close
    collect complete confirm create decline delete deliver deny discard
    dispatch download edit email enter escalate export fetch fill filter find
    finish generate grant hold import invite issue join launch link load log
    login logout mark merge move notify open order pay pick place plan post
    prepare print process publish purchase push raise reactivate read receive
    record redeem refund register reject release remove rename renew reopen
    reorder repay reply report request reschedule reserve reset resolve
    restore resume retry return review revoke save schedule search select
    send set settle ship show sign skip sort split start stop store submit
    subscribe suspend sync take transfer trigger unlink unsubscribe update
    upgrade upload validate verify view void withdraw write
    """.split()
)

#: Verbs and gerunds a Patton activity is named with. An activity is something
#: a user *does*, so its title is a verb phrase.
ACTIVITY_VERB_HINTS: Final[frozenset[str]] = IMPERATIVE_VERBS | frozenset(
    """
    browse compare configure decide discover do explore get give handle have
    identify inspect keep learn look make manage measure monitor navigate
    observe onboard organise organize pick plan practise practice prove
    provide pull put raise rate reach run scan see share shop sort start
    supply test track train try understand use watch work
    """.split()
)

#: Words that make a `then` a denial.
NEGATIONS: Final[frozenset[str]] = frozenset(
    """
    blocked cannot declined denied fails forbidden ignored never no none
    nor not nothing prevented refused rejected unable without
    """.split()
)

_WORD = re.compile(r"[A-Za-z][A-Za-z'\-]*")

#: Something that makes a step testable: a number, a date, a money amount, an
#: identifier, a code. "A voucher SUMMER10 that expired on 2026-08-21" has
#: three; "expired vouchers are refused" has none.
_CONCRETE = re.compile(
    r"""
    \d                       # any digit at all: a count, a price, a date, an id
    | \b[A-Z]{2,}\b          # an all-caps code: SUMMER10, CHF, GDPR
    | [%$£€]                 # a unit somebody has to compute against
    """,
    re.VERBOSE,
)


def words(text: str) -> list[str]:
    return [match.group(0).lower() for match in _WORD.finditer(text)]


def content_words(text: str) -> list[str]:
    return [word for word in words(text) if word not in STOPWORDS]


def first_word(text: str) -> str:
    found = words(text)
    return found[0] if found else ""


def overlap(left: str, right: str) -> float:
    """How much of the smaller phrase is already in the larger one.

    Containment rather than Jaccard: `so "I can search"` under `want "to
    search every product at once"` is a restatement even though the longer
    clause has words the shorter does not. Jaccard would score that pair low
    for the wrong reason.
    """
    a = set(content_words(left))
    b = set(content_words(right))
    if not a or not b:
        return 0.0
    return len(a & b) / min(len(a), len(b))


def looks_past_tense(text: str) -> bool:
    """Does anything in this title mark it as something that happened?

    `-ed` plus a short list of irregulars. A wall's events are short phrases,
    so one marker anywhere in the phrase is the signal.
    """
    for word in words(text):
        if word in IRREGULAR_PARTICIPLES:
            return True
        if len(word) > 3 and word.endswith("ed"):
            return True
    return False


def looks_imperative(text: str) -> bool:
    """Does this read as a request to do something rather than a record of it?

    The first word is what decides, because that is where the imperative lives:
    `Place order` against `Order placed`. Both start with a word that can be a
    verb, and only the second carries a past-tense marker - so a past marker
    anywhere in the phrase wins over the leading verb.
    """
    if looks_past_tense(text):
        return False
    return first_word(text) in IMPERATIVE_VERBS


def names_a_verb(text: str) -> bool:
    """Does the title start with something somebody does?

    Used on a story map's backbone, where an activity is a verb phrase and a
    bare noun - "Search", "Admin", "Reporting" - is the failure the doctrine
    names first.
    """
    head = first_word(text)
    if not head:
        return False
    return head in ACTIVITY_VERB_HINTS or (head.endswith("ing") and len(head) > 5)


def is_concrete(text: str) -> bool:
    """Does this step carry a real number, date, name or code?

    Numbers, dates and names are what make a `given` testable.
    """
    return bool(_CONCRETE.search(text))


def is_denial(text: str) -> bool:
    """Does this `then` say a thing did *not* happen?"""
    lowered = words(text)
    return any(word in NEGATIONS for word in lowered) or "n't" in text.lower()


def near_miss(name: str, candidates: Iterable[str]) -> str | None:
    """The candidate that differs only by case, if there is one.

    The same suggestion the boards make, and the same reason: a name that
    matches case-insensitively is a typo with an obvious fix, and anything
    looser would be guessing at what somebody meant.
    """
    folded = name.lower()
    for candidate in candidates:
        if candidate.lower() == folded and candidate != name:
            return candidate
    return None


def quote_list(names: Iterable[str]) -> str:
    return ", ".join(f'"{name}"' for name in names)


def count(n: int, singular: str, plural: str | None = None) -> str:
    """`3 rules`, `1 rule`, `1 activity`.

    A finding that says "1 rules" reads as a tool that was not finished, and a
    reader who notices that stops trusting the sentence around it.
    """
    return f"{n} {singular if n == 1 else (plural or singular + 's')}"


def verb(n: int, singular: str, plural: str) -> str:
    """`contributes` against `contribute` - the agreement `count` cannot do."""
    return singular if n == 1 else plural
