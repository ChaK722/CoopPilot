import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppErrorBoundary } from "@/components/app-error";
import { ErrorCard } from "@/components/error-card";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("AppErrorBoundary", () => {
  it("shows only a safe message and the digest reference", () => {
    const error = new Error("SQL detail that must never leak") as Error & { digest?: string };
    error.digest = "digest-abc";
    render(<AppErrorBoundary error={error} reset={vi.fn()} />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Reference: digest-abc")).toBeInTheDocument();
    expect(screen.queryByText(/SQL detail/)).not.toBeInTheDocument();
  });

  it("retries through the reset callback", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    render(<AppErrorBoundary error={new Error("boom")} reset={reset} />);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe("ErrorCard", () => {
  it("shows message, reference, and a retry action without leaking details", () => {
    render(
      <ErrorCard
        title="Could not load settings"
        message="Something went wrong. Please try again."
        reference="ref-xyz"
      />,
    );
    expect(screen.getByText("Could not load settings")).toBeInTheDocument();
    expect(screen.getByText("Reference: ref-xyz")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
