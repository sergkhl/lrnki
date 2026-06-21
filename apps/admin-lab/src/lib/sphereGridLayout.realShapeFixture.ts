// Real-shape regression fixture (U4): the exact node/edge SHAPE of a real seeded
// mixed-domain enrichment (5 domains, 59 nodes, 51 certain prerequisite edges),
// exported from the persisted Derived Graph Layer. This is an INPUT fixture exercising the
// deterministic layout envelope (ADR-0013 / AGENTS rule 11) — it asserts the geometry
// transform stays crossing-free, never anything about model judgment quality. Labels/ids are
// carried verbatim so the shape (branching, reconvergence, depth) matches production.
import type { SphereGridEdgeInput, SphereGridNodeInput } from "./sphereGridLayout";

export const realShapeNodes: SphereGridNodeInput[] = [
  {
    "id": "f77fbb32-ab64-4e6c-920f-c27788f386a0",
    "label": "DNA replication",
    "domain": "molecular biology",
    "difficulty": 0.393365
  },
  {
    "id": "ab02a29b-63e3-4af6-9490-aad81ff42dfc",
    "label": "double helix",
    "domain": "molecular biology",
    "difficulty": 0.278462
  },
  {
    "id": "eeb57074-5412-4c46-85bd-e2ce5f5c8454",
    "label": "complementary base pairing",
    "domain": "molecular biology",
    "difficulty": 0.258404
  },
  {
    "id": "c00b83b2-a723-4c5e-9a8b-a6abb13c1fb4",
    "label": "semiconservative replication",
    "domain": "molecular biology",
    "difficulty": 0.463519
  },
  {
    "id": "4fa0e4ce-fbe5-4631-8898-466ec6be8c68",
    "label": "Meselson and Stahl experiment",
    "domain": "molecular biology",
    "difficulty": 0.479423
  },
  {
    "id": "9dfc8da5-08f3-406a-95f9-bcc38296c8a2",
    "label": "Division of Labour",
    "domain": "economics",
    "difficulty": 0.364365
  },
  {
    "id": "51feefbd-6871-4b81-9940-c1d96612199e",
    "label": "Universal Opulence",
    "domain": "economics",
    "difficulty": 0.571538
  },
  {
    "id": "d6d1193b-9da9-4d44-b8ab-ec04acd9cc63",
    "label": "Propensity to Truck, Barter, and Exchange",
    "domain": "economics",
    "difficulty": 0.431058
  },
  {
    "id": "b05dde30-d949-42f1-9712-6f6e4b8e261e",
    "label": "Manufactures vs. Agriculture (Subdivision of Labour)",
    "domain": "economics",
    "difficulty": 0.372827
  },
  {
    "id": "f3598d21-7acf-491b-a969-79eafe0cf67c",
    "label": "Co-operation and Assistance of Great Multitudes",
    "domain": "economics",
    "difficulty": 0.566635
  },
  {
    "id": "6fd28ea9-e39f-4f12-81a8-c57052bbdf37",
    "label": "ownership (Rust)",
    "domain": "software engineering",
    "difficulty": 0.510308
  },
  {
    "id": "44a12566-6e96-47b6-b8b2-1da527227c93",
    "label": "move semantics",
    "domain": "software engineering",
    "difficulty": 0.545769
  },
  {
    "id": "673a6a88-d647-4016-806f-644ed54c06ae",
    "label": "clone (deep copy)",
    "domain": "software engineering",
    "difficulty": 0.591885
  },
  {
    "id": "d55eb9bb-e7b4-422c-8710-6fbde5a6d598",
    "label": "Copy trait",
    "domain": "software engineering",
    "difficulty": 0.566827
  },
  {
    "id": "6feb0b66-0265-497d-90de-81ba8397c9d4",
    "label": "stack (memory)",
    "domain": "software engineering",
    "difficulty": 0.313404
  },
  {
    "id": "d9b7398e-96a0-42c8-97b2-e4f7dd2ee343",
    "label": "Fitness Function",
    "domain": "machine learning systems",
    "difficulty": 0.36475
  },
  {
    "id": "2991f3ba-a390-450a-8ad2-7e973efc7b53",
    "label": "Exploration-Exploitation Trade-off",
    "domain": "machine learning systems",
    "difficulty": 0.575577
  },
  {
    "id": "64e5b8c0-d70c-48fe-83c8-22523a6c20f8",
    "label": "Generalization Gap",
    "domain": "machine learning systems",
    "difficulty": 0.366923
  },
  {
    "id": "185537f9-75d2-41ec-909b-2f19459a35e0",
    "label": "Overfitting (in agent search)",
    "domain": "machine learning systems",
    "difficulty": 0.472885
  },
  {
    "id": "66010b1b-8397-45fd-965f-ae662fb4efb3",
    "label": "Proxy Metric (Validation Score)",
    "domain": "machine learning systems",
    "difficulty": 0.396154
  },
  {
    "id": "a2e5b4d8-9758-40bf-a73f-a60a5a2cfbd3",
    "label": "Test Set Evaluation",
    "domain": "machine learning systems",
    "difficulty": 0.383115
  },
  {
    "id": "83e9c682-1ba9-45d6-9a3a-7b396f95d0d3",
    "label": "Final Node Selection",
    "domain": "machine learning systems",
    "difficulty": 0.610539
  },
  {
    "id": "212bb7bf-1c3b-4bcb-a2ea-5dee3e76e944",
    "label": "AIRA-dojo Framework",
    "domain": "machine learning systems",
    "difficulty": 0.578846
  },
  {
    "id": "96ab3f23-80ec-49ef-805e-a632002049d1",
    "label": "Medal Rate",
    "domain": "machine learning systems",
    "difficulty": 0.16125
  },
  {
    "id": "b59440f3-a731-4fcc-9408-944ba078ed44",
    "label": "Think Tokens",
    "domain": "machine learning systems",
    "difficulty": 0.28125
  },
  {
    "id": "03298a57-5bab-4cf2-ae8c-3944a79cf16a",
    "label": "Scoped Memory",
    "domain": "machine learning systems",
    "difficulty": 0.30375
  },
  {
    "id": "064b873a-d817-4ded-90b1-34ad015aa784",
    "label": "Prompt-Adaptive Complexity",
    "domain": "machine learning systems",
    "difficulty": 0.2925
  },
  {
    "id": "c1dfa87a-279e-41fe-9a4d-bbc30908ab36",
    "label": "Termination Rule (Search)",
    "domain": "machine learning systems",
    "difficulty": 0.241154
  },
  {
    "id": "0d378cae-ae56-4164-ba1c-6f4c1ad6f21b",
    "label": "Instructor-Aligned Knowledge Graphs",
    "domain": "educational technology",
    "difficulty": 0.541212
  },
  {
    "id": "5bf72db7-4dad-4d79-a01a-47e516019649",
    "label": "Temporal Signals (Teaching Order)",
    "domain": "educational technology",
    "difficulty": 0.17725
  },
  {
    "id": "fe1ca348-e06d-4df5-86d9-2bfa914fb1ac",
    "label": "Semantic Signals (Pedagogical Roles)",
    "domain": "educational technology",
    "difficulty": 0.30375
  },
  {
    "id": "34a3eeb8-1aad-4347-9258-d4d299a4a880",
    "label": "AI Research Agent",
    "domain": "machine learning systems",
    "difficulty": 0.726942
  },
  {
    "id": "53e0d702-4e98-4e45-9c14-3904de38d6c5",
    "label": "Overfitting",
    "domain": "machine learning systems",
    "difficulty": 0.474231
  },
  {
    "id": "60ba0431-508c-415f-bd64-1536b9b0f840",
    "label": "Proxy Evaluation",
    "domain": "machine learning systems",
    "difficulty": 0.475577
  },
  {
    "id": "78e57114-ceb9-4107-adbf-dede9ac549f6",
    "label": "AIRA-dojo",
    "domain": "machine learning systems",
    "difficulty": 0.545096
  },
  {
    "id": "4a3e600e-ca78-44b7-9e25-561bd16a33a6",
    "label": "DNA sequence",
    "domain": "molecular biology",
    "difficulty": 0.201058
  },
  {
    "id": "78e3e363-dc7a-4d15-800a-ffd78513a62d",
    "label": "nitrogenous base",
    "domain": "molecular biology",
    "difficulty": 0.12125
  },
  {
    "id": "2258c310-b6c6-4687-992b-58ea1a2a759b",
    "label": "Data Contamination",
    "domain": "machine learning systems",
    "difficulty": 0.18725
  },
  {
    "id": "4d6dda34-77bc-4eb9-8c26-f2d5df474f96",
    "label": "Evolutionary Search",
    "domain": "machine learning systems",
    "difficulty": 0.411154
  },
  {
    "id": "3f97e11c-09ac-4928-93ee-2136c1d80fac",
    "label": "MLE-bench",
    "domain": "machine learning systems",
    "difficulty": 0.42875
  },
  {
    "id": "c17980fc-c46b-49a4-aff4-7b368b39ed11",
    "label": "Selection Policy",
    "domain": "machine learning systems",
    "difficulty": 0.508173
  },
  {
    "id": "51e258eb-6d22-4d6d-b763-a94c8e5380c9",
    "label": "Test Score",
    "domain": "machine learning systems",
    "difficulty": 0.262019
  },
  {
    "id": "834dbaad-0ef2-4a8d-8c90-48826ce071f4",
    "label": "Benevolence vs. Self-Interest",
    "domain": "economics",
    "difficulty": 0.166
  },
  {
    "id": "6bd9688f-81e3-4964-98ba-07bcbd7a84a0",
    "label": "Contract / Exchange (human vs. animal)",
    "domain": "economics",
    "difficulty": 0.243462
  },
  {
    "id": "ce4b71de-0a13-47e8-a9d5-3bc4e4f72631",
    "label": "Loss of Time from Passing Between Different Kinds of Work",
    "domain": "economics",
    "difficulty": 0.316577
  },
  {
    "id": "80ee8a95-6e94-4790-ab83-e543ddfa0728",
    "label": "Market Town vs. Village (Industry Location)",
    "domain": "economics",
    "difficulty": 0.319712
  },
  {
    "id": "47fec169-d622-4918-9081-73880ea54ad9",
    "label": "Price of Goods Relative to Transport Cost / Weight",
    "domain": "economics",
    "difficulty": 0.220712
  },
  {
    "id": "0f4e9d46-a985-49c0-83af-af1df9f5e684",
    "label": "Productive Powers of Labour",
    "domain": "economics",
    "difficulty": 0.444423
  },
  {
    "id": "6fa16652-4476-4f23-b4a0-d85c2b33401b",
    "label": "Specialisation / Dedication to a Particular Occupation",
    "domain": "economics",
    "difficulty": 0.247019
  },
  {
    "id": "0a6ba115-04d7-41d8-b110-a3826a4ce998",
    "label": "Surplus Produce of Labour",
    "domain": "economics",
    "difficulty": 0.1435
  },
  {
    "id": "7cbe0235-ac35-408a-af5c-7ec5db48fb40",
    "label": "Cross-Validation Score",
    "domain": "machine learning systems",
    "difficulty": 0.257154
  },
  {
    "id": "7541d7d8-11a7-45c4-9559-0e36178cabda",
    "label": "Concept Extraction from Educational Content",
    "domain": "educational technology",
    "difficulty": 0.325
  },
  {
    "id": "26fe1a0e-380c-4cc5-9b3e-08fa1710ce94",
    "label": "Knowledge Graph Construction Methods",
    "domain": "educational technology",
    "difficulty": 0.501558
  },
  {
    "id": "7bb961cd-28b5-4daa-b72e-10edb4305944",
    "label": "drop on going out of scope",
    "domain": "software engineering",
    "difficulty": 0.307923
  },
  {
    "id": "bedd0265-7694-420f-a7ba-8d0398e55256",
    "label": "garbage collector (GC)",
    "domain": "software engineering",
    "difficulty": 0.12125
  },
  {
    "id": "207345f2-4b57-4371-9ba1-78187e3f56c4",
    "label": "last in, first out (LIFO)",
    "domain": "software engineering",
    "difficulty": 0.09375
  },
  {
    "id": "eb5b0a7d-aac5-4d25-a915-651b1c49e1c2",
    "label": "owner",
    "domain": "software engineering",
    "difficulty": 0.222212
  },
  {
    "id": "8b7e65ff-e467-4745-bbde-daeda21085ec",
    "label": "ownership transfer via function call",
    "domain": "software engineering",
    "difficulty": 0.603231
  },
  {
    "id": "1d5835f1-4576-498f-812a-db1a951ad59d",
    "label": "single owner rule",
    "domain": "software engineering",
    "difficulty": 0.215865
  }
];

