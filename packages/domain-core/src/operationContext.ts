export type AmbientOperationContext = {
  operationId: string;
  operationType: string;
  allowedTimelineStages: ReadonlySet<string>;
  allowedNeuralStages: ReadonlySet<string>;
};

export type OperationContextProvider = {
  run<T>(context: AmbientOperationContext, fn: () => T): T;
  current(): AmbientOperationContext | undefined;
};

let provider: OperationContextProvider = {
  run: (_context, fn) => fn(),
  current: () => undefined
};

export function installOperationContext(next: OperationContextProvider): void {
  provider = next;
}

export function runWithOperationContext<T>(context: AmbientOperationContext, fn: () => T): T {
  return provider.run(context, fn);
}

export function currentOperationContext(): AmbientOperationContext | undefined {
  return provider.current();
}

export function requireAmbientOperationNeuralStageOwnership(
  neuralStages: readonly string[]
): AmbientOperationContext | undefined {
  const context = currentOperationContext();
  if (!context) return undefined;
  for (const stage of neuralStages) {
    if (!context.allowedNeuralStages.has(stage)) {
      throw new OperationNeuralStageOwnershipError(
        context.operationType,
        context.operationId,
        stage
      );
    }
  }
  return context;
}

export function requireAmbientOperationTimelineStageOwnership(input: {
  operationType: string;
  operationId: string;
  stage: string;
}): AmbientOperationContext | undefined {
  const context = currentOperationContext();
  if (!context) return undefined;
  if (
    context.operationType !== input.operationType
    || context.operationId !== input.operationId
    || !context.allowedTimelineStages.has(input.stage)
  ) {
    throw new OperationTimelineStageOwnershipError(
      input.operationType,
      input.operationId,
      input.stage
    );
  }
  return context;
}

export class OperationNeuralStageOwnershipError extends Error {
  constructor(
    readonly operationType: string,
    readonly operationId: string,
    readonly stage: string
  ) {
    super(`Operation ${operationType}:${operationId} does not own neural stage ${stage}.`);
    this.name = "OperationNeuralStageOwnershipError";
  }
}

export class OperationTimelineStageOwnershipError extends Error {
  constructor(
    readonly operationType: string,
    readonly operationId: string,
    readonly stage: string
  ) {
    super(`Operation ${operationType}:${operationId} does not own timeline stage ${stage}.`);
    this.name = "OperationTimelineStageOwnershipError";
  }
}
