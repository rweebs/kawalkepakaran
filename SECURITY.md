# Security policy

Report a vulnerability through GitHub private vulnerability reporting (Security tab of https://github.com/rweebs/kawalkepakaran)
or by email to rahmat.wibowo21@gmail.com. Please do not open a public issue for it. You will get an answer within 7 days.

## Scope

The site is static (no accounts, forms or database), so the realistic risks are:

- a compromised build or deploy pipeline, or a malicious dependency;
- leaked secrets in the repository;
- personal data in content;
- the third-party surface the policy page discloses: the Cloudflare Web Analytics beacon and the YouTube and TikTok embeds
  (allowed by the Content-Security-Policy in `public/_headers`).

Only the latest `main` (the live site) is supported. Out of scope: findings that need a compromised visitor device, denial of
service, and automated scanner output with no demonstrated impact.

## Safe harbour

Good-faith research within this scope, with no data destroyed or exfiltrated and no disruption of the live site, will not be met
with legal action. Give us a reasonable time to fix before you disclose.

Reports about content (corrections, removal) go through https://kawalkepakaran.org/kebijakan instead.
