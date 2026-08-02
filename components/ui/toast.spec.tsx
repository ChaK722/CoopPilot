import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast } from "./toast";

function Trigger() {
  const { toast } = useToast();
  return (
    <button type="button" onClick={() => toast("Saved successfully", "success")}>
      Show toast
    </button>
  );
}

describe("ToastProvider", () => {
  it("shows a toast message and dismisses it", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Show toast" }));
    expect(screen.getByRole("status")).toHaveTextContent("Saved successfully");
    await user.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
