"""
Reading a user story map - the doctrine, as checks.

User story mapping is Jeff Patton's. Everything in this module comes from
`doc-sm/storymap-doctrine.md`, and every reading here is a **warning or a
reading, never an error**.

The doctrine's central claim governs the whole module: **a story map is a plan
for slicing, not a backlog with indentation.** The whole value is that you can
draw a line across it and ship what is above the line - so the first delivery
getting a story into every activity is the reading that matters most, and it is
the one check here that looks at the map as a whole rather than at a card.

Three of the doctrine's instructions are about what *not* to do, and they are
honoured by omission:

  - **Do not tidy away the unscheduled stories.** They are counted and named as
    what the plan leaves out, never as a backlog to file.
  - **Do not invent tickets or statuses.** Nothing here proposes a `#` or a `~`.
  - **Do not answer "is this ready?" with a slice.** An empty activity in the
    first delivery is reported and named; whether that is acceptable is the
    room's call, and no reading here makes it.
"""

from __future__ import annotations

from ..problems import Problem, Severity
from ..prose import count, names_a_verb, overlap, quote_list
from .model import Activity, Step, Story, StoryMap

#: A step with more stories than this is usually two steps.
CROWDED_STEP = 7

#: How much of the `so` clause may already be in the `want` before it is a
#: restatement rather than a justification.
RESTATEMENT = 0.75

#: An activity title of at most this many words with no verb in it reads as a
#: feature name. Longer than this and the title is a phrase, which is enough
#: for the benefit of the doubt - this heuristic's word list is not good enough
#: to argue with a sentence.
FEATURE_NAME_WORDS = 2


def read(story_map: StoryMap) -> list[Problem]:
    """Every doctrine reading of this map."""
    findings: list[Problem] = []
    findings += _shape(story_map)
    findings += _backbone(story_map)
    findings += _first_slice(story_map)
    findings += _steps(story_map)
    findings += _stories(story_map)
    findings += _personas(story_map)
    findings += _unscheduled(story_map)
    findings += _legacy_spelling(story_map)
    return findings


def _at(
    node: StoryMap | Activity | Step | Story,
    message: str,
    hint: str,
    code: str,
    severity: Severity,
) -> Problem:
    return Problem(
        message=message,
        line=node.line,
        column=node.col,
        length=node.width,
        hint=hint,
        severity=severity,
        code=code,
    )


# -- the shape of it --------------------------------------------------------


def _shape(story_map: StoryMap) -> list[Problem]:
    if not story_map.activities:
        return [
            _at(
                story_map,
                "This map has no backbone.",
                "A map with no activities is one nobody has laid out yet. "
                "That is a legal file, not a finding.",
                "sm-empty-map",
                Severity.INFO,
            )
        ]
    scheduled = len(story_map.stories) - len(story_map.unscheduled)
    return [
        _at(
            story_map,
            f"{count(len(story_map.activities), 'activity', 'activities')}, "
            f"{count(len(story_map.steps), 'step')}, "
            f"{count(len(story_map.stories), 'story', 'stories')} "
            f"({scheduled} scheduled, {len(story_map.unscheduled)} below the line), "
            f"{count(len(story_map.deliveries), 'delivery', 'deliveries')}.",
            "The backbone reads left to right in the order a user meets it.",
            "sm-shape",
            Severity.INFO,
        )
    ]


# -- the top row ------------------------------------------------------------


def _backbone(story_map: StoryMap) -> list[Problem]:
    """The backbone is a **narrative**.

    Activities read left to right in the order a user meets them, and a
    backbone that reads as a list of features - "Search", "Admin", "Reporting"
    - has lost the story it was supposed to tell.

    Two tells, and the doctrine's own three examples need both. "Search" is a
    verb and "Reporting" is a gerund, so asking only "does this start with
    something a person does?" lets the exact row the doctrine warns about
    straight through. What is actually wrong with them is that they name a
    *thing* rather than a job: an activity is a verb **and its object** -
    "Discover documentation", "Search the catalog" - so a title of one bare
    word is the first tell, and a longer title with no verb in it is the
    second.

    This is the weakest heuristic in the package. It will be wrong about a
    good activity whose verb is a word no list has, which is why it is a
    warning phrased as a question rather than an error.
    """
    findings: list[Problem] = []
    for activity in story_map.activities:
        title_words = activity.title.split()
        if len(title_words) == 1:
            why = "names a thing rather than a job somebody is doing"
        elif len(title_words) <= FEATURE_NAME_WORDS and not names_a_verb(activity.title):
            why = "has no verb in it"
        else:
            continue
        findings.append(
            _at(
                activity,
                f'The activity "{activity.title}" {why}.',
                "The backbone is a narrative: activities are what the user is trying "
                "to get done, in the order they meet them, and an activity is a verb "
                'and its object - "Discover documentation". A row of "Search", '
                '"Admin", "Reporting" is the existing system\'s menu structure, not a '
                "journey.",
                "sm-backbone-reads-as-features",
                Severity.WARNING,
            )
        )

    if not any(activity.personas for activity in story_map.activities):
        findings.append(
            _at(
                story_map,
                "No activity lists a persona.",
                'An activity is where "who is doing this?" actually gets asked - once '
                "per thing people do, not once per product.",
                "sm-no-personas",
                Severity.INFO,
            )
        )
    return findings


# -- the line you draw across it -------------------------------------------


