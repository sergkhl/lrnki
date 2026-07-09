# Blockers

- **Learner App universal Expo cutover (plan
  [2026-07-09-001](./2026-07-09-001-feat-learner-app-universal-expo-plan.md) U6).** The rule-14
  native half and the ADR-0032 feel gate need the user's phone: run `pnpm --filter
  @lrnki/learner-app start` and open the app in Expo Go (set `EXPO_PUBLIC_LEARNER_API_URL` to a
  reachable API), register, study a real expedition, and capture screenshots of the trail +
  crystals to compare side-by-side with the web export (web evidence already in
  `tmp/2026-07-09-learner-app-universal-expo/`). Until both pass, `apps/learner-web` stays
  frozen and is not deleted.
