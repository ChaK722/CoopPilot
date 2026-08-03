import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui/toast";

const actions = vi.hoisted(() => ({
  archiveApplication: vi.fn(),
  deleteApplication: vi.fn(),
  duplicateApplication: vi.fn(),
}));

vi.mock("@/features/applications/application-actions", () => actions);

const refresh = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace }),
}));

import { JobDetailActions } from "@/features/applications/job-detail-actions";

function renderActions(archived = false) {
  return render(
    <ToastProvider>
      <JobDetailActions applicationId="app-1" archived={archived} />
    </ToastProvider>,
  );
}

describe("JobDetailActions failure simulation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.archiveApplication.mockResolvedValue({ ok: true });
    actions.deleteApplication.mockResolvedValue({ ok: true });
    actions.duplicateApplication.mockResolvedValue({ ok: true, applicationId: "app-2" });
  });

  it("shows an error toast with a reference and never a success toast when archiving fails", async () => {
    const user = userEvent.setup();
    actions.archiveApplication.mockResolvedValue({
      ok: false,
      error: "Could not archive the application. Please try again.",
      reference: "ref-123",
    });
    renderActions();

    await user.click(screen.getByRole("button", { name: "Archive" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Archive" }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "Could not archive the application. Please try again. (Reference: ref-123)",
        ),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("Application archived.")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("cancelling delete keeps data intact and calls no action", async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(actions.deleteApplication).not.toHaveBeenCalled();
  });

  it("shows an error toast and no redirect when deleting fails", async () => {
    const user = userEvent.setup();
    actions.deleteApplication.mockResolvedValue({
      ok: false,
      error: "Could not delete the application. Please try again.",
      reference: "ref-456",
    });
    renderActions();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "Could not delete the application. Please try again. (Reference: ref-456)",
        ),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("Application deleted.")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects after a successful delete", async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/applications"));
    expect(screen.getByText("Application deleted.")).toBeInTheDocument();
  });
});
