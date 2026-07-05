# Design Manifesto

Waterlog는 화려한 인터페이스를 만들지 않는다.

조용하고,

숨 쉬는 듯하며,

물처럼 자연스럽게 흘러야 한다.

사용자는 UI보다

장소를 먼저 기억해야 한다.



*The visual and emotional language of Waterlog*

> Waterlog should never feel like software.
> It should feel like opening a field notebook after a quiet walk in the rain.

> The interface should disappear as quickly as possible, leaving only the place, the bird, and the memory.

Everything below exists to protect those two sentences. This is not a style
guide. It has no hex codes, no font names, no component specs — those will
come later, and they will be judged against this document, not the other
way around. This is the thing a designer reads before opening Figma, and
the thing an engineer reads before writing a transition curve. If a future
decision is easy to justify by pointing at a feature list but hard to
justify by pointing at this document, the decision is wrong.

---

## 1. The reversal this whole app is built on

Most apps in this space ask: *what did you find?* Waterlog asks a
different question: *what did you notice?*

Waterlog is not about collecting birds. It is about discovering places
where life quietly appears. The bird is not the trophy. The bird is
evidence — proof that an ordinary puddle, a drainage ditch, a fountain
outside a library, is not just wet concrete but a small, working
ecosystem that happened to exist under someone's daily path, unnoticed,
until they noticed it.

A Spot is never something a user *creates*. It is something a user
*discovers*. The difference is not semantic. Creating implies ownership,
authorship, a blank form waiting to be filled. Discovering implies that
the thing was already there, alive, indifferent to being seen — and the
user simply happened to be the one who looked. The app's entire posture
toward the user should reflect this: quiet, a little reverent, never
transactional.

## 2. Discovery is personal. Connection is quiet. Memory is yours alone.

Three principles govern the relationship between a person and a place.
They emerged directly from conversation about this app, they are not
negotiable, and every future notification, map interaction, and piece of
copy about a Spot should be checked against all three before it ships.


## Relationship is what deepens

A place does not become important because it contains many observations.

It becomes important because a person keeps returning,
and life keeps returning too.

Waterlog should never communicate this as progress.

There is no level.

No experience points.

No completion.

The interface should quietly suggest that
the relationship has become richer.

Old places should feel familiar.

Living places should feel alive.

Returning should feel natural,
never rewarded.

### Discovery is always personal.

Users never discover spots through other people. There is no feed of
nearby places someone else found first, no map layer that reveals a
location before the user has stood there themselves, no "others found
this" prompt that turns discovery into a suggestion or a lead. A spot
only becomes part of someone's world when they find it themselves — on
their own walk, by their own attention, first, always.

This is the emotional starting condition of the entire app, not a privacy
setting applied afterward. If a feature would let one user find a spot
*because* another user found it first, that feature is wrong, no matter
how useful or well-built it is. This is also the test that the current
"Spots" screen fails outright, and the reason it cannot simply be
restyled — a searchable directory of every spot the community has found
is precisely the mechanism this principle forbids.

### Connection happens quietly afterward.

Once — and only once — a user has personally discovered a spot, the app
may quietly tell them, later, that someone else found life there too.
This is not a discovery mechanism. It is a small, late acknowledgment that
a place they already cared about is bigger than their own noticing of it.

The reward here is not rarity. It is not "you found something few people
have seen." It is the quieter, larger feeling of realizing that a place
you personally cared about — the puddle you kept half an eye on all
spring — has become part of the lives of birds independent of you,
whether or not you happened to be there to see it this time. *Oh. It
wasn't just mine. It was already alive, and it still is, even when I'm
not looking.* Every notification, every animation, every piece of copy
touching this moment should be built toward that specific feeling — never
toward achievement, competition, or "you win."

### Waterlog shares places, not memories.

A Spot's underlying identity — its location, its kind, the fact that it
exists at all — is shared: the same physical puddle is the same physical
puddle no matter who is standing at it, and the app should quietly know
that. But the *memory* of it is never shared. Every user keeps their own
name for a place, their own notes, their own photos, their own sense of
what it means. One person's "the puddle by the bus stop" is another
person's "sparrow puddle" is a third person's "the place that shows up
after rain," and none of these ever has to reconcile with the others.

If two people are looking at the same physical spot, they should never be
shown each other's private words for it — not the name, not the note, not
the photo. What they may, eventually, quietly learn is that the place is
alive for someone else too. Never what that someone else called it,
wrote about it, or felt about it. Places are shared. Memories are not.

If a feature makes two users feel like they are racing for the same
puddle, or lets one read another's private words about a shared place, it
has failed this section completely, regardless of how well it is built.

## 3. The first minute

