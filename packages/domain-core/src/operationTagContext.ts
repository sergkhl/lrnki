export type OperationTagContextProvider = {
  run<T>(operationId: string, fn: () => T): T;
  current(): string | undefined;
};

let provider: OperationTagContextProvider = {
  run: (_operationId, fn) => fn(),
  current: () => undefined
};

export function installOperationTagContext(next: OperationTagContextProvider): void {
  provider = next;
}

export function runWithOperationTag<T>(operationId: string, fn: () => T): T {
  return provider.run(operationId, fn);
}

export function currentOperationTag(): string | undefined {
  return provider.current();
}
