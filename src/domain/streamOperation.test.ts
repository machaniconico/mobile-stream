import { describe, expect, it } from "vitest";
import {
  createFailedStreamOperation,
  createPendingStreamOperation,
  isStreamOperationCancelledError,
  StreamOperationCancelledError
} from "./streamOperation";

describe("stream operation status", () => {
  it("builds pending status labels for stream controls", () => {
    expect(createPendingStreamOperation("start")).toEqual({
      kind: "pending",
      action: "start",
      message: "Starting stream"
    });
  });

  it("normalizes failed operation errors", () => {
    expect(createFailedStreamOperation("reconnect", new Error("Permission denied")).message).toBe(
      "Reconnect failed: Permission denied"
    );
    expect(createFailedStreamOperation("stop", null).message).toBe(
      "Stop failed: Unexpected streaming control error"
    );
  });

  it("redacts tokens from failed operation errors", () => {
    const status = createFailedStreamOperation(
      "start",
      new Error("Native publisher failed with Authorization: Bearer abcdefghijklmnop")
    );

    expect(status.message).toContain("Authorization: Bearer [redacted]");
    expect(status.message).not.toContain("abcdefghijklmnop");
  });

  it("marks user-cancelled operations without treating them as native failures", () => {
    const error = new StreamOperationCancelledError("Public launch confirmation cancelled.");

    expect(isStreamOperationCancelledError(error)).toBe(true);
    expect(isStreamOperationCancelledError(new Error("Public launch confirmation cancelled."))).toBe(false);
    expect(createFailedStreamOperation("start", error).message).toBe("Start failed: Public launch confirmation cancelled.");
  });
});
