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
  const { createDemoAIProvider } = await import("@/features/ai/demo-provider");
  return createDemoAIProvider();
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
