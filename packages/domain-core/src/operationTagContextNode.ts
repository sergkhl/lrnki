import { AsyncLocalStorage } from "node:async_hooks";
import { installOperationTagContext } from "./operationTagContext";

const operationTagStorage = new AsyncLocalStorage<string>();

export function installNodeOperationTagContext(): void {
  installOperationTagContext({
    run: (operationId, fn) => operationTagStorage.run(operationId, fn),
    current: () => operationTagStorage.getStore()
  });
}
