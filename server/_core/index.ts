import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { ENV } from "./env";
import { seedDemoData } from "../seedDemoData";
import { getOrCreateLocalDevUser } from "./context";
import { getDb, listSpots } from "../db";

// Dev-only: populates the local demo store with a handful of varied
// spots/moments so the app can be looked at with real volume. Blocked in
// production at the route level (in addition to seedDemoData's own
// guard) so this is never even reachable there — deliberately including
// a WATERLOG_DEMO_MODE=true deployment: it's an unauthenticated public
// mutation, and autoSeedDemoDataIfEmpty() below already keeps a demo
// deployment stocked with spots without exposing this. Trigger with
// `pnpm seed` while `pnpm dev` is running.
function registerDevSeedRoute(app: express.Express) {
  app.post("/api/dev/seed-demo-data", async (_req, res) => {
    if (ENV.isProduction) {
      res.status(403).json({ error: "Not available in production" });
      return;
    }
    try {
      const result = await seedDemoData();
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
}

// The in-memory store (server/memoryStore.ts) is pure process memory, and
// `tsx watch` restarts this process on every server-file save — silently
// wiping every seeded spot/moment with nothing to say it happened. Rather
// than rely on remembering to re-run `pnpm seed` after every restart,
// auto-seed once at boot, but only when there's truly nothing to lose:
// never in real production, never against a real configured database (a
// real dev MySQL, or a real production database, is left alone entirely),
// and never if the local dev user already has spots (a manual `pnpm seed`
// run, or a previous boot's auto-seed, is left as-is rather than
// duplicated). A WATERLOG_DEMO_MODE=true deployment intentionally passes
// this gate — that's the whole point of demo mode: a public link that
// opens with seeded spots already there, same as local dev, instead of a
// cold empty state.
async function autoSeedDemoDataIfEmpty() {
  if (ENV.isProduction && !ENV.demoMode) return;
  if (await getDb()) return;

  const user = await getOrCreateLocalDevUser();
  if (!user) return;

  const existing = await listSpots(user.id);
  if (existing.length > 0) return;

  const result = await seedDemoData();
  console.log(`[Demo seed] Auto-seeded ${result.spots} spots and ${result.moments} moments for local dev (in-memory store was empty).`);
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

// Dev must be predictable: `pnpm dev` -> http://localhost:3000, every
// time, or a clear failure — never a silent hop to 3001/3013/whatever's
// free, which breaks anything with that URL hardcoded (bookmarks, the
// phone-LAN preview flow, OAuth redirect URIs). Production keeps the old
// scan-forward behavior via findAvailablePort above (unchanged) since
// that's a separate, deliberate choice this task isn't touching.
async function reservePortStrict(port: number): Promise<number> {
  if (!(await isPortAvailable(port))) {
    throw new Error(
      `Port ${port} is already in use. Stop whatever's using it (or set PORT to a free one) and retry — the dev server no longer falls back to a different port automatically.`,
    );
  }
  return port;
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerDevSeedRoute(app);
  await autoSeedDemoDataIfEmpty();
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port =
    process.env.NODE_ENV === "development" ? await reservePortStrict(preferredPort) : await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
