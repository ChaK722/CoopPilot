import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApplicationsTable } from "@/features/applications/applications-table";
import { ApplicationBoard, type BoardApplication } from "@/features/applications/board";
import { ActionLists } from "@/features/analytics/action-lists";
import { CoverLetterSection, type CoverLetterRow } from "@/features/ai/cover-letter-section";
import { ToastProvider } from "@/components/ui/toast";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const XSS_NAME = '<img src=x onerror="window.__xss = true">';
const XSS_SCRIPT = "<script>window.__xss = true</script>";

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__xss;
});

describe("script-like text renders as plain text", () => {
  it("does not execute script-like company/job titles in the applications table", () => {
    render(
      <ApplicationsTable
        rows={[
          {
            id: "app-1",
            company: XSS_NAME,
            job_title: XSS_SCRIPT,
            location: "Toronto",
            deadline: null,
            date_applied: null,
            status: "saved",
            updated_at: "2026-08-01T00:00:00.000Z",
            archived_at: null,
          },
        ]}
      />,
    );
    expect(screen.getByText(XSS_NAME)).toBeInTheDocument();
    expect(screen.getByText(XSS_SCRIPT)).toBeInTheDocument();
    expect((window as unknown as Record<string, unknown>).__xss).toBeUndefined();
  });

  it("does not execute script-like text on board cards", () => {
    const app: BoardApplication = {
      id: "app-1",
      company: XSS_NAME,
      job_title: XSS_SCRIPT,
      location: "Toronto",
      deadline: null,
      date_applied: null,
      latest_match_score: null,
      status: "saved",
      updated_at: "2026-08-01T00:00:00.000Z",
      archived_at: null,
    };
    render(
      <ToastProvider>
        <ApplicationBoard initial={[app]} today="2026-08-02" />
      </ToastProvider>,
    );
    expect(screen.getByText(XSS_NAME)).toBeInTheDocument();
    expect(screen.getByText(XSS_SCRIPT)).toBeInTheDocument();
    expect((window as unknown as Record<string, unknown>).__xss).toBeUndefined();
  });

  it("does not execute script-like text in analytics lists", () => {
    render(
      <ActionLists
        upcoming={[
          {
            id: "app-1",
            company: XSS_NAME,
            job_title: XSS_SCRIPT,
            deadline: "2026-08-05",
            updated_at: "2026-08-01T00:00:00.000Z",
          },
        ]}
        recent={[]}
        action={[]}
      />,
    );
    const link = screen.getByRole("link", { name: new RegExp(XSS_NAME) });
    expect(link.textContent).toContain(XSS_NAME);
    expect(link.textContent).toContain(XSS_SCRIPT);
    expect((window as unknown as Record<string, unknown>).__xss).toBeUndefined();
  });

  it("renders script-like cover letter content as a plain textarea value", () => {
    const row: CoverLetterRow = {
      id: "cl1",
      version: 1,
      content_text: XSS_SCRIPT,
      generation_mode: "demo",
      user_edited: false,
      created_at: "2026-08-01T00:00:00.000Z",
    };
    render(
      <ToastProvider>
        <CoverLetterSection current={row} versions={[row]} applicationId="app-1" />
      </ToastProvider>,
    );
    const textarea = screen.getByLabelText("Cover letter") as HTMLTextAreaElement;
    expect(textarea.value).toBe(XSS_SCRIPT);
    expect((window as unknown as Record<string, unknown>).__xss).toBeUndefined();
  });
});
