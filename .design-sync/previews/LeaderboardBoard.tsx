import { LeaderboardBoard } from "@lrnki/learner-app";

const page: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 12, width: 480 };

const entry = (rank: number, name: string, points: number, over: Record<string, unknown> = {}) => ({
  id: `e${rank}`,
  name,
  points,
  rank,
  isViewer: false,
  isRival: false,
  badges: { podiums: 0 },
  ...over
});

/** The weekly standings. Exactly one row is the viewer and at most one is the marked
 * rival — the board is a single ordered list, not a paged table. */
export function Standings() {
  return (
    <div style={page}>
      <LeaderboardBoard
        weekKey="2026-W33"
        masteredCrystalCount={18}
        entries={[
          entry(1, "Ada of the Frontier", 320, { badges: { podiums: 3 } }),
          entry(2, "Rune", 285, { isRival: true, badges: { podiums: 1 } }),
          entry(3, "You", 245, { isViewer: true }),
          entry(4, "Halden", 220),
          entry(5, "Mira", 180)
        ]}
      />
    </div>
  );
}

/** Leading the board — the viewer sits at rank 1 and the rival is the one below. */
export function Leading() {
  return (
    <div style={page}>
      <LeaderboardBoard
        weekKey="2026-W33"
        masteredCrystalCount={31}
        entries={[
          entry(1, "You", 410, { isViewer: true, badges: { podiums: 4 } }),
          entry(2, "Ada of the Frontier", 385, { isRival: true, badges: { podiums: 3 } }),
          entry(3, "Rune", 300)
        ]}
      />
    </div>
  );
}

/** A quiet week: a short board still renders its header and the mastered-crystal count. */
export function ShortBoard() {
  return (
    <div style={page}>
      <LeaderboardBoard
        weekKey="2026-W34"
        masteredCrystalCount={2}
        entries={[entry(1, "You", 15, { isViewer: true })]}
      />
    </div>
  );
}
