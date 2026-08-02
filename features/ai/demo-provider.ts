import type { JobExtractionResult } from "@/features/ai/extraction-schema";
import type { AIProvider, JobExtractionInput } from "@/features/ai/provider";

/**
 * Deterministic Demo Mode extraction: identical input always produces
 * identical output. Returns a fixed, reasonable structured example while
 * preserving the submitted URL and the complete original description.
 */
export function createDemoAIProvider(): AIProvider {
  return {
    async extractJob(input: JobExtractionInput): Promise<JobExtractionResult> {
      return {
        company: "Example Tech Inc.",
        job_title: "Software Developer Co-op",
        location: "Toronto, ON",
        country: "Canada",
        work_arrangement: "Hybrid",
        employment_type: "Co-op / Internship",
        work_term_duration: "4 months",
        deadline: "2026-12-31",
        salary_text: "Competitive hourly rate",
        education_requirements: ["Currently enrolled in a CS program"],
        years_of_experience: "0-2 years",
        posting_url: input.url,
        responsibilities: [
          "Build and maintain web application features",
          "Collaborate with the team in an agile environment",
        ],
        qualifications: ["Experience with TypeScript or JavaScript", "Strong communication skills"],
        original_description: input.description.trim(),
        mode: "demo",
      };
    },
  };
}
