export class PlatformApiOperationInFlightError extends Error {
  readonly requestedLabel: string;
  readonly currentLabel: string;

  constructor(requestedLabel: string, currentLabel: string) {
    super(`${requestedLabel} skipped because ${currentLabel} is already running.`);
    this.name = "PlatformApiOperationInFlightError";
    this.requestedLabel = requestedLabel;
    this.currentLabel = currentLabel;
  }
}

export interface PlatformApiOperationGate {
  getCurrentLabel(): string | null;
  run<T>(label: string, operation: () => Promise<T>): Promise<T>;
}

export const createPlatformApiOperationGate = (): PlatformApiOperationGate => {
  let currentLabel: string | null = null;

  return {
    getCurrentLabel: () => currentLabel,
    async run<T>(label: string, operation: () => Promise<T>): Promise<T> {
      if (currentLabel) {
        throw new PlatformApiOperationInFlightError(label, currentLabel);
      }

      currentLabel = label;
      try {
        return await operation();
      } finally {
        currentLabel = null;
      }
    }
  };
};
