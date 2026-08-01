// GENERATED — do not hand-edit. Ported from the v4 crystal generator's authored `GEMS`
// dict (`tmp/crystal-formation-options/v4/gen/gems4.py`) by `dump_crystal_library.py` on
// 2026-07-30, plan 2026-07-30-001 U1. This module is now the single durable source for the
// eight-crystal library; the generator and its SVGs are superseded output (rule 18).
//
// Keys are ROLE ids, never appearance names: new art is a re-authoring pass over THIS file
// and nothing else. The art-swap contract lives in `crystalLibrary.ts`.
//
// Coordinates are already normalized to the shared 100-box: bedrock y = 95,
// one cap height for every species at y = 20. Facet `tone`s are the generator's
// authored `shade` scalars, read as positions on each species' light->base->dark ramp.

import type { CrystalSpec, CrystalSpecies } from "./crystalLibrary";

export const CRYSTAL_SPECS: Record<CrystalSpecies, CrystalSpec> = {
  // difficulty band 1 — blue round
  band1: {
    species: "band1",
    silhouette: [
      [50, 20], [68.75, 25.02], [82.48, 38.75], [87.5, 57.5], [82.48, 76.25], [68.75, 89.98],
      [50, 95], [31.25, 89.98], [17.52, 76.25], [12.5, 57.5], [17.52, 38.75], [31.25, 25.02]
    ],
    facets: [
      {
        points: [
          [58.32, 37.27], [70.19, 49.07], [70.23, 65.82], [58.43, 77.69], [41.68, 77.73],
          [29.81, 65.93], [29.77, 49.18], [41.57, 37.31]
        ],
        tone: 0.16
      },
      {
        points: [
          [50, 20], [68.75, 25.02], [50, 57.5]
        ],
        tone: 0.14
      },
      {
        points: [
          [87.5, 57.5], [82.48, 76.25], [50, 57.5]
        ],
        tone: -0.13
      },
      {
        points: [
          [82.48, 76.25], [68.75, 89.98], [50, 57.5]
        ],
        tone: -0.13
      },
      {
        points: [
          [68.75, 89.98], [50, 95], [50, 57.5]
        ],
        tone: -0.13
      },
      {
        points: [
          [50, 95], [31.25, 89.98], [50, 57.5]
        ],
        tone: -0.13
      },
      {
        points: [
          [12.5, 57.5], [17.52, 38.75], [50, 57.5]
        ],
        tone: 0.14
      },
      {
        points: [
          [17.52, 38.75], [31.25, 25.02], [50, 57.5]
        ],
        tone: 0.14
      },
      {
        points: [
          [31.25, 25.02], [50, 20], [50, 57.5]
        ],
        tone: 0.14
      }
    ],
    gloss: [
      [
        [36.46, 39.79], [52.08, 35.62], [43.75, 52.29], [32.29, 50.21]
      ]
    ],
    rimLight: [
      [12.5, 57.5], [17.52, 38.75], [31.25, 25.02], [50, 20], [68.75, 25.02]
    ],
    colors: { base: "#4a7fd4", dark: "#2b529c", light: "#8fb6f0", contour: "#152c5c" }
  },
  // difficulty band 2 — cyan octagon
  band2: {
    species: "band2",
    silhouette: [
      [32.35, 20], [67.65, 20], [91.91, 44.26], [91.91, 70.74], [67.65, 95], [32.35, 95],
      [8.09, 70.74], [8.09, 44.26]
    ],
    facets: [
      {
        points: [
          [32.35, 20], [67.65, 20], [61.03, 32.13], [38.97, 32.13]
        ],
        tone: 0.28
      },
      {
        points: [
          [8.09, 44.26], [32.35, 20], [38.97, 32.13], [38.97, 82.87]
        ],
        tone: 0.15
      },
      {
        points: [
          [91.91, 44.26], [91.91, 70.74], [67.65, 95], [61.03, 82.87], [61.03, 32.13]
        ],
        tone: -0.17
      },
      {
        points: [
          [32.35, 95], [67.65, 95], [61.03, 82.87], [38.97, 82.87]
        ],
        tone: -0.11
      },
      {
        points: [
          [38.97, 32.13], [61.03, 32.13], [61.03, 82.87], [38.97, 82.87]
        ],
        tone: 0.06
      }
    ],
    gloss: [
      [
        [42.28, 37.65], [57.72, 37.65], [41.18, 65.22], [32.35, 54.19]
      ]
    ],
    rimLight: [
      [8.09, 70.74], [8.09, 44.26], [32.35, 20], [67.65, 20]
    ],
    colors: { base: "#34c6c6", dark: "#178c8c", light: "#82ebe6", contour: "#08494a" }
  },
  // difficulty band 3 — green chamfered square
  band3: {
    species: "band3",
    silhouette: [
      [26, 20], [74, 20], [92, 38], [92, 77], [74, 95], [26, 95], [8, 77], [8, 38]
    ],
    facets: [
      {
        points: [
          [26, 20], [74, 20], [68, 32], [32, 32]
        ],
        tone: 0.26
      },
      {
        points: [
          [8, 38], [26, 20], [32, 32], [32, 83]
        ],
        tone: 0.14
      },
      {
        points: [
          [92, 38], [92, 77], [74, 95], [68, 83], [68, 32]
        ],
        tone: -0.16
      },
      {
        points: [
          [26, 95], [74, 95], [68, 83], [32, 83]
        ],
        tone: -0.1
      },
      {
        points: [
          [32, 32], [68, 32], [68, 83], [32, 83]
        ],
        tone: 0.06
      }
    ],
    gloss: [
      [
        [37, 37], [60, 37], [40, 68], [30, 58]
      ]
    ],
    rimLight: [
      [8, 77], [8, 38], [26, 20], [74, 20]
    ],
    colors: { base: "#4caf3f", dark: "#2b6f24", light: "#84d971", contour: "#123c0e" }
  },
  // difficulty band 4 — purple shard
  band4: {
    species: "band4",
    silhouette: [
      [36.76, 95], [36.76, 50], [50, 20], [63.24, 50], [63.24, 95]
    ],
    facets: [
      {
        points: [
          [36.76, 95], [36.76, 50], [50, 20], [50, 95]
        ],
        tone: -0.14
      },
      {
        points: [
          [50, 20], [63.24, 50], [63.24, 95], [50, 95]
        ],
        tone: 0.1
      },
      {
        points: [
          [44.71, 95], [44.71, 44.71], [50, 32.35], [55.29, 44.71], [55.29, 95]
        ],
        tone: 0.2
      },
      {
        points: [
          [36.76, 85.29], [63.24, 85.29], [63.24, 95], [36.76, 95]
        ],
        tone: -0.2
      }
    ],
    gloss: [
      [
        [46.47, 88.82], [46.47, 39.41], [50, 30.59], [52.65, 39.41], [52.65, 88.82]
      ]
    ],
    rimLight: [
      [36.76, 95], [36.76, 50], [50, 20]
    ],
    colors: { base: "#8b3fe0", dark: "#5a1da0", light: "#c194f7", contour: "#280852" }
  },
  // difficulty band 5 — red triangle
  band5: {
    species: "band5",
    silhouette: [
      [50, 20], [86.11, 95], [13.89, 95]
    ],
    facets: [
      {
        points: [
          [50, 20], [50, 95], [13.89, 95]
        ],
        tone: -0.16
      },
      {
        points: [
          [50, 20], [86.11, 95], [50, 95]
        ],
        tone: 0.1
      },
      {
        points: [
          [50, 38.52], [71.3, 82.96], [28.7, 82.96]
        ],
        tone: 0.12
      },
      {
        points: [
          [50, 20], [61.11, 43.15], [38.89, 43.15]
        ],
        tone: 0.2
      }
    ],
    gloss: [
      [
        [32.41, 84.81], [44.44, 55.19], [49.07, 58.89], [38.89, 88.52]
      ]
    ],
    rimLight: [
      [13.89, 95], [50, 20], [86.11, 95]
    ],
    colors: { base: "#d1443a", dark: "#8e2a24", light: "#f08376", contour: "#4a110d" }
  },
  // the summit Keystone — yellow wide hexagon
  keystone: {
    species: "keystone",
    silhouette: [
      [20, 20], [80, 20], [100.77, 56.92], [80, 95], [20, 95], [-0.77, 56.92]
    ],
    facets: [
      {
        points: [
          [20, 20], [80, 20], [89.23, 40.77], [10.77, 40.77]
        ],
        tone: 0.28
      },
      {
        points: [
          [-0.77, 56.92], [20, 20], [10.77, 40.77], [10.77, 73.08]
        ],
        tone: 0.14
      },
      {
        points: [
          [100.77, 56.92], [80, 95], [89.23, 73.08], [89.23, 40.77]
        ],
        tone: -0.18
      },
      {
        points: [
          [10.77, 73.08], [89.23, 73.08], [80, 95], [20, 95]
        ],
        tone: -0.12
      }
    ],
    gloss: [
      [
        [17.69, 31.54], [56.92, 31.54], [31.54, 54.62], [10.77, 47.69]
      ]
    ],
    rimLight: [
      [-0.77, 56.92], [20, 20], [80, 20]
    ],
    colors: { base: "#e8c11f", dark: "#a8820b", light: "#f8e17a", contour: "#4d3c03" }
  },
  // the Crystal Guardian ward (Leg) — orange diamond
  legWard: {
    species: "legWard",
    silhouette: [
      [50, 20], [79.31, 57.93], [50, 95], [20.69, 57.93]
    ],
    facets: [
      {
        points: [
          [50, 20], [50, 95], [20.69, 57.93]
        ],
        tone: -0.16
      },
      {
        points: [
          [50, 20], [79.31, 57.93], [50, 95]
        ],
        tone: 0.1
      },
      {
        points: [
          [50, 20], [79.31, 57.93], [50, 57.93], [20.69, 57.93]
        ],
        tone: 0.24
      },
      {
        points: [
          [20.69, 57.93], [50, 57.93], [50, 80.34]
        ],
        tone: 0.1
      }
    ],
    gloss: [
      [
        [31.9, 53.62], [46.55, 27.76], [50.86, 32.07], [38.79, 58.79]
      ]
    ],
    rimLight: [
      [20.69, 57.93], [50, 20], [79.31, 57.93]
    ],
    colors: { base: "#ef9b3a", dark: "#b86412", light: "#ffcd85", contour: "#5e2d04" }
  },
  // the Expedition Guardian ward (summit) — pink trident
  summitWard: {
    species: "summitWard",
    silhouette: [
      [26.51, 95], [26.51, 61.57], [33.73, 38.07], [40.96, 61.57], [43.67, 61.57], [43.67, 45.3],
      [50, 20], [56.33, 45.3], [56.33, 61.57], [59.04, 61.57], [66.27, 38.07], [73.49, 61.57],
      [73.49, 95]
    ],
    facets: [
      {
        points: [
          [26.51, 95], [26.51, 61.57], [33.73, 38.07], [33.73, 95]
        ],
        tone: -0.14
      },
      {
        points: [
          [33.73, 38.07], [40.96, 61.57], [40.96, 95], [33.73, 95]
        ],
        tone: 0.1
      },
      {
        points: [
          [59.04, 61.57], [66.27, 38.07], [66.27, 95], [59.04, 95]
        ],
        tone: -0.14
      },
      {
        points: [
          [66.27, 38.07], [73.49, 61.57], [73.49, 95], [66.27, 95]
        ],
        tone: 0.1
      },
      {
        points: [
          [43.67, 95], [43.67, 45.3], [50, 20], [50, 95]
        ],
        tone: -0.12
      },
      {
        points: [
          [50, 20], [56.33, 45.3], [56.33, 95], [50, 95]
        ],
        tone: 0.14
      },
      {
        points: [
          [26.51, 86.87], [73.49, 86.87], [73.49, 95], [26.51, 95]
        ],
        tone: -0.22
      }
    ],
    gloss: [
      [
        [47.29, 85.06], [47.29, 36.27], [50, 27.23], [52.71, 36.27], [52.71, 85.06]
      ]
    ],
    rimLight: [
      [26.51, 61.57], [33.73, 38.07], [40.96, 61.57]
    ],
    colors: { base: "#e0439e", dark: "#a01268", light: "#f79bd2", contour: "#520a34" }
  }
};
