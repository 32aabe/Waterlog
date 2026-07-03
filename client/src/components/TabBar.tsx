import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import { Waves, BookOpen, Plus, MapPinned, User } from "lucide-react";

const TABS = [
  { path: "/", label: "Map", icon: Waves },
  { path: "/journal", label: "Journal", icon: BookOpen },
  { path: "/capture", label: "Capture", icon: Plus, center: true },
  { path: "/spots", label: "Spots", icon: MapPinned },
  { path: "/profile", label: "Profile", icon: User },
] as const;

/**
 * Persistent bottom tab bar — the entire primary nav for Waterlog.
 * Replaces Ver.2's top navbar + separate /admin route: everything a user
 * needs is one thumb-reach away, and Capture is always the loudest icon.
 */
export function TabBar() {
  const [location] = useLocation();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 backdrop-blur supports-backdrop-blur:bg-card/80"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-md items-center justify-around px-2 py-1.5">
        {TABS.map(tab => {
          const isActive = tab.path === "/" ? location === "/" : location.startsWith(tab.path);
          const Icon = tab.icon;

          if ("center" in tab && tab.center) {
            return (
              <Link
                key={tab.path}
                href={tab.path}
                aria-label={tab.label}
                className="flex flex-col items-center gap-1 px-3 py-1 -mt-6"
              >
                <span
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-full shadow-lg shadow-primary/30 transition-transform active:scale-95",
                    "bg-primary text-primary-foreground",
                  )}
                >
                  <Icon className="h-6 w-6" />
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={tab.path}
              href={tab.path}
              aria-label={tab.label}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className={cn("h-5 w-5", isActive && "fill-primary/15")} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
