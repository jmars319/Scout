# Desktop Release Distribution

Scout has two macOS package paths.

## Local QA Package

Use this for internal testing:

```sh
pnpm run package:desktop
pnpm run qa:desktop-install
```

This produces an ad-hoc signed local app, DMG, and zip under `dist/desktop`, installs the app into `/Applications`, verifies the signature, starts the packaged runtime, checks database/schema readiness, and shuts it down.

## Public Release Package

Use this only after Apple credentials are configured:

```sh
pnpm run check:desktop-release-env
pnpm run package:desktop:release
```

The release preflight requires one Developer ID signing path:

- `CSC_LINK`
- `CSC_NAME` pointing at an installed `Developer ID Application` identity
- an installed `Developer ID Application` certificate in the macOS keychain

It also requires one notarization credential set:

- `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- `APPLE_KEYCHAIN_PROFILE`

`package:desktop:release` runs the preflight, builds the package, then checks the final `.app` with `codesign` and Gatekeeper assessment.
