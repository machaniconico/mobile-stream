import { describe, expect, it } from "vitest";
import { createPlatformApiOperationGate, PlatformApiOperationInFlightError } from "./platformApiOperationGate";

describe("platformApiOperationGate", () => {
  it("runs one platform operation and releases the gate afterward", async () => {
    const gate = createPlatformApiOperationGate();

    await expect(gate.run("Create broadcast", async () => "done")).resolves.toBe("done");

    expect(gate.getCurrentLabel()).toBeNull();
    await expect(gate.run("Refresh status", async () => "fresh")).resolves.toBe("fresh");
  });

  it("rejects overlapping platform operations with the active operation label", async () => {
    const gate = createPlatformApiOperationGate();
    let release: () => void = () => undefined;
    const first = gate.run(
      "Create broadcast",
      () =>
        new Promise<string>((resolve) => {
          release = () => resolve("done");
        })
    );

    await expect(gate.run("Rotate stream key", async () => "rotated")).rejects.toMatchObject({
      name: "PlatformApiOperationInFlightError",
      requestedLabel: "Rotate stream key",
      currentLabel: "Create broadcast",
      message: "Rotate stream key skipped because Create broadcast is already running."
    } satisfies Partial<PlatformApiOperationInFlightError>);

    release?.();
    await expect(first).resolves.toBe("done");
    await expect(gate.run("Rotate stream key", async () => "rotated")).resolves.toBe("rotated");
  });

  it("releases the gate when an operation fails", async () => {
    const gate = createPlatformApiOperationGate();

    await expect(
      gate.run("Refresh status", async () => {
        throw new Error("HTTP 503");
      })
    ).rejects.toThrow("HTTP 503");

    expect(gate.getCurrentLabel()).toBeNull();
    await expect(gate.run("Refresh status", async () => "retry")).resolves.toBe("retry");
  });
});
