import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { getLoginUrl, SPOT_TYPE_LABELS, getSpotTypeLabel, WATER_CONDITIONS, BEHAVIOR_OPTIONS, type SpotType } from "@/const";
import { ArrowLeft, Camera, X, ChevronDown } from "lucide-react";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Capture() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const spotIdParam = useMemo(() => new URLSearchParams(search).get("spotId"), [search]);
  const spotId = spotIdParam ? Number(spotIdParam) : undefined;

  const utils = trpc.useUtils();
  const { data: existingSpot } = trpc.spots.getById.useQuery({ id: spotId! }, { enabled: !!spotId });

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [spotType, setSpotType] = useState<SpotType>("puddle");
  const [note, setNote] = useState("");
  const [waterCondition, setWaterCondition] = useState<string>("full");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [species, setSpecies] = useState("");
  const [behaviors, setBehaviors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!spotId && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setCoords(null),
      );
    }
  }, [spotId]);

  const createSpot = trpc.spots.create.useMutation();
  const createMoment = trpc.moments.create.useMutation();
  const uploadMedia = trpc.moments.uploadMedia.useMutation();

  const busy = createSpot.isPending || createMoment.isPending || uploadMedia.isPending;

  if (!authLoading && !isAuthenticated) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-muted-foreground">Sign in to log a moment.</p>
        <Button asChild>
          <a href={getLoginUrl()}>Sign in</a>
        </Button>
      </div>
    );
  }

  const canSubmit = spotId ? true : !!coords;

  const handleSubmit = async () => {
    try {
      let targetSpotId = spotId;

      if (!targetSpotId) {
        if (!coords) return;
        const spot = await createSpot.mutateAsync({
          latitude: coords.lat,
          longitude: coords.lng,
          spotType,
        });
        targetSpotId = spot?.id;
      }
      if (!targetSpotId) return;

      let photoUrls: string[] | undefined;
      if (photoFile) {
        const dataUrl = await fileToDataUrl(photoFile);
        const { url } = await uploadMedia.mutateAsync({
          dataUrl,
          filename: `${Date.now()}-${photoFile.name}`,
        });
        photoUrls = [url];
      }

      await createMoment.mutateAsync({
        spotId: targetSpotId,
        note: note || undefined,
        photoUrls,
        waterCondition,
        sightings: species
          ? [{ species, behaviors: behaviors.length > 0 ? behaviors : undefined }]
          : undefined,
      });

      await utils.spots.list.invalidate();
      setSaved(true);
      setTimeout(() => navigate(`/spot/${targetSpotId}`), 700);
    } catch (err) {
      console.error("[Capture] failed to save moment:", err);
    }
  };

  return (
    <div className="min-h-[100dvh] pb-24">
      <header className="flex items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-3">
        <Button size="icon" variant="ghost" onClick={() => navigate(-1 as unknown as string)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold text-foreground">What happened here?</h1>
          <p className="text-xs text-muted-foreground">
            {existingSpot ? existingSpot.spot.name || getSpotTypeLabel(existingSpot.spot.spotType) : "A photo is enough to start."}
          </p>
        </div>
      </header>

      <div className="mx-4 space-y-4">
        {/* Photo — the primary, fastest input */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="relative flex h-56 w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-card"
        >
          {photoPreview ? (
            <>
              <img src={photoPreview} alt="" className="h-full w-full object-cover" />
              <span
                role="button"
                onClick={e => {
                  e.stopPropagation();
                  setPhotoFile(null);
                  setPhotoPreview(null);
                }}
                className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"
              >
                <X className="h-4 w-4" />
              </span>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Camera className="h-8 w-8" />
              <span className="text-sm">Tap to add a photo</span>
            </div>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={async e => {
            const file = e.target.files?.[0];
            if (!file) return;
            setPhotoFile(file);
            setPhotoPreview(await fileToDataUrl(file));
          }}
        />

        {!spotId && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">What kind of spot is this?</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(SPOT_TYPE_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSpotType(key as SpotType)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    spotType === key ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {!coords && (
              <p className="mt-2 text-xs text-muted-foreground">Waiting for location…</p>
            )}
          </div>
        )}

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Water</p>
          <div className="flex flex-wrap gap-1.5">
            {WATER_CONDITIONS.map(c => (
              <button
                key={c.value}
                type="button"
                onClick={() => setWaterCondition(c.value)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs",
                  waterCondition === c.value ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <Textarea
          placeholder="What did this water spot become today? (optional)"
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={3}
        />

        <button
          type="button"
          onClick={() => setShowDetail(v => !v)}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showDetail && "rotate-180")} />
          Add a bird sighting (optional)
        </button>

        {showDetail && (
          <div className="space-y-2 rounded-xl border border-border bg-card p-3">
            <Input
              placeholder="Species (leave blank if unsure)"
              value={species}
              onChange={e => setSpecies(e.target.value)}
            />
            <div className="flex flex-wrap gap-1.5">
              {BEHAVIOR_OPTIONS.map(b => (
                <button
                  key={b}
                  type="button"
                  onClick={() =>
                    setBehaviors(prev => (prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]))
                  }
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    behaviors.includes(b) ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
                  )}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
        )}

        <Button className="w-full" size="lg" disabled={!canSubmit || busy || saved} onClick={handleSubmit}>
          {busy ? <Spinner className="h-4 w-4" /> : saved ? "Saved" : "Save moment"}
        </Button>
      </div>
    </div>
  );
}
