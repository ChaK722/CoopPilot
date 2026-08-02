import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui/toast";

const actions = vi.hoisted(() => ({
  generateMatchAnalysis: vi.fn(),
  generateCoverLetter: vi.fn(),
  generateInterviewPrep: vi.fn(),
  saveCoverLetterEdit: vi.fn(),
  restoreCoverLetterVersion: vi.fn(),
}));

vi.mock("@/features/ai/ai-actions", () => actions);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { MatchSection, type MatchRow } from "@/features/ai/match-section";
import { CoverLetterSection, type CoverLetterRow } from "@/features/ai/cover-letter-section";
import {
  InterviewPrepSection,
  type PrepQuestion,
  type PrepRow,
} from "@/features/ai/interview-prep-section";

const match: MatchRow = {
  id: "m1",
  overall_score: 80,
  score_breakdown: {
    required_skills: { score: 40, max: 40, explanation: "hit" },
    preferred_skills: { score: 10, max: 20, explanation: "half" },
    relevant_experience: { score: 20, max: 20, explanation: "yes" },
    education: { score: 10, max: 10, explanation: "yes" },
    location_availability: { score: 0, max: 10, explanation: "no" },
  },
  matching_skills: [{ name: "TypeScript", evidence: "profile" }],
  missing_required_skills: [],
  missing_preferred_skills: ["AWS"],
  matching_experience: [],
  relevant_projects: [],
  keywords: ["TypeScript"],
  suggestions: ["Highlight real results"],
  generation_mode: "demo",
  generated_at: "2026-08-02T00:00:00.000Z",
};

const coverLetter: CoverLetterRow = {
  id: "cl1",
  version: 1,
  content_text: "Dear Hiring Manager,\n\nI am applying.",
  generation_mode: "demo",
  user_edited: false,
  created_at: "2026-08-02T00:00:00.000Z",
};

const question: PrepQuestion = {
  question: "Explain how you have used TypeScript.",
  why: "Listed as required.",
  relevant_experience: "Relevant example: Intern at Acme.",
  outline: "1. Context",
};

const prepRow: PrepRow = {
  id: "p1",
  version: 1,
  content_json: { questions: [question] },
  generation_mode: "demo",
  created_at: "2026-08-02T00:00:00.000Z",
};

function wrap(node: React.ReactNode) {
  return <ToastProvider>{node}</ToastProvider>;
}

