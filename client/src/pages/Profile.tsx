import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut } from "lucide-react";

export default function Profile() {
  const { user, isAuthenticated, loading: authLoading, logout } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/");
  }, [authLoading, isAuthenticated, navigate]);

  const { data: stats } = trpc.moments.getUserStats.useQuery(undefined, { enabled: isAuthenticated });

  if (!isAuthenticated) return null;

  const initial = (user?.name || user?.email || "?").charAt(0).toUpperCase();

  return (
    <div className="min-h-[100dvh] pb-24">
      <header className="px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-3">
        <h1 className="text-lg font-semibold text-foreground">Profile</h1>
      </header>

      <div className="mx-4 flex items-center gap-3 rounded-xl border border-border bg-card p-4">
        <Avatar className="h-12 w-12">
          <AvatarFallback>{initial}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{user?.name || "Field journaler"}</p>
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
        </div>
      </div>

      {stats && (
        <div className="mx-4 mt-4 rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-xs font-medium text-muted-foreground">Your Waterlog so far</p>
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
        </div>
      )}

      <div className="mx-4 mt-6">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Coming later
        </p>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li>AI-generated monthly stories and best-photo picks</li>
          <li>Achievements and personal discoveries</li>
          <li>Research-grade CSV export</li>
        </ul>
      </div>

      <div className="mx-4 mt-6">
        <Button variant="outline" className="w-full" onClick={() => logout()}>
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>
    </div>
  );
}
