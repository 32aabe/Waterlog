import { useState } from "react";
import { useLocation, useParams, Link } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getSpotTypeLabel, getWaterConditionLabel, getBehaviorInfinitive, formatSighting } from "@/const";
import { ArrowLeft, Plus, Droplets, Bird } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { dayHeaderLabel, groupByDay, shortDateLabel } from "@/lib/dates";
import { resolveWaterStateStyle } from "@/lib/spotVisual";
import { SpotIllustration } from "@/components/SpotIllustration";
import type { MomentSummary } from "../../../server/db";

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
  // "other" / "Other" are deliberately excluded before ranking — a
  // generic catch-all should never become the one thing this sentence
  // claims to know about the place ("usually other," "stops to other").
  const topCondition = topByFrequency(
    moments.map(m => m.waterCondition).filter((c): c is string => !!c && c !== "other"),
    1,
  )[0];
  const conditionPhrase = topCondition ? WATER_CONDITION_CHARACTER[topCondition] : null;

  const species = topByFrequency(
    moments.flatMap(m => m.sightings.map(s => s.species).filter((s): s is string => !!s)),
    1,
  )[0];
  const behaviorLabel = topByFrequency(
    moments.flatMap(m => m.sightings.flatMap(s => s.behaviors)).filter(b => b !== "Other"),
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

export default function SpotStory() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const spotId = Number(params.id);
  const { data, isLoading } = trpc.spots.getById.useQuery({ id: spotId }, { enabled: !Number.isNaN(spotId) });
  const utils = trpc.useUtils();
  // Same "invalidate then navigate" order as Capture's own save flow —
  // by the time MapHome remounts on `/`, spots.list is already marked
  // stale, so its fresh fetch excludes this spot rather than briefly
  // showing it and then popping it out a beat later.
  const deleteSpot = trpc.spots.delete.useMutation({
    onSuccess: async () => {
      await utils.spots.list.invalidate();
      navigate("/");
    },
    onError: () => {
      toast("Couldn't delete this spot", { description: "Check your connection and try again." });
    },
  });
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

        {/* Quiet, deliberately unstyled as an action — tucked below
            everything else so it's never the thing this screen is about.
            AlertDialog (not a bare confirm()) so the copy can stay calm
            and specific instead of a generic browser prompt. */}
        <div className="mx-4 mt-10 flex justify-center">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-destructive"
              >
                Delete spot
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this spot?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove this place and its moments from your journal.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteSpot.isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={deleteSpot.isPending}
                  onClick={() => deleteSpot.mutate({ id: spot.id })}
                  className={buttonVariants({ variant: "destructive" })}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
        {/* Real back, not a hardcoded destination — a Spot can be entered
            from the Map, the Spots list, or the Journal, and each of
            those should be where this returns to. Matches the pattern
            already used in Capture.tsx. */}
        <Button size="icon" variant="ghost" onClick={() => window.history.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex-shrink-0 px-5 pt-1">
        <h1 className="line-clamp-2 font-display text-2xl leading-tight text-foreground">
          {spot.name || getSpotTypeLabel(spot.spotType)}
        </h1>
        <p className="mt-1.5 text-xs text-muted-foreground">
          <span
            className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: resolveWaterStateStyle(spot).color }}
          />
          {resolveWaterStateStyle(spot).label} · Since {shortDateLabel(new Date(spot.firstSeenAt))}
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
          <SpotIllustration spot={spot} waterCondition={latestWaterCondition} birdActivity={activityLevel} />
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
