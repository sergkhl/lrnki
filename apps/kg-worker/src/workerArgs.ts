export type GenerateStudyItemsArgs = {
  enrichmentId: string;
  concurrency?: number;
};

export function parseGenerateStudyItemsArgs(
  enrichmentId: string | undefined,
  flags: string[]
): GenerateStudyItemsArgs {
  if (!enrichmentId) throw new Error("generate-study-items requires <enrichmentId>.");
  let concurrency: number | undefined;
  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    let value: string | undefined;
    if (flag === "--concurrency") {
      index += 1;
      value = flags[index];
    } else if (flag.startsWith("--concurrency=")) {
      value = flag.slice("--concurrency=".length);
    } else {
      throw new Error(`unknown generate-study-items flag: ${flag}`);
    }
    if (concurrency !== undefined) throw new Error("generate-study-items concurrency was provided more than once.");
    concurrency = parsePositiveInteger(value, "generate-study-items concurrency");
  }
  return concurrency === undefined ? { enrichmentId } : { enrichmentId, concurrency };
}

function parsePositiveInteger(value: string | undefined, label: string): number {
  if (!value || !/^[1-9]\d*$/.test(value)) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return Number(value);
}
