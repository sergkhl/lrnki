# Blockers

Manual actions required for the
[Learner App deployment plan](./2026-07-08-002-feat-learner-app-deployment-plan.md):

- DNS: A record `api.lrnki.globesoul.com` → VPS IP. ✅ Done (2026-07-09). CNAME
  `lrnki.globesoul.com` → `sergkhl.github.io` still to add once the first Pages deploy exists.
- After the first Pages workflow run: set the Pages custom domain to `lrnki.globesoul.com` and
  enforce HTTPS in repo settings; optionally verify `globesoul.com` under GitHub account →
  Pages verified domains.
- `scripts/deploy-learner-api.sh` runs on the VPS against the local Docker daemon (no SSH env
  vars needed); ensure `LITELLM_API_KEY` is set in the repo-root `.env` on the VPS.