Someone opens Waterlog for the first time. They have no idea what a
"Spot" is. They do not read onboarding copy carefully. What do they feel?

They should feel like they've been handed something already in use — a
notebook with a few pages filled in by someone else, left on a bench,
inviting them to keep going, not a blank form demanding setup. The map
should already feel alive before they've done anything: a few quiet
points of light, unexplained, patient. Curiosity should arrive before
instruction. The first genuine emotional beat is not "here's how this
works," it's *"wait — was there always a bird here?"*

Nothing should ask for effort in the first minute. No account wall before
they can look. No form before they can feel the shape of the thing. The
first action available to them should be the smallest possible one — look
at a place, or notice one — and it should already feel complete.

## 4. The first year

A year in, the emotional register changes entirely, and the app should
change with it, quietly, without announcing that it has.

In the first minute, Waterlog is a door. In the first year, it is a
drawer full of old photographs you didn't know you were keeping. The
reward is no longer discovery — it's recognition across time. A puddle
that existed for four days last March, then was gone, then came back this
March. A sparrow that showed up in the exact same corner of a fountain,
twice, eleven months apart, and only the user would ever notice that.
Nobody else could feel that specific thing, because nobody else stood in
that exact spot with a phone in the rain on both of those days.

The design implication: the app must age *with* its content, not just
store it. A place a user hasn't visited in months should not look broken,
empty, or in need of maintenance — it should look like a pressed flower
in a book: quiet, a little faded, unmistakably still theirs. The passage
of time itself is content, not decay.

## 5. How the interface disappears

Every screen in Waterlog is in competition with the actual world outside
the phone — a puddle, a bird, five seconds of attention on a walk. The
interface loses that competition the moment it reminds the user that it
is an interface.

Concretely, this means: chrome recedes. Navigation exists, but it should
never be the loudest thing on a screen. Confirmations should be felt, not
announced — a small settling motion says "this is remembered" far better
than a green checkmark and a toast that says "Success." Every visible
label, button, and icon should earn its place by asking: *if I removed
this, would the user be lost, or would they simply be looking at the
photo, the place, the memory a half-second sooner?*

The test is not "does this look clean." Plenty of cold, sterile software
looks clean. The test is whether a screen, looked at without reading any
of its labels, still feels like *something happened here* rather than
*something can be configured here*.

## 6. Water, memory, and season as a visual logic

Water should not appear in Waterlog as an icon of a droplet stamped
everywhere. It should appear as a *logic that shapes everything else* —
the way real water shapes the ground it touches without needing to
announce itself as water.

