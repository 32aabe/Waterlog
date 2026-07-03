import { decimal, int, mysqlEnum, mysqlTable, text, timestamp, varchar, json } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Locations table for storing observation sites.
 *
 * Kept identical to Ver.2 ("Brooktrack") by design: this Ver.3 milestone
 * deliberately does not introduce a first-class Water Spot table yet. A
 * "spot" is represented in product code as a Location row plus a
 * lifecycle state derived at read time from its Observations (see
 * server/db.ts) rather than a stored column. This lets the product
 * validate the new experience with real users before committing to a new
 * data model. Each location can have multiple observations from different
 * users.
 */
export const locations = mysqlTable("locations", {
  id: int("id").autoincrement().primaryKey(),
  /** User who created this location entry */
  userId: int("userId").notNull(),
  /** User-provided location name (optional) */
  name: text("name"),
  /** Latitude coordinate */
  latitude: decimal("latitude", { precision: 10, scale: 8 }).notNull(),
  /** Longitude coordinate */
  longitude: decimal("longitude", { precision: 11, scale: 8 }).notNull(),
  /** Reverse geocoded place name (if available) */
  placeName: text("placeName"),
  /** Water resource type. Doubles as the product's "spot type" (puddle,
   *  pond, fountain, ...) — validated against an enum at the app layer in
   *  server/routers.ts, not at the schema layer. */
  waterResourceType: varchar("waterResourceType", { length: 64 }),
  /** Freshwater / saltwater / brackish */
  waterSalinity: varchar("waterSalinity", { length: 32 }),
  /** Natural / artificial / semi-natural */
  waterOrigin: varchar("waterOrigin", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Location = typeof locations.$inferSelect;
export type InsertLocation = typeof locations.$inferInsert;

/**
 * Observations table for storing bird observation records.
 *
 * Kept identical to Ver.2 ("Brooktrack"). In product code this row is a
 * "Moment" (a field entry at a spot) carrying exactly one "Sighting" —
 * see server/db.ts for the adapter that presents it that way to the
 * client without a schema change. Each observation is linked to a user
 * and a location.
 */
export const observations = mysqlTable("observations", {
  id: int("id").autoincrement().primaryKey(),
  /** User who made this observation */
  userId: int("userId").notNull(),
  /** Location where observation was made */
  locationId: int("locationId"),
  /** Observation date */
  date: varchar("date", { length: 10 }).notNull(),
  /** Observation time */
  time: varchar("time", { length: 8 }),
  /** GPS latitude */
  latitude: decimal("latitude", { precision: 10, scale: 8 }).notNull(),
  /** GPS longitude */
  longitude: decimal("longitude", { precision: 11, scale: 8 }).notNull(),
  /** Location name provided by user */
  locationName: text("locationName"),
  /** Reverse geocoded place name */
  placeName: text("placeName"),
  /** Bird species. Defaults to "Unidentified bird" at write time (see
   *  server/db.ts) rather than being made nullable, so a moment without a
   *  confirmed species is still a fast, valid entry without a schema change. */
  species: text("species").notNull(),
  /** Count of birds observed */
  count: int("count").default(1),
  /** Whether count is estimated */
  isEstimatedCount: int("isEstimatedCount").default(0),
  /** Primary behavior - stored as JSON array */
  primaryBehaviors: json("primaryBehaviors"),
  /** Secondary behaviors - stored as JSON array */
  secondaryBehaviors: json("secondaryBehaviors"),
  /** Distance from water */
  distanceFromWater: varchar("distanceFromWater", { length: 64 }),
  /** Water resource type */
  waterResourceType: varchar("waterResourceType", { length: 64 }),
  /** Freshwater / saltwater / brackish */
  waterSalinity: varchar("waterSalinity", { length: 32 }),
  /** Natural / artificial / semi-natural */
  waterOrigin: varchar("waterOrigin", { length: 32 }),
  /** Flowing / still */
  waterFlow: varchar("waterFlow", { length: 32 }),
  /** Water depth category. Doubles as the product's quick-capture "water
   *  condition" (full / receding / puddle_only / dry) — see server/db.ts. */
  waterDepth: varchar("waterDepth", { length: 32 }),
  /** Ice coverage */
  iceCoverage: varchar("iceCoverage", { length: 32 }),
  /** Human disturbance level */
  humanDisturbance: varchar("humanDisturbance", { length: 32 }),
  /** Temperature */
  temperature: decimal("temperature", { precision: 5, scale: 1 }),
  /** Weather conditions */
  weather: varchar("weather", { length: 64 }),
  /** Wind conditions */
  wind: varchar("wind", { length: 64 }),
  /** Precipitation */
  precipitation: varchar("precipitation", { length: 64 }),
  /** Field notes */
  notes: text("notes"),
  /** Photo URL if available */
  photoUrl: text("photoUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Observation = typeof observations.$inferSelect;
export type InsertObservation = typeof observations.$inferInsert;

/**
 * Relations
 */
export const usersRelations = relations(users, ({ many }) => ({
  observations: many(observations),
  locations: many(locations),
}));

export const observationsRelations = relations(observations, ({ one }) => ({
  user: one(users, {
    fields: [observations.userId],
    references: [users.id],
  }),
  location: one(locations, {
    fields: [observations.locationId],
    references: [locations.id],
  }),
}));

export const locationsRelations = relations(locations, ({ one, many }) => ({
  user: one(users, {
    fields: [locations.userId],
    references: [users.id],
  }),
  observations: many(observations),
}));
