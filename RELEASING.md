# Releasing dsh-subagent-model-tags

Operational reference for publishing this plugin. The quick flow lives in the
README; this file records the full setup, the decisions behind it, and every
pitfall hit while building it, so a future session can release without
rediscovering them.

## Quick release

The version tag is the only input. Create a Release in the GitHub UI —
**Releases → Draft a new release**, tag `vX.Y.Z`, Publish — or push the tag
from a terminal:

```sh
git tag v1.0.3 && git push origin v1.0.3
```

The workflow then: writes `X.Y.Z` into `package.json`, commits the bump to
`main`, moves the tag onto that commit (so the tagged tree is exactly what gets
published, the shape `npm version` produces), runs the self-check, and
publishes to npm with provenance through Trusted Publishing (OIDC). Roughly a
minute, no human step. Moving the tag re-triggers the workflow once; that run
finds the version already published and exits. There is no local version bump
to remember — the tag is the source of truth. Verify with:

```sh
npm view @hukj/dsh-subagent-model-tags version
```

## What triggers what

| Action | Workflow | Publishes? |
|---|---|---|
| Push to `main` | CI | No — tests only |
| Pull request | CI | No — tests only |
| Push a `v*` tag | Release | Yes |
| Actions tab → Run workflow | Release | Yes (enter the version) |

A tag or a Release publishes. Four rails protect a mistaken tag: the tag must
be semver (`v1.2.3`), the self-check must pass, an already-published version is
skipped, and npm only honours an OIDC token minted for this repository and this
workflow file. The version bump is committed back to `main` as
`github-actions[bot]` with `[skip ci]`, so a release costs one extra commit and
no CI run.

## npm account state (configured 2026-11-22)

- Account `hukj` (rolfhu@163.com), 2FA enabled with a **passkey registered on an
  iPhone** (WebAuthn). There is no TOTP secret, and npm no longer accepts new
  TOTP registrations — security keys and passkeys only. Consequence: the CLI
  cannot complete a 2FA challenge, so local `npm publish` / `pnpm publish`
  always fails with an OTP error. **Publish from CI only.**
- Trusted publisher on the package: `rolfhu/dsh-subagent-model-tags` +
  `release.yml`, allowed action **`npm publish`** (direct). Connections cannot
  be edited; if publishing ever fails with `403 OIDC permission denied`, the
  connection regressed to stage-publish — delete and recreate it with direct
  publish selected. Do not accept the default `npm stage publish` permission:
  staging requires a human 2FA approval before the version goes live.
- No `NPM_TOKEN` secret exists or is needed. Do not add one; OIDC replaces it.

## Pitfalls already solved (do not re-debug)

1. `403 OIDC permission denied for this action` — the trusted-publisher
   connection allowed only stage-publish. Fixed by recreating it with the
   direct `npm publish` action.
2. `ERR_PNPM_OTP_NON_INTERACTIVE` locally — 2FA is a passkey; the CLI has no
   WebAuthn. Local publishing is impossible by design now; CI is the only path.
3. `404 version not found` seconds after a green publish — registry propagation
   lag of roughly 90 seconds. Wait and re-query before concluding failure.
4. `npm profile enable-2fa` answers "already enabled" with no factor registered
   — a half-open 2FA state. `disable-2fa` then `enable-2fa` resets it, though
   TOTP enrollment is refused (pitfall in the account state above).
5. Windows Hello prompts for a USB security key on npmjs.com — the page wants a
   cross-platform authenticator. Register the passkey on the iPhone instead.

## Plugin catalog (awesome-dsh-plugin / dshmarket)

`dshmarket` reads the curated `awesome-dsh-plugin` catalog; listing there is a
pull request, not a registry step.

- Status: **PR not yet created.** The catalog's CI rejects repositories younger
  than 1 day. This repository was created 2026-11-22T06:27Z, so it qualifies
  from 2026-11-23 ~14:27 (Asia/Shanghai).
- Branch pushed to the fork: `rolfhu/awesome-dsh-plugin` @
  `add-rolfhu-dsh-subagent-model-tags`, adding
  `data/plugins/rolfhu__dsh-subagent-model-tags.yml`. The entry draft is kept in
  `market/awesome-dsh-plugin-entry.yml`.
- Create the PR:
  <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/compare/main...rolfhu:add-rolfhu-dsh-subagent-model-tags?expand=1>
  Title: `Add rolfhu/dsh-subagent-model-tags`. One entry per PR; CI checks the
  `dsh.bundle` manifest, repo age, and formatting, then a maintainer reviews.
- Also add the `dsh-plugin` topic to this repository (About → ⚙ → Topics); it is
  a listing requirement.
- After merge, dshmarket, dshmarket.com, and awesome-dsh-plugin.com pick the
  entry up within about a day. New npm versions need no index change: the
  catalog maps versions from npm automatically through the `repository` field.

## Local development install

The profile installs the published registry version. To work on the code:
remove the registry bundle in Plugins, install from the local directory path,
and switch back to the registry version before tagging a release.
