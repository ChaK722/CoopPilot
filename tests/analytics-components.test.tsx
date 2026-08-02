import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SummaryCards } from "@/features/analytics/summary-cards";
import { StatusChart } from "@/features/analytics/status-chart";
import { SubmissionsChart } from "@/features/analytics/submissions-chart";
import { SkillsChart } from "@/features/analytics/skills-chart";
import { ActionLists } from "@/features/analytics/action-lists";
import { AnalyticsErrorCard } from "@/features/analytics/analytics-error-card";
import type {
  AnalyticsSummary,
  RequiringActionItem,
  TopSkill,
} from "@/features/analytics/analytics-types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const SUMMARY: AnalyticsSummary = {
  total: 6,
  active: 3,
  interviews: 2,
  offers: 1,
  applied_denominator: 5,
  upcoming_deadlines: 4,
  interview_rate: 40,
  offer_rate: 20,
};

const EMPTY_SUMMARY: AnalyticsSummary = {
  total: 0,
  active: 0,
  interviews: 0,
  offers: 0,
  applied_denominator: 0,
  upcoming_deadlines: 0,
  interview_rate: null,
  offer_rate: null,
};

const STATUS_COUNTS = [
  { status: "saved" as const, count: 2 },
  { status: "preparing" as const, count: 0 },
  { status: "applied" as const, count: 1 },
  { status: "interview" as const, count: 1 },
  { status: "offer" as const, count: 1 },
  { status: "rejected" as const, count: 1 },
  { status: "withdrawn" as const, count: 0 },
];

const SKILLS: TopSkill[] = [
  {
    normalized_name: "typescript",
    name: "TypeScript",
    total_count: 3,
    required_count: 2,
    preferred_count: 1,
  },
];

describe("SummaryCards", () => {
  it("shows all seven metric values", () => {
    render(<SummaryCards summary={SUMMARY} />);
    expect(screen.getByText("Total applications")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("Active applications")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Interviews")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Offers")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Upcoming deadlines")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByText("20%")).toBeInTheDocument();
  });

  it("shows em dashes and helper text when rates are null", () => {
    render(<SummaryCards summary={EMPTY_SUMMARY} />);
    const dashes = screen.getAllByText("—");
    expect(dashes).toHaveLength(2);
    expect(screen.getAllByText("No applied applications yet")).toHaveLength(2);
  });

  it("explains that interviews/offers count applications that ever reached the stage", () => {
    render(<SummaryCards summary={SUMMARY} />);
    expect(screen.getByText("Applications that ever reached Interview")).toBeInTheDocument();
    expect(screen.getByText("Applications that ever reached Offer")).toBeInTheDocument();
  });
});

describe("StatusChart", () => {
  it("renders text labels, values, and an accessible summary", () => {
    render(<StatusChart counts={STATUS_COUNTS} />);
    const figure = screen.getByRole("figure");
    expect(within(figure).getByText("Applications by status")).toBeInTheDocument();
    expect(within(figure).getByText("Saved")).toBeInTheDocument();
    expect(within(figure).getByText("Total: 6")).toBeInTheDocument();
    expect(screen.getByLabelText("Interview: 1 applications (17% of total)")).toBeInTheDocument();
  });

  it("shows an explicit empty state without fake bars", () => {
    render(<StatusChart counts={STATUS_COUNTS.map((item) => ({ ...item, count: 0 }))} />);
    expect(screen.getByText("No applications yet")).toBeInTheDocument();
    expect(screen.queryByText("Total: 0")).not.toBeInTheDocument();
  });
});

describe("SubmissionsChart", () => {
  it("renders month labels and visible counts", () => {
    render(<SubmissionsChart months={[{ month: "2026-07", count: 3 }]} />);
    expect(screen.getByText("Applications submitted over time")).toBeInTheDocument();
    expect(screen.getByText("Jul 2026")).toBeInTheDocument();
    expect(screen.getByLabelText("Jul 2026: 3 applications")).toBeInTheDocument();
  });

  it("shows an empty state when there are no submissions", () => {
    render(<SubmissionsChart months={[]} />);
    expect(screen.getByText("No submitted applications yet")).toBeInTheDocument();
  });
});

describe("SkillsChart", () => {
  it("renders skill names and counts as text", () => {
    render(<SkillsChart skills={SKILLS} />);
    expect(screen.getByText("Most requested skills")).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("3 apps · 2 req · 1 pref")).toBeInTheDocument();
  });

  it("shows an empty state", () => {
    render(<SkillsChart skills={[]} />);
    expect(screen.getByText("No skills found yet")).toBeInTheDocument();
  });
});

describe("ActionLists", () => {
  const action: RequiringActionItem[] = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      company: "Acme",
      job_title: "Intern",
      status: "saved",
      deadline: "2026-08-01",
      updated_at: "2026-08-01T00:00:00.000Z",
      reason: "Deadline passed",
    },
  ];

  it("links every list item to the correct job detail page", () => {
    render(
      <ActionLists
        upcoming={[
          {
            id: "22222222-2222-4222-8222-222222222222",
            company: "Beta",
            job_title: "Co-op",
            deadline: "2026-08-05",
            updated_at: "2026-08-01T00:00:00.000Z",
          },
        ]}
        recent={[
          {
            id: "33333333-3333-4333-8333-333333333333",
            company: "Gamma",
            job_title: "Dev",
            status: "applied",
            updated_at: "2026-08-01T00:00:00.000Z",
          },
        ]}
        action={action}
      />,
    );
    expect(screen.getByRole("link", { name: /Acme — Intern/ }).getAttribute("href")).toBe(
      "/applications/11111111-1111-4111-8111-111111111111",
    );
    expect(screen.getByRole("link", { name: /Beta — Co-op/ }).getAttribute("href")).toBe(
      "/applications/22222222-2222-4222-8222-222222222222",
    );
    expect(screen.getByRole("link", { name: /Gamma — Dev/ }).getAttribute("href")).toBe(
      "/applications/33333333-3333-4333-8333-333333333333",
    );
    expect(screen.getByText("Deadline passed")).toBeInTheDocument();
  });

  it("shows semantic empty states for all three lists", () => {
    render(<ActionLists upcoming={[]} recent={[]} action={[]} />);
    expect(screen.getByText("No upcoming deadlines")).toBeInTheDocument();
    expect(screen.getByText("No applications yet")).toBeInTheDocument();
    expect(screen.getByText("Nothing needs attention")).toBeInTheDocument();
  });
});

describe("AnalyticsErrorCard", () => {
  it("shows only the safe message", () => {
    render(<AnalyticsErrorCard message="Could not load your dashboard. Please try again." />);
    expect(
      screen.getByText("Could not load your dashboard. Please try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText(/stack|SQL|error:/i)).not.toBeInTheDocument();
  });
});
