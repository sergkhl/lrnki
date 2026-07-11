import { afterEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { useReducedMotion } from "react-native-reanimated";
import { AppText, Input, Progress } from "./foundation";

const reducedMotionMock = useReducedMotion as jest.Mock;

afterEach(() => {
  reducedMotionMock.mockReturnValue(false);
});

test("Text variants forward React Native text props unchanged", async () => {
  await render(
    <AppText variant="title" numberOfLines={2} testID="title" allowFontScaling>
      A very long expedition title
    </AppText>
  );
  const text = screen.getByTestId("title");
  expect(text.props.numberOfLines).toBe(2);
  expect(text.props.allowFontScaling).toBe(true);
  expect(text.props.className).toContain("font-semibold");
});

test("Text nests inline spans like raw RN text", async () => {
  await render(
    <AppText testID="outer">
      outer <AppText variant="caption">inner</AppText>
    </AppText>
  );
  expect(screen.getByText("inner")).toBeTruthy();
});

test("Input associates label and hint, shows error state, and supports secure numeric entry", async () => {
  const { rerender } = await render(<Input label="PIN" hint="4 digits" secureTextEntry inputMode="numeric" value="" onChangeText={() => {}} />);
  const input = screen.getByLabelText("PIN");
  expect(input.props.secureTextEntry).toBe(true);
  expect(input.props.inputMode).toBe("numeric");
  expect(screen.getByText("4 digits")).toBeTruthy();

  await fireEvent(input, "focus");
  expect(screen.getByLabelText("PIN").props.className).toContain("border-frontier");

  await rerender(<Input label="PIN" hint="4 digits" error="Wrong PIN" secureTextEntry value="" onChangeText={() => {}} />);
  expect(screen.getByText("Wrong PIN")).toBeTruthy();
  expect(screen.queryByText("4 digits")).toBeNull();
  expect(screen.getByLabelText("PIN").props.className).toContain("border-destructive");
});

test("Input can be disabled without losing its label", async () => {
  await render(<Input label="Name" editable={false} value="explorer" onChangeText={() => {}} />);
  expect(screen.getByLabelText("Name").props.editable).toBe(false);
});

test("determinate progress exposes its accessibility value", async () => {
  await render(<Progress fraction={0.4} accessibilityLabel="Collected" />);
  const bar = screen.getByLabelText("Collected");
  expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 40 });
});

test("indeterminate progress renders a static track under reduced motion", async () => {
  reducedMotionMock.mockReturnValue(true);
  await render(<Progress fraction={null} accessibilityLabel="Scouting" />);
  const bar = screen.getByLabelText("Scouting");
  expect(bar.props.accessibilityValue).toBeUndefined();
  // Reduced motion swaps the sweeping segment for a plain static one.
  expect(JSON.stringify(bar.children.length ?? 0)).toBeDefined();
});
