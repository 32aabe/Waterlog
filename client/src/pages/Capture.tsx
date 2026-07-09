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
import { fetchAmbientWeather, type AmbientWeather } from "@/lib/weather";
import { formatClockTime } from "@/lib/dates";
import { ArrowLeft, Camera, Plus, X, ChevronDown, Mic, Square, Droplets } from "lucide-react";

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
  const { data: nearbySpotsData, isLoading: nearbySpotsLoading } = trpc.spots.list.useQuery(undefined, { enabled: !urlSpotId });

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [spotType, setSpotType] = useState<SpotType>("puddle");
  const [note, setNote] = useState("");
  const [waterCondition, setWaterCondition] = useState<string>("full");
  const [photos, setPhotos] = useState<Array<{ file: File; preview: string }>>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [sightings, setSightings] = useState<SightingDraft[]>([{ species: "", behaviors: [] }]);
  const [saved, setSaved] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ambient context for the Auto Context block — filled in quietly, never
  // asked for, never blocking Save. See client/src/lib/weather.ts.
  const [weather, setWeather] = useState<AmbientWeather | null>(null);
  const timeText = useMemo(() => formatClockTime(new Date()), []);
  const rippleOriginRef = useRef<HTMLDivElement>(null);

  // Voice note: an alternative, faster-than-typing way to fill the note
  // field, not a separate stored asset — see server/routers.ts.
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Whether the location attempt has concluded — success, failure, or
  // gave-up — as distinct from whether it actually produced coordinates.
  // Previously `locating`/`canSubmit` were derived from `!coords` alone,
  // which meant a denied/unsupported/never-called-back geolocation
  // request left Save permanently disabled with a permanent spinner:
  // opening Capture from the home + button (no spotId, so this effect
  // runs) could hang forever in exactly that way, while opening it from
  // a Spot's "Log a moment" (spotId already known) never depended on
  // geolocation at all — which is why only one entry path got stuck. The
  // independent timeout below guarantees this settles even if the
  // browser never invokes either geolocation callback at all (seen in
  // some insecure-context / permission-blocked previews), the same
  // pattern already used in MapHome's own geolocation effect.
  // Diagnostic, not just cosmetic: when geolocation fails, this captures
  // *why* (permission denied vs. no hardware/OS location vs. timeout)
  // instead of collapsing every cause into a silent "not available" —
  // both logged to the console and surfaced in the Auto Context Location
  // row below, since a machine with location services disabled at the OS
  // level (common on Windows/desktop) reports PERMISSION_DENIED or
  // POSITION_UNAVAILABLE from the browser even when site-level permission
  // was granted.
  const [geoSettled, setGeoSettled] = useState(false);
  const [geoErrorReason, setGeoErrorReason] = useState<string | null>(null);
  useEffect(() => {
    if (urlSpotId) {
      setGeoSettled(true);
      return;
    }
    if (!navigator.geolocation) {
      console.error("[Capture] navigator.geolocation is unavailable — unsupported browser, or a non-secure context (must be https, or localhost).");
      setGeoErrorReason("location not supported here");
      setGeoSettled(true);
      return;
    }
    const timeout = setTimeout(() => {
      console.error(
        "[Capture] geolocation never called back within 8.5s — the browser neither returned a position nor an error. Often caused by an insecure context (http, not https/localhost) or the request silently hanging.",
      );
      setGeoErrorReason("location request timed out");
      setGeoSettled(true);
    }, 8500);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoSettled(true);
        clearTimeout(timeout);
      },
      err => {
        const reason =
          err.code === err.PERMISSION_DENIED
            ? "location permission denied"
            : err.code === err.POSITION_UNAVAILABLE
              ? "location unavailable — check that OS-level location services are turned on"
              : "location request timed out";
        console.error(`[Capture] geolocation failed (code ${err.code} ${err.message ? `— ${err.message}` : ""}).`);
        setGeoErrorReason(reason);
        setGeoSettled(true);
        clearTimeout(timeout);
      },
      GEOLOCATION_OPTIONS,
    );
    return () => clearTimeout(timeout);
  }, [urlSpotId]);

  // Weather arrives quietly once coordinates do — never gates Save. On
  // failure, client/src/lib/weather.ts already logs the specific cause
  // (network error, bad response, etc.) to the console; this just leaves
  // its clause out of Auto Context rather than blocking anything.
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

  // A short place phrase for Auto Context, and — if this turns out to be
  // a new spot — its placeName. Fetched speculatively whenever there's no
  // spot already resolved; harmless to fetch even if the user ends up
  // picking a nearby existing spot instead. Resolves to null (not an
  // error) when reverse geocoding isn't configured server-side — see
  // server/_core/geocode.ts, which logs the specific reason there.
  const { data: placeText, isLoading: placeTextLoading } = trpc.spots.describeLocation.useQuery(
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
  // Tapping "Not this place?" on a high-confidence match reveals every
  // real nearby candidate (not just "new") — GPS proximity alone should
  // never be the only door out of a wrong auto-match. See
  // docs/decisions/001_PLACE_RECOGNITION.md.
  const [revealNearby, setRevealNearby] = useState(false);
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

  const busy = isSubmitting || createSpot.isPending || createMoment.isPending || uploadMedia.isPending;
  const locating = !targetSpotId && !geoSettled;
  // Once geolocation has settled — whether it produced coordinates or
  // not — Save unlocks. A failed/denied/unsupported location must never
  // leave the user stuck; handleSubmit below falls back to an existing
  // spot's coordinates if a fresh GPS fix never arrived.
  const canSubmit = targetSpotId ? true : geoSettled;
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
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      // Captured before the mutation so it reflects the spot's state
      // going into this save, for the reawakening check below.
      const lifecycleBeforeSave = existingSpot?.spot.lifecycleState;
      let resolvedSpotId = targetSpotId;

      if (!resolvedSpotId) {
        // A fresh GPS fix may never have arrived (denied, unsupported, or
        // just slow) even though geolocation has "settled" — fall back to
        // an existing spot's coordinates rather than blocking the save
        // entirely. Only a brand-new account with zero spots and no GPS
        // at all has genuinely nothing to fall back to.
        const fallbackCoords =
          coords ??
          (nearbySpotsData && nearbySpotsData.length > 0
            ? { lat: Number(nearbySpotsData[0].latitude), lng: Number(nearbySpotsData[0].longitude) }
            : null);
        if (!fallbackCoords) {
          setSubmitError("Couldn't determine a location for this. Try again, or open Capture from an existing spot.");
          return;
        }
        const spot = await createSpot.mutateAsync({
          latitude: fallbackCoords.lat,
          longitude: fallbackCoords.lng,
          spotType,
          placeName: placeText ?? undefined,
        });
        resolvedSpotId = spot?.id;
      }
      if (!resolvedSpotId) {
        setSubmitError("Couldn't save that moment. Try again.");
        return;
      }

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
        weather: weather ? `${weather.condition ? `${weather.condition}, ` : ""}${weather.tempC}°C` : undefined,
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
      setSubmitError("Couldn't save that moment. Check your connection and try again.");
    } finally {
      // Always releases the button, whether the save succeeded, failed,
      // or hit one of the early returns above — the submit state can
      // never outlive this function's own execution.
      setIsSubmitting(false);
    }
  };

  // weather.condition is already capitalized at the source (see
  // WMO_CONDITIONS in lib/weather.ts) — no lowercasing here, so the
  // compact strip below reads "Overcast," not "overcast."
  const weatherText = weather?.condition ?? "not available";
  const temperatureText = weather ? `${weather.tempC}°C` : "not available";

  // True once there's enough information to say something definite about
  // place — either a spot already chosen via urlSpotId, or both
  // geolocation and the nearby-spots fetch have concluded. Guards the
  // "no nearby spots" branch below from firing on a still-loading list
  // and reading as a confident "this place is new" for a beat before the
  // real answer arrives.
  const recognitionSettled = !!urlSpotId || (geoSettled && !nearbySpotsLoading);

  // The felt opening of Capture — "I am at this place" — before anything
  // else, implementing the three confidence tiers from
  // docs/decisions/001_PLACE_RECOGNITION.md: a real match is presented as
  // fact (quietly overridable), a handful of candidates are offered as a
  // gentle question, and a place with nothing nearby is acknowledged
  // plainly, never as system doubt ("seems new"). GPS is only ever the
  // clue that ranks candidates — the tap that actually decides is always
  // the user's, via setPickedNearby below.
  function renderPlaceRecognition() {
    // Opened via a Spot's own "Log a moment" — already resolved, nothing
    // left to recognize or confirm.
    if (urlSpotId) {
      return (
        <>
          <h1 className="font-display text-2xl leading-tight text-foreground">
            {existingSpot ? existingSpot.spot.name || getSpotTypeLabel(existingSpot.spot.spotType) : "…"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">What happened here today?</p>
        </>
      );
    }

    if (!recognitionSettled) {
      return <p className="font-display text-lg text-muted-foreground">Finding where you are…</p>;
    }

    if (!coords) {
      // geoErrorReason carries the specific cause (permission denied,
      // unsupported, timed out — see the geolocation effect above) so
      // this stays honest about what happened instead of a blanket
      // "unavailable."
      const reasonText = geoErrorReason
        ? geoErrorReason.charAt(0).toUpperCase() + geoErrorReason.slice(1)
        : "Location isn't available right now";
      return (
        <>
          <h1 className="font-display text-xl leading-snug text-foreground">Not sure where you are yet.</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{reasonText} — you can still leave a note about this moment.</p>
          <p className="mt-1 text-sm text-muted-foreground">What happened here today?</p>
        </>
      );
    }

    // High confidence: a real place, presented as settled fact rather
    // than a decision waiting to be made. The override lives below the
    // question, small and last — an escape hatch, not a competing
    // choice. Tapping it doesn't jump straight to "new": it falls
    // through to the same candidate list the low-confidence tier below
    // renders (autoMatch is always nearby[0], so it's still one of the
    // choices there, just no longer the only one).
    if (autoMatch && !revealNearby) {
      const matchLabel = autoMatch.name || getSpotTypeLabel(autoMatch.spotType);
      return (
        <>
          <h1 className="font-display text-2xl leading-tight text-foreground">{matchLabel}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">What happened here today?</p>
          <button
            type="button"
            onClick={() => setRevealNearby(true)}
            className="mt-2 text-xs text-muted-foreground underline underline-offset-2"
          >
            Not this place?
          </button>
        </>
      );
    }

    // Low confidence, or a high-confidence match the user asked to see
    // alternatives to: every real nearby candidate plus "New place",
    // offered as one calm question — a gentle confirmation, not a setup
    // form.
    if (nearby.length > 0) {
      return (
        <>
          <h1 className="font-display text-xl leading-tight text-foreground">Which place is this?</h1>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {nearby.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => setPickedNearby(s.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs",
                  pickedNearby === s.id ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
                )}
              >
                {s.name || getSpotTypeLabel(s.spotType)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPickedNearby("new")}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs",
                pickedNearby === "new" ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
              )}
            >
              New place
            </button>
          </div>
          <p className="mt-2.5 text-sm text-muted-foreground">What happened here today?</p>
        </>
      );
    }

    // Nothing nearby at all — a place worth acknowledging plainly, as a
    // fact about the user's own history here, never as the system
    // hedging ("seems new"). Naming, if it ever happens, comes later.
    return (
      <>
        <h1 className="font-display text-2xl leading-tight text-foreground">
          {placeText ? `Near ${placeText}` : placeTextLoading ? "…" : "This place"}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">You haven't recorded a place here before.</p>
        <p className="mt-1 text-sm text-muted-foreground">What happened here today?</p>
      </>
    );
  }

  return (
    <div className="settle-in min-h-[100dvh] pb-40">
      <div className="flex items-center px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-2">
        <Button size="icon" variant="ghost" onClick={() => window.history.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
      </div>

      <div className="px-4 pb-2">{renderPlaceRecognition()}</div>

      {/* Spot type — grouped with place recognition, not sandwiched
          between the in-the-moment observations below (what the bird
          did, what the water looks like right now). Classifying what
          kind of place this is belongs with "where is this," since
          Waterlog is place-centered — it's asked once, about the place,
          not once per moment. Only shown for a spot that doesn't exist
          yet; an existing spot already has a fixed type. */}
      {!targetSpotId && (
        <div className="px-4 pb-2">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">What kind of place is it?</p>
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

      {/* Secondary, and felt that way: quietly appears a beat after the
          place above (same .settle-in fade, delayed) rather than sharing
          its moment — see docs/design/02_CAPTURE_SCREEN.md's Information
          Hierarchy (Place is Primary, Weather is Secondary). Never gates
          Save. */}
      <div className="settle-in px-4 pb-3" style={{ animationDelay: "220ms" }}>
        <p className="text-xs text-muted-foreground">Weather · {weatherText}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {temperatureText} · {timeText}
        </p>
      </div>

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
            pigeon drinks) but rare — extra sightings get a quiet top rule
            to separate them from the primary sighting above, not a
            bordered card; nothing on this screen should look like a
            settings panel. */}
        {sightings.slice(1).map((s, i) => {
          const index = i + 1;
          return (
            <div key={index} className="space-y-2 border-t border-border/50 pt-3">
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

        {/* Everything else — a note (or a spoken version of it) and the
            first bird's species — is real but secondary. Species in
            particular is demoted on purpose: which bird it was matters
            less here than what it was doing. Labeled as continuing to
            look, not adding data — "Add details" reads like productivity
            software; this is the same act of noticing, just closer. */}
        <button
          type="button"
          onClick={() => setShowDetails(v => !v)}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showDetails && "rotate-180")} />
          A closer look
        </button>

        {showDetails && (
          <div className="space-y-3 border-t border-border/50 pt-3">
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

      {/* Sticky, so the action is one tap away no matter how much of the
          optional section above is expanded or scrolled past. Signing in
          is a different action entirely (it leaves the app) from leaving
          a memory, so it keeps its own labeled button; the memory-leaving
          gesture itself is an icon, never a word — see docs/design/
          02_CAPTURE_SCREEN.md, "Interaction": avoid Save/Submit/Done, and
          "the action should feel like gently placing a memory down." */}
      <div className="fixed inset-x-0 bottom-20 z-40 mx-auto flex max-w-md flex-col items-center px-4">
        {!isAuthenticated ? (
          <Button
            className="shadow-lg"
            size="lg"
            disabled={authLoading || !loginUrl}
            onClick={() => {
              if (loginUrl) window.open(loginUrl, "_blank", "noopener,noreferrer");
            }}
          >
            {authLoading ? <Spinner className="h-4 w-4" /> : loginUrl ? "Sign in to save" : "Sign-in unavailable"}
          </Button>
        ) : saved ? (
          // The spec's own completion line (docs/design/
          // 02_CAPTURE_SCREEN.md, "Completion") — text here, not inside a
          // button, since the gesture is already done; this is the quiet
          // acknowledgment that follows it, faded in via .settle-in.
          <p className="settle-in px-6 text-center font-display text-base text-foreground">This place now holds this moment.</p>
        ) : (
          <div className="relative">
            <button
              type="button"
              aria-label="Leave this moment here"
              disabled={busy || authLoading || !canSubmit}
              onClick={e => {
                // A tap here should feel like a drop landing on still
                // water, not a button press — see
                // docs/03_DESIGN_MANIFESTO.md §7. Ring color reads from
                // the button's own computed style so it follows
                // light/dark automatically; spawnRipple no-ops under
                // reduced motion.
                if (rippleOriginRef.current) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  rippleOriginRef.current.style.left = `${e.clientX - rect.left}px`;
                  rippleOriginRef.current.style.top = `${e.clientY - rect.top}px`;
                  const color = getComputedStyle(e.currentTarget).getPropertyValue("--primary-foreground").trim();
                  spawnRipple(rippleOriginRef.current, color || "#fff");
                }
                handleSubmit();
              }}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95 disabled:opacity-50"
            >
              {busy || authLoading || locating ? <Spinner className="h-5 w-5" /> : <Droplets className="h-6 w-6" />}
            </button>
            <div ref={rippleOriginRef} className="pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full" />
          </div>
        )}
        {!isAuthenticated && !authLoading && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {loginUrl
              ? "Opens in a new tab — this photo stays right here."
              : "OAuth isn't configured in this preview — saving needs a signed-in session."}
          </p>
        )}
        {submitError && <p className="mt-2 text-center text-xs text-destructive">{submitError}</p>}
      </div>
    </div>
  );
}
