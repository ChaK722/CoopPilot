import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ToastProvider } from "@/components/ui/toast";

const updateApplicationStatus = vi.fn();

vi.mock("@/features/applications/application-actions", () => ({
  updateApplicationStatus: (...args: unknown[]) => updateApplicationStatus(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ApplicationBoard, type BoardApplication } from "@/features/applications/board";

const TODAY = "2026-08-02";

function app(overrides: Partial<BoardApplication>): BoardApplication {
  return {
    id: "app-1",
    company: "Acme",
    job_title: "Intern",
    location: "Toronto",
    deadline: null,
    date_applied: null,
    status: "saved",
    updated_at: "2026-08-02T00:00:00.000Z",
    archived_at: null,
    ...overrides,
  };
}

function renderBoard(initial: BoardApplication[]) {
  return render(
    <ToastProvider>
      <ApplicationBoard initial={initial} today={TODAY} />
    </ToastProvider>,
  );
}

describe("ApplicationBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateApplicationStatus.mockResolvedValue({ ok: true });
  });

  it("renders each application in exactly one correct column", () => {
    const apps = [
      app({ id: "a", status: "saved" }),
      app({ id: "b", status: "applied", company: "Beta" }),
      app({ id: "c", status: "offer", company: "Gamma" }),
    ];
    renderBoard(apps);

    const savedColumn = screen.getByRole("region", { name: /Saved column/ });
    const appliedColumn = screen.getByRole("region", { name: /Applied column/ });
    const offerColumn = screen.getByRole("region", { name: /Offer column/ });

    expect(within(savedColumn).getByText("Acme")).toBeInTheDocument();
    expect(within(savedColumn).queryByText("Beta")).not.toBeInTheDocument();
    expect(within(appliedColumn).getByText("Beta")).toBeInTheDocument();
    expect(within(offerColumn).getByText("Gamma")).toBeInTheDocument();
  });

  it("shows counts that match the rendered cards", () => {
    renderBoard([app({ id: "a" }), app({ id: "b" }), app({ id: "c", status: "preparing" })]);

    const savedColumn = screen.getByRole("region", { name: /Saved column/ });
    expect(within(savedColumn).getByText("2")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: /Preparing column/ })).getByText("1"),
    ).toBeInTheDocument();
  });

  it("shows a usable empty state for empty columns", () => {
    renderBoard([]);
    expect(screen.getAllByText("No applications here yet").length).toBe(7);
  });

  it("links each card to its job detail page", () => {
    renderBoard([app({ id: "app-xyz" })]);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/applications/app-xyz");
  });

  it("shows an expired-unapplied warning only for saved/preparing", () => {
    renderBoard([
      app({ id: "a", deadline: "2026-08-01", status: "saved" }),
      app({ id: "b", deadline: "2026-08-01", status: "applied", company: "Beta" }),
      app({ id: "c", deadline: "2026-08-05", status: "saved", company: "Gamma" }),
    ]);
    expect(screen.getByText("Deadline passed")).toBeInTheDocument();
    expect(screen.getAllByText("Deadline passed")).toHaveLength(1);
    expect(screen.getByText("Deadline 2026-08-05")).toBeInTheDocument();
  });

  it("changes status optimistically through the selector", async () => {
    renderBoard([app({ id: "a" })]);

    const select = screen.getByRole("combobox", { name: /Status for Acme/ });
    fireEvent.change(select, { target: { value: "interview" } });

    expect(updateApplicationStatus).toHaveBeenCalledWith("a", "interview", null);
    expect(
      within(screen.getByRole("region", { name: /Interview column/ })).getByText("Acme"),
    ).toBeInTheDocument();
  });

  it("rolls back and announces when a status update fails", async () => {
    updateApplicationStatus.mockResolvedValue({ ok: false, error: "Could not update status." });
    renderBoard([app({ id: "a" })]);

    const select = screen.getByRole("combobox", { name: /Status for Acme/ });
    fireEvent.change(select, { target: { value: "offer" } });
    expect((await screen.findAllByText(/Could not update status/)).length).toBeGreaterThan(0);

    // Card is back in the saved column.
    expect(
      within(screen.getByRole("region", { name: /Saved column/ })).getByText("Acme"),
    ).toBeInTheDocument();
    // Failure is announced through the live region.
    expect(
      screen
        .getAllByRole("status")
        .some((node) => node.textContent?.includes("Could not update status.")),
    ).toBe(true);
  });

  it("shows the applied date prompt and saves the chosen date", async () => {
    renderBoard([app({ id: "a" })]);

    const select = screen.getByRole("combobox", { name: /Status for Acme/ });
    fireEvent.change(select, { target: { value: "applied" } });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    const dateInput = screen.getByLabelText("Date applied");
    fireEvent.change(dateInput, { target: { value: "2026-08-02" } });
    fireEvent.click(screen.getByRole("button", { name: "Save date" }));

    expect(updateApplicationStatus).toHaveBeenCalledWith("a", "applied", "2026-08-02");
  });

  it("supports skipping the applied date prompt", async () => {
    renderBoard([app({ id: "a" })]);

    const select = screen.getByRole("combobox", { name: /Status for Acme/ });
    fireEvent.change(select, { target: { value: "applied" } });
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    expect(updateApplicationStatus).toHaveBeenCalledWith("a", "applied", null);
  });

  it("cancels the applied date prompt without changing status", async () => {
    renderBoard([app({ id: "a" })]);

    const select = screen.getByRole("combobox", { name: /Status for Acme/ });
    fireEvent.change(select, { target: { value: "applied" } });
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(updateApplicationStatus).not.toHaveBeenCalled();
    expect(
      within(screen.getByRole("region", { name: /Saved column/ })).getByText("Acme"),
    ).toBeInTheDocument();
  });

  it("does not prompt again when a date already exists", async () => {
    renderBoard([app({ id: "a", date_applied: "2026-08-01" })]);

    const select = screen.getByRole("combobox", { name: /Status for Acme/ });
    fireEvent.change(select, { target: { value: "applied" } });

    expect(updateApplicationStatus).toHaveBeenCalledWith("a", "applied", null);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
