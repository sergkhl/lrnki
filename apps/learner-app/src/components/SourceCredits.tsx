import { useMemo, useState } from "react";
import { Linking, View } from "react-native";
import { BookOpen, ExternalLink } from "lucide-react-native";

import type { CatalogView } from "@/lib/queries";
import {
  Button,
  Text,
  buttonIconColor
} from "@/ui";

export type SourceCredit = CatalogView["expeditions"][number]["sourceCredits"][number];

export function SourceCreditsExpander({
  sourceCredits,
  sourceCreditKeys,
  contextLabel
}: Readonly<{
  sourceCredits: readonly SourceCredit[];
  sourceCreditKeys: readonly string[];
  contextLabel: string;
}>) {
  const [expanded, setExpanded] = useState(false);
  const resolved = useMemo(() => {
    const byKey = new Map(sourceCredits.map((credit) => [credit.key, credit] as const));
    return sourceCreditKeys.flatMap((key) => {
      const credit = byKey.get(key);
      return credit ? [credit] : [];
    });
  }, [sourceCreditKeys, sourceCredits]);

  if (resolved.length === 0) return null;

  return (
    <View className="items-start gap-2">
      <Button
        variant="outline"
        size="compact"
        expanded={expanded}
        accessibilityLabel={`${expanded ? "Hide" : "Show"} sources for ${contextLabel}`}
        label={expanded ? "Hide sources" : `Sources (${resolved.length})`}
        icon={<BookOpen size={14} color={buttonIconColor("outline")} />}
        onPress={() => setExpanded((current) => !current)}
        testID="sources-expander"
      />
      {expanded ? (
        <View
          accessibilityLiveRegion="polite"
          className="w-full gap-3 rounded-control border border-line bg-muted-panel p-3"
          testID="source-credit-list"
        >
          <SourceCreditList sourceCredits={resolved} />
        </View>
      ) : null}
    </View>
  );
}

export function SourceCreditList({
  sourceCredits
}: Readonly<{ sourceCredits: readonly SourceCredit[] }>) {
  return sourceCredits.map((credit) => (
    <SourceCreditEntry key={credit.key} credit={credit} />
  ));
}

function SourceCreditEntry({ credit }: Readonly<{ credit: SourceCredit }>) {
  const [linkError, setLinkError] = useState(false);
  const authority = [credit.author, credit.publisher]
    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
    .join(" · ");
  const edition = [
    credit.publishedAt ? `Published ${credit.publishedAt}` : null,
    credit.version ? `Version ${credit.version}` : null,
    `Accessed ${credit.accessedAt}`
  ].filter(Boolean).join(" · ");

  const openSource = async () => {
    setLinkError(false);
    try {
      await Linking.openURL(credit.url);
    } catch {
      setLinkError(true);
    }
  };

  return (
    <View className="gap-1.5" testID={`source-credit-${credit.key}`}>
      <Text variant="label">{credit.title}</Text>
      {authority ? <Text variant="caption" color="muted">{authority}</Text> : null}
      <Text variant="caption" color="muted">{edition}</Text>
      {credit.license ? <Text variant="caption" color="muted">License: {credit.license}</Text> : null}
      {credit.note ? <Text variant="caption" color="muted">{credit.note}</Text> : null}
      <Button
        variant="outline"
        size="compact"
        accessibilityLabel={`Open source: ${credit.title}`}
        label="Open source"
        icon={<ExternalLink size={14} color={buttonIconColor("outline")} />}
        onPress={() => void openSource()}
        className="self-start"
      />
      {linkError ? (
        <Text variant="caption" color="destructive" accessibilityLiveRegion="polite">
          This source link could not be opened.
        </Text>
      ) : null}
    </View>
  );
}
