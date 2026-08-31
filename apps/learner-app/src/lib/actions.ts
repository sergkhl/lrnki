import type { LearnerCommandDto, LearnerTransitionDto } from "./api";
import { api, queryClient } from "./api";
import { learnerScopeKey } from "./queries";
import { clientUuid } from "./uuid";

export type { LearnerCommandDto, LearnerTransitionDto };

export async function dispatchLearnerCommand(input: Readonly<{
  expectedStateVersion: string;
  command: LearnerCommandDto;
  requestId?: string;
}>): Promise<LearnerTransitionDto> {
  const response = await api.game.commands.$post({
    json: {
      requestId: input.requestId ?? clientUuid(),
      expectedStateVersion: input.expectedStateVersion,
      command: input.command
    }
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`command transport refused: ${response.status}`);
  const result = body as LearnerTransitionDto;
  if (result.status === "applied") {
    await queryClient.invalidateQueries({ queryKey: learnerScopeKey });
  } else if (result.status === "stale" || result.status === "content_changed") {
    await queryClient.invalidateQueries({ queryKey: learnerScopeKey });
  }
  return result;
}
