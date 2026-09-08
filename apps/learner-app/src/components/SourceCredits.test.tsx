import { afterEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import { PortalHost } from "@rn-primitives/portal";
import { SafeAreaProvider } from "react-native-safe-area-context";

import {
  SourceCreditList,
  SourceCreditsButton,
  type SourceCredit
} from "./SourceCredits";

const credits = [
  {
    key: "official-guide",
    title: "Official reasoning guide",
    url: "https://example.org/reasoning-guide",
    author: "Ada Author",
    publisher: "Example Institute",
    publishedAt: "2026",
    version: "2",
    accessedAt: "2026-09-01",
    license: "CC BY 4.0",
    note: "Supports the named reasoning operation."
  },
  {
    key: "second-guide",
    title: "Second guide",
    url: "https://example.org/second-guide",
    publisher: "Second Institute",
    accessedAt: "2026-09-01"
  }
] satisfies SourceCredit[];

afterEach(() => {
  jest.restoreAllMocks();
});

test("one compact control deduplicates authored keys and opens sources without expanding the card", async () => {
  await render(
    <SafeAreaProvider initialMetrics={{ insets: { top: 0, bottom: 0, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } }}>
    <SourceCreditsButton
      sourceCredits={credits}
      sourceCreditKeys={["official-guide", "official-guide"]}
      contextLabel="the Lesson section"
    />
    <PortalHost />
    </SafeAreaProvider>
  );

  const toggle = screen.getByLabelText("Show sources for the Lesson section");
  expect(toggle.props.accessibilityState).toMatchObject({ expanded: false });
  expect(screen.queryByText("Official reasoning guide")).toBeNull();
  expect(screen.queryByText("Second guide")).toBeNull();

  await fireEvent.press(toggle);

  expect(screen.getByLabelText("Show sources for the Lesson section").props.accessibilityState)
    .toMatchObject({ expanded: true });
  expect(screen.getByText("Official reasoning guide")).toBeTruthy();
  expect(screen.getByText("Ada Author · Example Institute")).toBeTruthy();
  expect(screen.getByText("Published 2026 · Version 2 · Accessed 2026-09-01")).toBeTruthy();
  expect(screen.getByText("License: CC BY 4.0")).toBeTruthy();
  expect(screen.queryByText("Second guide")).toBeNull();
  expect(screen.getAllByText("Official reasoning guide")).toHaveLength(1);
  await fireEvent.press(screen.getByLabelText("Close sources"));
  expect(screen.queryByText("Official reasoning guide")).toBeNull();
});

test("the source action has a descriptive accessible label and opens the exact HTTPS URL", async () => {
  const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  await render(<SourceCreditList sourceCredits={[credits[0]]} />);

  await fireEvent.press(screen.getByLabelText("Open source: Official reasoning guide"));

  expect(openURL).toHaveBeenCalledWith("https://example.org/reasoning-guide");
});
