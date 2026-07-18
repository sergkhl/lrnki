// Expected control flow for a stale worker: another attempt owns the durable row, so
// the old attempt stops without writing. Supervisors distinguish this cancellation
// from a generation failure while retaining a visible, concise warning.
export class GenerationClaimLostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationClaimLostError";
  }
}

export function isGenerationClaimLostError(error: unknown): error is GenerationClaimLostError {
  return error instanceof GenerationClaimLostError;
}
