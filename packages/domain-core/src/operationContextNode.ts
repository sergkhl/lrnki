import { AsyncLocalStorage } from "node:async_hooks";
import {
  installOperationContext,
  type AmbientOperationContext
} from "./operationContext";

const operationContextStorage = new AsyncLocalStorage<AmbientOperationContext>();

export function installNodeOperationContext(): void {
  installOperationContext({
    run: (context, fn) => operationContextStorage.run(context, fn),
    current: () => operationContextStorage.getStore()
  });
}
