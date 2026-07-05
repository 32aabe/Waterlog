import { useState } from "react";
import { useLocation, useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getSpotTypeLabel, getWaterConditionLabel, getBehaviorInfinitive, LIFECYCLE_LABELS, formatSighting } from "@/const";
import { ArrowLeft, Plus, Droplets, Bird, Waves } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { dayHeaderLabel, groupByDay, shortDateLabel } from "@/lib/dates";
import type { MomentSummary } from "../../../server/db";

const STATE_DOT_COLOR: Record<string, string> = {
  alive: "bg-chart-2",
  drying: "bg-amber-600",
  dry: "bg-muted-foreground/40",
  reawakened: "bg-primary",
};

function topByFrequency(items: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([item]) => item);
}

// How a place tends to hold water, in a phrase that reads naturally after
// "A puddle that's ___" — a character trait, not today's reading.
const WATER_CONDITION_CHARACTER: Record<string, string> = {
  full: "usually full",
  receding: "often receding",
  puddle_only: "often reduced to a small puddle",
  dry: "often dry",
  frozen: "often frozen over",
  partially_frozen: "half-frozen more often than not",
  snow_ice_present: "often dusted with snow or ice",
};

// The place's identity, in one sentence — what kind of place this is and
// who tends to show up, drawn from every moment ever logged here rather
// than the latest visit (see docs/design/06_SPOT_SCREEN.md, Layer 1).
// Deliberately doesn't mention weather or "when" — that's Layer 2's job.
function placeCharacterSentence(spotType: string, moments: MomentSummary[]): string | null {
  if (moments.length === 0) return null;

  const spotWord = getSpotTypeLabel(spotType).toLowerCase();
  const topCondition = topByFrequency(
    moments.map(m => m.waterCondition).filter((c): c is string => !!c),
    1,
  )[0];
  const conditionPhrase = topCondition ? WATER_CONDITION_CHARACTER[topCondition] : null;

  const species = topByFrequency(
    moments.flatMap(m => m.sightings.map(s => s.species).filter((s): s is string => !!s)),
    1,
  )[0];
  const behaviorLabel = topByFrequency(
    moments.flatMap(m => m.sightings.flatMap(s => s.behaviors)),
    1,
  )[0];
  const behavior = behaviorLabel ? getBehaviorInfinitive(behaviorLabel) : undefined;

  let sentence = `A ${spotWord}`;
  if (conditionPhrase) sentence += ` that's ${conditionPhrase}`;
  if (species && behavior) sentence += `, where a ${species} often stops to ${behavior}`;
  else if (species) sentence += `, known for visits from a ${species}`;
  else if (behavior) sentence += `, where birds often come to ${behavior}`;
  return `${sentence}.`;
}

// A coarse, symbolic read of how much bird life shows up here — never a
// literal count. See docs/design/06_SPOT_SCREEN.md, "Illustration
// Philosophy": bird numbers are symbolic, meant to convey atmosphere.
function birdActivityLevel(moments: MomentSummary[]): "None" | "Low" | "Medium" | "High" {
  const sightingCount = moments.reduce((sum, m) => sum + m.sightings.length, 0);
  if (sightingCount === 0) return "None";
  if (sightingCount <= 2) return "Low";
  if (sightingCount <= 5) return "Medium";
  return "High";
}

// The emotional center of Layer 1. Same slot, same aspect ratio, whether
// it holds a real photo or (for now) a plain placeholder — so the
// illustration system promised in docs/design/06_SPOT_SCREEN.md can drop
// in here later (built from water-type/condition/bird-activity parts)
// without any layout change, only this component's body changing.
function RepresentativeVisual({ photoUrl }: { photoUrl?: string }) {
  if (photoUrl) {
    return <img src={photoUrl} alt="" className="h-full w-full object-cover" />;
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-[var(--water-mist)] to-[var(--water-mist-2)]">
      <Waves className="h-9 w-9 text-muted-foreground/30" />
    </div>
  );
}

