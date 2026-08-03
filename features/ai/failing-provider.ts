import type { AIProvider } from "@/features/ai/provider";

/**
 * Simulated provider that always fails. Only reachable through the
 * server-only `E2E_AI_FAILURE=1` flag, which `getAIProvider` refuses unless
 * running against a localhost backend outside production. It is never
 * selectable from the browser or by request parameters.
 */
export function createFailingAIProvider(): AIProvider {
  const fail = async (): Promise<never> => {
    throw new Error("E2E simulated AI provider failure.");
  };
  return {
    extractJob: fail,
    analyzeMatch: fail,
    generateCoverLetter: fail,
    generateInterviewPrep: fail,
  };
}
