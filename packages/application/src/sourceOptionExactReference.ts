import type { OptionSelectItem } from "@lrnki/domain-core";
import { normalizeOptionText } from "./optionSelectGuard";

export const SOURCE_OPTION_EXACT_REFERENCE_ADMISSION_POLICY =
  "source_option_exact_reference_v1" as const;

export function sourceOptionExactReferenceQuestion(canonicalLabel: string): string {
  return `Which option exactly repeats the source-backed lesson text for ${canonicalLabel}?`;
}

export function sourceOptionExactReferenceContractReasons(
  item: OptionSelectItem,
  canonicalLabel: string,
  expectedReferenceText: string | undefined
): string[] {
  const reasons: string[] = [];
  if (item.question !== sourceOptionExactReferenceQuestion(canonicalLabel)) {
    reasons.push("question: exact-reference source question required");
  }
  if (item.options.length !== 4) {
    reasons.push(`options: exactly four required, found ${item.options.length}`);
  }
  const keyed = item.options.filter((option) => option.isCorrect);
  if (keyed.length !== 1) {
    reasons.push(`key: exactly one required, found ${keyed.length}`);
    return reasons;
  }
  if (expectedReferenceText === undefined) {
    reasons.push("key: source-backed lesson reference is unavailable");
  } else if (keyed[0]!.text !== expectedReferenceText) {
    reasons.push("key: must exactly repeat the code-selected source-backed lesson text");
  }
  if (item.explanation !== keyed[0]!.text) {
    reasons.push("explanation: must exactly repeat the source-backed keyed lesson text");
  }
  const normalized = item.options.map((option) => normalizeOptionText(option.text));
  if (new Set(normalized).size !== normalized.length) {
    reasons.push("options: normalized texts must be unique");
  }
  return reasons;
}

export function sourceOptionUsesExactReferenceContract(
  item: OptionSelectItem,
  canonicalLabel: string
): boolean {
  return item.question === sourceOptionExactReferenceQuestion(canonicalLabel);
}
