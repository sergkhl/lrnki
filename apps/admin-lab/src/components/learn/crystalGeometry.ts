// Pure procedural crystal geometry — the durable core of the growing-crystal reward.
// A concept's identity (derivedNodeId) seeds a deterministic shard formation, so every
// concept grows a visually distinct crystal that is stable across reloads and devices
// without persisting any cosmetic state (growth derives from the completion rule at
// read time). If a real-3D renderer ever replaces the SVG layer, this seed → geometry
// mapping transfers untouched.

export interface CrystalShard {
  // Pentagon outline in the 0..100 viewBox: baseLeft, shoulderLeft, tip, shoulderRight,
  // baseRight. The base sits on the bedrock line (CRYSTAL_BASE); shards grow upward.
  points: readonly (readonly [number, number])[];
  // Shards appear center-out in this order as growth advances.
  revealIndex: number;
  // Per-facet lightness (%): adjacent shards differ so the formation reads faceted.
  lightness: number;
}

export interface CrystalSpec {
  // Per-concept hue, seeded within ±HUE_BAND of the journal gem hue so crystals differ
  // while the trail stays one palette.
  hue: number;
  shards: CrystalShard[];
}

export const CRYSTAL_VIEWBOX = "0 0 100 100";
export const CRYSTAL_SATURATION = 52;
// Where shards anchor. y sits above the viewBox floor so the base corners of angled
// shards (± half-width along the perpendicular) never leave the box.
export const CRYSTAL_BASE = { x: 50, y: 95 } as const;

// --journal-gem #2f8f83 in HSL space (theme.css owns the canonical color).
const BASE_HUE = 172;
const HUE_BAND = 20;
// The fan of shard directions, degrees from vertical.
const FAN_DEGREES = 110;

// FNV-1a over the id string: cheap, dependency-free, and stable across runtimes.
function hashSeed(key: string): number {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// mulberry32: tiny deterministic PRNG, uniform in [0, 1).
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function crystalSpec(seedKey: string, difficulty: number): CrystalSpec {
  const random = mulberry32(hashSeed(seedKey));
  const clampedDifficulty = Math.min(1, Math.max(0, difficulty));
  // Harder concepts grow bigger formations: 3..7 shards by difficulty band.
  const shardCount = 3 + Math.round(clampedDifficulty * 4);
  const hue = BASE_HUE + (random() * 2 - 1) * HUE_BAND;

  const angles: number[] = [];
  for (let index = 0; index < shardCount; index += 1) {
    const fanCenter = -FAN_DEGREES / 2 + ((index + 0.5) * FAN_DEGREES) / shardCount;
    angles.push(fanCenter + (random() * 2 - 1) * 8);
  }

  const shards = angles.map((angleDegrees) => {
    // Central shards rise tallest; the fan tapers outward like a natural cluster.
    const length = Math.min(82, Math.max(26, 78 - Math.abs(angleDegrees) * 0.55 + (random() * 2 - 1) * 7));
    const halfWidth = 6 + random() * 5 - Math.abs(angleDegrees) * 0.04;
    const lightness = 32 + random() * 14;

    const radians = (angleDegrees * Math.PI) / 180;
    const dirX = Math.sin(radians);
    const dirY = -Math.cos(radians);
    const perpX = Math.cos(radians);
    const perpY = Math.sin(radians);
    const shoulder = length * 0.62;

    const point = (along: number, aside: number): readonly [number, number] =>
      [round2(CRYSTAL_BASE.x + dirX * along + perpX * aside), round2(CRYSTAL_BASE.y + dirY * along + perpY * aside)] as const;

    return {
      angleDegrees,
      lightness: round2(lightness),
      points: [
        point(0, -halfWidth * 0.55),
        point(shoulder, -halfWidth),
        point(length, 0),
        point(shoulder, halfWidth),
        point(0, halfWidth * 0.55)
      ] as const
    };
  });

  // Center-out reveal: growth starts from the heart of the formation and fans outward.
  const revealOrder = shards
    .map((shard, index) => ({ index, distance: Math.abs(shard.angleDegrees) }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .map((entry) => entry.index);
  const revealIndexByShard = new Map(revealOrder.map((shardIndex, revealIndex) => [shardIndex, revealIndex] as const));

  return {
    hue: round2(hue),
    shards: shards.map((shard, index) => ({
      points: shard.points,
      lightness: shard.lightness,
      revealIndex: revealIndexByShard.get(index)!
    }))
  };
}

// The shards grown at a given completion fraction, in reveal order. The final shard is
// reserved for mastery itself, so a crystal never looks finished before the node is —
// the completion rule stays the one visible truth.
export function visibleShards(spec: CrystalSpec, growthFraction: number): CrystalShard[] {
  const ordered = [...spec.shards].sort((a, b) => a.revealIndex - b.revealIndex);
  if (growthFraction >= 1) return ordered;
  if (growthFraction <= 0) return [];
  const count = Math.min(ordered.length - 1, Math.max(1, Math.round(growthFraction * ordered.length)));
  return ordered.slice(0, count);
}
