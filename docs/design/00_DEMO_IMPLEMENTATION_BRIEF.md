# Waterlog Demo Implementation Brief

---

# Purpose

This document defines the implementation scope for the AIR project demo.

The goal is **not** to build the complete Waterlog product.

The goal is to communicate Waterlog's core philosophy through a small but polished experience.

Every implemented interaction should reinforce one idea:

> Waterlog helps people build relationships with places where life gathers around water.

---

# Demo Goal

A user should finish the demo thinking:

> "This isn't a bird logging app."

Instead, they should feel:

> "This app helps me build a relationship with a place."

Feature completeness is less important than emotional clarity.

---

# Demo Scope

Only implement three core screens.

1. Map
2. Capture
3. Spot

Everything else is intentionally postponed.

---

# Out of Scope

Do NOT implement:

- Journal
- AI reflections
- Notifications
- Social features
- Spot creation algorithm
- Analytics
- Export
- Achievements
- Streaks
- User profiles
- Settings (except placeholder)

Simple placeholders are acceptable if necessary.

---

# Primary User Flow

Map

↓

Capture

↓

Spot

↓

Back to Map

This loop represents the core Waterlog experience.

---

# Screen 01 — Map

Purpose

The emotional home of Waterlog.

The map should never feel like Google Maps.

Instead, it should feel like a personal landscape built through repeated visits.

Requirements

- Minimal interface
- User's own places only
- No hotspot information
- No rankings
- No statistics
- No public data

Spot Representation

Each Spot grows through relationship.

Growth is represented by:

- slightly richer color
- subtle organic ripple variations
- gentle visual presence

Avoid map pins.

Background

Use a simplified landscape rather than a navigation map.

Prioritize:

- rivers
- ponds
- wetlands
- forests

Reduce:

- roads
- buildings
- labels

Capture

A centered water-drop button.

Tap should immediately open Capture.

Optional drag interactions may be explored later, but must never replace the fastest interaction.

Bottom Navigation

Map

Capture

Journal (placeholder)

Current Location button should remain available.

---

# Screen 02 — Capture

Purpose

Capture is where relationships begin.

Recording should always take less time than observing.

The interface should feel lightweight.

Layout

Photo (optional)

↓

Observation note

↓

Bird species

↓

Bird behavior

↓

Location

↓

Save

---

Photo

Optional.

Used for remembering places rather than documenting evidence.

---

Observation

Free text.

One sentence is enough.

---

Bird Species

Allow:

- AI suggestion
- manual search
- manual correction

Species remains an important part of the AIR project.

---

Bird Behavior

Behavior is equally important.

Provide a simple selection UI.

Examples:

- Drinking
- Bathing
- Swimming
- Foraging
- Resting
- Flying
- Other

Avoid complicated scientific terminology.

Primary / Secondary behavior can remain an internal data model.

---

Location

Instead of forcing location selection first,

Capture should finish naturally.

Then suggest nearby Spots.

Example:

Looks like you're near:

Library Pond

School Creek

or

Create New Spot

User always makes the final decision.

---

# Screen 03 — Spot

Purpose

A place becomes meaningful through repeated observation.

Spot consists of two layers.

---

Layer 1

Spot Overview

Shows the current identity of the place.

Examples

- representative birds
- common behaviors
- recent photo
- water condition
- visit count (optional, subtle)

This should answer:

"What is this place like?"

---

Layer 2

Spot Story

A chronological timeline.

Each observation becomes a small memory.

Examples:

Spring

↓

Summer

↓

Autumn

↓

Winter

The emphasis is storytelling rather than data visualization.

---

# Visual Language

Overall feeling

Quiet

Natural

Reflective

Never productive.

Never gamified.

Colors

Soft cream

Warm stone

Sage green

Deep water blue

Interaction

Fast.

Animations should never delay navigation.

Motion supports interaction.

Motion never blocks interaction.

---

# Success Criteria

The demo succeeds if users naturally understand:

Map

↓

Capture

↓

Spot

without explanation.

If users remember the feeling rather than the feature list,

the implementation has succeeded.

---

# Final Reminder

Always prioritize atmosphere over functionality.

When implementation choices become difficult,

choose the solution that best supports calm observation,
not feature completeness.