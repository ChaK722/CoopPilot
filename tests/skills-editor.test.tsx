import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui/toast";

const replaceSkills = vi.fn().mockResolvedValue({ ok: true });
const refresh = vi.fn();

vi.mock("@/features/profile/profile-actions", () => ({
  replaceSkills: (...args: unknown[]) => replaceSkills(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import { SkillsEditor, type SkillRow } from "@/features/profile/skills-editor";

const initial: SkillRow[] = [{ id: "1", category: "tools", name: "Git", normalized_name: "git" }];

describe("SkillsEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads persisted skills into their categories", () => {
    render(
      <ToastProvider>
        <SkillsEditor initial={initial} />
      </ToastProvider>,
    );
    const toolsSection = screen.getByRole("heading", { name: "Tools" }).closest("section");
    expect(within(toolsSection as HTMLElement).getByText("Git")).toBeInTheDocument();
  });

  it("adds a skill with the keyboard and saves the full set", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <SkillsEditor initial={initial} />
      </ToastProvider>,
    );

    const input = screen.getByRole("textbox", { name: "Tools" });
    await user.type(input, "Docker{Enter}");
    expect(screen.getByRole("button", { name: "Remove Docker" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save skills" }));

    expect(replaceSkills).toHaveBeenCalledWith([
      { category: "tools", name: "Git" },
      { category: "tools", name: "Docker" },
    ]);
  });

  it("does not add a duplicate skill with different casing", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <SkillsEditor initial={initial} />
      </ToastProvider>,
    );

    const input = screen.getByRole("textbox", { name: "Tools" });
    await user.type(input, "docker{Enter}");
    await user.type(input, "DOCKER{Enter}");

    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(2);
  });
});
