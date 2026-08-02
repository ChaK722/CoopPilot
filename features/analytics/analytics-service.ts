import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import {
  analyticsSnapshotSchema,
  type AnalyticsSnapshotData,
} from "@/features/analytics/analytics-schema";

type DbClient = SupabaseClient;

/**
 * One RPC returns the complete analytics snapshot; the service validates the
 * shape with Zod and never trusts the database JSON directly. Both Dashboard
 * and Analytics pages use this single service, so the two pages always
 * reconcile.
 */
export function createAnalyticsService(supabase: DbClient) {
  return {
    async getSnapshot(userId: string, today: string): Promise<AnalyticsSnapshotData> {
      const { data, error } = await supabase.rpc("get_application_analytics", {
        p_user_id: userId,
        p_today: today,
      });
      if (error) {
        throw new AppError(
          "database_unavailable",
          "Could not load your dashboard. Please try again.",
          error,
        );
      }
      const parsed = analyticsSnapshotSchema.safeParse(data);
      if (!parsed.success) {
        throw new AppError("unexpected", "The dashboard data could not be read. Please try again.");
      }
      return parsed.data;
    },
  };
}

export type AnalyticsService = ReturnType<typeof createAnalyticsService>;
