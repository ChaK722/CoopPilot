import { afterEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppErrorBoundary } from "@/components/app-error";
import { ErrorCard } from "@/components/error-card";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

/**
 * AppErrorBoundary deliberately reports the technical error to
 * console.error (server-log semantics) while rendering only a safe message.
 * These tests spy on console.error in this file's scope only, assert that
 * every logged call is exactly the expected boundary error, and restore the
 * spy afterwards. Any unexpected console.error call fails the test.
 */
function expectOnlyBoundaryError(spy: MockInstance, error: Error) {
  expect(spy).toHaveBeenCalled();
  for (const call of spy.mock.calls) {
    expect(
      call.some((argument) => argument === error),
      `console.error received an unexpected call: ${call.map(String).join(" ")}`,
    ).toBe(true);
  }
}

describe("AppErrorBoundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows only a safe message and the digest reference", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("SQL detail that must never leak") as Error & { digest?: string };
    error.digest = "digest-abc";
    render(<AppErrorBoundary error={error} reset={vi.fn()} />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Reference: digest-abc")).toBeInTheDocument();
    expect(screen.queryByText(/SQL detail/)).not.toBeInTheDocument();
    expectOnlyBoundaryError(errorSpy, error);
  });

  it("retries through the reset callback", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    const reset = vi.fn();
    const error = new Error("boom");
    render(<AppErrorBoundary error={error} reset={reset} />);
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
    expectOnlyBoundaryError(errorSpy, error);
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
