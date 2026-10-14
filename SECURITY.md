# Security policy

TraceVerse v0.1.x is the initial supported release line. Security fixes are applied to the current release; older versions may need an upgrade.

## Report a vulnerability privately

If GitHub private vulnerability reporting is enabled, use [Report a vulnerability](https://github.com/prohz189hh-boop/traceverse/security/advisories/new). If the form is unavailable, use an available private contact on the [repository owner's GitHub profile](https://github.com/prohz189hh-boop), or ask for a private reporting channel without disclosing the vulnerability in a public issue.

Include the affected version, impact, prerequisites, and a minimal sanitized reproduction. Do not include authentication tokens, private telemetry, or exploit attempts against other systems. There is no paid bug bounty or guaranteed response deadline.

## Intended boundary

TraceVerse is a local development tool. The collector binds to loopback, checks Host/origin headers, limits request rates and body sizes, validates telemetry, strips unsupported/sensitive attributes, and bounds retention. It has no authentication or authorization system for public or shared deployment. Do not expose its port to a network as a production monitoring endpoint.

An allowed local browser origin can read and delete local history. Local processes can submit telemetry. These local trust assumptions are part of the design, not a substitute for user authentication.

The safe-attribute policy reduces collection but cannot detect every secret embedded in a service name, operation name, or retained exception type. Exception messages and stack traces are discarded. Review exported sessions before sharing. See [privacy](docs/privacy.md) for the exact data boundary.

## Maintainer release checks

- Inspect changes for credentials, private files, debug dumps, and generated databases.
- Run relevant validation and inspect dependency security/license changes.
- Keep collector validation, network controls, and session import limits covered by tests.
- Publish accurate release notes and disclose limitations without claiming an independent audit.
