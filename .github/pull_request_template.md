## Problem and result

Describe the concrete problem and what users will observe after this change.

## Validation

List the checks actually run and their results. Include actual screenshots for UI changes.

For public UI changes, verify `/traceverse/` assets/hash routes and run `npm run test:static`. For local telemetry changes, include a real instrumented request and relevant collector tests. For graphics changes, report the browser/renderer/viewport and measurements; requestAnimationFrame frequency alone is not rendered FPS.

- [ ] Relevant automated tests pass.
- [ ] Documentation matches changed commands, formats, defaults, and limitations.
- [ ] No credentials, private telemetry, generated databases, or temporary artifacts are included.
- [ ] Live, demo, synthetic, and replay data remain clearly labeled.
- [ ] The public build remains synthetic-only, has separate browser storage, and makes no collector requests.
- [ ] Security/privacy controls and bounded rendering/storage remain covered where affected.
- [ ] Dependency license inventory and browser notices are updated if dependencies changed.

## Risks or limitations

Mention anything reviewers should know, including incomplete verification.
