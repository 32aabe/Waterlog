import { User } from "lucide-react";

/**
 * Temporary placeholder for today's AIR demo submission — the real
 * Profile depends on a signed-in user and a working server, neither
 * guaranteed on a fresh demo deployment. Replaces an auth-gated redirect
 * back to Map (which read as a dead tab) with an always-visible
 * explanation instead. Swap back to the real implementation (see git
 * history) once the demo deployment's auth/server story is settled.
 */
export default function Profile() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 px-6 pb-24 text-center">
      <User className="h-6 w-6 text-muted-foreground" />
      <p className="max-w-xs text-sm text-muted-foreground">
        Profile is coming later. This demo focuses on Map, Capture, and Spot.
      </p>
    </div>
  );
}