export const realShapeEdges: SphereGridEdgeInput[] = [
  {
    "source": "0a6ba115-04d7-41d8-b110-a3826a4ce998",
    "target": "d6d1193b-9da9-4d44-b8ab-ec04acd9cc63",
    "uncertain": false
  },
  {
    "source": "0f4e9d46-a985-49c0-83af-af1df9f5e684",
    "target": "b05dde30-d949-42f1-9712-6f6e4b8e261e",
    "uncertain": false
  },
  {
    "source": "0f4e9d46-a985-49c0-83af-af1df9f5e684",
    "target": "ce4b71de-0a13-47e8-a9d5-3bc4e4f72631",
    "uncertain": false
  },
  {
    "source": "185537f9-75d2-41ec-909b-2f19459a35e0",
    "target": "83e9c682-1ba9-45d6-9a3a-7b396f95d0d3",
    "uncertain": false
  },
  {
    "source": "1d5835f1-4576-498f-812a-db1a951ad59d",
    "target": "44a12566-6e96-47b6-b8b2-1da527227c93",
    "uncertain": false
  },
  {
    "source": "207345f2-4b57-4371-9ba1-78187e3f56c4",
    "target": "6feb0b66-0265-497d-90de-81ba8397c9d4",
    "uncertain": false
  },
  {
    "source": "2258c310-b6c6-4687-992b-58ea1a2a759b",
    "target": "a2e5b4d8-9758-40bf-a73f-a60a5a2cfbd3",
    "uncertain": false
  },
  {
    "source": "26fe1a0e-380c-4cc5-9b3e-08fa1710ce94",
    "target": "0d378cae-ae56-4164-ba1c-6f4c1ad6f21b",
    "uncertain": false
  },
  {
    "source": "2991f3ba-a390-450a-8ad2-7e973efc7b53",
    "target": "34a3eeb8-1aad-4347-9258-d4d299a4a880",
    "uncertain": false
  },
  {
    "source": "34a3eeb8-1aad-4347-9258-d4d299a4a880",
    "target": "212bb7bf-1c3b-4bcb-a2ea-5dee3e76e944",
    "uncertain": false
  },
  {
    "source": "34a3eeb8-1aad-4347-9258-d4d299a4a880",
    "target": "78e57114-ceb9-4107-adbf-dede9ac549f6",
    "uncertain": false
  },
  {
    "source": "44a12566-6e96-47b6-b8b2-1da527227c93",
    "target": "7bb961cd-28b5-4daa-b72e-10edb4305944",
    "uncertain": false
  },
  {
    "source": "4a3e600e-ca78-44b7-9e25-561bd16a33a6",
    "target": "ab02a29b-63e3-4af6-9490-aad81ff42dfc",
    "uncertain": false
  },
  {
    "source": "51e258eb-6d22-4d6d-b763-a94c8e5380c9",
    "target": "64e5b8c0-d70c-48fe-83c8-22523a6c20f8",
    "uncertain": false
  },
  {
    "source": "51e258eb-6d22-4d6d-b763-a94c8e5380c9",
    "target": "c17980fc-c46b-49a4-aff4-7b368b39ed11",
    "uncertain": false
  },
  {
    "source": "53e0d702-4e98-4e45-9c14-3904de38d6c5",
    "target": "185537f9-75d2-41ec-909b-2f19459a35e0",
    "uncertain": false
  },
  {
    "source": "53e0d702-4e98-4e45-9c14-3904de38d6c5",
    "target": "34a3eeb8-1aad-4347-9258-d4d299a4a880",
    "uncertain": false
  },
  {
    "source": "60ba0431-508c-415f-bd64-1536b9b0f840",
    "target": "53e0d702-4e98-4e45-9c14-3904de38d6c5",
    "uncertain": false
  },
  {
    "source": "64e5b8c0-d70c-48fe-83c8-22523a6c20f8",
    "target": "60ba0431-508c-415f-bd64-1536b9b0f840",
    "uncertain": false
  },
  {
    "source": "66010b1b-8397-45fd-965f-ae662fb4efb3",
    "target": "a2e5b4d8-9758-40bf-a73f-a60a5a2cfbd3",
    "uncertain": false
  },
  {
    "source": "6bd9688f-81e3-4964-98ba-07bcbd7a84a0",
    "target": "9dfc8da5-08f3-406a-95f9-bcc38296c8a2",
    "uncertain": false
  },
  {
    "source": "6fa16652-4476-4f23-b4a0-d85c2b33401b",
    "target": "0f4e9d46-a985-49c0-83af-af1df9f5e684",
    "uncertain": false
  },
  {
    "source": "6fd28ea9-e39f-4f12-81a8-c57052bbdf37",
    "target": "eb5b0a7d-aac5-4d25-a915-651b1c49e1c2",
    "uncertain": false
  },
  {
    "source": "6feb0b66-0265-497d-90de-81ba8397c9d4",
    "target": "6fd28ea9-e39f-4f12-81a8-c57052bbdf37",
    "uncertain": false
  },
  {
    "source": "7541d7d8-11a7-45c4-9559-0e36178cabda",
    "target": "26fe1a0e-380c-4cc5-9b3e-08fa1710ce94",
    "uncertain": false
  },
  {
    "source": "78e3e363-dc7a-4d15-800a-ffd78513a62d",
    "target": "eeb57074-5412-4c46-85bd-e2ce5f5c8454",
    "uncertain": false
  },
  {
    "source": "78e57114-ceb9-4107-adbf-dede9ac549f6",
    "target": "3f97e11c-09ac-4928-93ee-2136c1d80fac",
    "uncertain": false
  },
  {
    "source": "7bb961cd-28b5-4daa-b72e-10edb4305944",
    "target": "d55eb9bb-e7b4-422c-8710-6fbde5a6d598",
    "uncertain": false
  },
  {
    "source": "7cbe0235-ac35-408a-af5c-7ec5db48fb40",
    "target": "a2e5b4d8-9758-40bf-a73f-a60a5a2cfbd3",
    "uncertain": false
  },
  {
    "source": "834dbaad-0ef2-4a8d-8c90-48826ce071f4",
    "target": "d6d1193b-9da9-4d44-b8ab-ec04acd9cc63",
    "uncertain": false
  },
  {
    "source": "8b7e65ff-e467-4745-bbde-daeda21085ec",
    "target": "673a6a88-d647-4016-806f-644ed54c06ae",
    "uncertain": false
  },
  {
    "source": "9dfc8da5-08f3-406a-95f9-bcc38296c8a2",
    "target": "6fa16652-4476-4f23-b4a0-d85c2b33401b",
    "uncertain": false
  },
  {
    "source": "a2e5b4d8-9758-40bf-a73f-a60a5a2cfbd3",
    "target": "51e258eb-6d22-4d6d-b763-a94c8e5380c9",
    "uncertain": false
  },
  {
    "source": "ab02a29b-63e3-4af6-9490-aad81ff42dfc",
    "target": "f77fbb32-ab64-4e6c-920f-c27788f386a0",
    "uncertain": false
  },
  {
    "source": "b05dde30-d949-42f1-9712-6f6e4b8e261e",
    "target": "f3598d21-7acf-491b-a969-79eafe0cf67c",
    "uncertain": false
  },
  {
    "source": "c00b83b2-a723-4c5e-9a8b-a6abb13c1fb4",
    "target": "4fa0e4ce-fbe5-4631-8898-466ec6be8c68",
    "uncertain": false
  },
  {
    "source": "c17980fc-c46b-49a4-aff4-7b368b39ed11",
    "target": "2991f3ba-a390-450a-8ad2-7e973efc7b53",
    "uncertain": false
  },
  {
    "source": "ce4b71de-0a13-47e8-a9d5-3bc4e4f72631",
    "target": "f3598d21-7acf-491b-a969-79eafe0cf67c",
    "uncertain": false
  },
  {
    "source": "d55eb9bb-e7b4-422c-8710-6fbde5a6d598",
    "target": "8b7e65ff-e467-4745-bbde-daeda21085ec",
    "uncertain": false
  },
  {
    "source": "d6d1193b-9da9-4d44-b8ab-ec04acd9cc63",
    "target": "47fec169-d622-4918-9081-73880ea54ad9",
    "uncertain": false
  },
  {
    "source": "d6d1193b-9da9-4d44-b8ab-ec04acd9cc63",
    "target": "6bd9688f-81e3-4964-98ba-07bcbd7a84a0",
    "uncertain": false
  },
  {
    "source": "d6d1193b-9da9-4d44-b8ab-ec04acd9cc63",
    "target": "80ee8a95-6e94-4790-ab83-e543ddfa0728",
    "uncertain": false
  },
  {
    "source": "d9b7398e-96a0-42c8-97b2-e4f7dd2ee343",
    "target": "4d6dda34-77bc-4eb9-8c26-f2d5df474f96",
    "uncertain": false
  },
  {
    "source": "d9b7398e-96a0-42c8-97b2-e4f7dd2ee343",
    "target": "66010b1b-8397-45fd-965f-ae662fb4efb3",
    "uncertain": false
  },
  {
    "source": "d9b7398e-96a0-42c8-97b2-e4f7dd2ee343",
    "target": "7cbe0235-ac35-408a-af5c-7ec5db48fb40",
    "uncertain": false
  },
  {
    "source": "d9b7398e-96a0-42c8-97b2-e4f7dd2ee343",
    "target": "c1dfa87a-279e-41fe-9a4d-bbc30908ab36",
    "uncertain": false
  },
  {
    "source": "eb5b0a7d-aac5-4d25-a915-651b1c49e1c2",
    "target": "1d5835f1-4576-498f-812a-db1a951ad59d",
    "uncertain": false
  },
  {
    "source": "eeb57074-5412-4c46-85bd-e2ce5f5c8454",
    "target": "4a3e600e-ca78-44b7-9e25-561bd16a33a6",
    "uncertain": false
  },
  {
    "source": "f3598d21-7acf-491b-a969-79eafe0cf67c",
    "target": "51feefbd-6871-4b81-9940-c1d96612199e",
    "uncertain": false
  },
  {
    "source": "f77fbb32-ab64-4e6c-920f-c27788f386a0",
    "target": "c00b83b2-a723-4c5e-9a8b-a6abb13c1fb4",
    "uncertain": false
  },
  {
    "source": "fe1ca348-e06d-4df5-86d9-2bfa914fb1ac",
    "target": "26fe1a0e-380c-4cc5-9b3e-08fa1710ce94",
    "uncertain": false
  }
];
