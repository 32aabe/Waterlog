import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { storagePut } from "./storage";
import { transcribeAudio } from "./_core/voiceTranscription";
import { describeLocation } from "./_core/geocode";
import { TRPCError } from "@trpc/server";

const spotTypeSchema = z.enum([
  "puddle",
  "temporary_pool",
  "pond",
  "fountain",
  "drainage",
  "container",
  "wetland",
  "other",
]);

const sightingInputSchema = z.object({
  species: z.string().optional(),
  count: z.number().optional(),
  behaviors: z.array(z.string()).optional(),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // The map/spot screens are browsable without signing in — login is
  // deferred until someone wants to log a moment — but a Spot is always
  // one user's private record of a place (see listSpots/getSpotDetail in
  // server/db.ts), so signed-out visitors simply see nothing yet, the
  // same way a diary is empty until you start writing in it.
  spots: router({
    list: publicProcedure.query(({ ctx }) => (ctx.user ? db.listSpots(ctx.user.id) : [])),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ ctx, input }) => (ctx.user ? db.getSpotDetail(input.id, ctx.user.id) : null)),

    // Quietly turns coordinates into a short place phrase for Capture's
    // dateline — "near Fulton Fountain" instead of a raw lat/lng — and,
    // when a new spot is created, becomes its placeName. Never blocks or
    // fails the capture flow: resolves to null wherever it can't help.
    describeLocation: publicProcedure
      .input(z.object({ latitude: z.number(), longitude: z.number() }))
      .query(({ input }) => describeLocation(input.latitude, input.longitude)),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().optional(),
          latitude: z.number(),
          longitude: z.number(),
          placeName: z.string().optional(),
          spotType: spotTypeSchema.optional(),
        }),
      )
      .mutation(({ ctx, input }) =>
        db.createSpot({
          creatorId: ctx.user.id,
          ...input,
        }),
      ),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const deleted = await db.deleteSpot(input.id, ctx.user.id);
        if (!deleted) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Spot not found" });
        }
        return { success: true } as const;
      }),
  }),

  moments: router({
    create: protectedProcedure
      .input(
        z.object({
          spotId: z.number(),
          note: z.string().optional(),
          photoUrls: z.array(z.string()).optional(),
          waterCondition: z.string().optional(),
          sightings: z.array(sightingInputSchema).optional(),
          weather: z.string().optional(),
        }),
      )
      .mutation(({ ctx, input }) =>
        db.createMoment({
          userId: ctx.user.id,
          ...input,
        }),
      ),

    listJournal: protectedProcedure.query(({ ctx }) => db.listUserJournal(ctx.user.id)),

    getUserStats: protectedProcedure.query(({ ctx }) => db.getUserStats(ctx.user.id)),

    // Accepts a data: URL (photo or voice note captured on-device) and
    // hands it to the existing Forge/S3 storage helper. Kept generic so
    // both the Capture flow's photo and voice-note inputs share one path.
    uploadMedia: protectedProcedure
      .input(
        z.object({
          dataUrl: z.string(),
          filename: z.string().default("moment-media"),
        }),
      )
      .mutation(async ({ input }) => {
        const match = /^data:(.+);base64,(.+)$/.exec(input.dataUrl);
        if (!match) throw new Error("Invalid data URL");
        const [, contentType, base64] = match;
        const buffer = Buffer.from(base64, "base64");
        const { url } = await storagePut(`moments/${input.filename}`, buffer, contentType);
        return { url };
      }),

    // Voice notes are a faster-than-typing input for the note field, not a
    // stored asset in their own right: we transcribe and hand back text,
    // and don't persist the audio URL anywhere (no schema change needed).
    // The uploaded clip itself is left in storage rather than deleted —
    // an acceptable, deliberate trade-off at this stage.
    transcribeVoice: protectedProcedure
      .input(z.object({ audioUrl: z.string() }))
      .mutation(async ({ input }) => {
        const result = await transcribeAudio({ audioUrl: input.audioUrl });
        if ("error" in result) {
          throw new TRPCError({ code: "BAD_REQUEST", message: result.error, cause: result });
        }
        return { text: result.text };
      }),
  }),
});

export type AppRouter = typeof appRouter;
