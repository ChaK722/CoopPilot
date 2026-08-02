import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui/toast";

const createExperience = vi.fn().mockResolvedValue({ ok: true });
const updateExperience = vi.fn().mockResolvedValue({ ok: true });
const deleteExperience = vi.fn().mockResolvedValue({ ok: true });

vi.mock("@/features/profile/profile-actions", () => ({
  createExperience: (...args: unknown[]) => createExperience(...args),
  updateExperience: (...args: unknown[]) => updateExperience(...args),
  deleteExperience: (...args: unknown[]) => deleteExperience(...args),
  moveExperience: () => Promise.resolve({ ok: true }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ExperienceEditor, type ExperienceRow } from "@/features/profile/experience-editor";

const rows: ExperienceRow[] = [
  {
    id: "exp-1",
    title: "Intern",
    organization: "Acme",
    location: null,
    start_date: null,
    end_date: null,
    description: null,
    bullet_points: [],
    sort_order: 0,
  },
];

describe("ExperienceEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an empty state and adds experience", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ExperienceEditor initial={[]} />
      </ToastProvider>,
    );
    expect(screen.getByText(/No experience added yet/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add experience" }));
    await user.type(screen.getByLabelText("Title"), "QA Intern");
    await user.type(screen.getByLabelText("Organization"), "Test Co");
    await user.click(screen.getByRole("button", { name: "Add experience" }));

    expect(createExperience).toHaveBeenCalledWith(
      expect.objectContaining({ title: "QA Intern", organization: "Test Co" }),
    );
  });

  it("edits an existing record", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ExperienceEditor initial={rows} />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Edit Intern" }));
    const org = screen.getByLabelText("Organization");
    await user.clear(org);
    await user.type(org, "New Corp");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(updateExperience).toHaveBeenCalledWith(
      "exp-1",
      expect.objectContaining({ organization: "New Corp" }),
    );
  });

  it("keeps the record when the delete confirmation is cancelled", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ExperienceEditor initial={rows} />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Delete Intern" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deleteExperience).not.toHaveBeenCalled();
    expect(screen.getByText("Intern")).toBeInTheDocument();
  });

  it("deletes after confirmation", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ExperienceEditor initial={rows} />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Delete Intern" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(deleteExperience).toHaveBeenCalledWith("exp-1");
  });
});
