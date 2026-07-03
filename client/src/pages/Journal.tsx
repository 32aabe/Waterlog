import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActivitySparkline } from "@/components/ActivitySparkline";
import { formatDistanceToNow, differenceInYears } from "date-fns";
import { BookOpen, Plus, Sparkles } from "lucide-react";
import { formatSighting } from "@/const";
import { dayHeaderLabel, groupByDay, findOnThisDay, weeklyActivityCounts } from "@/lib/dates";

const ACTIVITY_WEEKS = 10;

export default function Journal() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/");
  }, [authLoading, isAuthenticated, navigate]);

  const { data: journal, isLoading } = trpc.moments.listJournal.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: stats } = trpc.moments.getUserStats.useQuery(undefined, { enabled: isAuthenticated });

  const onThisDay = useMemo(() => (journal ? findOnThisDay(journal) : null), [journal]);
  const dayGroups = useMemo(() => (journal ? groupByDay(journal) : []), [journal]);
  const activityCounts = useMemo(
    () => (journal ? weeklyActivityCounts(journal, ACTIVITY_WEEKS) : []),
    [journal],
  );

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-[100dvh] pb-24">
      <header className="px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-3">
        <h1 className="flex items-center gap-1.5 text-lg font-semibold text-foreground">
          <BookOpen className="h-5 w-5 text-primary" /> Journal
        </h1>
        <p className="text-xs text-muted-foreground">Every moment you've logged, in order.</p>
      </header>

      {stats && (
        <div className="mx-4 mb-4 rounded-xl border border-border bg-card p-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Moments", value: stats.totalMoments },
              { label: "Spots visited", value: stats.spotsVisited },
              { label: "Species seen", value: stats.uniqueSpecies },
            ].map(item => (
              <div key={item.label} className="text-center">
                <p className="text-2xl font-semibold text-foreground">{item.value}</p>
                <p className="text-[11px] text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>
          {activityCounts.some(c => c > 0) && (
            <div className="mt-3 border-t border-border pt-3">
              <p className="mb-1.5 text-[11px] text-muted-foreground">Last {ACTIVITY_WEEKS} weeks</p>
              <ActivitySparkline counts={activityCounts} />
            </div>
          )}
        </div>
      )}

      {onThisDay && (
        <div className="mx-4 mb-4 overflow-hidden rounded-xl border border-primary/30 bg-secondary">
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
            <div className="space-y-3">
              {group.items.map(moment => (
                <button
                  key={moment.id}
                  onClick={() => navigate(`/spot/${moment.spotId}`)}
                  className="flex w-full items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent"
                >
                  {moment.photoUrls[0] && (
                    <img
                      src={moment.photoUrls[0]}
                      alt=""
                      className="h-14 w-14 flex-shrink-0 rounded-lg object-cover"
                    />
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
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {moment.sightings.map(s => (
                          <Badge key={s.id} variant={s.behaviors.length > 0 ? "default" : "outline"}>
                            {formatSighting(s.species, s.behaviors)}
                          </Badge>
                        ))}
                      </div>
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
