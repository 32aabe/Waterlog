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
import { getLoginUrl, SPOT_TYPE_LABELS, getSpotTypeLabel, WATER_CONDITIONS, BEHAVIOR_OPTIONS, COMMON_SPECIES, type SpotType } from "@/const";
import { spawnRipple } from "@/lib/ripple";
import { fetchAmbientWeather, formatDatelineTime, type AmbientWeather } from "@/lib/weather";
import { ArrowLeft, Camera, Plus, X, ChevronDown, Mic, Square } from "lucide-react";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function speciesSuggestions(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return COMMON_SPECIES.filter(s => s.toLowerCase().includes(q)).slice(0, 6);
}

// A species field that suggests instead of requiring the full name typed
// out — tapping a suggestion fills the field, but typing anything else is
// always allowed and stored exactly as typed.
function SpeciesField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const suggestions = speciesSuggestions(value);
  return (
    <div>
      <Input placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
      {suggestions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {suggestions.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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

  // Ambient context for the dateline — filled in quietly, never asked
  // for, never blocking Save. See client/src/lib/weather.ts.
  const [weather, setWeather] = useState<AmbientWeather | null>(null);
  const datelineTime = useMemo(() => formatDatelineTime(new Date()), []);
  const rippleOriginRef = useRef<HTMLDivElement>(null);
  // The nearby-spot picker only needs to be shown by default in the
  // genuinely ambiguous case; a confident auto-match instead gets a
  // quiet recognition line, with the picker one tap away if it's wrong.
  const [showPicker, setShowPicker] = useState(false);

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

  // Weather arrives quietly once coordinates do — never gates Save, and
  // simply leaves its clause out of the dateline if it's slow or fails.
  useEffect(() => {
    if (!coords) return;
    let cancelled = false;
    fetchAmbientWeather(coords.lat, coords.lng).then(w => {
      if (!cancelled) setWeather(w);
    });
    return () => {
      cancelled = true;
    };
  }, [coords]);

  // A short place phrase for the dateline, and — if this turns out to be
  // a new spot — its placeName. Fetched speculatively whenever there's no
  // spot already resolved; harmless to fetch even if the user ends up
  // picking a nearby existing spot instead.
  const { data: placeText } = trpc.spots.describeLocation.useQuery(
    { latitude: coords?.lat ?? 0, longitude: coords?.lng ?? 0 },
    { enabled: !!coords && !urlSpotId },
  );

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
          placeName: placeText ?? undefined,
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
        weather: weather ? `${weather.condition ? `${weather.condition}, ` : ""}${weather.tempF}°F` : undefined,
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

      // The place received the moment — same quiet acknowledgment whether
      // this spot is brand new or long-known (see docs/design/02_CAPTURE_SCREEN.md,
      // "Completion"). No success-check energy, no separate copy for the
      // two cases; it fades into the spot itself a beat later.
      setSaved(true);
      setTimeout(() => navigate(`/spot/${resolvedSpotId}`), 700);
    } catch (err) {
      console.error("[Capture] failed to save moment:", err);
    }
  };

  // The dateline: time is instant, place and weather arrive a beat later
  // over the network and simply join the sentence when they're ready —
  // nothing here ever gates Save. Before location resolves at all, it
  // reads as the app quietly getting its bearings rather than a stalled
  // "Locating…" status. Place is only worth naming for a spot that isn't
  // already known (an existing spot's own name already does that job).
  // Weather trails last, deliberately — Waterlog is about water, not
  // weather; the sky is incidental context, never the thing that
  // outranks the water itself (see the Water section below, which is
  // sized to actually carry that weight).
  const datelineText = !coords
    ? "Remembering where you are…"
    : [datelineTime, !targetSpotId && placeText ? `near ${placeText}` : null, weather ? `${weather.condition ? `${weather.condition}, ` : ""}${weather.tempF}°F` : null]
        .filter(Boolean)
        .join(" · ");

  return (
    <div className="settle-in min-h-[100dvh] pb-40">
      <div className="flex items-center px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-2">
        <Button size="icon" variant="ghost" onClick={() => window.history.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
      </div>
      <p className="font-display px-4 pb-3 text-[15px] italic text-muted-foreground">{datelineText}</p>

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

        {/* Nearby spots. A confident auto-match (≤25m) reads as quiet
            recognition of somewhere already on the user's map, not a
            decision to make — the picker only surfaces if they say it's
            wrong. The genuinely ambiguous case (25–120m, no confident
            match) keeps the equal-weight picker, since that's a real
            choice. Neither renders at all for the common "nothing nearby"
            case, which looks exactly like it always has. */}
        {!urlSpotId && autoMatch && (
          <div>
            <p className="font-display text-[15px] text-foreground">
              You're back at <span className="font-medium">{autoMatch.name || getSpotTypeLabel(autoMatch.spotType)}</span>.
            </p>
            {!showPicker ? (
              <button type="button" onClick={() => setShowPicker(true)} className="mt-1 text-xs text-muted-foreground underline underline-offset-2">
                Not this one?
              </button>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
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
            )}
          </div>
        )}
        {!urlSpotId && !autoMatch && nearby.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Nearby — is this one of these?</p>
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
            valid entry. Nothing here is marked "optional" — nothing in a
            field notebook needs to be. */}
        <div>
          <p className="mb-1.5 text-sm font-semibold text-foreground">What was it doing?</p>
          <div className="flex flex-wrap gap-1.5">
            {BEHAVIOR_OPTIONS.map(b => (
              <button
                key={b.value}
                type="button"
                onClick={() => toggleBehavior(0, b.value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium",
                  sightings[0].behaviors.includes(b.value) ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
                )}
              >
                {b.label}
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
                    key={b.value}
                    type="button"
                    onClick={() => toggleBehavior(index, b.value)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs",
                      s.behaviors.includes(b.value) ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
                    )}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
              <SpeciesField
                placeholder="Which bird, if you know"
                value={s.species}
                onChange={v => setSightingSpecies(index, v)}
              />
            </div>
          );
        })}
        {sightings.length < MAX_SIGHTINGS && (
          <button type="button" onClick={addSighting} className="text-xs font-medium text-muted-foreground">
            + Add another bird
          </button>
        )}

        {/* Water condition — the spot's current state (how much water,
            or ice, is here right now). Secondary to the bird's own
            action above (see "What was it doing?"), since the
            interaction is the observation and this is context about it —
            but water is the actual subject of this app, not incidental
            chrome, so it stays legible rather than shrinking toward
            invisibility the way weather does in the dateline above. */}
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Water condition</p>
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
            matters less here than what it was doing. Labeled as
            continuing to look, not adding data — "Add details" reads
            like productivity software; this is the same act of noticing,
            just closer. */}
        <button
          type="button"
          onClick={() => setShowDetails(v => !v)}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showDetails && "rotate-180")} />
          A closer look
        </button>

        {showDetails && (
          <div className="space-y-3 rounded-xl border border-border bg-card p-3">
            {!targetSpotId && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">What kind of spot is this?</p>
                <p className="mb-1.5 text-[11px] text-muted-foreground">The place itself, not today's water condition</p>
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
                placeholder="What caught your attention?"
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={3}
              />
              {voiceError && <p className="mt-1 text-xs text-destructive">{voiceError}</p>}
            </div>

            <SpeciesField
              placeholder="Which bird, if you know"
              value={sightings[0].species}
              onChange={v => setSightingSpecies(0, v)}
            />
          </div>
        )}
      </div>

      {/* Sticky, so Save is one tap away no matter how much of the
          optional section above is expanded or scrolled past. Not being
          signed in doesn't block the photo/note above — it only changes
          what this button does. */}
      <div className="fixed inset-x-0 bottom-20 z-40 mx-auto max-w-md px-4">
        <div className="relative">
          <Button
            className="w-full shadow-lg"
            size="lg"
            disabled={busy || saved || authLoading || (isAuthenticated && !canSubmit) || (!isAuthenticated && !loginUrl)}
            onClick={e => {
              // A tap here should feel like a drop landing on still
              // water, not a button press — see
              // docs/03_DESIGN_MANIFESTO.md §7. Ring color reads from the
              // button's own computed style so it follows light/dark
              // automatically; spawnRipple no-ops under reduced motion.
              if (rippleOriginRef.current) {
                const rect = e.currentTarget.getBoundingClientRect();
                rippleOriginRef.current.style.left = `${e.clientX - rect.left}px`;
                rippleOriginRef.current.style.top = `${e.clientY - rect.top}px`;
                const color = getComputedStyle(e.currentTarget).getPropertyValue("--primary-foreground").trim();
                spawnRipple(rippleOriginRef.current, color || "#fff");
              }
              if (!isAuthenticated) {
                if (loginUrl) window.open(loginUrl, "_blank", "noopener,noreferrer");
                return;
              }
              handleSubmit();
            }}
          >
            {saved ? (
              "This place now holds this moment."
            ) : busy || authLoading ? (
              <Spinner className="h-4 w-4" />
            ) : !isAuthenticated ? (
              loginUrl ? "Sign in to save" : "Sign-in unavailable"
            ) : locating ? (
              <Spinner className="h-4 w-4" />
            ) : (
              "Save moment"
            )}
          </Button>
          <div ref={rippleOriginRef} className="pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full" />
        </div>
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
