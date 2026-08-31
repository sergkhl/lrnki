import { QueryClient } from "@tanstack/react-query";
import { hc } from "hono/client";
import type {
  AppType,
  LearnerCommandDto,
  LearnerReadDto,
  LearnerTransitionDto
} from "@lrnki/learner-api/client";

import { API_URL, sessionTransport } from "./authClient";

export type { LearnerCommandDto, LearnerReadDto, LearnerTransitionDto };
export { API_URL };

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000 } }
});

// The Expo app consumes only this typed HTTP contract. It has no dependency on learner-runtime,
// Postgres, authored server documents, or any grading key.
export const api = hc<AppType>(API_URL, {
  init: sessionTransport.init,
  headers: sessionTransport.headers
});