Concretely: things in this app should behave the way water behaves.
States fill and recede rather than switch on and off. A "dry" spot isn't
hidden — it's still there, just quieter, the way a dry streambed is still
a streambed. Backgrounds and surfaces can carry the faintest suggestion of
depth and reflection rather than being flat matte panels. Photography
(the user's own, always — see §11) is the primary way weather and season
enter the app; the interface itself should never need a literal
"sunny/rainy" icon set layered on top of someone's actual photo of the
sky.

Season is a rhythm, not a filter the user picks from a menu. Spring
shouldn't be signaled with a pastel-pink UI reskin. It should be signaled
by what's actually in the journal that week — more moments, more water,
more birds — the same way a real season announces itself through what you
notice, not through decoration.

## 7. Motion that feels like ripples, not software

Software motion optimizes for speed and legibility: things slide in from
an edge, snap into place, bounce slightly to confirm they've "landed."
This is a completely different physics than water, and it is the wrong
physics for this app.

Water doesn't snap. It settles. A ripple doesn't arrive with a bounce and
a click — it expands outward, slows, and fades, and by the time it's gone
you're not sure exactly when it stopped. Motion in Waterlog should borrow
that quality: things ease rather than snap, they fade rather than wipe,
and the *end* of an animation should feel softer and slower than the
start, the way a ripple loses energy rather than a spring recoiling.

A tap that logs a moment should not feel like pressing a button. It
should feel like a drop landing on still water — one small, deliberate
motion, and then a quiet, spreading acknowledgment that something changed,
without the app ever needing to say "Saved!" out loud. If an animation
would feel equally at home in a to-do app or a delivery-tracking app, it
is wrong for Waterlog, no matter how smooth it is.

Motion should also almost always be quiet by default and only occasionally,
deliberately, allowed a real moment of feeling — a spot coming back from
dry is worth one true, memorable animation in the whole app. If everything
animates, nothing feels earned.

## 8. Typography as tone of voice, not just legibility

Type in this app is not there to look designed. It's there to sound like
someone who writes calmly, precisely, and without hurry. Numbers and
system chrome can be plain and get out of the way — nobody needs to feel
the "warmth" of a stat tile. But anywhere the app is speaking *to* the
user, or showing the user their *own* words back to them — a note, a day
header, a place's name — the type should feel closer to handwriting that's
had time to dry than to a dashboard label. Not literally a script font;
never that costume-y. Just unhurried, with enough character that reading
it doesn't feel like reading a form.

Hierarchy should work the way emphasis works in speech — a little larger,
a little heavier, because it matters more right now — not the way it
works in a spreadsheet, where hierarchy is just a rule applied uniformly
down the page.

## 9. Spacing as silence

부드러운 여백 — soft margin. Whitespace in Waterlog is not empty; it's the
pause between sentences in a diary entry, the beat where the reader is
allowed to actually feel the last thing they read before the next thing
arrives.

Density is the enemy of calm, even when density is efficient. A screen
that fits more information in less space has optimized for the wrong
thing if the result feels crowded. When in doubt, the app should feel like
it's asking for less of the user's attention than it technically could —
one clear thing per screen, room around it, and trust that the user will
scroll, tap, or wait rather than needing everything visible at once.

## 10. Color as the color of water, not a brand color

The calm blue this app returns to again and again should never read as a
corporate accent color chosen from a palette generator. It should read as
the actual color of water under ordinary, overcast light — the color of a
puddle reflecting a grey sky, not the color of a fintech app's primary
button.

That means: muted over saturated, always. Cooler and quieter in most
contexts; allowed to warm slightly only where the app is being genuinely
tender (a memory returning, a place coming back to life). Color should
never be used the way a dashboard uses it — green for good, red for bad,
a traffic light of system status. States in this app are not "healthy" or
"failing." They're closer to weather: temporary, natural, nobody's fault.

## 11. Photography: the user's, always

Waterlog is not a photography app and should never art-direct its users
into thinking it is. A shaky, slightly blurry phone photo of a puddle,
taken in five seconds because a sparrow was about to fly off, is *more*
correct for this app than a polished, color-graded, editorial shot of the
same puddle would be. Perfect photography would be a kind of lie about
what this app is for.

The app's own visual system should never compete with or upstage a user's
photo. No heavy filters, no forced crops that fight the moment someone
actually captured, no glossy frames. If the app ever needs its own
imagery — for an empty state, an onboarding moment, a marketing surface —
it should look like it was taken by the same kind of person who uses the
app: unposed, close to the ground, a little imperfect, never stock.

## 12. Icons and marks as field-guide sketches

Icons should feel drawn by hand and then simplified, the way a naturalist
sketches something quickly in the margin of a notebook to remember its
shape — not manufactured by an icon-pack generator. Simple line marks,
consistent weight, nothing glossy, nothing dimensional, nothing that
looks like it belongs on an app-store icon grid of a hundred other
tools. When an icon needs to represent something in this world — water, a
wing, a ripple, a footprint — it should look like it could have been
sketched in fifteen seconds by someone standing at the spot, not rendered
by a design system.

## 13. What we deliberately avoid

These are not style preferences. Each of these actively undermines the
core reversal in §1–2, and should be treated as a hard boundary, not a
taste call:

- **Gamification of any kind** — badges, streaks, levels, progress bars,
  unlock animations, confetti, "you're on a 7-day streak!" Anything that
  makes noticing a bird feel like clearing a to-do item.
- **Competitive language** — leaderboards, rankings, "most spots found,"
  anything that pits one user's noticing against another's.
- **Dashboard visual grammar** — KPI tiles, bar charts, status-light
  colors (green/red), anything that would look at home in an analytics
  product.
- **Stock nature photography and cheerful illustration** — anything that
  looks like a wellness-app's idea of "calm," rather than an actual place.
- **Mascots or personified assistants** — no character, no avatar, no
  "meet your guide." If AI ever speaks, it speaks in the voice of the
  place or the notebook, never as a separate persona.
- **Urgency of any kind** — red badges demanding attention, push
  notifications that interrupt, copy that implies the user is missing out
  or falling behind.
- **Generic "eco" visual clichés** — leaf icons, green gradients, anything
  that signals "sustainability app" rather than "this specific puddle, on
  this specific Tuesday."
- **Research-tool coldness** — dense forms, field labels in
  ALL_CAPS_WITH_UNDERSCORES energy, anything that makes the user feel like
  they are the instrument, not the observer.

If a proposed feature or screen can only be explained by pointing at
something on this list, it should not ship in that form.

## 14. Reference constellation

None of these should be copied. Each is here because it holds one true
piece of the feeling Waterlog is after, and naming the piece matters more
than naming the reference.

- **Field Notes** — the physical object, not the brand: pocket-sized,
  unglamorous, meant to be filled in by hand and to look better worn than
  new. The standard for "made to be used outdoors, without ceremony."
- **Apple Journal** — private by default, prompts that suggest rather than
  demand, zero social pressure, and a quiet trust that a memory is worth
  keeping even with no audience.
- **Muji** — the absence of branding *as* the branding. Calm materials,
  no unnecessary ornament, confidence that comes from restraint rather
  than decoration.
- **AllTrails** — referenced narrowly, for its map-as-living-object
  feeling and the outdoor-utility warmth of its best screens — not for its
  gamified badge system, which this app should explicitly not inherit.
- **Merlin Bird ID** — the quiet, humble moment of identification. No
  competition, no rarity-chasing, just "here's what that probably was,"
  offered gently and without insisting on being right.
- **Persona 3 Reload** — specifically its handling of the calendar: the
  way an ordinary day, logged and then looked back on, becomes emotionally
  weighted purely through repetition and time passing. Its water, memory,
  and blue-toned atmosphere are close kin to this app's own.
- **Nan Shepherd's *The Living Mountain*** — a naturalist returning to the
  same mountain for decades, finding it inexhaustible not because it
  changes but because her attention deepens. This is the exact shape of
  the relationship a user should build with a single Spot.
- **The quiet moments in Studio Ghibli films** (rain at a bus stop, a
  snail on a leaf, given the same visual weight as a plot event) — the
  principle that an unremarkable moment, looked at closely enough, becomes
  the most memorable thing in the story.
- **一期一会 (ichi-go ichi-e), "one time, one meeting"** — the idea that
  this exact moment, this bird, this puddle, today, will never happen in
  precisely this way again, and is worth recording fully because of that,
  not despite it.

## 15. AI as a quiet companion

AI in Waterlog is never the protagonist, never a character, and never
announces itself with a chat bubble competing for the user's attention.
It behaves the way a good notebook would if a notebook could remember
things for you: filling in the date, guessing that this is the same
puddle as last Tuesday, quietly suggesting a name for a species — always
reversible, always in the background, never insisting it's right.

AI should never speak in the first person as a distinct entity ("I found
3 matches!"). If it needs to say anything, it should speak in the voice
of the place or the journal itself — closer to a margin note than a
notification from an assistant. Its suggestions should feel like a soft
pencil mark that's easy to erase, not a confident, boxed-in answer the
user has to accept or reject. The moment a user feels *managed* by AI
rather than *helped* by it quietly, the AI has failed, regardless of how
accurate it was.

## 16. Notifications as ripples returning

A notification from Waterlog should feel like receiving a short letter,
not a push alert. It is rare. It is never urgent. It never uses a red
badge. It is always, without exception, about a place the user personally
has a relationship with — never a generic "3 new observations nearby."

The emotional target for every notification is exactly the feeling
described in §2: *it wasn't just mine.* "Someone found life at your
puddle." "This place came alive again today." Nothing about counts,
rankings, or how many other people did something. If a notification could
be mistaken for a marketing re-engagement push, it does not belong in
this app, no matter how well-timed it is.

## 17. Tests every future decision should pass

A short list a designer or engineer can hold a decision up against
without needing to ask anyone:

1. Does this make the user feel like they're entering data, or like
   they're remembering a moment?
2. If every label and icon on this screen were removed, would it still
   feel like something happened here — or would it just feel unfinished?
3. Would this feel at home in a field notebook left out in the rain?
4. Does this celebrate an achievement, or does it honor a discovery? (If
   the honest answer is "achievement," reject it.)
5. If this interaction were a sound, is it closer to a chime and a ding,
   or to rain on a window? It should always be the second one.
6. Does this ask the user to hurry, compete, optimize, or compare
   themselves to anyone else? If yes, it doesn't belong here.
7. Could this screen's copy, read aloud, be mistaken for a research
   instrument or a corporate dashboard? If yes, rewrite it.
8. Is this decision protecting §1 and §2 — place over bird, private
   discovery before quiet connection — or has it quietly drifted back
   toward being about collecting things?
9. Could this let someone find a spot *because* another user found it
   first — a feed, a map layer, a "nearby discoveries" list? If yes, it
   breaks discovery, no matter how well it's built.
10. Does this ever show one user another user's private name, note, or
    photo for a place they both happen to have found? If yes, it breaks
    the line between a shared place and a private memory.

## 18. Closing

Waterlog is not trying to be the best app for finding birds. It is trying
to be the thing someone reaches for, unthinkingly, the way they'd reach
for a coat by the door — because a walk in the rain left them with
something small worth not forgetting.

Every decision from here forward should be measured against two sentences
already written above this document, and one image: someone getting home,
a little wet, opening this app the way they'd open a notebook, and finding
that the puddle they almost didn't stop for is already, quietly, more
alive than they knew.
