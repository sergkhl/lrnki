import { useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Linking, Platform, View } from "react-native";
import { BookOpen, ExternalLink } from "lucide-react-native";

import type { CatalogView } from "@/lib/queries";
import {
  Button,
  Dialog,
  DialogBody,
  OverlayHeader,
  PressableSurface,
  Text,
  buttonIconColor
} from "@/ui";

export type SourceCredit = CatalogView["expeditions"][number]["sourceCredits"][number];

export function SourceCreditsButton({
  sourceCredits,
  sourceCreditKeys,
  contextLabel,
  testID
}: Readonly<{
  sourceCredits: readonly SourceCredit[];
  sourceCreditKeys: readonly string[];
  contextLabel: string;
  testID?: string;
}>) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<View>(null);
  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next && Platform.OS !== "web") requestAnimationFrame(() => {
      if (trigger.current) AccessibilityInfo.sendAccessibilityEvent(trigger.current, "focus");
    });
  };
  const resolved = useMemo(() => {
    const byKey = new Map(sourceCredits.map((credit) => [credit.key, credit] as const));
    return [...new Set(sourceCreditKeys)].flatMap((key) => {
      const credit = byKey.get(key);
      return credit ? [credit] : [];
    });
  }, [sourceCreditKeys, sourceCredits]);

  if (resolved.length === 0) return null;

  return (
    <>
      <PressableSurface
        ref={trigger}
        expanded={open}
        accessibilityLabel={`Show sources for ${contextLabel}`}
        onPress={() => setOpen(true)}
        className="min-h-target min-w-target shrink-0 flex-row items-center justify-center gap-1 px-1"
        testID={testID ?? "sources-button"}
      >
        <BookOpen size={14} color={buttonIconColor("outline")} />
        <Text variant="caption">Sources</Text>
      </PressableSurface>
      <Dialog open={open} onOpenChange={changeOpen} onCloseAutoFocus={event => {
        event.preventDefault();
        trigger.current?.focus();
      }}>
        <OverlayHeader
          icon={<BookOpen size={20} color={buttonIconColor("outline")} />}
          title="Sources"
          description={contextLabel}
          onClose={() => changeOpen(false)}
          closeLabel="Close sources"
        />
        <DialogBody>
          <SourceCreditList sourceCredits={resolved} />
        </DialogBody>
      </Dialog>
    </>
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
