import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { distanceMeters } from "@/lib/geo";
import { toast } from "sonner";
import { getLoginUrl, SPOT_TYPE_LABELS, getSpotTypeLabel, WATER_CONDITIONS, BEHAVIOR_OPTIONS, type SpotType } from "@/const";
import { ArrowLeft, Camera, Plus, X, ChevronDown, Mic, Square } from "lucide-react";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
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

const MAX_PHOTOS = 6;
const MAX_SIGHTINGS = 5;

// Close enough that it's almost certainly the same physical puddle —
// silently (but visibly, and overridably) treated as a revisit instead of
// a new spot. Farther out, up to SUGGEST_RADIUS_M, a spot is offered as a
// one-tap alternative to creating a duplicate, but "new spot" stays the
// default since we're not confident it's the same place.
const AUTO_MATCH_RADIUS_M = 25;
const SUGGEST_RADIUS_M = 120;
const MAX_NEARBY_SUGGESTIONS = 3;

type SightingDraft = { species: string; behaviors: string[] };

export default function Capture() {
  const { isAuthenticated, loading: authLoading, refresh } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const urlSpotId = useMemo(() => {
    const raw = new URLSearchParams(search).get("spotId");
    return raw ? Number(raw) : undefined;
  }, [search]);

  const utils = trpc.useUtils();
  const { data: nearbySpotsData } = trpc.spots.list.useQuery(undefined, { enabled: !urlSpotId });

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [spotType, setSpotType] = useState<SpotType>("puddle");
  const [note, setNote] = useState("");
  const [waterCondition, setWaterCondition] = useState<string>("full");
  const [photos, setPhotos] = useState<Array<{ file: File; preview: string }>>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [sightings, setSightings] = useState<SightingDraft[]>([{ species: "", behaviors: [] }]);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice note: an alternative, faster-than-typing way to fill the note
  // field, not a separate stored asset — see server/routers.ts.
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!urlSpotId && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setCoords(null),
        GEOLOCATION_OPTIONS,
      );
    }
  }, [urlSpotId]);

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

  // Nearby water spots, closest first — a revisit shouldn't fragment into
  // a duplicate spot just because GPS didn't land on the exact same
  // coordinate twice.
  const nearby = useMemo(() => {
    if (!coords || !nearbySpotsData) return [];
    return nearbySpotsData
      .map(s => ({ ...s, distanceM: distanceMeters(coords, { lat: Number(s.latitude), lng: Number(s.longitude) }) }))
      .filter(s => s.distanceM <= SUGGEST_RADIUS_M)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, MAX_NEARBY_SUGGESTIONS);
  }, [coords, nearbySpotsData]);
  const autoMatch = nearby.length > 0 && nearby[0].distanceM <= AUTO_MATCH_RADIUS_M ? nearby[0] : null;

  const [pickedNearby, setPickedNearby] = useState<number | "new">("new");
  const autoMatchApplied = useRef(false);
  useEffect(() => {
    if (!autoMatchApplied.current && autoMatch) {
      setPickedNearby(autoMatch.id);
      autoMatchApplied.current = true;
    }
  }, [autoMatch]);

  const targetSpotId = urlSpotId ?? (pickedNearby !== "new" ? pickedNearby : undefined);
  const { data: existingSpot } = trpc.spots.getById.useQuery({ id: targetSpotId! }, { enabled: !!targetSpotId });

  const createSpot = trpc.spots.create.useMutation();
  const createMoment = trpc.moments.create.useMutation();
  const uploadMedia = trpc.moments.uploadMedia.useMutation();
  const transcribeVoice = trpc.moments.transcribeVoice.useMutation();

  const busy = createSpot.isPending || createMoment.isPending || uploadMedia.isPending;
  const locating = !targetSpotId && !coords;
  const canSubmit = targetSpotId ? true : !!coords;
  // null in local dev / mobile-LAN preview, where OAuth isn't configured —
  // the whole capture flow (photo, water interaction, everything) still
  // works up to Save, which then explains sign-in isn't available here
  // instead of opening a broken link.
  const loginUrl = getLoginUrl();

  const toggleBehavior = (index: number, behavior: string) => {
    setSightings(prev =>
      prev.map((s, i) =>
        i !== index
          ? s
          : { ...s, behaviors: s.behaviors.includes(behavior) ? s.behaviors.filter(b => b !== behavior) : [...s.behaviors, behavior] },
      ),
    );
  };
  const setSightingSpecies = (index: number, species: string) => {
    setSightings(prev => prev.map((s, i) => (i === index ? { ...s, species } : s)));
  };
  const addSighting = () => setSightings(prev => (prev.length >= MAX_SIGHTINGS ? prev : [...prev, { species: "", behaviors: [] }]));
  const removeSighting = (index: number) => setSightings(prev => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));

  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length;
    const toAdd = Array.from(files).slice(0, Math.max(room, 0));
    const withPreviews = await Promise.all(toAdd.map(async file => ({ file, preview: await blobToDataUrl(file) })));
    setPhotos(prev => [...prev, ...withPreviews]);
  };
  const removePhoto = (index: number) => setPhotos(prev => prev.filter((_, i) => i !== index));

  const startRecording = async () => {
    setVoiceError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setTranscribing(true);
        try {
          const dataUrl = await blobToDataUrl(blob);
          const { url } = await uploadMedia.mutateAsync({ dataUrl, filename: `${Date.now()}-voice.webm` });
          const { text } = await transcribeVoice.mutateAsync({ audioUrl: url });
          setNote(prev => (prev ? `${prev} ${text}`.trim() : text));
        } catch (err) {
          console.error("[Capture] voice transcription failed:", err);
          setVoiceError("Couldn't transcribe that — try again, or type instead.");
        } finally {
          setTranscribing(false);
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      setVoiceError("Microphone access denied.");
    }
  };
  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const handleSubmit = async () => {
    try {
      // Captured before the mutation so it reflects the spot's state
      // going into this save, for the reawakening check below.
      const lifecycleBeforeSave = existingSpot?.spot.lifecycleState;
      let resolvedSpotId = targetSpotId;

      if (!resolvedSpotId) {
        if (!coords) return;
        const spot = await createSpot.mutateAsync({
          latitude: coords.lat,
          longitude: coords.lng,
          spotType,
        });
        resolvedSpotId = spot?.id;
      }
      if (!resolvedSpotId) return;

      const photoUrls = await Promise.all(
        photos.map(async (p, i) => {
          const dataUrl = await blobToDataUrl(p.file);
          const { url } = await uploadMedia.mutateAsync({
            dataUrl,
            filename: `${Date.now()}-${i}-${p.file.name}`,
          });
          return url;
        }),
      );

      // Behavior alone (no species typed) is a complete sighting — water
      // interaction is the observation, species is secondary detail about
      // it. A slot with neither is simply not sent.
      const sightingsPayload = sightings
        .map(s => ({
          species: s.species.trim() || undefined,
          behaviors: s.behaviors.length > 0 ? s.behaviors : undefined,
        }))
        .filter(s => s.species || s.behaviors);

      await createMoment.mutateAsync({
        spotId: resolvedSpotId,
        note: note || undefined,
        photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
        waterCondition,
        sightings: sightingsPayload.length > 0 ? sightingsPayload : undefined,
      });

      await utils.spots.list.invalidate();

      // A spot coming back from dry is the one moment worth celebrating
      // — a small, one-time payoff for noticing something most people
      // would walk past.
      if (lifecycleBeforeSave === "dry") {
        const fresh = await utils.spots.getById.fetch({ id: resolvedSpotId });
        if (fresh?.spot.lifecycleState === "reawakened") {
          toast("This spot is alive again", {
            description: "It had gone dry — now there's water, and you were the one who found it.",
          });
        }
      }

      setSaved(true);
      setTimeout(() => navigate(`/spot/${resolvedSpotId}`), 700);
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
            gesture that matters most, so nothing else sits above it. Once
            a photo exists it becomes a thumbnail row with an add tile,
            rather than growing the same big box — most captures still
            have exactly one photo. */}
        {photos.length === 0 ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="relative flex h-56 w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-card"
          >
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Camera className="h-8 w-8" />
              <span className="text-sm">Tap to add a photo</span>
            </div>
          </button>
        ) : (
          <div className="flex gap-2 overflow-x-auto">
            {photos.map((p, i) => (
              <div key={i} className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl">
                <img src={p.preview} alt="" className="h-full w-full object-cover" />
                <span
                  role="button"
                  onClick={() => removePhoto(i)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </span>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-xl border border-dashed border-border bg-card text-muted-foreground"
              >
                <Plus className="h-6 w-6" />
              </button>
            )}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={async e => {
            await addPhotos(e.target.files);
            e.target.value = "";
          }}
        />

        {/* Nearby spots — only rendered when there's actually something
            nearby, so the common "genuinely new puddle" case looks
            exactly like it always has. A close match is pre-selected
            (visibly, not silently) so a revisit doesn't fragment into a
            duplicate spot; farther matches are offered but "New spot"
            stays the default. */}
        {!urlSpotId && nearby.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              {autoMatch ? "Logging at" : "Nearby — is this one of these?"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {nearby.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setPickedNearby(s.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    pickedNearby === s.id ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
                  )}
                >
                  {s.name || getSpotTypeLabel(s.spotType)} · {Math.round(s.distanceM)}m
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPickedNearby("new")}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs",
                  pickedNearby === "new" ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
                )}
              >
                New spot
              </button>
            </div>
          </div>
        )}

        {/* Water interaction — the actual subject of this app: not "what
            bird," but "what was it doing with the water." One tap, no
            typing, so it reads as the main action of the flow rather than
            a detail hanging off a species field. No default is
            pre-selected — a spot check with no bird is still a complete,
            valid entry. */}
        <div>
          <p className="mb-1.5 text-sm font-semibold text-foreground">Water interaction</p>
          <p className="mb-1.5 text-xs text-muted-foreground">What was the bird doing? (optional)</p>
          <div className="flex flex-wrap gap-1.5">
            {BEHAVIOR_OPTIONS.map(b => (
              <button
                key={b}
                type="button"
                onClick={() => toggleBehavior(0, b)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium",
                  sightings[0].behaviors.includes(b) ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
                )}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        {/* More than one bird at once is real (a sparrow bathing while a
            pigeon drinks) but rare — extra sightings are additive cards,
            never in the way of the single-bird case above. */}
        {sightings.slice(1).map((s, i) => {
          const index = i + 1;
          return (
            <div key={index} className="space-y-2 rounded-xl border border-border bg-card p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Another bird</p>
                <button type="button" onClick={() => removeSighting(index)} className="text-muted-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {BEHAVIOR_OPTIONS.map(b => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => toggleBehavior(index, b)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs",
                      s.behaviors.includes(b) ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
                    )}
                  >
                    {b}
                  </button>
                ))}
              </div>
              <Input
                placeholder="Which bird, if you know (optional)"
                value={s.species}
                onChange={e => setSightingSpecies(index, e.target.value)}
              />
            </div>
          );
        })}
        {sightings.length < MAX_SIGHTINGS && (
          <button type="button" onClick={addSighting} className="text-xs font-medium text-muted-foreground">
            + Add another bird
          </button>
        )}

        {/* Water level — the spot's own state, distinct from what the
            bird was doing above. Still a single tap, but secondary to
            the interaction itself. */}
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Water level</p>
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

        {/* Everything else — spot type, a note (or a spoken version of
            it), and the first bird's species — is real but secondary.
            Species in particular is demoted on purpose: which bird it was
            matters less here than what it was doing. */}
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
            {!targetSpotId && (
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

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Note</p>
                <button
                  type="button"
                  onClick={recording ? stopRecording : startRecording}
                  disabled={transcribing}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                    recording ? "border-destructive bg-destructive text-white" : "border-border text-muted-foreground",
                  )}
                >
                  {transcribing ? (
                    <>
                      <Spinner className="h-3 w-3" /> Transcribing…
                    </>
                  ) : recording ? (
                    <>
                      <Square className="h-3 w-3" /> Stop
                    </>
                  ) : (
                    <>
                      <Mic className="h-3 w-3" /> Speak it
                    </>
                  )}
                </button>
              </div>
              <Textarea
                placeholder="What did this water spot become today? (optional)"
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={3}
              />
              {voiceError && <p className="mt-1 text-xs text-destructive">{voiceError}</p>}
            </div>

            <Input
              placeholder="Which bird, if you know (optional)"
              value={sightings[0].species}
              onChange={e => setSightingSpecies(0, e.target.value)}
            />
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
          disabled={busy || saved || authLoading || (isAuthenticated && !canSubmit) || (!isAuthenticated && !loginUrl)}
          onClick={() => {
            if (!isAuthenticated) {
              if (loginUrl) window.open(loginUrl, "_blank", "noopener,noreferrer");
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
            loginUrl ? "Sign in to save" : "Sign-in unavailable"
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
            {loginUrl
              ? "Opens in a new tab — this photo stays right here."
              : "OAuth isn't configured in this preview — saving needs a signed-in session."}
          </p>
        )}
      </div>
    </div>
  );
}
