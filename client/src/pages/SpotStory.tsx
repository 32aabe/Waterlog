import { useParams, useLocation, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { SPOT_TYPE_LABELS, LIFECYCLE_LABELS } from "@/const";
import { ArrowLeft, Plus, Droplets } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function SpotStory() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const spotId = Number(params.id);
  const { data, isLoading } = trpc.spots.getById.useQuery({ id: spotId }, { enabled: !Number.isNaN(spotId) });

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

  return (
    <div className="min-h-[100dvh] pb-24">
      <header className="flex items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-3">
        <Button size="icon" variant="ghost" onClick={() => navigate("/")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold text-foreground">
            {spot.name || SPOT_TYPE_LABELS[spot.spotType]}
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {spot.placeName || `${Number(spot.latitude).toFixed(4)}, ${Number(spot.longitude).toFixed(4)}`}
          </p>
        </div>
      </header>

      <div className="mx-4 flex items-center gap-2">
        <Badge variant="secondary">{SPOT_TYPE_LABELS[spot.spotType]}</Badge>
        <Badge>{LIFECYCLE_LABELS[spot.lifecycleState]}</Badge>
        <span className="text-xs text-muted-foreground">
          last activity {formatDistanceToNow(new Date(spot.lastActivityAt), { addSuffix: true })}
        </span>
      </div>

      <div className="mx-4 mt-5 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Story</h2>
        <Button size="sm" onClick={() => navigate(`/capture?spotId=${spot.id}`)}>
          <Plus className="h-4 w-4" /> Log a moment
        </Button>
      </div>

      <div className="mx-4 mt-3 space-y-3">
        {moments.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No moments logged here yet. Be the first to record what this spot becomes.
          </div>
        )}
        {moments.map(moment => (
          <div key={moment.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(moment.capturedAt), { addSuffix: true })}
              </p>
              {moment.waterCondition && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Droplets className="h-3 w-3" /> {moment.waterCondition.replace("_", " ")}
                </span>
              )}
            </div>
            {moment.note && <p className="mt-2 text-sm text-foreground">{moment.note}</p>}
            {moment.photoUrls.length > 0 && (
              <div className="mt-2 flex gap-2 overflow-x-auto">
                {moment.photoUrls.map((url, i) => (
                  <img key={i} src={url} alt="" className="h-24 w-24 flex-shrink-0 rounded-lg object-cover" />
                ))}
              </div>
            )}
            {moment.sightings.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {moment.sightings.map(s => (
                  <Badge key={s.id} variant="outline">
                    {s.species || "Unidentified bird"}
                    {s.count && s.count > 1 ? ` ×${s.count}` : ""}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
