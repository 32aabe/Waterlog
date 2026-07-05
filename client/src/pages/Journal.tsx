import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow, differenceInYears } from "date-fns";
import { BookOpen, Plus, Sparkles } from "lucide-react";
import { formatSighting } from "@/const";
import { dayHeaderLabel, groupByDay, findOnThisDay } from "@/lib/dates";

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
  const dayGroups = useMemo(() => (journal ? groupByDay(journal) : []), [journal]);

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-[100dvh] pb-24">
      <header className="px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-3">
        <h1 className="flex items-center gap-1.5 text-lg font-semibold text-foreground">
          <BookOpen className="h-5 w-5 text-primary" /> Journal
        </h1>
        <p className="text-xs text-muted-foreground">Every moment you've logged, in order.</p>
      </header>

      {/* A real memory surfacing across time, not a metric — the one thing
          in this header worth a beat of visual weight (see Design
          Manifesto §4, "recognition across time"). No border: a tint is
          enough to say "this one's different," without becoming a card. */}
      {onThisDay && (
        <div className="mx-4 mb-5 overflow-hidden rounded-xl bg-secondary">
          <div className="flex items-center gap-1.5 px-4 pt-3 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            On this day, {differenceInYears(new Date(), new Date(onThisDay.capturedAt))} year
            {differenceInYears(new Date(), new Date(onThisDay.capturedAt)) === 1 ? "" : "s"} ago
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

      <div className="mx-4">
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

        {dayGroups.map(group => (
          <div key={group.key} className="mb-5">
            <p className="mb-2 font-display text-sm text-muted-foreground">{dayHeaderLabel(group.date)}</p>
            <div className="divide-y divide-border">
              {group.items.map(moment => (
                <button
                  key={moment.id}
                  onClick={() => navigate(`/spot/${moment.spotId}`)}
                  className="flex w-full items-start gap-3 py-3 text-left first:pt-0"
                >
                  {moment.photoUrls[0] && (
                    <img src={moment.photoUrls[0]} alt="" className="h-14 w-14 flex-shrink-0 rounded-lg object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {moment.spot?.name || "A water spot"}
                      </p>
                      <p className="flex-shrink-0 text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(moment.capturedAt), { addSuffix: true })}
                      </p>
                    </div>
                    {moment.note && (
                      <p className="mt-1 line-clamp-2 font-display text-sm text-muted-foreground">{moment.note}</p>
                    )}
                    {moment.sightings.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {moment.sightings.map((s, i) => (
                          <span key={s.id}>
                            {i > 0 && " · "}
                            {formatSighting(s.species, s.behaviors)}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