export default function SpotStory() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const spotId = Number(params.id);
  const { data, isLoading } = trpc.spots.getById.useQuery({ id: spotId }, { enabled: !Number.isNaN(spotId) });
  // Layer 1 (Place Portrait) and Layer 2 (Story) are two different
  // purposes, not two sections of one page — see docs/design/
  // 06_SPOT_SCREEN.md. Toggled locally rather than routed, so entering
  // Story feels like a soft reveal ("gently diving beneath the surface,"
  // per 01_MAP_SCREEN.md) rather than a page navigation, while the URL
  // stays a single shareable link to the spot.
  const [layer, setLayer] = useState<"portrait" | "story">("portrait");

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-muted-foreground">This water spot couldn't be found.</p>
        <Link href="/">
          <Button variant="outline">Back to map</Button>
        </Link>
      </div>
    );
  }

  const { spot, moments } = data;
  const coverPhoto = moments.find(m => m.photoUrls.length > 0)?.photoUrls[0];
  const placeSentence = placeCharacterSentence(spot.spotType, moments);
  const latestWaterCondition = moments[0]?.waterCondition;
  const activityLevel = birdActivityLevel(moments);

  if (layer === "story") {
    const dayGroups = groupByDay(moments);
    return (
      <div className="settle-in min-h-[100dvh] pb-24">
        <header className="flex items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-1">
          <Button size="icon" variant="ghost" onClick={() => setLayer("portrait")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="truncate font-display text-lg text-foreground">
            {spot.name || getSpotTypeLabel(spot.spotType)}
          </h1>
        </header>

        <div className="mx-4 mt-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Story</h2>
          <Button size="sm" onClick={() => navigate(`/capture?spotId=${spot.id}`)}>
            <Plus className="h-4 w-4" /> Log a moment
          </Button>
        </div>

        <div className="mx-4 mt-3">
          {moments.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No moments logged here yet. Be the first to record what this spot becomes.
            </div>
          )}
          {dayGroups.map(group => (
            <div key={group.key} className="mb-5">
              <p className="mb-2 font-display text-sm text-muted-foreground">{dayHeaderLabel(group.date)}</p>
              <div className="divide-y divide-border">
                {group.items.map(moment => (
                  <div key={moment.id} className="py-3 first:pt-0">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(moment.capturedAt), { addSuffix: true })}
                      </p>
                      {moment.waterCondition && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Droplets className="h-3 w-3" /> {getWaterConditionLabel(moment.waterCondition).toLowerCase()}
                        </span>
                      )}
                    </div>
                    {moment.note && <p className="mt-1.5 font-display text-sm text-foreground">{moment.note}</p>}
                    {moment.photoUrls.length > 0 && (
                      <div className="mt-2 flex gap-2 overflow-x-auto">
                        {moment.photoUrls.map((url, i) => (
                          <img key={i} src={url} alt="" className="h-24 w-24 flex-shrink-0 rounded-lg object-cover" />
                        ))}
                      </div>
                    )}
                    {moment.sightings.length > 0 && (
                      <p className="mt-1.5 text-sm text-muted-foreground">
                        {moment.sightings.map((s, i) => (
                          <span key={s.id}>
                            {i > 0 && " · "}
                            {formatSighting(s.species, s.behaviors)}
                            {s.count && s.count > 1 ? ` ×${s.count}` : ""}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Layer 1 — Place Portrait. Near-static, fills exactly one viewport,
  // never scrolls: the image is the emotional center, everything else is
  // the minimum needed to feel the place before choosing to read it.
  return (
    <div className="settle-in flex h-[100dvh] flex-col overflow-hidden">
      <div className="flex-shrink-0 px-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <Button size="icon" variant="ghost" onClick={() => navigate("/")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex-shrink-0 px-5 pt-1">
        <h1 className="line-clamp-2 font-display text-2xl leading-tight text-foreground">
          {spot.name || getSpotTypeLabel(spot.spotType)}
        </h1>
        <p className="mt-1.5 text-xs text-muted-foreground">
          <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${STATE_DOT_COLOR[spot.lifecycleState]}`} />
          {LIFECYCLE_LABELS[spot.lifecycleState]} · Since {shortDateLabel(new Date(spot.firstSeenAt))}
        </p>
      </div>

      {/* Minimal supporting info only — never a card, never a stat tile.
          See docs/design/06_SPOT_SCREEN.md: "Between the title and image,
          only minimal supporting information may appear... never large
          cards or dashboard-like components." */}
      <div className="flex-shrink-0 mt-3 flex items-center gap-4 px-5 text-xs text-muted-foreground">
        {latestWaterCondition && (
          <span className="flex items-center gap-1.5">
            <Droplets className="h-3.5 w-3.5" /> {getWaterConditionLabel(latestWaterCondition)}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <Bird className="h-3.5 w-3.5" /> {activityLevel}
        </span>
      </div>

      <div className="min-h-0 flex-1 px-5 pt-4">
        <div className="h-full w-full overflow-hidden rounded-3xl">
          <RepresentativeVisual photoUrl={coverPhoto} />
        </div>
      </div>

      {placeSentence && (
        <p className="flex-shrink-0 px-5 pt-4 font-display text-[16px] leading-relaxed text-foreground/90">
          {placeSentence}
        </p>
      )}

      <div className="flex-shrink-0 px-5 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] pt-5">
        <Button className="w-full" size="lg" variant="outline" onClick={() => setLayer("story")}>
          View Story
        </Button>
      </div>
    </div>
  );
}
