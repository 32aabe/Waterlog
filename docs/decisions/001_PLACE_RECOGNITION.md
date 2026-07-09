# 001. Place Recognition

## Status

Accepted for AIR Demo direction.

---

## Context

Waterlog is a place-centered product.

A Spot is not simply a GPS location.
A Spot represents a relationship between a person and a place where life gathers around water.

Nearby water features can have very similar GPS coordinates.

For example:

- a large puddle in front of a library
- a drainage channel beside the library
- a small rain puddle near a flower bed

These places may appear almost identical through GPS, but they are different places ecologically and emotionally.

GPS alone must never determine which Spot a memory belongs to.

---

## Decision

Waterlog never asks users to manually create a place as the default experience.

Instead, Waterlog quietly tries to recognize where the user is.

Place recognition is always a suggestion, never a final decision.

The user always has the final say.

---

## Recognition Principle

GPS is only one clue.

Future place recognition may combine multiple signals, including:

- GPS location
- nearby existing Spots
- previous visits
- user history
- photo context
- water type
- surrounding environment
- seasonal patterns

The goal is not perfect automation.

The goal is reducing effort while preserving personal meaning.

---

## Confidence-Based Recognition

### High confidence

If Waterlog is highly confident that the user is at an existing Spot:

```text
Library Front Puddle

What happened here today?
```

The Spot may be selected automatically.

The user should always be able to change it.

---

### Low confidence

If multiple nearby places are possible:

```text
Which place is this?

○ Library Front Puddle
○ Drain beside the Library
○ New Place
```

This should feel like a gentle confirmation, not a setup form.

---

### New place

If no existing place seems likely:

```text
This place seems new.
```

The user may simply save the memory.

Naming the place can happen later after repeated visits.

---

## Naming Principle

Waterlog should never require users to name a place immediately.

A place may begin unnamed.

After repeated visits, Waterlog may gently ask:

```text
This place seems to matter to you.

Would you like to give it a name?
```

This supports the philosophy that Spots are discovered through relationships, not created through forms.

---

## Shared Physical Place Model

In the future, multiple users may independently discover the same physical place.

Internally, the system may recognize a shared physical place.

Example:

```text
physicalPlaceId: 27

Canonical server name:
Library Front Puddle
```

Each user keeps a completely personal identity for that place.

Example:

```text
User A
Large puddle

User B
Just a puddle

User C
The place after rain
```

The server may know these are the same physical place.

Users should never see each other's names, notes, photos, or memories.

---

## Privacy Principle

Places may be shared internally.

Memories are private.

By default:

- The Map only shows the current user's Spots.
- Spot Story only shows the current user's memories.
- Names, notes, and photos are never shared.

Future ecological features may reference a shared place without revealing another user's private content.

---

## AIR Demo Scope

For the AIR Demo:

- Scope all Spots to the current user.
- Show only the user's own Spot Stories.
- Keep memories private.
- Optionally suggest nearby existing Spots.
- Do not implement community features.
- Do not implement shared physical-place behavior.
- Keep the architecture compatible with a future `physicalPlaceId` layer.

---

## Product Test

Before implementing any place recognition behavior, ask:

1. Does this reduce effort without replacing the user's judgment?
2. Does this distinguish a meaningful place from a GPS coordinate?
3. Does this protect personal memories?
4. Does this make Capture feel like leaving a memory rather than managing a database?
5. Does this encourage returning to places over time?

If the answer is "no" to any of these questions, reconsider the implementation.