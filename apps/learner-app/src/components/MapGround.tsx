// The parchment ground layer (plan 2026-07-18-001 U2, R1/R5): ONE absolute,
// non-interactive SVG under the trail content — parchment wash, a single <Pattern>
// grain tile, the weathered edge border, and the seeded margin doodles from
// `treasureMap.ts`. Element count is O(stops + sections); no SVG filters (KTD3).
import { View } from "react-native";
import Svg, { Circle, Defs, Line, Path, Pattern, Rect } from "react-native-svg";
import { buildMapGround, type MapDoodle, type MapStopAnchor } from "@/learn/treasureMap";
import { colors } from "@/ui";

export function MapGround({
  seed,
  width,
  height,
  stopAnchors
}: Readonly<{ seed: string; width: number; height: number; stopAnchors: readonly MapStopAnchor[] }>) {
  if (width === 0 || height === 0) return null;
  const layout = buildMapGround({ seed, width, height, stopAnchors });
  return (
    <View className="absolute inset-0" pointerEvents="none" testID="map-ground">
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern
            id="map-grain"
            width={layout.grain.tileSize}
            height={layout.grain.tileSize}
            patternUnits="userSpaceOnUse"
          >
            {layout.grain.marks.map((mark, index) => (
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
        <Rect width={width} height={height} rx={10} fill={colors["map-parchment"]} />
        <Rect width={width} height={height} rx={10} fill="url(#map-grain)" />
        <Path
          d={layout.edgePath}
          fill="none"
          stroke={colors["map-ink-soft"]}
          strokeOpacity={0.55}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        {layout.doodles.map((doodle, index) => (
          <Doodle key={index} doodle={doodle} />
        ))}
      </Svg>
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