describe("MatchSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.generateMatchAnalysis.mockResolvedValue({ ok: true });
  });

  it("shows a generate action with Demo label when empty", async () => {
    const user = userEvent.setup();
    render(wrap(<MatchSection applicationId="app-1" match={null} stale={false} />));
    await user.click(screen.getByRole("button", { name: "Generate match analysis" }));
    expect(actions.generateMatchAnalysis).toHaveBeenCalledWith("app-1", expect.any(String));
  });

  it("renders the score, breakdown, missing skills, and suggestions", () => {
    render(wrap(<MatchSection applicationId="app-1" match={match} stale={false} />));
    expect(screen.getByText("80/100")).toBeInTheDocument();
    expect(screen.getByText("Required skills")).toBeInTheDocument();
    expect(screen.getByText("AWS")).toBeInTheDocument();
    expect(screen.getByText(/Highlight real results/)).toBeInTheDocument();
    expect(screen.getByText(/Demo AI Response/)).toBeInTheDocument();
  });

  it("shows a stale warning when the source hashes changed", () => {
    render(wrap(<MatchSection applicationId="app-1" match={match} stale={true} />));
    expect(screen.getByText(/has changed since this analysis/)).toBeInTheDocument();
  });

  it("shows a recoverable error when generation fails", async () => {
    actions.generateMatchAnalysis.mockResolvedValue({ ok: false, error: "AI unavailable." });
    const user = userEvent.setup();
    render(wrap(<MatchSection applicationId="app-1" match={null} stale={false} />));
    await user.click(screen.getByRole("button", { name: "Generate match analysis" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("AI unavailable.");
  });
});

describe("CoverLetterSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.generateCoverLetter.mockResolvedValue({ ok: true });
    actions.saveCoverLetterEdit.mockResolvedValue({ ok: true });
    actions.restoreCoverLetterVersion.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates a letter when none exists", async () => {
    const user = userEvent.setup();
    render(wrap(<CoverLetterSection applicationId="app-1" current={null} versions={[]} />));
    await user.click(screen.getByRole("button", { name: "Generate cover letter" }));
    expect(actions.generateCoverLetter).toHaveBeenCalledWith("app-1", expect.any(String));
  });

  it("shows an actionable error when the profile is insufficient", async () => {
    actions.generateCoverLetter.mockResolvedValue({
      ok: false,
      error: "Add at least one experience or project to your profile to generate a cover letter.",
    });
    const user = userEvent.setup();
    render(wrap(<CoverLetterSection applicationId="app-1" current={null} versions={[]} />));
    await user.click(screen.getByRole("button", { name: "Generate cover letter" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Add at least one experience/);
  });

  it("edits and saves the letter as a new version", async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <CoverLetterSection applicationId="app-1" current={coverLetter} versions={[coverLetter]} />,
      ),
    );
    const textarea = screen.getByLabelText("Cover letter");
    await user.clear(textarea);
    await user.type(textarea, "Edited content");
    await user.click(screen.getByRole("button", { name: "Save edits" }));
    await waitFor(() =>
      expect(actions.saveCoverLetterEdit).toHaveBeenCalledWith("app-1", {
        content: "Edited content",
      }),
    );
  });

  it("copies the letter with success feedback", async () => {
    const writeTextSpy = vi
      .spyOn(window.navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      wrap(
        <CoverLetterSection applicationId="app-1" current={coverLetter} versions={[coverLetter]} />,
      ),
    );
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeTextSpy).toHaveBeenCalledWith(coverLetter.content_text);
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(await screen.findByText("Copied to clipboard.")).toBeInTheDocument();
  });

  it("shows explicit failure feedback when copying fails", async () => {
    vi.spyOn(window.navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    const user = userEvent.setup();
    render(
      wrap(
        <CoverLetterSection applicationId="app-1" current={coverLetter} versions={[coverLetter]} />,
      ),
    );
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByText("Could not copy to clipboard.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copied" })).not.toBeInTheDocument();
  });

  it("restores a previous version from the history", async () => {
    const user = userEvent.setup();
    const edited: CoverLetterRow = { ...coverLetter, id: "cl2", version: 2, user_edited: true };
    render(
      wrap(
        <CoverLetterSection
          applicationId="app-1"
          current={edited}
          versions={[coverLetter, edited]}
        />,
      ),
    );
    await user.click(screen.getByRole("button", { name: /v1/ }));
    expect(actions.restoreCoverLetterVersion).toHaveBeenCalledWith("app-1", 1);
  });

  it("warns before regenerating when the current version is edited", async () => {
    const user = userEvent.setup();
    const edited: CoverLetterRow = { ...coverLetter, id: "cl2", version: 2, user_edited: true };
    render(
      wrap(
        <CoverLetterSection
          applicationId="app-1"
          current={edited}
          versions={[coverLetter, edited]}
        />,
      ),
    );
    await user.click(screen.getByRole("button", { name: "Regenerate" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Regenerate" }));
    expect(actions.generateCoverLetter).toHaveBeenCalled();
  });
});

describe("InterviewPrepSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.generateInterviewPrep.mockResolvedValue({ ok: true });
  });

  it("generates prep when nothing exists", async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <InterviewPrepSection
          applicationId="app-1"
          behavioural={null}
          technical={null}
          research={null}
        />,
      ),
    );
    await user.click(screen.getByRole("button", { name: "Generate interview prep" }));
    expect(actions.generateInterviewPrep).toHaveBeenCalledWith("app-1", expect.any(String));
  });

  it("renders behavioural questions, technical questions, and the checklist", () => {
    render(
      wrap(
        <InterviewPrepSection
          applicationId="app-1"
          behavioural={prepRow}
          technical={prepRow}
          research={{ ...prepRow, content_json: { items: ["Research Acme."] } }}
        />,
      ),
    );
    expect(screen.getByText("Behavioural questions")).toBeInTheDocument();
    expect(screen.getByText("Technical questions")).toBeInTheDocument();
    expect(screen.getByText("Research checklist")).toBeInTheDocument();
    expect(screen.getAllByText(/Explain how you have used TypeScript/).length).toBeGreaterThan(0);
    expect(screen.getByText("Research Acme.")).toBeInTheDocument();
  });
});
