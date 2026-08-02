import type { JobExtractionResult } from "@/features/ai/extraction-schema";
import type {
  CoverLetterInput,
  CoverLetterResult,
  InterviewPrepInput,
  InterviewPrepResult,
  MatchAnalysisResult,
  MatchInput,
} from "@/features/ai/schemas";
import type { AIProvider, JobExtractionInput } from "@/features/ai/provider";

/**
 * Deterministic Demo Mode provider: identical inputs always produce
 * identical outputs for every operation. Only real profile/job facts are
 * used; nothing is invented.
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

    async analyzeMatch(input: MatchInput): Promise<MatchAnalysisResult> {
      const profileSkills = new Set(input.profileSkills.map((skill) => skill.normalized_name));

      const matchingRequired = input.application.requiredSkills.filter((skill) =>
        profileSkills.has(skill.normalized_name),
      );
      const missingRequired = input.application.requiredSkills.filter(
        (skill) => !profileSkills.has(skill.normalized_name),
      );
      const matchingPreferred = input.application.preferredSkills.filter((skill) =>
        profileSkills.has(skill.normalized_name),
      );
      const missingPreferred = input.application.preferredSkills.filter(
        (skill) => !profileSkills.has(skill.normalized_name),
      );

      const requiredTotal = input.application.requiredSkills.length;
      const preferredTotal = input.application.preferredSkills.length;
      const requiredScore =
        requiredTotal > 0 ? Math.round((40 * matchingRequired.length) / requiredTotal) : 0;
      const preferredScore =
        preferredTotal > 0 ? Math.round((20 * matchingPreferred.length) / preferredTotal) : 0;
      const experienceScore = input.experiences.length > 0 ? 20 : 0;
      const educationScore = input.educations.length > 0 ? 10 : 0;
      const locationScore = input.location || input.availableStartDate ? 10 : 0;
      const overallScore =
        requiredScore + preferredScore + experienceScore + educationScore + locationScore;

      const matchingSkillNames = new Set([
        ...matchingRequired.map((skill) => skill.normalized_name),
        ...matchingPreferred.map((skill) => skill.normalized_name),
      ]);
      const matchingSkills = input.profileSkills
        .filter((skill) => matchingSkillNames.has(skill.normalized_name))
        .map((skill) => ({
          name: skill.name,
          evidence: `Listed in your ${skill.category.replace(/_/g, " ")} skills.`,
        }));

      const keywords = Array.from(
        new Set([input.application.job_title, ...input.application.qualifications].filter(Boolean)),
      ).slice(0, 8);

      const suggestions = [
        ...missingRequired.map(
          (skill) =>
            `The posting lists "${skill.name}" as required. Add it to your profile only if you genuinely have that experience.`,
        ),
        ...missingPreferred.map(
          (skill) =>
            `"${skill.name}" is preferred. Mention real coursework or projects where you used it.`,
        ),
        "Highlight concrete results (metrics, users, impact) from your experience.",
      ].filter(Boolean);

      return {
        overall_score: overallScore,
        score_breakdown: {
          required_skills: {
            score: requiredScore,
            max: 40,
            explanation: `${matchingRequired.length}/${requiredTotal} required skills in your profile.`,
          },
          preferred_skills: {
            score: preferredScore,
            max: 20,
            explanation: `${matchingPreferred.length}/${preferredTotal} preferred skills in your profile.`,
          },
          relevant_experience: {
            score: experienceScore,
            max: 20,
            explanation:
              input.experiences.length > 0
                ? `${input.experiences.length} experience entr${input.experiences.length === 1 ? "y" : "ies"} in your profile.`
                : "No experience entries in your profile.",
          },
          education: {
            score: educationScore,
            max: 10,
            explanation:
              input.educations.length > 0
                ? `${input.educations.length} education entr${input.educations.length === 1 ? "y" : "ies"} in your profile.`
                : "No education entries in your profile.",
          },
          location_availability: {
            score: locationScore,
            max: 10,
            explanation:
              input.location || input.availableStartDate
                ? "Location or availability is set."
                : "No location or availability set.",
          },
        },
        matching_skills: matchingSkills,
        missing_required_skills: missingRequired.map((skill) => skill.name),
        missing_preferred_skills: missingPreferred.map((skill) => skill.name),
        matching_experience: input.experiences.map((experience) => ({
          id: experience.id,
          title: experience.title,
          evidence: `${experience.title} at ${experience.organization}`,
        })),
        relevant_projects: input.projects.map((project) => ({
          id: project.id,
          name: project.name,
          evidence: project.description ?? `Project: ${project.name}`,
        })),
        keywords,
        suggestions,
        profile_source_hash: input.profileSourceHash,
        application_source_hash: input.applicationSourceHash,
        mode: "demo",
      };
    },

    async generateCoverLetter(input: CoverLetterInput): Promise<CoverLetterResult> {
      const { profile, application } = input;
      const hasName = Boolean(profile.preferredName?.trim());
      const hasMaterial = profile.experiences.length > 0 || profile.projects.length > 0;
      const hasRole = Boolean(application.company && application.job_title);

      if (!hasName || !hasMaterial || !hasRole) {
        const missing = [
          !hasName ? "your preferred name" : null,
          !hasMaterial ? "at least one experience or project" : null,
          !hasRole ? "a company and job title for this application" : null,
        ]
          .filter(Boolean)
          .join(", ");
        return {
          sufficient: false,
          prompt: `Add ${missing} to your profile to generate a cover letter.`,
          mode: "demo",
        };
      }

      const paragraphs: string[] = [
        `Dear Hiring Manager,`,
        `I am writing to apply for the ${application.job_title} role at ${application.company}. The position stood out to me because it focuses on ${
          application.responsibilities[0] ?? "building great software"
        }, which aligns closely with the work I have enjoyed most in my previous roles and projects. I believe my practical experience, technical skills, and enthusiasm for learning make me a strong fit for this co-op term.`,
      ];

      for (const experience of profile.experiences.slice(0, 3)) {
        const bullets = experience.bullet_points.slice(0, 3);
        paragraphs.push(
          `In my role as ${experience.title} at ${experience.organization}, I worked on real, production-facing work that maps directly to this position. ${
            bullets.length > 0
              ? bullets
                  .map(
                    (bullet) =>
                      `I ${bullet.charAt(0).toLowerCase()}${bullet.slice(1)}${bullet.endsWith(".") ? "" : "."}`,
                  )
                  .join(" ")
              : "I contributed to the team's day-to-day deliverables and learned how to ship reliable software in a professional environment."
          }`,
        );
      }

      for (const project of profile.projects.slice(0, 2)) {
        paragraphs.push(
          `Outside of work, I built ${project.name}${
            project.technologies.length > 0 ? ` using ${project.technologies.join(", ")}` : ""
          }. ${
            project.description
              ? `${project.description.charAt(0).toUpperCase()}${project.description.slice(1)}. `
              : ""
          }This project taught me to plan, build, and iterate on a complete solution, and it strengthened the habits I want to bring to ${application.company}.`,
        );
      }

      const education = profile.educations[0];
      if (education) {
        paragraphs.push(
          `I am currently pursuing ${education.degree} in ${education.program} at ${education.school}. My coursework and co-op experiences have given me a strong foundation in computer science fundamentals, and I am eager to apply them to real products during this work term.`,
        );
      }

      if (application.qualifications.length > 0) {
        paragraphs.push(
          `The posting mentions ${
            application.qualifications.length === 1
              ? application.qualifications[0]
              : application.qualifications.slice(0, -1).join(", ") +
                ", and " +
                application.qualifications[application.qualifications.length - 1]
          }. I am comfortable working in these areas and enjoy picking up new tools quickly when a project requires them.`,
        );
      }

      paragraphs.push(
        `I would welcome the chance to discuss how my experience and enthusiasm can contribute to ${application.company}'s team. I am available for an interview at your convenience and can provide examples of my work in more detail. Thank you for your time and consideration.`,
        `Sincerely,`,
        profile.preferredName ?? "",
      );

      return {
        sufficient: true,
        content: paragraphs.filter((line) => line.length > 0).join("\n\n"),
        mode: "demo",
      };
    },

    async generateInterviewPrep(input: InterviewPrepInput): Promise<InterviewPrepResult> {
      const exampleSource = (): string => {
        const first = input.experiences[0];
        const firstProject = input.projects[0];
        if (first) {
          return `Relevant example: ${first.title} at ${first.organization}${
            first.bullet_points[0] ? ` — ${first.bullet_points[0]}` : ""
          }.`;
        }
        if (firstProject) {
          return `Relevant example: project "${firstProject.name}"${
            firstProject.description ? ` — ${firstProject.description}` : ""
          }.`;
        }
        return "No relevant example available in your profile.";
      };

      const behavioural = [
        {
          question: "Tell me about a time you worked effectively in a team.",
          why: "Most co-op and internship roles require close collaboration.",
          relevant_experience: exampleSource(),
          outline: "1. Situation 2. Your role 3. Action 4. Result",
        },
        {
          question: "Describe a challenge you overcame in a project or role.",
          why: "Shows problem-solving and ownership.",
          relevant_experience: exampleSource(),
          outline: "1. Problem 2. Approach 3. Outcome 4. Lesson",
        },
        {
          question: "How do you manage your time when multiple deadlines overlap?",
          why: "Co-op terms often involve parallel deliverables.",
          relevant_experience: exampleSource(),
          outline: "1. Prioritization 2. Communication 3. Follow-through",
        },
      ];

      const technicalSkills: Array<{
        skill: { name: string; normalized_name: string };
        required: boolean;
      }> = [
        ...input.application.requiredSkills.map((skill) => ({ skill, required: true })),
        ...input.application.preferredSkills.map((skill) => ({ skill, required: false })),
      ].slice(0, 5);

      const technical = technicalSkills.map(({ skill, required }) => ({
        question: `Explain how you have used ${skill.name} in a real project or role.`,
        why: required
          ? `${skill.name} is listed as a required skill for this application.`
          : `${skill.name} is listed as a preferred skill for this application.`,
        relevant_experience: exampleSource(),
        outline: "1. Context 2. What you did 3. Outcome 4. What you learned",
      }));

      const researchChecklist = [
        `Research ${input.application.company}'s products and recent news.`,
        `Review the ${input.application.job_title} posting and note any terms you should clarify.`,
        "Prepare two questions about the team and the role.",
        ...(technicalSkills.length > 0
          ? [
              `Review the technologies in the posting: ${technicalSkills
                .map(({ skill }) => skill.name)
                .join(", ")}.`,
            ]
          : []),
      ];

      return {
        behavioural_questions: behavioural,
        technical_questions: technical,
        research_checklist: researchChecklist,
        mode: "demo",
      };
    },
  };
}
