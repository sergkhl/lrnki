import assert from "node:assert/strict";
import { test } from "node:test";
import { STAGE_TAGS } from "@lrnki/domain-core";
import type { LiteLlmForcedToolClient } from "./LiteLlmForcedToolClient";
import {
  createScaffoldContentCongruencePort,
  scaffoldContentCongruenceDescriptor
} from "./scaffoldContentCongruenceAdapters";
import { readPromptFile } from "./promptFile";
import { scaffoldContentCongruenceSchema, scaffoldContentCongruenceValidator } from "./toolSchemas";

const judgeInput = {
  declaredDomain: "a domain",
  term: "target term",
  parentLabel: "Parent concept",
  stepLabel: "Prerequisite step",
  microLesson: "A short teaching passage.",
  question: "A recall question?",
  explanation: "Because reasons.",
  options: ["Apple", "Banana", "Cherry", "Date"]
};

function adapterReturning(canned: unknown) {
  const calls: unknown[] = [];
  const client = {
    async call(input: unknown) {
      calls.push(input);
      return scaffoldContentCongruenceValidator.parse(canned);
    }
  } as unknown as LiteLlmForcedToolClient;
  return { adapter: createScaffoldContentCongruencePort(client), calls };
}

test("congruence validator requires both booleans and a rationale, and fails closed otherwise", () => {
  assert.deepEqual(
    scaffoldContentCongruenceValidator.parse({ teachesStepLabel: true, isSimplerPrerequisite: false, rationale: "r" }),
    { teachesStepLabel: true, isSimplerPrerequisite: false, rationale: "r" }
  );
  assert.throws(() => scaffoldContentCongruenceValidator.parse({ teachesStepLabel: true, isSimplerPrerequisite: false }));
  assert.throws(() => scaffoldContentCongruenceValidator.parse({ teachesStepLabel: true, isSimplerPrerequisite: false, rationale: "" }));
  assert.throws(() => scaffoldContentCongruenceValidator.parse({ teachesStepLabel: true, isSimplerPrerequisite: false, rationale: "r", extra: 1 }));
});

test("adapter uses the independent judge alias, stage tag, and rendered inputs", async () => {
  const verdict = { teachesStepLabel: false, isSimplerPrerequisite: true, rationale: "The lesson is about something else." };
  const { adapter, calls } = adapterReturning(verdict);

  assert.deepEqual(await adapter.judge(judgeInput), verdict);
  assert.equal(adapter.model, "kg-independent-judge");
  assert.equal(readPromptFile(scaffoldContentCongruenceDescriptor.promptPath).model, "kg-independent-judge");

  const call = calls[0] as {
    model: string;
    toolName: string;
    parameters: unknown;
    tags: string[];
    messages: { content: string }[];
  };
  assert.equal(call.model, "kg-independent-judge");
  assert.equal(call.toolName, "submit_scaffold_content_congruence");
  assert.deepEqual(call.parameters, scaffoldContentCongruenceSchema);
  assert.deepEqual(call.tags, [STAGE_TAGS.scaffoldContentCongruence]);
  const userMessage = call.messages[1]?.content ?? "";
  assert.match(userMessage, /Target term the learner was exploring: "target term"/);
  assert.match(userMessage, /Step label \(what this step claims to teach\): "Prerequisite step"/);
  assert.match(userMessage, /- Apple\n- Banana\n- Cherry\n- Date/);
});
