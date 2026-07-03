import type { InsertUser, User, Location, Observation } from "../drizzle/schema";

/**
 * In-memory fallback store — dev-only. Used by server/db.ts (see
 * resolveDataSource there) whenever no DATABASE_URL is configured and
 * NODE_ENV isn't "production", so the whole app (Map, Journal, Spots,
 * Profile, Capture) works with zero external dependencies for local
 * demoing. Row shapes match the drizzle-inferred User/Location/Observation
 * types exactly, so every read-side transform in db.ts
 * (groupObservationsIntoMoments, computeLifecycle, toSpotSummary) runs
 * unchanged regardless of which backend produced the rows.
 *
 * Deliberately resets whenever the process restarts — this exists to
 * unblock local demoing without Docker/MySQL, not to be a real
 * persistence layer. Production always requires a real DATABASE_URL;
 * see resolveDataSource's isProduction gate in db.ts.
 */

let nextUserId = 1;
let nextLocationId = 1;
let nextObservationId = 1;

const users: User[] = [];
const locations: Location[] = [];
const observations: Observation[] = [];

function clone<T>(value: T): T {
  return { ...value };
}

export type InsertLocationInput = {
  userId: number;
  name?: string | null;
  latitude: string;
  longitude: string;
  placeName?: string | null;
  waterResourceType?: string | null;
  /** Seed-data only in practice — lets a demo spot read as "discovered N
   *  days ago" instead of everything being "just now". */
  createdAt?: Date;
};

export type InsertObservationInput = {
  userId: number;
  locationId: number | null;
  date: string;
  time?: string | null;
  latitude: string;
  longitude: string;
  placeName?: string | null;
  species: string;
  count?: number | null;
  primaryBehaviors?: string | null;
  waterResourceType?: string | null;
  waterDepth?: string | null;
  distanceFromWater?: string | null;
  notes?: string | null;
  photoUrl?: string | null;
  weather?: string | null;
  /** Seed-data only in practice — backdates a demo moment. */
  createdAt?: Date;
};

export const memoryStore = {
  /** Exposed for tests / an explicit "start fresh" action; not called
   *  automatically — process restart already clears everything. */
  reset() {
    users.length = 0;
    locations.length = 0;
    observations.length = 0;
    nextUserId = 1;
    nextLocationId = 1;
    nextObservationId = 1;
  },

  async getUserByOpenId(openId: string): Promise<User | undefined> {
    const found = users.find(u => u.openId === openId);
    return found ? clone(found) : undefined;
  },

  async upsertUser(data: InsertUser): Promise<void> {
    const now = new Date();
    const existing = users.find(u => u.openId === data.openId);
    if (existing) {
      if (data.name !== undefined) existing.name = data.name;
      if (data.email !== undefined) existing.email = data.email;
      if (data.loginMethod !== undefined) existing.loginMethod = data.loginMethod;
      if (data.role !== undefined) existing.role = data.role;
      existing.lastSignedIn = data.lastSignedIn ?? now;
      existing.updatedAt = now;
      return;
    }
    users.push({
      id: nextUserId++,
      openId: data.openId,
      name: data.name ?? null,
      email: data.email ?? null,
      loginMethod: data.loginMethod ?? null,
      role: data.role ?? "user",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: data.lastSignedIn ?? now,
    });
  },

  async insertLocation(data: InsertLocationInput): Promise<Location> {
    const now = data.createdAt ?? new Date();
    const row: Location = {
      id: nextLocationId++,
      userId: data.userId,
      name: data.name ?? null,
      latitude: data.latitude,
      longitude: data.longitude,
      placeName: data.placeName ?? null,
      waterResourceType: data.waterResourceType ?? null,
      waterSalinity: null,
      waterOrigin: null,
      createdAt: now,
      updatedAt: now,
    };
    locations.push(row);
    return clone(row);
  },

  async getLocationById(id: number): Promise<Location | undefined> {
    const found = locations.find(l => l.id === id);
    return found ? clone(found) : undefined;
  },

  async listLocations(): Promise<Location[]> {
    return [...locations].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map(clone);
  },

  async insertObservation(data: InsertObservationInput): Promise<Observation> {
    const now = data.createdAt ?? new Date();
    const row: Observation = {
      id: nextObservationId++,
      userId: data.userId,
      locationId: data.locationId,
      date: data.date,
      time: data.time ?? null,
      latitude: data.latitude,
      longitude: data.longitude,
      locationName: null,
      placeName: data.placeName ?? null,
      species: data.species,
      count: data.count ?? 1,
      isEstimatedCount: 0,
      primaryBehaviors: data.primaryBehaviors ?? null,
      secondaryBehaviors: null,
      distanceFromWater: data.distanceFromWater ?? null,
      waterResourceType: data.waterResourceType ?? null,
      waterSalinity: null,
      waterOrigin: null,
      waterFlow: null,
      waterDepth: data.waterDepth ?? null,
      iceCoverage: null,
      humanDisturbance: null,
      temperature: null,
      weather: data.weather ?? null,
      wind: null,
      precipitation: null,
      notes: data.notes ?? null,
      photoUrl: data.photoUrl ?? null,
      createdAt: now,
      updatedAt: now,
    };
    observations.push(row);
    return clone(row);
  },

  async getObservationById(id: number): Promise<Observation | undefined> {
    const found = observations.find(o => o.id === id);
    return found ? clone(found) : undefined;
  },

  async listObservationsByLocationId(locationId: number): Promise<Observation[]> {
    return observations
      .filter(o => o.locationId === locationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(clone);
  },

  async listObservationsByUserId(userId: number): Promise<Observation[]> {
    return observations
      .filter(o => o.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(clone);
  },

  async listObservationsByGroupKey(groupKey: string): Promise<Observation[]> {
    return observations.filter(o => o.distanceFromWater === groupKey).map(clone);
  },
};
