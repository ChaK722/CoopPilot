import type { JobExtractionResult } from "@/features/ai/extraction-schema";

export interface JobExtractionInput {
  description: string;
  url: string | null;
}

/**
 * Phase 3 AI provider contract: only job extraction is defined here.
 * Match analysis, cover letters, and interview preparation extend this
 * interface in Phase 5.
 */
export interface AIProvider {
  extractJob(input: JobExtractionInput): Promise<JobExtractionResult>;
}

/**
 * Provider selection happens server-side only. No external AI configuration
 * exists yet, so the deterministic Demo provider is always selected; the
 * external provider slot is reserved for Phase 5.
 */
export async function getAIProvider(): Promise<AIProvider> {
  const { createDemoAIProvider } = await import("@/features/ai/demo-provider");
  return createDemoAIProvider();
}
