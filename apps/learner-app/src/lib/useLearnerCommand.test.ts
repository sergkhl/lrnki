import { beforeEach, expect, jest, test } from "@jest/globals";
import { act, renderHook } from "@testing-library/react-native";
import { dispatchLearnerCommand } from "./actions";
import { useLearnerCommand } from "./useLearnerCommand";

jest.mock("./actions", () => ({ dispatchLearnerCommand: jest.fn() }));
const dispatch = jest.mocked(dispatchLearnerCommand);
const command = { kind: "record_lesson_read", expeditionKey: "reasoning", stopKey: "claims" } as const;

beforeEach(() => { dispatch.mockReset(); });

test("two taps in the same render submit once, remain pending, and release after failure for an explicit retry", async () => {
  let reject!: (reason: Error) => void;
  dispatch.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  const busyChanged = jest.fn();
  const { result } = await renderHook(() => useLearnerCommand("7", busyChanged));
  let pending!: ReturnType<typeof result.current.run>;
  await act(async () => {
    pending = result.current.run(command);
    void result.current.run(command);
    expect(result.current.isPending()).toBe(true);
  });
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(result.current.busy).toBe(true);
  await act(async () => { reject(new Error("offline")); await pending; });
  expect(result.current.error).toMatch(/could not be saved/);
  expect(result.current.busy).toBe(false);
  expect(result.current.isPending()).toBe(false);
  expect(busyChanged.mock.calls).toEqual([[true], [false]]);
  dispatch.mockResolvedValueOnce({ status: "content_changed", stateVersion: "8", expeditionKey: "reasoning",
    view: { kind: "journal", activeExpeditionKey: null, expeditions: [] } });
  await act(async () => { await result.current.run(command); });
  expect(dispatch).toHaveBeenCalledTimes(2);
  expect(result.current.error).toMatch(/progress.*unavailable/i);
});
