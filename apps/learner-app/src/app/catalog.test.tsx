import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { PortalHost } from "@rn-primitives/portal";
import { Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { CatalogView } from "@/lib/queries";
import { SourcesAndLicensesDialog } from "./catalog";

const sources: CatalogView["sources"] = [{
  catalogKey: "critical-thinking",
  title: "Critical Thinking",
  sourceProvenance: {
    authorship: "lrnki_model_authored_project_source",
    knowledgeBasis: "general_model_knowledge_only",
    externalClaimVerificationRequired: false,
    acceptanceScope: "local_shared_learner_playtest"
  },
  sourceCredits: [
    {
      sourceResourceId: "local-source",
      title: "Critical Thinking primer",
      sourceUri: "lrnki model-authored project source",
      license: "lrnki project-owned playtest fixture"
    },
    {
      sourceResourceId: "web-source",
      title: "HTTP source",
      sourceUri: "https://example.test/source",
      license: null
    }
  ]
}];

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 }
};

beforeEach(() => {
  jest.restoreAllMocks();
});

test("one Catalog dialog renders server-owned source credits and links only HTTP URIs", async () => {
  const openUrl = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <SourcesAndLicensesDialog sources={sources} />
      <PortalHost />
    </SafeAreaProvider>
  );

  expect(screen.queryByText("Critical Thinking primer")).toBeNull();
  await fireEvent.press(screen.getByLabelText("Sources & licenses"));
  expect(screen.getByText("Critical Thinking")).toBeTruthy();
  expect(screen.getByText(/project-authored playtest source/)).toBeTruthy();
  expect(screen.getByText(/external claims are not independently verified/)).toBeTruthy();
  const localSource = screen.getByText("Source: lrnki model-authored project source");
  expect(localSource.props.accessibilityRole).toBeUndefined();
  expect(screen.getByText("License: lrnki project-owned playtest fixture")).toBeTruthy();

  const webSource = screen.getByRole("link");
  await fireEvent.press(webSource);
  expect(openUrl).toHaveBeenCalledWith("https://example.test/source");

  await fireEvent.press(screen.getByLabelText("Done"));
  expect(screen.queryByText("Critical Thinking primer")).toBeNull();
});
