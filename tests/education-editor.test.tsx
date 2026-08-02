import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui/toast";

const createEducation = vi.fn().mockResolvedValue({ ok: true });
const updateEducation = vi.fn().mockResolvedValue({ ok: true });
const deleteEducation = vi.fn().mockResolvedValue({ ok: true });
const moveEducation = vi.fn().mockResolvedValue({ ok: true });
const refresh = vi.fn();

vi.mock("@/features/profile/profile-actions", () => ({
  createEducation: (...args: unknown[]) => createEducation(...args),
  updateEducation: (...args: unknown[]) => updateEducation(...args),
  deleteEducation: (...args: unknown[]) => deleteEducation(...args),
  moveEducation: (...args: unknown[]) => moveEducation(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import { EducationEditor, type EducationRow } from "@/features/profile/education-editor";

const rows: EducationRow[] = [
  {
    id: "edu-1",
    school: "Waterloo",
    degree: "BSc",
    program: "CS",
    start_date: "2022-09-01",
    expected_graduation_date: null,
    relevant_coursework: ["Databases"],
    sort_order: 0,
  },
];

function renderEditor(initial: EducationRow[] = rows) {
  return render(
    <ToastProvider>
      <EducationEditor initial={initial} />
    </ToastProvider>,
  );
}

describe("EducationEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an empty state when there are no records", () => {
    renderEditor([]);
    expect(screen.getByText(/No education added yet/)).toBeInTheDocument();
  });

  it("adds education and calls the create action", async () => {
    const user = userEvent.setup();
    renderEditor([]);

    await user.click(screen.getByRole("button", { name: "Add education" }));
    await user.type(screen.getByLabelText("School"), "Test University");
    await user.type(screen.getByLabelText("Degree"), "BSc");
    await user.type(screen.getByLabelText("Program"), "CS");
    await user.click(screen.getByRole("button", { name: "Add education" }));

    expect(createEducation).toHaveBeenCalledWith(
      expect.objectContaining({ school: "Test University", degree: "BSc", program: "CS" }),
    );
  });

  it("edits an existing record and calls the update action", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Edit Waterloo" }));
    const schoolInput = screen.getByLabelText("School");
    await user.clear(schoolInput);
    await user.type(schoolInput, "UBC");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(updateEducation).toHaveBeenCalledWith(
      "edu-1",
      expect.objectContaining({ school: "UBC" }),
    );
  });

  it("cancelling the delete confirmation leaves the record untouched", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Delete Waterloo" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deleteEducation).not.toHaveBeenCalled();
    expect(screen.getByText(/BSc — Waterloo/)).toBeInTheDocument();
  });

  it("confirms deletion and calls the delete action", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Delete Waterloo" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(deleteEducation).toHaveBeenCalledWith("edu-1");
  });

  it("moves a record up with the move action", async () => {
    const user = userEvent.setup();
    renderEditor([
      { ...rows[0], id: "a", sort_order: 0 },
      { ...rows[0], id: "b", school: "UBC", sort_order: 1 },
    ]);

    await user.click(screen.getAllByRole("button", { name: "Move education up" })[1]);
    expect(moveEducation).toHaveBeenCalledWith("b", "up");
  });
});
