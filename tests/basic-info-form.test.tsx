import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui/toast";

const completeOnboarding = vi.fn().mockResolvedValue({ ok: true });
const saveBasicInfo = vi.fn().mockResolvedValue({ ok: true });
const refresh = vi.fn();
const replace = vi.fn();

vi.mock("@/features/profile/profile-actions", () => ({
  completeOnboarding: (...args: unknown[]) => completeOnboarding(...args),
  saveBasicInfo: (...args: unknown[]) => saveBasicInfo(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace }),
}));

import { BasicInfoForm } from "@/features/profile/basic-info-form";

describe("BasicInfoForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks onboarding completion when preferred name is missing", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <BasicInfoForm initial={null} mode="onboarding" />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Finish onboarding" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Preferred name is required.");
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it("blocks whitespace-only preferred names on the client", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <BasicInfoForm initial={null} mode="onboarding" />
      </ToastProvider>,
    );

    await user.type(screen.getByLabelText(/Preferred name/), "   ");
    await user.click(screen.getByRole("button", { name: "Finish onboarding" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Preferred name is required.");
    expect(completeOnboarding).not.toHaveBeenCalled();
  });

  it("submits valid onboarding data and redirects to the dashboard", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <BasicInfoForm initial={null} mode="onboarding" />
      </ToastProvider>,
    );

    await user.type(screen.getByLabelText(/Preferred name/), "Alex");
    await user.click(screen.getByRole("button", { name: "Finish onboarding" }));

    expect(completeOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({ preferred_name: "Alex" }),
    );
    expect(replace).toHaveBeenCalledWith("/dashboard");
  });

  it("rejects non-http URLs before calling the server", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <BasicInfoForm initial={null} mode="onboarding" />
      </ToastProvider>,
    );

    await user.type(screen.getByLabelText(/Preferred name/), "Alex");
    await user.type(screen.getByLabelText(/GitHub URL/), "javascript:alert(1)");
    await user.click(screen.getByRole("button", { name: "Finish onboarding" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/URL must start with http/);
    expect(completeOnboarding).not.toHaveBeenCalled();
  });
});
