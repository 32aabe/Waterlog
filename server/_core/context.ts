import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { ENV } from "./env";
import * as db from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

const LOCAL_DEV_OPEN_ID = "local-dev-admin";

// Gated on BOTH conditions so this can never activate in a real
// deployment (NODE_ENV=production) or for anyone testing real OAuth
// locally (OAUTH_SERVER_URL set) — only the specific "bare local/phone-
// LAN preview with no OAuth configured" case this exists for.
const LOCAL_DEV_AUTH_ENABLED = !ENV.isProduction && !ENV.oAuthServerUrl;

let localDevUserPromise: Promise<User | null> | null = null;

/**
 * Real OAuth needs a Manus app id and a reachable OAuth server, neither
 * of which exist in a bare local checkout or a phone-LAN preview.
 * Without this, every protected action (saving a moment, viewing the
 * journal) would permanently fail there with no way to sign in — so in
 * that specific situation only, synthesize one persistent "Local Dev
 * Admin" account instead. Memoized so repeated requests reuse the same
 * DB row rather than racing to create it.
 */
export async function getOrCreateLocalDevUser(): Promise<User | null> {
  if (!localDevUserPromise) {
    localDevUserPromise = (async () => {
      let user = await db.getUserByOpenId(LOCAL_DEV_OPEN_ID);
      if (!user) {
        await db.upsertUser({
          openId: LOCAL_DEV_OPEN_ID,
          name: "Local Dev Admin",
          email: "local-dev@localhost",
          loginMethod: "local-dev",
          role: "admin",
        });
        user = await db.getUserByOpenId(LOCAL_DEV_OPEN_ID);
      }
      return user ?? null;
    })().catch(error => {
      // No DATABASE_URL yet, most likely — fall back to null rather than
      // crash context creation; protected procedures will still report
      // "please login" until a local database is configured too.
      console.warn("[Auth] Local dev auth fallback couldn't create its user:", error);
      return null;
    });
  }
  return localDevUserPromise;
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  if (!user && LOCAL_DEV_AUTH_ENABLED) {
    user = await getOrCreateLocalDevUser();
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
