import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { Plus, Sparkles } from "lucide-react";
import { formatSighting } from "@/const";
import { dayHeaderLabel, groupByDay, findOnThisDay } from "@/lib/dates";
import { cn } from "@/lib/utils";

// One quiet line supporting the note above it — place, time, and any
// sightings, combined rather than kept as separate competing rows.
function metaLine(
  spotName: string | null | undefined,
  capturedAt: string | Date,
  sightings: Array<{ species: string | null; behaviors: string[] }>,
): string {
  const parts = [spotName || "A water spot", formatDistanceToNow(new Date(capturedAt), { addSuffix: true })];
  if (sightings.length > 0) {
    parts.push(sightings.map(s => formatSighting(s.species, s.behaviors)).join(" · "));
  }
  return parts.join(" · ");
}

export default function Journal() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/");
  }, [authLoading, isAuthenticated, navigate]);

  const { data: journal, isLoading } = trpc.moments.listJournal.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const onThisDay = useMemo(() => (journal ? findOnThisDay(journal) : null), [journal]);
  // Calendar-year subtraction, not differenceInYears — that computes
  // *elapsed* time, which reads as "0 years ago" whenever today's clock
  // time hasn't yet reached last year's capture time on this same
  // month/day. findOnThisDay already guarantees a strictly earlier year,
  // so a simple calendar difference is both correct and always ≥ 1.
  const onThisDayYearsAgo = useMemo(
    () => (onThisDay ? Math.max(1, new Date().getFullYear() - new Date(onThisDay.capturedAt).getFullYear()) : 0),
    [onThisDay],
  );
  const dayGroups = useMemo(() => (journal ? groupByDay(journal) : []), [journal]);

  if (!isAuthenticated) return null;

  return (
    // A quiet warm shift off the app's usual neutral --paper — atmosphere,
    // not a texture — so this one screen reads as a slightly different
    // kind of page without literally depicting one (docs/03_DESIGN_
    // MANIFESTO.md §6, §9: paper influences mood, it's never imitated).
    <div className="min-h-[100dvh] pb-24" style={{ background: "color-mix(in oklab, var(--warm-mist) 16%, var(--paper) 84%)" }}>
      <header className="px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-4">
        <h1 className="font-display text-2xl text-foreground">Journal</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">Every moment you've logged, in order.</p>
      </header>

      {/* A real memory surfacing across time, not a metric — the one thing
          in this header worth a beat of visual weight (see Design
          Manifesto §4, "recognition across time"). No border: a tint is
          enough to say "this one's different," without becoming a card. */}
      {onThisDay && (
        <div className="ml-8 mr-4 mb-5 overflow-hidden rounded-xl bg-secondary">
          <div className="flex items-center gap-1.5 px-4 pt-3 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            On this day, {onThisDayYearsAgo} year{onThisDayYearsAgo === 1 ? "" : "s"} ago
          </div>
          <button
            onClick={() => navigate(`/spot/${onThisDay.spotId}`)}
            className="flex w-full items-center gap-3 p-4 pt-2 text-left"
          >
            {onThisDay.photoUrls[0] && (
              <img src={onThisDay.photoUrls[0]} alt="" className="h-16 w-16 flex-shrink-0 rounded-lg object-cover" />
            )}
            <div className="min-w-0">
              <p className="truncate font-display text-base text-foreground">{onThisDay.spot?.name || "A water spot"}</p>
              {onThisDay.note && <p className="line-clamp-2 text-sm text-muted-foreground">{onThisDay.note}</p>}
            </div>
          </button>
        </div>
      )}

      <div className="ml-8 mr-4">
        {isLoading && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}

        {!isLoading && journal && journal.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
            <Sparkles className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Your journal is waiting for its first page. The first entry takes less than 10 seconds.
            </p>
            <Button onClick={() => navigate("/capture")}>
              <Plus className="h-4 w-4" /> Log your first moment
            </Button>
          </div>
        )}

        {/* Consecutive field notes, not a timeline: no rail, no dots, no
            entry cards. Whitespace alone separates one memory from the
            next — a day is its own page (a large heading, a real pause
            before the next one begins), and within a day, each moment is
            its own small paragraph. The note is the first and largest
            thing rendered, never clamped — it should be read in full,
            not scanned and cut off. A photo, when there is one, sits
            quietly beneath it, small and unframed. Everything else that
            used to compete for attention — spot name, time, behavior,
            species — is now one quiet line under the memory, never above
            it. Spacing between entries scales with how much each one
            actually holds, since nothing else here marks where one ends
            and the next begins. */}
        {dayGroups.map(group => (
          <div key={group.key} className="mb-16">
            <p className="mb-6 pl-5 font-display text-2xl leading-tight text-foreground">
              {dayHeaderLabel(group.date)}
            </p>
            <div>
              {group.items.map((moment, i) => {
                const richness = [moment.note, moment.photoUrls[0], moment.sightings.length > 0].filter(Boolean).length;
                const gapClass = richness === 0 ? "mt-6" : richness === 1 ? "mt-8" : richness === 2 ? "mt-10" : "mt-12";
                return (
                  <button
                    key={moment.id}
                    onClick={() => navigate(`/spot/${moment.spotId}`)}
                    className={cn("block w-full pl-5 text-left", i > 0 && gapClass)}
                  >
                    {moment.note && (
                      <p className="font-display text-lg leading-relaxed text-foreground">{moment.note}</p>
                    )}
                    {moment.photoUrls[0] && (
                      <img
                        src={moment.photoUrls[0]}
                        alt=""
                        className={cn("h-12 w-12 rounded-lg object-cover", moment.note && "mt-2")}
                      />
                    )}
                    <p className={cn("text-[11px] text-muted-foreground/70", (moment.note || moment.photoUrls[0]) && "mt-2")}>
                      {metaLine(moment.spot?.name, moment.capturedAt, moment.sightings)}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