def _first_slice(story_map: StoryMap) -> list[Problem]:
    """A release is a **slice, not a prefix**.

    Every activity should have something in the first delivery: a slice that
    ships three whole activities and none of the fourth is a plan to ship a
    product that stops working halfway through the job.

    Reported for the first band only. The doctrine's question is about the
    first thing that ships - later bands are allowed to be about one part of
    the journey, and warning on each of them would drown the one that matters.
    """
    findings: list[Problem] = []
    if not story_map.deliveries:
        if story_map.stories:
            findings.append(
                _at(
                    story_map,
                    "This map has no deliveries, so every story is below the line.",
                    "The whole value of a map is that you can draw a line across it "
                    "and ship what is above the line. Nothing has been sliced yet.",
                    "sm-no-deliveries",
                    Severity.INFO,
                )
            )
        return findings

    first = story_map.deliveries[0]
    empty = [
        activity.title
        for activity in story_map.activities
        if activity.steps
        and not any(story.delivery == first.title for story in activity.stories)
    ]
    if empty:
        findings.append(
            _at(
                first,
                f'The first delivery "{first.title}" leaves '
                f"{count(len(empty), 'activity', 'activities')} empty: "
                f"{quote_list(empty)}.",
                "A release is a slice, not a prefix. A slice that ships whole "
                "activities and none of the next is a plan to ship a product that "
                "stops working halfway through the job. Whether that is acceptable is "
                "the room's call, not this tool's.",
                "sm-slice-is-a-prefix",
                Severity.WARNING,
            )
        )
    return findings


# -- the middle row ---------------------------------------------------------


def _steps(story_map: StoryMap) -> list[Problem]:
    """A step with a great many stories is usually two steps. A step with one
    story is usually not a step - it is the story, and the level above it is
    doing no work."""
    findings: list[Problem] = []
    for step in story_map.steps:
        if len(step.stories) >= CROWDED_STEP:
            findings.append(
                _at(
                    step,
                    f'The step "{step.title}" holds '
                    f"{count(len(step.stories), 'story', 'stories')}.",
                    "A step with a great many stories is usually two steps. "
                    "Where does the user finish one thing and start the next?",
                    "sm-crowded-step",
                    Severity.WARNING,
                )
            )
        elif len(step.stories) == 1:
            findings.append(
                _at(
                    step,
                    f'The step "{step.title}" holds one story.',
                    "A step with one story is usually not a step - it is the story, "
                    "and the level above it is doing no work.",
                    "sm-thin-step",
                    Severity.INFO,
                )
            )
    return findings


# -- the cards --------------------------------------------------------------


def _stories(story_map: StoryMap) -> list[Problem]:
    """`so` is the line that decides whether a story is worth building.

    One that restates the `want` in other words - *"so I can search"* under
    *"want to search"* - is a story nobody has justified yet.
    """
    findings: list[Problem] = []
    for story in story_map.stories:
        if story.want and story.so_that and overlap(story.so_that, story.want) >= RESTATEMENT:
            findings.append(
                _at(
                    story,
                    f'The story "{story.title}" has a `so` that restates its `want`.',
                    "`so` is the line that decides whether a story is worth building. "
                    "What goes wrong for this person if it is never built?",
                    "sm-so-restates-want",
                    Severity.WARNING,
                )
            )
        elif story.want and not story.so_that:
            findings.append(
                _at(
                    story,
                    f'The story "{story.title}" says what is wanted and not why.',
                    "The `so` clause is the half that gets dropped first and missed "
                    "most. All three fields are optional, so this is a reading rather "
                    "than a defect.",
                    "sm-no-so",
                    Severity.INFO,
                )
            )
    return findings


def _personas(story_map: StoryMap) -> list[Problem]:
    """An activity every persona touches is often not one activity."""
    findings: list[Problem] = []
    everyone = story_map.personas
    if len(everyone) < 3:
        return findings
    for activity in story_map.activities:
        if len(activity.personas) < len(everyone):
            continue
        findings.append(
            _at(
                activity,
                f'The activity "{activity.title}" lists every persona on the map.',
                "An activity every persona touches is often not one activity. "
                "Do they all want the same thing from it?",
                "sm-activity-for-everyone",
                Severity.INFO,
            )
        )
    return findings


# -- what the plan leaves out ----------------------------------------------


def _unscheduled(story_map: StoryMap) -> list[Problem]:
    """Unscheduled stories are **not a backlog to be tidied away**.

    They are the map saying what the plan currently leaves out, and that is
    worth reading before anybody adds another sprint. So this is an INFO that
    names them, and there is deliberately no suggestion anywhere in this module
    that they be scheduled, deleted or filed.
    """
    below = story_map.unscheduled
    if not below or not story_map.deliveries:
        return []
    titles = quote_list(story.title for story in below[:5])
    more = "" if len(below) <= 5 else f", and {len(below) - 5} more"
    return [
        _at(
            story_map,
            f"{count(len(below), 'story', 'stories')} below the line: {titles}{more}.",
            "This is the map saying what the plan currently leaves out. Read it "
            "before adding another sprint - it is not a backlog somebody forgot "
            "to file.",
            "sm-below-the-line",
            Severity.INFO,
        )
    ]


def _legacy_spelling(story_map: StoryMap) -> list[Problem]:
    """`release "MVP"` is the older spelling and still parses.

    A migration path rather than a dialect the format keeps: nothing writes it
    any more, and one trip through the board converts a file.
    """
    return [
        _at(
            delivery,
            f'The delivery "{delivery.title}" uses the older `release "..."` spelling.',
            'It still parses and means `delivery "%s" release`. One trip through the '
            "board converts the file." % delivery.title,
            "sm-legacy-release-spelling",
            Severity.INFO,
        )
        for delivery in story_map.deliveries
        if delivery.legacy
    ]
