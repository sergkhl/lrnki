// Pure, Cytoscape-free FFX-sphere-grid layout geometry (ADR-0019 derived-graph
// canvas). It turns a derived prerequisite DAG into per-loop serpentine grid
// positions, straight-segment edge route polylines, packed region boxes, and a
// PROVABLE crossing count — everything the Cytoscape applier (cytoscapeSphereGrid.ts)
// needs, with no `cytoscape` import, so it is fully unit-testable under `tsx --test`.
//
// Why this shape (KTDs):
//   - Enrichment only ever judges SAME-domain CEP pairs, so cross-domain edges cannot
//     exist; grouping nodes into one "loop" per declared domain yields zero cross-loop
//     crossings by construction. Each loop is packed into its own disjoint region box.
//   - General HV-grid planarity is NP-complete, so we do NOT decide it. Per loop we
//     embed a deterministic spanning tree as a boustrophedon (serpentine) snake on an
//     integer grid — trees are always grid-embeddable — then add non-tree / uncertain
//     edges back as straight routes. Those reconvergent edges are the only crossing
//     risk; sparse near-trees have few.
//   - The straight center-to-center segment is the crossing MODEL, not the rendered
//     geometry. Cytoscape renders orthogonal `taxi` tracks configured monotone within
//     each edge's bounding box, so the right-angle rendering cannot add a crossing the
//     straight model lacks (confirmed visually in the U4 rule-14 pass).
//   - Fail loud: if a loop's route set crosses, the loop is returned `flagged`, never
//     drawn as if clean (R10 / AGENTS rule 16). The caller surfaces it to the operator.

export interface SphereGridNodeInput {
  id: string;
  label: string;
  // The declared domain = the learning loop the node belongs to. Cross-domain edges
  // cannot exist, so this both groups the canvas into regions and guarantees no
  // inter-region edge. Absent/identical for a single-domain canvas (the learner path).
  domain: string;
  difficulty: number | null;
}

export interface SphereGridEdgeInput {
  source: string;
  target: string;
  uncertain: boolean | "yes" | "no";
}

export interface Point {
  x: number;
  y: number;
}

export interface SphereGridPosition {
  id: string;
  x: number;
  y: number;
}

// One rendered edge's straight-segment route polyline (currently a single segment:
// source center → target center). Carries the endpoint node ids so the crossing
// counter can exclude incident (node-sharing) edge pairs.
export interface SphereGridEdgeRoute {
  source: string;
  target: string;
  points: Point[];
}

