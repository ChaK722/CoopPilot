import { z } from "zod";
import { APPLICATION_STATUSES } from "@/lib/validation/applications";

const applicationStatusSchema = z.enum(APPLICATION_STATUSES);
const nonNegativeInt = z.number().int().min(0);
const nullableRate = z.number().min(0).nullable();
const uuidString = z.string().uuid();

const summarySchema = z.object({
  total: nonNegativeInt,
  active: nonNegativeInt,
  interviews: nonNegativeInt,
  offers: nonNegativeInt,
  applied_denominator: nonNegativeInt,
  upcoming_deadlines: nonNegativeInt,
  interview_rate: nullableRate,
  offer_rate: nullableRate,
});

const statusCountSchema = z.object({
  status: applicationStatusSchema,
  count: nonNegativeInt,
});

const submissionCountSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  count: nonNegativeInt,
});

const topSkillSchema = z.object({
  normalized_name: z.string().min(1),
  name: z.string().min(1),
  total_count: nonNegativeInt,
  required_count: nonNegativeInt,
  preferred_count: nonNegativeInt,
});

const upcomingDeadlineSchema = z.object({
  id: uuidString,
  company: z.string().min(1),
  job_title: z.string().min(1),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  updated_at: z.string().min(1),
});

const recentlyUpdatedSchema = z.object({
  id: uuidString,
  company: z.string().min(1),
  job_title: z.string().min(1),
  status: applicationStatusSchema,
  updated_at: z.string().min(1),
});

const requiringActionSchema = z.object({
  id: uuidString,
  company: z.string().min(1),
  job_title: z.string().min(1),
  status: applicationStatusSchema,
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  updated_at: z.string().min(1),
  reason: z.enum(["Deadline passed", "Apply before deadline"]),
});

export const analyticsSnapshotSchema = z.object({
  summary: summarySchema,
  status_counts: z.array(statusCountSchema).length(7),
  submissions_over_time: z.array(submissionCountSchema),
  top_skills: z.array(topSkillSchema).max(10),
  upcoming_deadlines: z.array(upcomingDeadlineSchema).max(5),
  recently_updated: z.array(recentlyUpdatedSchema).max(5),
  requiring_action: z.array(requiringActionSchema).max(5),
});

export type AnalyticsSnapshotData = z.infer<typeof analyticsSnapshotSchema>;
