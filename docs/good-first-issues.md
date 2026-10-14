# Starter contribution ideas

Choose one small, testable change and check existing issues before starting. The ideas below are candidate tasks, not invented user feedback or a claim that an issue has already been filed. Maintainers can add `good first issue` or `help wanted` after confirming the scope is current.

| Candidate task                            | Scope and acceptance criteria                                                                                                                           | Suggested labels                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Keyboard navigation regression            | Choose one service/filter/trace control, reproduce the issue, fix focus or activation, and add a focused browser check                                  | `accessibility`, `good first issue` |
| Instrumentation troubleshooting example   | Add a tiny failing/working Node HTTP or Express preload example; use real local requests and document why the collector receives no span before the fix | `documentation`, `telemetry`        |
| Static-demo deep-link regression          | Reproduce one fragment route or asset-loading failure under `/traceverse/`, then add a static-browser check                                             | `demo`, `good first issue`          |
| Empty or partial trace explanation        | Improve one empty/incomplete inspector state without inventing parents or request rates; verify with a deterministic sanitized span fixture             | `ux`, `telemetry`                   |
| Performance observation on another device | Run the documented harness with browser/renderer/viewport details, compare low/balanced/high and 2D, and report measurements with their limits          | `performance`, `help wanted`        |
| Sanitized export guidance                 | Add a concise before/after example showing sensitive names in permitted fields; never use private telemetry or credentials                              | `documentation`, `privacy`          |

## A small contribution workflow

1. Describe the user-visible problem and the smallest useful outcome in an issue.
2. Read the relevant workspace in [the architecture](architecture.md), then follow [CONTRIBUTING.md](../CONTRIBUTING.md) for setup.
3. Keep the change focused; use deterministic synthetic fixtures for UI behavior or genuine instrumented requests for collector/framework behavior.
4. Run the relevant checks and state exactly what ran. Include an actual screenshot for visual changes and the hardware/browser conditions for measurements.
5. Open a pull request describing the problem, resulting behavior, and remaining limits.

Do not weaken synthetic labeling, the public demo's collector isolation, local privacy controls, or bounded histories to make a test pass. Framework documentation must describe a verified integration boundary. Binary OTLP, remote authentication, and broad architectural redesigns need a separate proposal before implementation.
