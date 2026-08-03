import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui/toast";

const analyzeJob = vi.fn();
const replace = vi.fn();
const refresh = vi.fn();

vi.mock("@/features/applications/application-actions", () => ({
  analyzeJob: (...args: unknown[]) => analyzeJob(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

import { AddJobFlow } from "@/features/applications/add-job-flow";

function renderFlow() {
  return render(
    <ToastProvider>
      <AddJobFlow />
    </ToastProvider>,
  );
}

describe("AddJobFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks analysis with an empty description", async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole("button", { name: "Analyze" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/paste a job description/i);
    expect(analyzeJob).not.toHaveBeenCalled();
  });

  it("shows a recoverable error when analysis fails and keeps manual entry usable", async () => {
    analyzeJob.mockResolvedValue({ ok: false, error: "The analysis provider is unavailable." });
    const user = userEvent.setup();
    renderFlow();

    await user.type(screen.getByLabelText("Job description"), "A real job posting.");
    await user.click(screen.getByRole("button", { name: "Analyze" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The analysis provider is unavailable.",
    );
    expect(screen.getByRole("button", { name: /Skip analysis/ })).toBeEnabled();
  });

  it("shows the review form with the demo result after a successful analysis", async () => {
    analyzeJob.mockResolvedValue({
      ok: true,
      result: {
        company: "Example Tech Inc.",
        job_title: "Software Developer Co-op",
        location: null,
        country: null,
        work_arrangement: null,
        employment_type: null,
        work_term_duration: null,
        deadline: null,
        salary_text: null,
        education_requirements: [],
        years_of_experience: null,
        posting_url: "https://example.com/job",
        responsibilities: [],
        qualifications: [],
        original_description: "A real job posting.",
        mode: "demo",
      },
    });
    const user = userEvent.setup();
    renderFlow();

    await user.type(screen.getByLabelText("Job description"), "A real job posting.");
    await user.click(screen.getByRole("button", { name: "Analyze" }));

    expect(await screen.findByText(/Demo AI Response/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Example Tech Inc.")).toBeInTheDocument();
  });

  it("does not start a second analysis while one is running", async () => {
    let resolveAnalysis: (value: unknown) => void;
    analyzeJob.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAnalysis = resolve;
        }),
    );
    const user = userEvent.setup();
    renderFlow();

    await user.type(screen.getByLabelText("Job description"), "A real job posting.");
    await user.click(screen.getByRole("button", { name: "Analyze" }));

    // The submit control is disabled for the whole analysis, so a second
    // user action (Enter) cannot start another submission.
    const analyzingButton = screen.getByRole("button", { name: /Analyzing/ });
    expect(analyzingButton).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(analyzeJob).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveAnalysis!({
        ok: false,
        error: "failure",
      });
    });

    // The failure is surfaced and the flow returns to a recoverable state.
    expect(await screen.findByRole("alert")).toHaveTextContent("failure");
    expect(screen.getByRole("button", { name: "Analyze" })).toBeEnabled();
    expect(analyzeJob).toHaveBeenCalledTimes(1);
  });
});
