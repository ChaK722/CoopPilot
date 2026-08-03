import type { JobExtractionResult } from "@/features/ai/extraction-schema";
import type {
  CoverLetterInput,
  CoverLetterResult,
  InterviewPrepInput,
  InterviewPrepResult,
  MatchAnalysisResult,
  MatchInput,
} from "@/features/ai/schemas";

export interface JobExtractionInput {
  description: string;
  url: string | null;
}

/**
 * Phase 5 provider contract: job extraction plus match analysis, cover
 * letters, and interview preparation.
 */
export interface AIProvider {
  extractJob(input: JobExtractionInput): Promise<JobExtractionResult>;
  analyzeMatch(input: MatchInput): Promise<MatchAnalysisResult>;
  generateCoverLetter(input: CoverLetterInput): Promise<CoverLetterResult>;
  generateInterviewPrep(input: InterviewPrepInput): Promise<InterviewPrepResult>;
}

/**
 * Provider selection happens server-side only. No external AI configuration
 * exists yet, so the deterministic Demo provider is always selected; the
 * external provider slot is reserved for future configuration.
 */
export async function getAIProvider(): Promise<AIProvider> {
  if (process.env.E2E_AI_FAILURE === "1") {
    assertE2EFailureAllowed();
    const { createFailingAIProvider } = await import("@/features/ai/failing-provider");
    return createFailingAIProvider();
  }
  const { createDemoAIProvider } = await import("@/features/ai/demo-provider");
  return createDemoAIProvider();
}

/**
 * The E2E failure hook is test-only: it fails fast in production builds and
 * requires a localhost-only Supabase URL so it can never be enabled against
 * a real deployment.
 */
function assertE2EFailureAllowed(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("E2E_AI_FAILURE is not allowed in production.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) {
    throw new Error("E2E_AI_FAILURE requires a localhost-only Supabase URL.");
  }
}

/** Bounded execution for provider calls; Demo providers resolve instantly. */
export async function withProviderTimeout<T>(promise: Promise<T>, timeoutMs = 30_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("The AI request timed out. Please try again.")),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
