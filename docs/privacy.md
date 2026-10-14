# Privacy and local data

TraceVerse has no analytics beacon, paid API integration, or hosted telemetry backend. By default, real application spans are sent to your local collector at `127.0.0.1:4318`, streamed to your local dashboard, and saved in local SQLite. Installing dependencies, cloning the repository, or following external documentation/GitHub links uses the network; running the installed application does not require an external service.

## Public demo boundary

The GitHub Pages site loads static assets from GitHub Pages, then generates bundled synthetic scenarios in your browser. It starts in Synthetic mode and offers Replay only for synthetic sessions. It has no application telemetry endpoint, does not contact a local collector over HTTP/WebSocket, and rejects file imports containing any `live` or `demo` spans. Never configure your application's exporter to use the public site.

Synthetic saved sessions and preferences stay in browser local storage under separate public-demo keys. They are not uploaded to a telemetry backend and do not share the local application's storage namespace. GitHub Pages still receives normal asset requests; this privacy boundary concerns application telemetry, not the web host's handling of ordinary HTTP requests.

Delete synthetic sessions in Sessions, or clear the site's browser storage to remove its sessions and preferences. Downloaded JSON exports stay on your disk until you delete them. Collector retention and **Clear collector telemetry** apply only to the real local collector. See [the public demo guide](public-demo.md).

## Framework telemetry

Next.js has a separate upstream framework usage analytics setting. The repository's optional Next.js launcher and verification command disable it through `NEXT_TELEMETRY_DISABLED=1`. When integrating your own Next.js application, set the same variable before launch; the [integration guide](instrumentation.md) includes the local environment setting. This setting is independent of exporting your application traces to TraceVerse.

## What is retained

The normalized model includes trace/span/parent IDs, service name, operation name, start time, duration, span kind, status, source, a small allowlist of semantic attributes, and limited events. Useful retained attributes include route/method/status code, service identity/category, destination address, database system/name/operation, RPC/messaging labels, and exception/error type.

The normalizer discards arbitrary custom attributes, request/response bodies, authorization/cookie headers, SQL statements, stack traces, exception messages, and environment variables. It removes query strings, fragments, and URL credentials from retained URL attributes and removes control characters and truncates text. Event names are reduced to `exception` or `event`.

These rules apply when telemetry enters TraceVerse. Your application's own OpenTelemetry instrumentation or another exporter may collect more information before this point. TraceVerse cannot control other exporters in your application.

An allowlist is not universal redaction. Instrumentation can place sensitive data in an otherwise permitted field, such as a service name, route path, database name, destination hostname, operation name, or exception type. Prefer route templates such as `/users/:id` to paths containing personal identifiers. Review your instrumentation and session exports before sharing them.

## Storage and deletion

The collector retains at most 10,000 spans for 60 minutes by default, subject to configurable retention and count limits. SQLite is a local unencrypted file. Browser preferences such as graphics quality, reduced motion, and collector connection URL are stored in local storage. Up to six saved/imported sessions are also kept in the browser's local storage; those copies have separate lifetimes from collector retention.

Use **Clear collector telemetry** or `DELETE /api/session` to clear collected history and reset connected dashboards. Delete each saved session in the Sessions page to remove its browser copy. Stop the application before removing its local database files directly. Deleting collector history does not delete saved browser sessions, a previously downloaded export, or browser preferences. Close other open TraceVerse tabs if you want to ensure their in-memory views are discarded.

Reducing retention discards older collector spans; it cannot restore previously deleted data. Dashboard file import validates a session and opens it in Replay without replacing collector history. The separate collector `POST /api/session` import replaces collector history. Replay labels historical activity and does not generate new real application requests.

## Exports and reports

Session exports contain normalized spans and are readable JSON. Exported values retain source labels and timestamps, so they can reveal service architecture, operation names, timing, and errors. Keep them out of public issue reports until reviewed. Any sanitized bug report is still subject to the same limitation: structural filtering cannot identify every secret embedded in an allowed field.

Do not share environment files, authentication headers, production databases, or tokens in a reproduction. Use the private process in [SECURITY.md](../SECURITY.md) for vulnerabilities.

## Local network controls

The collector binds to loopback and rejects unsupported Host/origin headers by default. It limits request size/rate, validates inputs, and bounds storage and streaming. There is no login or remote authorization layer. A trusted local process can send spans; a permitted local browser origin can read/delete history. These controls are designed for a local developer machine, not a shared public telemetry endpoint.

The collector's accepted browser origins and configuration are documented in [the API](api.md). Do not expose it through a public reverse proxy or port forwarding without designing authentication and deployment controls first.
