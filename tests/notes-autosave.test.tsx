import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const saveApplicationNotes = vi.fn();

vi.mock("@/features/applications/application-actions", () => ({
  saveApplicationNotes: (...args: unknown[]) => saveApplicationNotes(...args),
}));

import { NotesAutosave } from "@/features/applications/notes-autosave";

describe("NotesAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveApplicationNotes.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows Saving then Saved after the debounce", async () => {
    render(<NotesAutosave applicationId="app-1" initialNotes="" />);

    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "hello" } });
    expect(screen.getByText("Saving…")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(saveApplicationNotes).toHaveBeenCalledWith("app-1", "hello");
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("shows an error state and never reports success when the save fails", async () => {
    saveApplicationNotes.mockResolvedValue({ ok: false, error: "Could not save" });
    render(<NotesAutosave applicationId="app-1" initialNotes="" />);

    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "hello" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });

    expect(screen.getByText(/Could not save/)).toBeInTheDocument();
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });
});
