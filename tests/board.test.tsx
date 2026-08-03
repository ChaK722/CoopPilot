import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui/toast";

const updateApplicationStatus = vi.fn();
const refresh = vi.fn();

vi.mock("@/features/applications/application-actions", () => ({
  updateApplicationStatus: (...args: unknown[]) => updateApplicationStatus(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
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
    latest_match_score: null,
    status: "saved",
    updated_at: "2026-08-02T00:00:00.000Z",
    archived_at: null,
    ...overrides,
  };
}

function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function column(status: string) {
  return screen.getByRole("region", { name: new RegExp(`${status} column`) });
}

function renderBoard(initial: BoardApplication[]) {
  return render(
    <ToastProvider>
      <ApplicationBoard initial={initial} today={TODAY} />
    </ToastProvider>,
  );
}

function acmeSelect() {
  return screen.getByRole("combobox", { name: /Status for Acme/ });
}

describe("ApplicationBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateApplicationStatus.mockResolvedValue({ ok: true });
  });

  it("renders each application in exactly one correct column", () => {
    renderBoard([
      app({ id: "a", status: "saved" }),
      app({ id: "b", status: "applied", company: "Beta" }),
      app({ id: "c", status: "offer", company: "Gamma" }),
    ]);
    expect(within(column("Saved")).getByText("Acme")).toBeInTheDocument();
    expect(within(column("Saved")).queryByText("Beta")).not.toBeInTheDocument();
    expect(within(column("Applied")).getByText("Beta")).toBeInTheDocument();
    expect(within(column("Offer")).getByText("Gamma")).toBeInTheDocument();
  });

  it("shows counts that match the rendered cards", () => {
    renderBoard([app({ id: "a" }), app({ id: "b" }), app({ id: "c", status: "preparing" })]);
    expect(within(column("Saved")).getByText("2")).toBeInTheDocument();
    expect(within(column("Preparing")).getByText("1")).toBeInTheDocument();
  });

  it("shows a usable empty state for empty columns", () => {
    renderBoard([]);
    expect(screen.getAllByText("No applications here yet").length).toBe(7);
  });

  it("links each card to its job detail page", () => {
    renderBoard([app({ id: "app-xyz" })]);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/applications/app-xyz");
  });

  describe("deadline display", () => {
    it("always shows the concrete deadline date when present", () => {
      renderBoard([
        app({ id: "a", deadline: "2026-08-10" }), // 8 days out: no badge, but date shown
        app({ id: "b", deadline: "2026-08-01", company: "Beta" }), // expired, saved
        app({ id: "c", deadline: "2026-08-05", company: "Gamma" }), // upcoming
      ]);
      expect(within(column("Saved")).getByText("Deadline: 2026-08-10")).toBeInTheDocument();
      expect(within(column("Saved")).getByText("Deadline: 2026-08-01")).toBeInTheDocument();
      expect(within(column("Saved")).getByText("Deadline: 2026-08-05")).toBeInTheDocument();
    });

    it("shows a placeholder when there is no deadline", () => {
      renderBoard([app({ id: "a", deadline: null })]);
      expect(within(column("Saved")).getByText("Deadline: —")).toBeInTheDocument();
    });

    it("keeps badges as additional hints without replacing the date", () => {
      renderBoard([
        app({ id: "a", deadline: "2026-08-01" }), // expired-unapplied
        app({ id: "b", deadline: "2026-08-05", company: "Beta" }), // upcoming
      ]);
      expect(within(column("Saved")).getByText("Deadline passed")).toBeInTheDocument();
      expect(within(column("Saved")).getByText("Deadline: 2026-08-01")).toBeInTheDocument();
      expect(within(column("Saved")).getByText("Upcoming")).toBeInTheDocument();
      expect(within(column("Saved")).getByText("Deadline: 2026-08-05")).toBeInTheDocument();
    });

    it("does not show the unapplied warning for applied-stage records", () => {
      renderBoard([app({ id: "a", deadline: "2026-08-01", status: "applied" })]);
      expect(screen.queryByText("Deadline passed")).not.toBeInTheDocument();
      expect(within(column("Applied")).getByText("Deadline: 2026-08-01")).toBeInTheDocument();
    });
  });

  describe("latest match score", () => {
    it("shows the latest match score when one exists", () => {
      renderBoard([app({ id: "a", latest_match_score: 78 })]);
      expect(screen.getByText("Match: 78/100")).toBeInTheDocument();
    });

    it("shows a real score of zero but omits the row entirely when there is no score", () => {
      renderBoard([
        app({ id: "a", company: "Alpha", latest_match_score: null }),
        app({ id: "b", company: "Beta", latest_match_score: 0 }),
      ]);
      expect(screen.getByText("Match: 0/100")).toBeInTheDocument();
      expect(screen.queryByText(/Match:/)).not.toBeNull();
      const alphaCard = screen.getByRole("link", { name: /Alpha/ }).closest("div");
      expect(alphaCard?.textContent).not.toContain("Match:");
    });

    it("keeps multiple cards independent", () => {
      renderBoard([
        app({ id: "a", company: "Alpha", latest_match_score: 78 }),
        app({ id: "b", company: "Beta", latest_match_score: 42 }),
      ]);
      expect(screen.getByText("Match: 78/100")).toBeInTheDocument();
      expect(screen.getByText("Match: 42/100")).toBeInTheDocument();
    });
  });

  describe("drag handle", () => {
    it("uses an independent button handle with an accessible name", () => {
      renderBoard([app({ id: "a", company: "Acme", job_title: "Software Developer" })]);
      const handle = screen.getByRole("button", { name: "Move Acme — Software Developer" });
      expect(handle.tagName).toBe("BUTTON");
    });

    it("does not turn the card container into a draggable button", () => {
      renderBoard([app({ id: "a" })]);
      const card = screen.getByRole("link").closest("div");
      expect(card?.getAttribute("role")).not.toBe("button");
      expect(card?.getAttribute("tabindex")).toBeNull();
    });

    it("keeps the link and selector independent from drag listeners", async () => {
      const user = userEvent.setup();
      renderBoard([app({ id: "a" })]);
      const link = screen.getByRole("link");
      const select = screen.getByRole("combobox", { name: /Status for Acme/ });

      // Prevent jsdom's default navigation so the click only exercises the
      // link's accessible behaviour (the real app intercepts navigation).
      link.addEventListener("click", (event) => event.preventDefault());
      await user.click(link);
      expect(link.getAttribute("href")).toBe("/applications/a");

      await user.selectOptions(select, "preparing");
      await waitFor(() =>
        expect(updateApplicationStatus).toHaveBeenCalledWith("a", "preparing", null),
      );
      // Select interaction must not have started a drag (no throw, no drag overlay).
      expect(screen.getByRole("combobox", { name: /Status for Acme/ })).toBeInTheDocument();
    });

    it("disables the handle while the card is pending", async () => {
      const pending = deferred();
      updateApplicationStatus.mockReturnValue(pending.promise);
      const user = userEvent.setup();
      renderBoard([app({ id: "a" })]);

      await user.selectOptions(
        screen.getByRole("combobox", { name: /Status for Acme/ }),
        "interview",
      );
      const handle = screen.getByRole("button", { name: "Move Acme — Intern" });
      expect(handle).toBeDisabled();
      expect(screen.getByRole("combobox", { name: /Status for Acme/ })).toBeDisabled();
      pending.resolve({ ok: true });
      await waitFor(() => expect(handle).toBeEnabled());
    });
  });

  describe("status changes and concurrency", () => {
    it("changes status optimistically through the selector", async () => {
      const user = userEvent.setup();
      renderBoard([app({ id: "a" })]);

      await user.selectOptions(
        screen.getByRole("combobox", { name: /Status for Acme/ }),
        "interview",
      );
      await waitFor(() =>
        expect(updateApplicationStatus).toHaveBeenCalledWith("a", "interview", null),
      );
      expect(within(column("Interview")).getByText("Acme")).toBeInTheDocument();
    });

    it("rolls back only the failing card when another card succeeds", async () => {
      const pendingA = deferred();
      const pendingB = deferred();
      updateApplicationStatus.mockImplementation((id: string) =>
        id === "a" ? pendingA.promise : pendingB.promise,
      );
      const user = userEvent.setup();
      renderBoard([app({ id: "a", company: "Alpha" }), app({ id: "b", company: "Beta" })]);

      const selectA = screen.getByRole("combobox", { name: /Status for Alpha/ });
      const selectB = screen.getByRole("combobox", { name: /Status for Beta/ });
      await user.selectOptions(selectA, "offer");
      await user.selectOptions(selectB, "interview");

      // B succeeds first, then A fails.
      pendingB.resolve({ ok: true });
      await waitFor(() =>
        expect(within(column("Interview")).getByText("Beta")).toBeInTheDocument(),
      );
      pendingA.resolve({ ok: false, error: "Boom" });
      await waitFor(() => expect(within(column("Saved")).getByText("Alpha")).toBeInTheDocument());

      // B keeps its successful optimistic state; counts are per-record.
      expect(within(column("Interview")).getByText("Beta")).toBeInTheDocument();
      expect(within(column("Saved")).queryByText("Beta")).not.toBeInTheDocument();
      expect(within(column("Offer")).queryByText("Alpha")).not.toBeInTheDocument();
      expect(within(column("Saved")).getByText("1")).toBeInTheDocument();
      expect(within(column("Interview")).getByText("1")).toBeInTheDocument();
    });

    it("does not block one card because another card is pending", async () => {
      const pendingA = deferred();
      updateApplicationStatus.mockImplementation((id: string) =>
        id === "a" ? pendingA.promise : Promise.resolve({ ok: true }),
      );
      const user = userEvent.setup();
      renderBoard([app({ id: "a", company: "Alpha" }), app({ id: "b", company: "Beta" })]);

      await user.selectOptions(screen.getByRole("combobox", { name: /Status for Alpha/ }), "offer");
      await user.selectOptions(
        screen.getByRole("combobox", { name: /Status for Beta/ }),
        "interview",
      );

      await waitFor(() =>
        expect(updateApplicationStatus).toHaveBeenCalledWith("b", "interview", null),
      );
      pendingA.resolve({ ok: true });
      await waitFor(() => expect(within(column("Offer")).getByText("Alpha")).toBeInTheDocument());
    });

    it("blocks repeated submissions for the same card while pending", async () => {
      const pending = deferred();
      updateApplicationStatus.mockReturnValue(pending.promise);
      const user = userEvent.setup();
      renderBoard([app({ id: "a" })]);

      await user.selectOptions(acmeSelect(), "interview");
      await waitFor(() => expect(acmeSelect()).toBeDisabled());
      const handle = screen.getByRole("button", { name: "Move Acme — Intern" });
      expect(handle).toBeDisabled();

      await user.selectOptions(acmeSelect(), "offer").catch(() => undefined);

      expect(updateApplicationStatus).toHaveBeenCalledTimes(1);
      await act(async () => {
        pending.resolve({ ok: true });
      });
      await waitFor(() => expect(acmeSelect()).toBeEnabled());
    });

    it("synchronizes with new initial props when nothing is pending", async () => {
      const { rerender } = renderBoard([app({ id: "a" })]);
      rerender(
        <ToastProvider>
          <ApplicationBoard
            initial={[app({ id: "a", status: "applied", company: "Acme" })]}
            today={TODAY}
          />
        </ToastProvider>,
      );
      await waitFor(() => expect(within(column("Applied")).getByText("Acme")).toBeInTheDocument());
    });

    it("keeps optimistic state when new props arrive during a pending mutation", async () => {
      const pending = deferred();
      updateApplicationStatus.mockReturnValue(pending.promise);
      const user = userEvent.setup();
      const { rerender } = renderBoard([app({ id: "a" })]);

      await user.selectOptions(acmeSelect(), "interview");
      await waitFor(() =>
        expect(within(column("Interview")).getByText("Acme")).toBeInTheDocument(),
      );
      // Server payload arrives with the old status while the mutation is in flight.
      rerender(
        <ToastProvider>
          <ApplicationBoard initial={[app({ id: "a", status: "saved" })]} today={TODAY} />
        </ToastProvider>,
      );
      expect(within(column("Interview")).getByText("Acme")).toBeInTheDocument();
      await act(async () => {
        pending.resolve({ ok: true });
      });
      await waitFor(() => expect(acmeSelect()).toBeEnabled());
    });

    it("re-sorts by updated_at DESC then id ASC after a successful refresh payload", async () => {
      const { rerender } = renderBoard([
        app({ id: "a", company: "Alpha", updated_at: "2026-08-01T00:00:00.000Z" }),
        app({ id: "b", company: "Beta", updated_at: "2026-08-01T00:00:00.000Z" }),
        app({ id: "c", company: "Gamma", updated_at: "2026-08-02T00:00:00.000Z" }),
      ]);
      rerender(
        <ToastProvider>
          <ApplicationBoard
            initial={[
              app({ id: "b", company: "Beta", updated_at: "2026-08-03T00:00:00.000Z" }),
              app({ id: "a", company: "Alpha", updated_at: "2026-08-01T00:00:00.000Z" }),
              app({ id: "c", company: "Gamma", updated_at: "2026-08-02T00:00:00.000Z" }),
            ]}
            today={TODAY}
          />
        </ToastProvider>,
      );
      await waitFor(() => {
        const cards = within(column("Saved")).getAllByRole("link");
        expect(cards.map((card) => card.textContent)).toEqual([
          expect.stringContaining("Beta"),
          expect.stringContaining("Gamma"),
          expect.stringContaining("Alpha"),
        ]);
      });
    });
  });

  describe("applied date prompt", () => {
    it("opens empty each time and does not leak dates between applications", async () => {
      const user = userEvent.setup();
      renderBoard([app({ id: "a", company: "Alpha" }), app({ id: "b", company: "Beta" })]);

      // Open for Alpha, type a date, then Skip.
      await user.selectOptions(
        screen.getByRole("combobox", { name: /Status for Alpha/ }),
        "applied",
      );
      const input = await screen.findByLabelText("Date applied");
      await user.type(input, "2026-08-02");
      await user.click(screen.getByRole("button", { name: "Skip" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      // Open for Beta: the date field must be empty.
      await user.selectOptions(
        screen.getByRole("combobox", { name: /Status for Beta/ }),
        "applied",
      );
      const nextInput = await screen.findByLabelText("Date applied");
      expect(nextInput).toHaveValue("");
    });

    it("focuses the date input on open", async () => {
      const user = userEvent.setup();
      renderBoard([app({ id: "a" })]);
      await user.selectOptions(
        screen.getByRole("combobox", { name: /Status for Acme/ }),
        "applied",
      );
      const input = await screen.findByLabelText("Date applied");
      await waitFor(() => expect(input).toHaveFocus());
    });

    it("traps Tab focus inside the dialog", async () => {
      const user = userEvent.setup();
      renderBoard([app({ id: "a" })]);
      await user.selectOptions(
        screen.getByRole("combobox", { name: /Status for Acme/ }),
        "applied",
      );
      const dialog = await screen.findByRole("dialog");
      const input = screen.getByLabelText("Date applied");
      await waitFor(() => expect(input).toHaveFocus());
      // Enable Save date so it participates in the tab order.
      fireEvent.change(input, { target: { value: "2026-08-02" } });

      const cancel = screen.getByRole("button", { name: "Cancel" });
      const skip = screen.getByRole("button", { name: "Skip" });
      const save = screen.getByRole("button", { name: "Save date" });

      // Manual tab order inside the dialog (jsdom cannot tab fixed elements).
      cancel.focus();
      expect(dialog.contains(document.activeElement)).toBe(true);
      skip.focus();
      save.focus();
      expect(dialog.contains(document.activeElement)).toBe(true);

      // Tab from the last control wraps to the first; Shift+Tab wraps back.
      fireEvent.keyDown(save, { key: "Tab" });
      expect(input).toHaveFocus();
      fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
      expect(save).toHaveFocus();
    });

    it("closes on Escape without submitting", async () => {
      const user = userEvent.setup();
      renderBoard([app({ id: "a" })]);
      await user.selectOptions(
        screen.getByRole("combobox", { name: /Status for Acme/ }),
        "applied",
      );
      await screen.findByRole("dialog");
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(updateApplicationStatus).not.toHaveBeenCalled();
    });

    it("restores focus to the triggering selector on close", async () => {
      const user = userEvent.setup();
      renderBoard([app({ id: "a" })]);
      const select = screen.getByRole("combobox", { name: /Status for Acme/ });
      await user.selectOptions(select, "applied");
      await screen.findByRole("dialog");
      await user.keyboard("{Escape}");
      await waitFor(() => expect(select).toHaveFocus());
    });

    it("saves the chosen date and skips with null", async () => {
      const user = userEvent.setup();
      renderBoard([app({ id: "a", company: "Alpha" }), app({ id: "b", company: "Beta" })]);

      await user.selectOptions(
        screen.getByRole("combobox", { name: /Status for Alpha/ }),
        "applied",
      );
      const input = await screen.findByLabelText("Date applied");
      fireEvent.change(input, { target: { value: "2026-08-02" } });
      await user.click(screen.getByRole("button", { name: "Save date" }));
      await waitFor(() =>
        expect(updateApplicationStatus).toHaveBeenCalledWith("a", "applied", "2026-08-02"),
      );

      // Second card has no date yet, so the prompt appears; Skip keeps null.
      await user.selectOptions(
        screen.getByRole("combobox", { name: /Status for Beta/ }),
        "applied",
      );
      await screen.findByRole("dialog");
      await user.click(screen.getByRole("button", { name: "Skip" }));
      await waitFor(() =>
        expect(updateApplicationStatus).toHaveBeenCalledWith("b", "applied", null),
      );
    });

    it("cancels without calling the server action", async () => {
      const user = userEvent.setup();
      renderBoard([app({ id: "a" })]);
      await user.selectOptions(acmeSelect(), "applied");
      await screen.findByRole("dialog");
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(updateApplicationStatus).not.toHaveBeenCalled();
      expect(within(column("Saved")).getByText("Acme")).toBeInTheDocument();
      await waitFor(() => expect(acmeSelect()).toHaveFocus());
    });

    it("does not prompt again when a date already exists", async () => {
      const user = userEvent.setup();
      renderBoard([app({ id: "a", date_applied: "2026-08-01" })]);
      await user.selectOptions(
        screen.getByRole("combobox", { name: /Status for Acme/ }),
        "applied",
      );
      await waitFor(() =>
        expect(updateApplicationStatus).toHaveBeenCalledWith("a", "applied", null),
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("restores focus after a slow Save completes (no fixed timeout)", async () => {
      const pending = deferred();
      updateApplicationStatus.mockReturnValue(pending.promise);
      const user = userEvent.setup();
      renderBoard([app({ id: "a" })]);

      await user.selectOptions(acmeSelect(), "applied");
      const input = await screen.findByLabelText("Date applied");
      fireEvent.change(input, { target: { value: "2026-08-02" } });
      await user.click(screen.getByRole("button", { name: "Save date" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() => expect(acmeSelect()).toBeDisabled());
      // While pending, focus must not land on the disabled selector.
      expect(document.activeElement).not.toBe(acmeSelect());

      // Let more time pass than the old 120ms assumption; still pending.
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(updateApplicationStatus).toHaveBeenCalledTimes(1);
      expect(acmeSelect()).toBeDisabled();

      await act(async () => {
        pending.resolve({ ok: true });
      });
      await waitFor(() => expect(acmeSelect()).toBeEnabled());
      await waitFor(() => expect(acmeSelect()).toHaveFocus());
    });

    it("restores focus after a slow Skip completes", async () => {
      const pending = deferred();
      updateApplicationStatus.mockReturnValue(pending.promise);
      const user = userEvent.setup();
      renderBoard([app({ id: "a" })]);

      await user.selectOptions(acmeSelect(), "applied");
      await screen.findByRole("dialog");
      await user.click(screen.getByRole("button", { name: "Skip" }));

      await waitFor(() => expect(acmeSelect()).toBeDisabled());
      await new Promise((resolve) => setTimeout(resolve, 200));
      await act(async () => {
        pending.resolve({ ok: true });
      });
      await waitFor(() => expect(acmeSelect()).toBeEnabled());
      await waitFor(() => expect(acmeSelect()).toHaveFocus());
    });

    it("restores focus after a failed mutation rolls back", async () => {
      const pending = deferred();
      updateApplicationStatus.mockReturnValue(pending.promise);
      const user = userEvent.setup();
      renderBoard([app({ id: "a" })]);

      await user.selectOptions(acmeSelect(), "applied");
      await screen.findByRole("dialog");
      await user.click(screen.getByRole("button", { name: "Skip" }));

      await waitFor(() => expect(acmeSelect()).toBeDisabled());
      await act(async () => {
        pending.resolve({ ok: false, error: "Boom" });
      });
      await waitFor(() => expect(within(column("Saved")).getByText("Acme")).toBeInTheDocument());
      await waitFor(() => expect(acmeSelect()).toBeEnabled());
      await waitFor(() => expect(acmeSelect()).toHaveFocus());
    });

    it("restores focus only to the originating card with concurrent cards", async () => {
      const pendingA = deferred();
      updateApplicationStatus.mockImplementation((id: string) =>
        id === "a" ? pendingA.promise : Promise.resolve({ ok: true }),
      );
      const user = userEvent.setup();
      renderBoard([app({ id: "a", company: "Alpha" }), app({ id: "b", company: "Beta" })]);

      const alphaSelect = () => screen.getByRole("combobox", { name: /Status for Alpha/ });
      await user.selectOptions(alphaSelect(), "applied");
      await screen.findByRole("dialog");
      await user.click(screen.getByRole("button", { name: "Skip" }));

      await waitFor(() => expect(alphaSelect()).toBeDisabled());
      await act(async () => {
        pendingA.resolve({ ok: true });
      });
      await waitFor(() => expect(alphaSelect()).toHaveFocus());
      expect(screen.getByRole("combobox", { name: /Status for Beta/ })).not.toHaveFocus();
    });
  });
});
