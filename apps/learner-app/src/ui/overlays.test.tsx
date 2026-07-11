import { expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { PortalHost } from "@rn-primitives/portal";
import { Text as RNText } from "react-native";
import { Map as MapIcon } from "lucide-react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Dialog, FullScreenDialog, OverlayHeader, SideSheet } from "./overlays";
import { BottomSheet } from "./sheets";

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 }
};

function withHost(ui: React.ReactElement) {
  return (
    <>
      {ui}
      <PortalHost />
    </>
  );
}

test("Dialog mounts its content with a header icon and closes through the header control", async () => {
  const onOpenChange = jest.fn();
  await render(
    withHost(
      <Dialog open onOpenChange={onOpenChange}>
        <OverlayHeader icon={<MapIcon size={20} />} title="Board" description="Weekly standings" onClose={() => onOpenChange(false)} />
        <RNText>body</RNText>
      </Dialog>
    )
  );
  expect(screen.getByText("Board")).toBeTruthy();
  expect(screen.getByText("Weekly standings")).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Close"));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test("a blocked dialog ignores dismissal until the mutation settles", async () => {
  const onOpenChange = jest.fn();
  await render(
    withHost(
      <Dialog open onOpenChange={onOpenChange} dismissBlocked>
        <OverlayHeader
          icon={<MapIcon size={20} />}
          title="Planning"
          onClose={() => onOpenChange(false)}
          closeDisabled
        />
        <RNText>body</RNText>
      </Dialog>
    )
  );
  await fireEvent.press(screen.getByLabelText("Close"));
  expect(onOpenChange).not.toHaveBeenCalled();
});

test("FullScreenDialog renders full-surface content without a backdrop close", async () => {
  const onOpenChange = jest.fn();
  await render(
    withHost(
      <FullScreenDialog open onOpenChange={onOpenChange}>
        <OverlayHeader icon={<MapIcon size={20} />} title="Trail stop" onClose={() => onOpenChange(false)} />
        <RNText>activity body</RNText>
      </FullScreenDialog>
    )
  );
  expect(screen.getByText("activity body")).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Close"));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test("SideSheet mounts its menu content and closes through the shared header", async () => {
  const onOpenChange = jest.fn();
  await render(
    withHost(
      <SideSheet open onOpenChange={onOpenChange}>
        <OverlayHeader icon={<MapIcon size={20} />} title="Menu" onClose={() => onOpenChange(false)} />
        <RNText>menu body</RNText>
      </SideSheet>
    )
  );
  expect(screen.getByText("menu body")).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Close"));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test("closed overlays mount nothing", async () => {
  await render(
    withHost(
      <Dialog open={false} onOpenChange={() => {}}>
        <RNText>hidden</RNText>
      </Dialog>
    )
  );
  expect(screen.queryByText("hidden")).toBeNull();
});

test("BottomSheet closes normally but re-asserts itself while dismissal is blocked", async () => {
  const onOpenChange = jest.fn();
  const { rerender } = await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <BottomSheet open onOpenChange={onOpenChange}>
        <RNText>sheet body</RNText>
      </BottomSheet>
    </SafeAreaProvider>
  );
  expect(screen.getByText("sheet body")).toBeTruthy();
  expect(screen.getByTestId("bottom-sheet").props.accessibilityHint).toBe("pan-enabled");

  await rerender(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <BottomSheet open onOpenChange={onOpenChange} dismissBlocked>
        <RNText>sheet body</RNText>
      </BottomSheet>
    </SafeAreaProvider>
  );
  // Pan-down is disabled while a mutation is pending (AE4).
  expect(screen.getByTestId("bottom-sheet").props.accessibilityHint).toBe("pan-disabled");
});
