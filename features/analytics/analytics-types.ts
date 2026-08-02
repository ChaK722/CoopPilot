import type { ApplicationStatus } from "@/lib/validation/applications";

export interface AnalyticsSummary {
  total: number;
  active: number;
  interviews: number;
  offers: number;
  applied_denominator: number;
  upcoming_deadlines: number;
  interview_rate: number | null;
  offer_rate: number | null;
}

export interface StatusCount {
  status: ApplicationStatus;
  count: number;
}

export interface SubmissionCount {
  month: string;
  count: number;
}

export interface TopSkill {
  normalized_name: string;
  name: string;
  total_count: number;
  required_count: number;
  preferred_count: number;
}

export interface UpcomingDeadlineItem {
  id: string;
  company: string;
  job_title: string;
  deadline: string | null;
  updated_at: string;
}

export interface RecentlyUpdatedItem {
  id: string;
  company: string;
  job_title: string;
  status: ApplicationStatus;
  updated_at: string;
}

export type RequiringActionReason = "Deadline passed" | "Apply before deadline";

export interface RequiringActionItem {
  id: string;
  company: string;
  job_title: string;
  status: ApplicationStatus;
  deadline: string | null;
  updated_at: string;
  reason: RequiringActionReason;
}

export interface AnalyticsSnapshot {
  summary: AnalyticsSummary;
  status_counts: StatusCount[];
  submissions_over_time: SubmissionCount[];
  top_skills: TopSkill[];
  upcoming_deadlines: UpcomingDeadlineItem[];
  recently_updated: RecentlyUpdatedItem[];
  requiring_action: RequiringActionItem[];
}
