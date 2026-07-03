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

// Every choice here is measured against one scenario: someone stops for ten
// seconds because they just noticed a bird in a puddle. Only the photo and
// a single tap on water condition sit above the fold — everything else
// (spot type, a note, a species) is optional and tucked behind one "Add
// details" toggle so it never competes with the two things worth doing
// fast. Geolocation prefers a cached, network-based fix over a slow
// high-accuracy GPS lock, since "near this puddle" is precise enough.
const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 8000,
  maximumAge: 5 * 60 * 1000,
};

export default function Capture() {
  const { isAuthenticated, loading: authLoading, refresh } = useAuth();
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
  const [showDetails, setShowDetails] = useState(false);
  const [species, setSpecies] = useState("");
  const [behaviors, setBehaviors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!spotId && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setCoords(null),
        GEOLOCATION_OPTIONS,
      );
    }
  }, [spotId]);

  // Signing in requires leaving the app (OAuth redirect), which would
  // otherwise wipe an in-progress photo/note for anyone who opened
  // Capture before ever creating an account. The Save button below opens
  // sign-in in a new tab instead, so this tab — and everything typed into
  // it — survives; refetch auth whenever the user comes back to it so
  // Save unlocks without a manual reload.
  useEffect(() => {
    const onFocus = () => refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const createSpot = trpc.spots.create.useMutation();
  const createMoment = trpc.moments.create.useMutation();
  const uploadMedia = trpc.moments.uploadMedia.useMutation();

  const busy = createSpot.isPending || createMoment.isPending || uploadMedia.isPending;
  const locating = !spotId && !coords;
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
    <div className="min-h-[100dvh] pb-40">
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
        {/* Photo — the primary, fastest input. Tapping it is the one
            gesture that matters most, so nothing else sits above it. */}
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

        {/* Water condition — the one other thing worth a single tap: no
            typing, a sensible default already selected. */}
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

        {/* Everything else — spot type, a note, a species — is real but
            optional, so it's one toggle away instead of competing with
            the photo and water tap for a rushed thumb. */}
        <button
          type="button"
          onClick={() => setShowDetails(v => !v)}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showDetails && "rotate-180")} />
          Add details (optional)
        </button>

        {showDetails && (
          <div className="space-y-3 rounded-xl border border-border bg-card p-3">
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
              </div>
            )}

            <Textarea
              placeholder="What did this water spot become today? (optional)"
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
            />

            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Bird sighting</p>
              <Input
                placeholder="Species (leave blank if unsure)"
                value={species}
                onChange={e => setSpecies(e.target.value)}
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
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
          </div>
        )}
      </div>

      {/* Sticky, so Save is one tap away no matter how much of the
          optional section above is expanded or scrolled past. Not being
          signed in doesn't block the photo/note above — it only changes
          what this button does. */}
      <div className="fixed inset-x-0 bottom-20 z-40 mx-auto max-w-md px-4">
        <Button
          className="w-full shadow-lg"
          size="lg"
          disabled={busy || saved || authLoading || (isAuthenticated && !canSubmit)}
          onClick={() => {
            if (!isAuthenticated) {
              window.open(getLoginUrl(), "_blank", "noopener,noreferrer");
              return;
            }
            handleSubmit();
          }}
        >
          {saved ? (
            "Saved"
          ) : busy || authLoading ? (
            <Spinner className="h-4 w-4" />
          ) : !isAuthenticated ? (
            "Sign in to save"
          ) : locating ? (
            <>
              <Spinner className="h-4 w-4" /> Locating…
            </>
          ) : (
            "Save moment"
          )}
        </Button>
        {!isAuthenticated && !authLoading && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Opens in a new tab — this photo stays right here.
          </p>
        )}
      </div>
    </div>
  );
}
