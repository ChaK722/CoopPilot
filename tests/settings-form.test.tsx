import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const setTheme = vi.fn();
const signOut = vi.fn();
const refresh = vi.fn();
const replace = vi.fn();

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme }),
}));

vi.mock("@/lib/auth/supabase-browser", () => ({
  createBrowserSupabaseClient: () => ({ auth: { signOut } }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace }),
}));

import { SettingsForm } from "@/features/shell/settings-form";

describe("SettingsForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signOut.mockResolvedValue(undefined);
  });

  it("shows the canonical email read-only", () => {
    render(<SettingsForm email="user@example.test" />);
    expect(screen.getByText("user@example.test")).toBeInTheDocument();
    expect(screen.getByText(/cannot be changed here/)).toBeInTheDocument();
  });

  it("offers System, Light, and Dark theme choices and persists via setTheme", async () => {
    const user = userEvent.setup();
    render(<SettingsForm email="user@example.test" />);

    const system = screen.getByRole("radio", { name: "System" });
    const light = screen.getByRole("radio", { name: "Light" });
    const dark = screen.getByRole("radio", { name: "Dark" });
    expect(system).toHaveAttribute("aria-checked", "true");

    await user.click(light);
    expect(setTheme).toHaveBeenCalledWith("light");
    await user.click(dark);
    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("signs out and redirects to the landing page", async () => {
    const user = userEvent.setup();
    render(<SettingsForm email="user@example.test" />);

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/");
    expect(refresh).toHaveBeenCalled();
  });
});
