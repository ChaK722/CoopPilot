import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui/toast";

const createApplication = vi.fn();
const updateApplication = vi.fn();
const replace = vi.fn();
const refresh = vi.fn();

vi.mock("@/features/applications/application-actions", () => ({
  createApplication: (...args: unknown[]) => createApplication(...args),
  updateApplication: (...args: unknown[]) => updateApplication(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

import { emptyApplicationValues, ReviewForm } from "@/features/applications/review-form";

function initial(overrides: Partial<ReturnType<typeof emptyApplicationValues>> = {}) {
  return {
    values: {
      ...emptyApplicationValues(),
      company: "Acme",
      job_title: "Intern",
      original_description: "Job text",
      ...overrides,
    },
  };
}

function renderForm(mode: "create" | "edit" = "create") {
  return render(
    <ToastProvider>
      <ReviewForm initial={initial()} applicationId={mode === "edit" ? "app-1" : undefined} />
    </ToastProvider>,
  );
}

describe("ReviewForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createApplication.mockResolvedValue({ ok: true, applicationId: "app-new" });
    updateApplication.mockResolvedValue({ ok: true });
  });

  it("blocks saving when required fields are missing", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ReviewForm initial={initial({ company: "" })} />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Save application" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/Company is required/);
    expect(createApplication).not.toHaveBeenCalled();
  });

  it("creates an application with a creation key and skills", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Save application" }));

    expect(createApplication).toHaveBeenCalledTimes(1);
    const arg = createApplication.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.creation_key).toEqual(expect.any(String));
    expect(arg.skills).toEqual([]);
  });

  it("updates an existing application in edit mode", async () => {
    const user = userEvent.setup();
    renderForm("edit");

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(updateApplication).toHaveBeenCalledWith(
      "app-1",
      expect.objectContaining({ company: "Acme" }),
    );
    expect(createApplication).not.toHaveBeenCalled();
  });

  it("does not double-submit while a save is in flight", async () => {
    let resolveSave: (value: unknown) => void;
    createApplication.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Save application" }));
    await user.click(screen.getByRole("button", { name: /Saving/ })).catch(() => undefined);
    resolveSave!({ ok: true, applicationId: "app-new" });

    expect(createApplication).toHaveBeenCalledTimes(1);
  });
});
