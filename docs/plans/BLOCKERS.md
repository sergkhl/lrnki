# Blockers

No open blockers.

- **RESOLVED 2026-06-25 — extraction prefix-cache reuse + provider access.** The prior blocker
  ("no dedicated OpenRouter key, so the per-host DeepSeek cache never reused the ~23k-token admission
  document, ~0.7% hit") is closed by routing the extraction aliases (`kg-concept-discovery`,
  `kg-concept-admission`, `kg-claim-extraction`, `default-model`) to **DeepSeek first-party**
  (`deepseek/deepseek-v4-flash-no-thinking`) instead of OpenRouter (`litellm/config.yaml`). First-party
  credits are live, and DeepSeek's prefix cache is per-ACCOUNT and automatic — no host pinning and no
  dedicated OpenRouter key required. Measured on a real AIRA-dojo run (2026-06-25,
  `tmp/2026-06-25-run-timing-spike/FINDINGS.md`): concept-discovery 162 s → 24 s/call, admission
  59 s → 17 s/call, cep-extraction cache 21% → 53%. The latency motivation (TODO #2) is met by the
  provider switch alone; the admission document-prefix cache warming further is a minor open
  optimization, not a blocker.
</content>
