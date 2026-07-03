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
 * Water Spots are the primary object in Waterlog: a puddle, pond, fountain,
 * or any place where birds interact with water. A spot persists across many
 * visits from many users and carries its own lifecycle state, independent
 * of any single sighting.
 */
export const waterSpots = mysqlTable("waterSpots", {
  id: int("id").autoincrement().primaryKey(),
  /** User who first logged this spot */
  creatorId: int("creatorId").notNull(),
  /** User-given name, e.g. "Puddle by the bus stop" */
  name: text("name"),
  latitude: decimal("latitude", { precision: 10, scale: 8 }).notNull(),
  longitude: decimal("longitude", { precision: 11, scale: 8 }).notNull(),
  /** Reverse geocoded place name (if available) */
  placeName: text("placeName"),
  /** What kind of water spot this is */
  spotType: mysqlEnum("spotType", [
    "puddle",
    "temporary_pool",
    "pond",
    "fountain",
    "drainage",
    "container",
    "wetland",
    "other",
  ]).default("other").notNull(),
  /**
   * Where this spot is in its life story. Set on write today (see
   * server/db.ts createMoment); time-based decay toward "drying"/"dry" is a
   * later milestone.
   */
  lifecycleState: mysqlEnum("lifecycleState", ["alive", "drying", "dry", "reawakened"])
    .default("alive")
    .notNull(),
  firstSeenAt: timestamp("firstSeenAt").defaultNow().notNull(),
  lastActivityAt: timestamp("lastActivityAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WaterSpot = typeof waterSpots.$inferSelect;
export type InsertWaterSpot = typeof waterSpots.$inferInsert;

/**
 * A Moment is a single field entry at a Water Spot: "what happened here
 * today?" Designed to be completable in under 10 seconds with just a photo
 * or voice note and a spot — everything else is optional enrichment.
 */
export const moments = mysqlTable("moments", {
  id: int("id").autoincrement().primaryKey(),
  spotId: int("spotId").notNull(),
  /** User who logged this moment */
  userId: int("userId").notNull(),
  capturedAt: timestamp("capturedAt").defaultNow().notNull(),
  /** Free-text field note, or a cleaned-up voice transcript */
  note: text("note"),
  /** Photo URLs (S3), stored as a JSON array */
  photoUrls: json("photoUrls"),
  /** Raw voice note audio URL, if captured by voice */
  voiceNoteUrl: text("voiceNoteUrl"),
  /** Transcription of the voice note */
  transcript: text("transcript"),
  /** How much water was there: full / receding / puddle_only / dry */
  waterCondition: varchar("waterCondition", { length: 32 }),
  weather: varchar("weather", { length: 64 }),
  temperature: decimal("temperature", { precision: 5, scale: 1 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Moment = typeof moments.$inferSelect;
export type InsertMoment = typeof moments.$inferInsert;

/**
 * A Sighting is a bird observed during a Moment. It is a child record of
 * the moment, not the primary object — species is optional so "a bird I
 * couldn't identify visited" is still a complete, valid entry.
 */
export const sightings = mysqlTable("sightings", {
  id: int("id").autoincrement().primaryKey(),
  momentId: int("momentId").notNull(),
  /** Optional — unidentified sightings are a valid fast-path entry */
  species: text("species"),
  count: int("count").default(1),
  /** e.g. drinking, bathing, foraging, wading — stored as a JSON array */
  behaviors: json("behaviors"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Sighting = typeof sightings.$inferSelect;
export type InsertSighting = typeof sightings.$inferInsert;

/**
 * Relations
 */
export const usersRelations = relations(users, ({ many }) => ({
  waterSpots: many(waterSpots),
  moments: many(moments),
}));

export const waterSpotsRelations = relations(waterSpots, ({ one, many }) => ({
  creator: one(users, {
    fields: [waterSpots.creatorId],
    references: [users.id],
  }),
  moments: many(moments),
}));

export const momentsRelations = relations(moments, ({ one, many }) => ({
  spot: one(waterSpots, {
    fields: [moments.spotId],
    references: [waterSpots.id],
  }),
  user: one(users, {
    fields: [moments.userId],
    references: [users.id],
  }),
  sightings: many(sightings),
}));

export const sightingsRelations = relations(sightings, ({ one }) => ({
  moment: one(moments, {
    fields: [sightings.momentId],
    references: [moments.id],
  }),
}));
