import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui/toast";

const createProject = vi.fn().mockResolvedValue({ ok: true });
const updateProject = vi.fn().mockResolvedValue({ ok: true });
const deleteProject = vi.fn().mockResolvedValue({ ok: true });

vi.mock("@/features/profile/profile-actions", () => ({
  createProject: (...args: unknown[]) => createProject(...args),
  updateProject: (...args: unknown[]) => updateProject(...args),
  deleteProject: (...args: unknown[]) => deleteProject(...args),
  moveProject: () => Promise.resolve({ ok: true }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ProjectEditor, type ProjectRow } from "@/features/profile/project-editor";

const rows: ProjectRow[] = [
  {
    id: "proj-1",
    name: "CoopPilot",
    technologies: ["Next.js"],
    start_date: null,
    end_date: null,
    description: null,
    bullet_points: [],
    github_url: null,
    demo_url: null,
    sort_order: 0,
  },
];

describe("ProjectEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an empty state and adds a project", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ProjectEditor initial={[]} />
      </ToastProvider>,
    );
    expect(screen.getByText(/No projects added yet/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add project" }));
    await user.type(screen.getByLabelText("Name"), "Portfolio");
    await user.click(screen.getByRole("button", { name: "Add project" }));

    expect(createProject).toHaveBeenCalledWith(expect.objectContaining({ name: "Portfolio" }));
  });

  it("edits an existing project", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ProjectEditor initial={rows} />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Edit CoopPilot" }));
    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "CoopPilot 2");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(updateProject).toHaveBeenCalledWith(
      "proj-1",
      expect.objectContaining({ name: "CoopPilot 2" }),
    );
  });

  it("keeps the record when the delete confirmation is cancelled", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ProjectEditor initial={rows} />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Delete CoopPilot" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deleteProject).not.toHaveBeenCalled();
    expect(screen.getByText("CoopPilot")).toBeInTheDocument();
  });

  it("deletes after confirmation", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ProjectEditor initial={rows} />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Delete CoopPilot" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(deleteProject).toHaveBeenCalledWith("proj-1");
  });
});