// The packed bounding box of one loop, in absolute canvas coordinates. The region
// boxes of distinct loops never overlap (deterministic shelf packing).
export interface SphereGridRegion {
  domain: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SphereGridFlaggedLoop {
  domain: string;
  crossings: number;
}

export interface SphereGridLayout {
  positions: SphereGridPosition[];
  routes: SphereGridEdgeRoute[];
  regions: SphereGridRegion[];
  // Total crossing edge pairs across all loops. The R1 invariant asserts this is 0.
  crossings: number;
  // Loops whose own route set crosses despite the spanning-tree embedding — surfaced
  // for the operator instead of silently rendered (R10).
  flaggedLoops: SphereGridFlaggedLoop[];
}

// Grid lattice spacing (px). Cells are far larger than the largest node diameter
// (~48px) so taxi tracks have gutter room and the serpentine reads as a board.
const CELL = 130;
// Padding between a loop's outermost node centers and its region box edge.
const REGION_PAD = 90;
// Gap between packed region boxes (both axes).
const REGION_GAP = 150;
// Shelf packing wraps to a new row once a shelf would exceed this width.
const MAX_SHELF_WIDTH = 1600;
const EPS = 1e-9;

function certain(edge: SphereGridEdgeInput): boolean {
  return edge.uncertain === false || edge.uncertain === "no";
}

function isUncertain(edge: SphereGridEdgeInput): boolean {
  return edge.uncertain === true || edge.uncertain === "yes";
}

// Deterministic placement order: difficulty asc, then label, then id — identical to
// the prerequisite ordering the canvas uses everywhere, so the easiest/most-foundational
// concept anchors each loop.
function compareNodes(a: SphereGridNodeInput, b: SphereGridNodeInput): number {
  const difficultyA = a.difficulty ?? Number.POSITIVE_INFINITY;
  const difficultyB = b.difficulty ?? Number.POSITIVE_INFINITY;
  if (difficultyA !== difficultyB) return difficultyA - difficultyB;
  const labelOrder = a.label.localeCompare(b.label);
  if (labelOrder !== 0) return labelOrder;
  return a.id.localeCompare(b.id);
}

// Deterministic prerequisite (topological) order over the trusted graph only. Uncertain
// edges stay visible on the canvas but never control placement. If certain edges contain
// a cycle, Kahn's ready-queue empties; we break it by taking the lowest tie-break node
// still remaining, then continue. (Ported from the deleted spiral module — its file is
// gone, so this is now the single source of the ordering, R7/R18.)
export function orderLoopNodes(nodes: SphereGridNodeInput[], edges: SphereGridEdgeInput[]): string[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const remaining = new Set(byId.keys());
  const outgoing = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();

  for (const node of nodes) indegree.set(node.id, 0);

  for (const edge of edges) {
    if (!certain(edge) || !byId.has(edge.source) || !byId.has(edge.target)) continue;
    const targets = outgoing.get(edge.source) ?? new Set<string>();
    if (!targets.has(edge.target)) {
      targets.add(edge.target);
      outgoing.set(edge.source, targets);
      indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    }
  }

  const ordered: string[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter((id) => (indegree.get(id) ?? 0) === 0)
      .map((id) => byId.get(id)!)
      .sort(compareNodes);
    const next = ready[0] ?? [...remaining].map((id) => byId.get(id)!).sort(compareNodes)[0];

    ordered.push(next.id);
    remaining.delete(next.id);
    for (const target of outgoing.get(next.id) ?? []) {
      indegree.set(target, Math.max(0, (indegree.get(target) ?? 0) - 1));
    }
  }

  return ordered;
}

// Boustrophedon (serpentine) cell index → grid column/row. Row 0 runs left→right, row 1
// right→left, and so on, so consecutive ordered nodes are always grid-adjacent — the
// FFX-sphere-grid meander, and the property the single-chain fixture asserts.
function serpentineCell(index: number, width: number): { col: number; row: number } {
  const row = Math.floor(index / width);
  const offset = index % width;
  const col = row % 2 === 0 ? offset : width - 1 - offset;
  return { col, row };
}

// Place a loop's ordered nodes on a serpentine grid local to the loop (origin 0,0). The
// grid width is ~sqrt(n) so a loop forms a compact board rather than one long strip.
function serpentinePositions(orderedIds: string[]): Map<string, Point> {
  const width = Math.max(1, Math.ceil(Math.sqrt(orderedIds.length)));
  const positions = new Map<string, Point>();
  orderedIds.forEach((id, index) => {
    const { col, row } = serpentineCell(index, width);
    positions.set(id, { x: col * CELL, y: row * CELL });
  });
  return positions;
}

// Straight center-to-center route for every DRAWN edge (certain AND uncertain) whose
// endpoints both live in this loop. Uncertain edges are routed/drawn but, per
// `orderLoopNodes`, never influenced placement. De-duped by source→target.
function loopRoutes(positions: Map<string, Point>, edges: SphereGridEdgeInput[]): SphereGridEdgeRoute[] {
  const seen = new Set<string>();
  const routes: SphereGridEdgeRoute[] = [];
  for (const edge of edges) {
    const from = positions.get(edge.source);
    const to = positions.get(edge.target);
    if (!from || !to) continue;
    const key = `${edge.source} ${edge.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    routes.push({ source: edge.source, target: edge.target, points: [from, to] });
  }
  return routes;
}

function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

// Do two segments [p1,p2] and [p3,p4] cross such that it would read as an edge crossing?
// Proper interior intersection and positive-length collinear overlap count; a touch that
// is an endpoint of BOTH segments does not (coincident endpoints never count).
export function segmentsCross(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const r = sub(p2, p1);
  const s = sub(p4, p3);
  const denom = cross(r, s);
  const qp = sub(p3, p1);

  if (Math.abs(denom) < EPS) {
    // Parallel. Non-collinear → never meet.
    if (Math.abs(cross(qp, r)) > EPS) return false;
    // Collinear → overlap test by projecting p3,p4 onto r.
    const rr = r.x * r.x + r.y * r.y;
    if (rr < EPS) return false; // degenerate zero-length segment
    const t0 = (qp.x * r.x + qp.y * r.y) / rr;
    const t1 = t0 + (s.x * r.x + s.y * r.y) / rr;
    const lo = Math.max(0, Math.min(t0, t1));
    const hi = Math.min(1, Math.max(t0, t1));
    return hi - lo > EPS; // positive-length overlap only; a single-point touch does not count
  }

  const t = cross(qp, s) / denom;
  const u = cross(qp, r) / denom;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return false;
  // Intersection lies within both segments. Exclude an endpoint-to-endpoint touch
  // (coincident endpoints); a proper crossing or a T-junction (endpoint on the other's
  // interior) is a real crossing.
  const atEndpointOfBoth = (t < EPS || t > 1 - EPS) && (u < EPS || u > 1 - EPS);
  return !atEndpointOfBoth;
}

// Count crossing edge PAIRS among route polylines. Edge pairs sharing a node id are
// INCIDENT (they legitimately meet at that concept) and excluded; every other pair is
// tested segment-by-segment, counted at most once. Pure and deterministic.
export function countEdgeCrossings(routes: SphereGridEdgeRoute[]): number {
  let crossings = 0;
  for (let i = 0; i < routes.length; i += 1) {
    for (let j = i + 1; j < routes.length; j += 1) {
      const a = routes[i];
      const b = routes[j];
      if (a.source === b.source || a.source === b.target || a.target === b.source || a.target === b.target) {
        continue; // incident edges — shared endpoint, not a crossing
      }
      if (routesCross(a, b)) crossings += 1;
    }
  }
  return crossings;
}

function routesCross(a: SphereGridEdgeRoute, b: SphereGridEdgeRoute): boolean {
  for (let i = 0; i + 1 < a.points.length; i += 1) {
    for (let j = 0; j + 1 < b.points.length; j += 1) {
      if (segmentsCross(a.points[i], a.points[i + 1], b.points[j], b.points[j + 1])) return true;
    }
  }
  return false;
}

// Group nodes into loops by declared domain, preserving deterministic domain order.
function partitionByDomain(nodes: SphereGridNodeInput[]): Map<string, SphereGridNodeInput[]> {
  const byDomain = new Map<string, SphereGridNodeInput[]>();
  for (const node of nodes) {
    const bucket = byDomain.get(node.domain) ?? [];
    bucket.push(node);
    byDomain.set(node.domain, bucket);
  }
  return byDomain;
}

interface PlacedLoop {
  domain: string;
  localPositions: Map<string, Point>;
  routes: SphereGridEdgeRoute[];
  crossings: number;
  // Local bounds of node centers (before region offset).
  minX: number;
  minY: number;
  width: number;
  height: number;
}

function placeLoop(domain: string, nodes: SphereGridNodeInput[], edges: SphereGridEdgeInput[]): PlacedLoop {
  const order = orderLoopNodes(nodes, edges);
  const localPositions = serpentinePositions(order);
  const routes = loopRoutes(localPositions, edges);
  const crossings = countEdgeCrossings(routes);

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const { x, y } of localPositions.values()) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
  }

  return {
    domain,
    localPositions,
    routes,
    crossings,
    minX,
    minY,
    width: maxX - minX + REGION_PAD * 2,
    height: maxY - minY + REGION_PAD * 2
  };
}

// Deterministic shelf packing: place loop region boxes left→right, wrapping to a new
// shelf row once the current shelf would exceed MAX_SHELF_WIDTH. Guarantees the region
// boxes are pairwise disjoint (no bounding-box overlap), and therefore — with same-domain
// edges only — no route connects two regions.
function packRegions(loops: PlacedLoop[]): Map<string, { x: number; y: number; region: SphereGridRegion }> {
  const placed = new Map<string, { x: number; y: number; region: SphereGridRegion }>();
  let shelfX = 0;
  let shelfY = 0;
  let shelfHeight = 0;

  for (const loop of loops) {
    if (shelfX > 0 && shelfX + loop.width > MAX_SHELF_WIDTH) {
      shelfX = 0;
      shelfY += shelfHeight + REGION_GAP;
      shelfHeight = 0;
    }
    const region: SphereGridRegion = { domain: loop.domain, x: shelfX, y: shelfY, width: loop.width, height: loop.height };
    // Absolute offset that maps a local node center into this region's interior, past
    // the region padding.
    const offsetX = shelfX + REGION_PAD - loop.minX;
    const offsetY = shelfY + REGION_PAD - loop.minY;
    placed.set(loop.domain, { x: offsetX, y: offsetY, region });
    shelfX += loop.width + REGION_GAP;
    shelfHeight = Math.max(shelfHeight, loop.height);
  }

  return placed;
}

function offsetPoint(point: Point, dx: number, dy: number): Point {
  return { x: point.x + dx, y: point.y + dy };
}

// Build the full sphere-grid layout: one serpentine loop per declared domain, packed
// into disjoint regions, with absolute node positions, straight-segment routes, region
// boxes, a total crossing count, and the list of any loops flagged non-embeddable (R10).
export function layoutSphereGrid(nodes: SphereGridNodeInput[], edges: SphereGridEdgeInput[]): SphereGridLayout {
  const byDomain = partitionByDomain(nodes);
  const domains = [...byDomain.keys()].sort((a, b) => a.localeCompare(b));

  const loops = domains.map((domain) => {
    const loopNodes = byDomain.get(domain)!;
    const loopNodeIds = new Set(loopNodes.map((node) => node.id));
    // Only edges fully inside this loop participate (same-domain by construction; this
    // also defends the invariant if a stray cross-domain edge ever appears).
    const loopEdges = edges.filter((edge) => loopNodeIds.has(edge.source) && loopNodeIds.has(edge.target));
    return placeLoop(domain, loopNodes, loopEdges);
  });

  const packed = packRegions(loops);

  const positions: SphereGridPosition[] = [];
  const routes: SphereGridEdgeRoute[] = [];
  const regions: SphereGridRegion[] = [];
  const flaggedLoops: SphereGridFlaggedLoop[] = [];
  let crossings = 0;

  for (const loop of loops) {
    const place = packed.get(loop.domain)!;
    regions.push(place.region);
    crossings += loop.crossings;
    if (loop.crossings > 0) flaggedLoops.push({ domain: loop.domain, crossings: loop.crossings });

    for (const [id, point] of loop.localPositions) {
      positions.push({ id, x: point.x + place.x, y: point.y + place.y });
    }
    for (const route of loop.routes) {
      routes.push({
        source: route.source,
        target: route.target,
        points: route.points.map((point) => offsetPoint(point, place.x, place.y))
      });
    }
  }

  return { positions, routes, regions, crossings, flaggedLoops };
}

// Convenience re-export so callers/tests can reason about a single edge's certainty the
// same way placement does.
export { certain as isCertainEdge, isUncertain as isUncertainEdge };
