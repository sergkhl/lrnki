import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { PortalHost } from "@rn-primitives/portal";
import { Platform, StyleSheet, Text as RNText } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { Map as MapIcon } from "lucide-react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Dialog, DialogBody, DialogFooter, FullScreenDialog, OverlayEntrance, OverlayHeader, SideSheet } from "./overlays";
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

beforeEach(() => {
  jest.mocked(useReducedMotion).mockReturnValue(false);
});

test("overlay content starts structurally visible before its entrance worklet advances", async () => {
  await render(
    <OverlayEntrance>
      <RNText>visible fallback</RNText>
    </OverlayEntrance>
  );
  // An entrance may decorate mounted content; it may not encode visibility in the
  // base style that remains when the worklet does not run.
  const wrapper = screen.getByText("visible fallback").parent;
  expect(wrapper?.props.style?.opacity ?? 1).toBe(1);
});

test("overlay entrances settle immediately for reduced motion and retain both normal-motion directions", async () => {
  const bottom = await render(
    <OverlayEntrance>
      <RNText>bottom entrance</RNText>
    </OverlayEntrance>
  );
  expect(screen.getByText("bottom entrance").parent?.props.entering).toEqual({ direction: "down", duration: 220 });
  await bottom.unmount();

  const right = await render(
    <OverlayEntrance slideFrom="right">
      <RNText>right entrance</RNText>
    </OverlayEntrance>
  );
  expect(screen.getByText("right entrance").parent?.props.entering).toEqual({ direction: "right", duration: 220 });
  await right.unmount();

  jest.mocked(useReducedMotion).mockReturnValue(true);
  await render(
    <OverlayEntrance>
      <RNText>settled entrance</RNText>
    </OverlayEntrance>
  );
  expect(screen.getByText("settled entrance").parent?.props.entering).toBeUndefined();
});

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
  // Native uses a bounded flex chain, not an absolute-positioned scroll ancestor (H1): an
  // absolute content node does not hand a definite height to the activity ScrollView, so
  // Theory grows unbounded and cannot scroll on Android. Jest runs the native branch.
  const fullscreen = screen.getByTestId("fullscreen-content").props.className ?? "";
  expect(fullscreen).toContain("flex-1");
  expect(fullscreen).not.toContain("absolute");
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

test("Covers AE5 anatomy (KTD9): the dialog body scrolls while the footer stays outside it", async () => {
  await render(
    withHost(
      <Dialog open onOpenChange={() => {}}>
        <OverlayHeader icon={<MapIcon size={20} />} title="Support" onClose={() => {}} />
        <DialogBody>
          <RNText>long body</RNText>
        </DialogBody>
        <DialogFooter>
          <RNText>actions</RNText>
        </DialogFooter>
      </Dialog>
    )
  );
  // The body is the ONE scrollable region; the actions render as a sibling after it, so a
  // tall body can never push them out of the bounded column (the former progress-dialog crop).
  expect(screen.getAllByTestId("dialog-body").length).toBe(1);
  // `shrink min-h-0`, not `flex-1`: shrink-from-natural is the Yoga contract that survives a
  // max-height-only column (grow-from-zero collapses to the border-only Android dialog). The
  // body — never the header or footer — is the region allowed to give up space and scroll.
  expect(screen.getByTestId("dialog-body").props.className ?? "").toContain("shrink");
  expect(screen.getByTestId("dialog-body").props.className ?? "").toContain("min-h-0");
  expect(screen.getByTestId("dialog-body").props.className ?? "").not.toContain("flex-1");
  expect(screen.getByText("long body")).toBeTruthy();
  expect(screen.getByText("actions")).toBeTruthy();
});

test("the centered dialog caps its height with one window-derived NUMERIC maximum (KTD5)", async () => {
  // The cap must be a resolved px number, not a percentage class or a web-only vh string:
  // those either need a definite-height parent (absent behind the web focus wrapper) or
  // collapse a max-only column on native. A numeric px cap resolves identically on both.
  await render(
    withHost(
      <Dialog open onOpenChange={() => {}}>
        <OverlayHeader icon={<MapIcon size={20} />} title="Support" onClose={() => {}} />
        <DialogBody>
          <RNText>capped body</RNText>
        </DialogBody>
      </Dialog>
    )
  );
  const cap = StyleSheet.flatten(screen.getByTestId("dialog-content").props.style) as { maxHeight?: unknown };
  expect(typeof cap.maxHeight).toBe("number");
  expect(cap.maxHeight as number).toBeGreaterThan(0);
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

test("on web the sheet mounts through the root PortalHost, escaping journal stacking (KTD7)", async () => {
  const original = Platform.OS;
  Object.defineProperty(Platform, "OS", { configurable: true, value: "web" });
  try {
    // Web relocates the whole primitive into the portal, so with no host in the tree the
    // sheet has nowhere to render — the native branch would render it in place here.
    const noHost = await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <BottomSheet open onOpenChange={() => {}}>
          <RNText>web sheet body</RNText>
        </BottomSheet>
      </SafeAreaProvider>
    );
    expect(screen.queryByText("web sheet body")).toBeNull();
    await noHost.unmount();
    // With the single root host present it renders at the root overlay layer.
    await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <BottomSheet open onOpenChange={() => {}}>
          <RNText>web sheet body</RNText>
        </BottomSheet>
        <PortalHost />
      </SafeAreaProvider>
    );
    expect(screen.getByText("web sheet body")).toBeTruthy();
  } finally {
    Object.defineProperty(Platform, "OS", { configurable: true, value: original });
  }
});
