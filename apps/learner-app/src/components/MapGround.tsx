// The parchment ground layer (plan 2026-07-18-001 U2, R1/R5), split so that NOTHING here
// rasterizes at trail scale. react-native-svg draws every <Svg> through an offscreen
// ARGB_8888 bitmap the size of the view, and Android's RecordingCanvas rejects any bitmap
// over 100MB — so the original single ground canvas, stretched over a real 400-stop
// expedition, asked for ~383MB and crashed the screen on first draw. The ground is now two
// bounded pieces:
//
// - `MapParchment` — the wash and the grain tile. ONE viewport-sized canvas that sits
//   BEHIND the scroll, so its bitmap is capped by the screen no matter how long the trail
//   is. A flat wash and a uniform grain read identically whether or not they scroll.
// - `MapFrame` — the sheet edge as a real view border (no canvas at all) plus one tiny
//   canvas per margin doodle, each sized to `doodleBox`.
//
// Element count is still O(stops + sections); no SVG filters (KTD3).
import { View } from "react-native";
import Svg, { Circle, Defs, Line, Path, Pattern, Rect } from "react-native-svg";
import { buildMapDoodles, buildMapGrain, doodleBox, type MapDoodle, type MapStopAnchor } from "@/learn/treasureMap";
import { colors } from "@/ui";

// The shipped 0.55 edge-stroke opacity as hex alpha, so the border keeps the token as its
// one source of colour.
const EDGE_ALPHA = "8c";

/** The fixed parchment behind the trail column. Renders outside the ScrollView, inset to
 * the same column the trail content occupies. */
export function MapParchment({ seed }: Readonly<{ seed: string }>) {
  const grain = buildMapGrain(seed);
  return (
    <View className="absolute inset-0 px-4" pointerEvents="none" testID="map-parchment">
      <View className="mx-auto h-full w-full max-w-sm" style={{ backgroundColor: colors["map-parchment"] }}>
        <Svg width="100%" height="100%">
          <Defs>
            <Pattern
              id="map-grain"
              width={grain.tileSize}
              height={grain.tileSize}
              patternUnits="userSpaceOnUse"
            >
              {grain.marks.map((mark, index) => (
                <Line
                  key={index}
                  x1={mark.x}
                  y1={mark.y}
                  x2={mark.x + mark.length}
                  y2={mark.y}
                  stroke={colors["map-ink-soft"]}
                  strokeOpacity={0.16}
                  strokeWidth={1}
                  transform={`rotate(${mark.angle} ${mark.x} ${mark.y})`}
                />
              ))}
            </Pattern>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#map-grain)" />
        </Svg>
      </View>
    </View>
  );
}

/** The sheet's weathered edge and its margin doodles, anchored to the measured trail
 * container so they scroll with the map. */
export function MapFrame({
  seed,
  width,
  stopAnchors
}: Readonly<{ seed: string; width: number; stopAnchors: readonly MapStopAnchor[] }>) {
  const doodles = width === 0 ? [] : buildMapDoodles({ seed, width, stopAnchors });
  return (
    <View
      className="absolute inset-0"
      pointerEvents="none"
      testID="map-ground"
      style={{ borderWidth: 1.5, borderRadius: 10, borderColor: `${colors["map-ink-soft"]}${EDGE_ALPHA}` }}
    >
      {doodles.map((doodle, index) => {
        // The doodle keeps drawing in container coordinates; the viewBox does the
        // translation, so only the canvas moved.
        const box = doodleBox(doodle);
        return (
          <View
            key={index}
            style={{ position: "absolute", left: box.x, top: box.y, width: box.width, height: box.height }}
          >
            <Svg width="100%" height="100%" viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}>
              <Doodle doodle={doodle} />
            </Svg>
          </View>
        );
      })}
    </View>
  );
}

// Nonsemantic margin marks (KTD8): faded ink, no fill weight, nothing that could read
// as a node, an edge, or progress.
function Doodle({ doodle }: Readonly<{ doodle: MapDoodle }>) {
  const ink = colors["map-ink-soft"];
  if (doodle.kind === "compass") {
    const r = doodle.size / 2;
    const cx = doodle.x + r;
    const cy = doodle.y + r;
    return (
      <>
        <Circle cx={cx} cy={cy} r={r} fill="none" stroke={ink} strokeOpacity={0.5} strokeWidth={1.2} />
        <Circle cx={cx} cy={cy} r={r * 0.55} fill="none" stroke={ink} strokeOpacity={0.4} strokeWidth={1} />
        <Line x1={cx} y1={doodle.y} x2={cx} y2={doodle.y + doodle.size} stroke={ink} strokeOpacity={0.5} strokeWidth={1} />
        <Line x1={doodle.x} y1={cy} x2={doodle.x + doodle.size} y2={cy} stroke={ink} strokeOpacity={0.5} strokeWidth={1} />
        <Path
          d={`M ${cx} ${cy - r * 0.8} L ${cx + r * 0.18} ${cy} L ${cx} ${cy + r * 0.35} L ${cx - r * 0.18} ${cy} Z`}
          fill={ink}
          fillOpacity={0.45}
        />
      </>
    );
  }
  if (doodle.kind === "contour") {
    const wave = (y: number, w: number) =>
      `M ${doodle.x} ${y} q ${w / 4} -3 ${w / 2} 0 q ${w / 4} 3 ${w / 2} 0`;
    return (
      <>
        <Path d={wave(doodle.y, doodle.width)} fill="none" stroke={ink} strokeOpacity={0.45} strokeWidth={1} />
        <Path d={wave(doodle.y + 5, doodle.width * 0.7)} fill="none" stroke={ink} strokeOpacity={0.35} strokeWidth={1} />
      </>
    );
  }
  return (
    <Path
      d={`M ${doodle.x} ${doodle.y + doodle.size} L ${doodle.x + doodle.size / 2} ${doodle.y} L ${doodle.x + doodle.size} ${doodle.y + doodle.size}`}
      fill="none"
      stroke={ink}
      strokeOpacity={0.45}
      strokeWidth={1.2}
      strokeLinejoin="round"
    />
  );
}
