import { ChaseBanner } from "@lrnki/learner-app";

const col: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 12, width: 460 };

/** The single highlighted rival on the weekly board: the nearest explorer above the
 * learner, or — when they lead — the nearest below. One line, never a list. */
export function Chasing() {
  return (
    <div style={col}>
      <ChaseBanner chase={{ name: "Ada of the Frontier", gap: 40, direction: "ahead" }} />
      <ChaseBanner chase={{ name: "Rune", gap: 5, direction: "ahead" }} />
    </div>
  );
}

/** When the learner is leading, the same banner names who is closing on them instead. */
export function BeingChased() {
  return (
    <div style={col}>
      <ChaseBanner chase={{ name: "Halden", gap: 25, direction: "behind" }} />
    </div>
  );
}
