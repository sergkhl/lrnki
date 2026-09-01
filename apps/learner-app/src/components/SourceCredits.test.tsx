import { afterEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

import {
  SourceCreditList,
  SourceCreditsExpander,
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

test("a compact disclosure resolves only authored keys and exposes its expanded state", async () => {
  await render(
    <SourceCreditsExpander
      sourceCredits={credits}
      sourceCreditKeys={["official-guide"]}
      contextLabel="the Lesson section"
    />
  );

  const toggle = screen.getByLabelText("Show sources for the Lesson section");
  expect(toggle.props.accessibilityState).toMatchObject({ expanded: false });
  expect(screen.queryByText("Official reasoning guide")).toBeNull();
  expect(screen.queryByText("Second guide")).toBeNull();

  await fireEvent.press(toggle);

  expect(screen.getByLabelText("Hide sources for the Lesson section").props.accessibilityState)
    .toMatchObject({ expanded: true });
  expect(screen.getByText("Official reasoning guide")).toBeTruthy();
  expect(screen.getByText("Ada Author · Example Institute")).toBeTruthy();
  expect(screen.getByText("Published 2026 · Version 2 · Accessed 2026-09-01")).toBeTruthy();
  expect(screen.getByText("License: CC BY 4.0")).toBeTruthy();
  expect(screen.queryByText("Second guide")).toBeNull();
});

test("the source action has a descriptive accessible label and opens the exact HTTPS URL", async () => {
  const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  await render(<SourceCreditList sourceCredits={[credits[0]]} />);

  await fireEvent.press(screen.getByLabelText("Open source: Official reasoning guide"));

  expect(openURL).toHaveBeenCalledWith("https://example.org/reasoning-guide");
});
