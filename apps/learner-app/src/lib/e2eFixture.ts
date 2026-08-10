export const E2E_FIXTURE_EMAIL = "native-fixture@fixture.invalid";
export const E2E_FIXTURE_PASSWORD = "native-fixture-password";

// Metro inlines EXPO_PUBLIC_* reads into the bundle. Keeping the read behind this tiny seam lets
// the gate test both build profiles without giving production code another source of truth.
export function isE2eBuild(): boolean {
  return process.env.EXPO_PUBLIC_LRNKI_E2E_BUILD === "1";
}
