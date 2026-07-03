import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { BookOpen, Plus } from "lucide-react";
import { formatSighting } from "@/const";

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
        <div className="mx-4 mb-4 grid grid-cols-3 gap-2">
          {[
            { label: "Moments", value: stats.totalMoments },
            { label: "Spots visited", value: stats.spotsVisited },
            { label: "Species seen", value: stats.uniqueSpecies },
          ].map(item => (
            <div key={item.label} className="rounded-xl border border-border bg-card p-3 text-center">
              <p className="text-xl font-semibold tabular-nums text-foreground">{item.value}</p>
              <p className="text-[11px] text-muted-foreground">{item.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mx-4 space-y-3">
        {isLoading && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}

        {!isLoading && journal && journal.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Your journal is empty. The first entry takes less than 10 seconds.
            </p>
            <Button onClick={() => navigate("/capture")}>
              <Plus className="h-4 w-4" /> Log your first moment
            </Button>
          </div>
        )}

        {journal?.map(moment => (
          <button
            key={moment.id}
            onClick={() => navigate(`/spot/${moment.spotId}`)}
            className="block w-full rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">
                {moment.spot?.name || "A water spot"}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(moment.capturedAt), { addSuffix: true })}
              </p>
            </div>
            {moment.note && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{moment.note}</p>}
            {moment.sightings.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {moment.sightings.map(s => (
                  <Badge key={s.id} variant={s.behaviors.length > 0 ? "default" : "outline"}>
                    {formatSighting(s.species, s.behaviors)}
                  </Badge>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
