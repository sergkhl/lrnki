export type LearnerDivision = {
  name: string;
  threshold: number;
  nextThreshold: number | null;
};

const DIVISIONS = [
  { name: "Basecamp", threshold: 0 },
  { name: "Foothills", threshold: 10 },
  { name: "Ridge", threshold: 30 },
  { name: "Summit", threshold: 75 }
] as const;

export function divisionForMasteredCrystals(masteredCrystals: number): LearnerDivision {
  const count = Math.max(0, Math.floor(masteredCrystals));
  let current: (typeof DIVISIONS)[number] = DIVISIONS[0];
  for (const division of DIVISIONS) {
    if (count >= division.threshold) current = division;
  }
  const index = DIVISIONS.findIndex((division) => division.name === current.name);
  return {
    name: current.name,
    threshold: current.threshold,
    nextThreshold: DIVISIONS[index + 1]?.threshold ?? null
  };
}
