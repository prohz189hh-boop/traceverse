# Local collector API

Base URL: **`http://127.0.0.1:4318`**. The collector listens on loopback and is intended for a trusted local developer machine. This is a trace-only HTTP JSON receiver, not a full OpenTelemetry Collector distribution.

These endpoints exist only in the **local application**. The GitHub Pages demo serves static files, has no collector API or SQLite database, and never attempts collector requests. It cannot receive application telemetry.

## Network and resource limits

- Allowed Host names: `127.0.0.1` and `localhost`.
- Allowed browser origins: `http://127.0.0.1:5173`, `http://localhost:5173`, `http://127.0.0.1:4318`, and `http://localhost:4318`.
- Requests without an Origin header are accepted from local processes when Host is valid. Browser Origin is checked when present.
- Body limit: **2 MiB**. JSON payloads must be uncompressed.
- Request limits per client IP: **600 OTLP ingestion requests per minute** at `/v1/traces`; **120 requests per minute** for other API traffic.
- Defaults: **10,000 spans**, **60-minute receipt-time retention**.
- Maximum per OTLP ingestion request: **5,000 spans**.
- WebSocket limit: **8 dashboards**; clients with over **1 MiB** of queued outgoing data are closed and can reconnect for a fresh snapshot.

There is no authentication token. Host/origin controls do not make the collector suitable for public deployment. Do not change network exposure casually.

## Endpoints

| Method and path       | Result                                                                      |
| --------------------- | --------------------------------------------------------------------------- |
| `GET /health`         | Status, version, retained span count, and current retention settings        |
| `POST /v1/traces`     | Validate and ingest OTLP/HTTP JSON trace data                               |
| `GET /api/spans`      | `{ "spans": [...] }` in start-time order                                    |
| `GET /api/session`    | Versioned export of current normalized history                              |
| `POST /api/session`   | Validate/sanitize and **replace** current history; `{ "imported": number }` |
| `DELETE /api/session` | Clear local history; `{ "cleared": true }` and stream reset                 |
| `PATCH /api/settings` | Update retention/count settings and prune immediately                       |
| `GET /ws`             | Upgrade to the server-to-browser telemetry stream                           |

Errors are JSON objects with an `error` string. Typical statuses are 400 (invalid payload/settings), 403 (Host/origin rejected), 413 (body too large), 415 (unsupported content type), and 429 (rate limit). A successful trace export responds with HTTP 200 and `{}`. Invalid OTLP batches are rejected rather than partially ingested. Duplicate `traceId:spanId` identities are ignored.

## OTLP/HTTP JSON

Send `Content-Type: application/json` to `/v1/traces`. Use the official JavaScript `@opentelemetry/exporter-trace-otlp-http` exporter; `@opentelemetry/exporter-trace-otlp-proto` sends binary data and is unsupported here. gRPC, metrics, logs, binary Protobuf, and compressed bodies are outside this release.

The supported envelope is `resourceSpans → scopeSpans → spans`. Resource attribute `service.name` identifies the service; absent names become `unknown_service`. Resource attribute `traceverse.source` can be `live`, `demo`, or `synthetic`; unrecognized/missing values become `live`.

Trace IDs are 32 hexadecimal characters and span IDs are 16; all-zero IDs are invalid. Timestamps use Unix nanosecond decimal strings. Status and kind accept supported numeric or named OTLP enum values. A span must have a nonempty name, valid start/end timestamps, and a duration from zero to 24 hours. Events and safe attributes are bounded and sanitized.

This minimal shape illustrates the wire format. Real timestamps should come from your SDK, not a manually maintained JSON fixture:

```json
{
  "resourceSpans": [
    {
      "resource": {
        "attributes": [
          {
            "key": "service.name",
            "value": { "stringValue": "my-api" }
          }
        ]
      },
      "scopeSpans": [
        {
          "spans": [
            {
              "traceId": "0123456789abcdef0123456789abcdef",
              "spanId": "0123456789abcdef",
              "name": "GET /health",
              "kind": 2,
              "startTimeUnixNano": "1791936000000000000",
              "endTimeUnixNano": "1791936000010000000",
              "status": { "code": 1 }
            }
          ]
        }
      ]
    }
  ]
}
```

See the [official OTLP HTTP/JSON specification](https://opentelemetry.io/docs/specs/otlp/#json-protobuf-encoding) for the wider protocol. TraceVerse's supported subset and transport limits are stated above.

## Normalized spans and sessions

Session files use this envelope:

```ts
interface Session {
  version: 1;
  exportedAt: string; // ISO date/time
  spans: NormalizedSpan[];
}

interface NormalizedSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  serviceName: string;
  operation: string;
  startTime: number; // Unix milliseconds
  durationMs: number;
  status: 'ok' | 'error' | 'unset';
  kind: number;
  attributes: Record<string, string | number | boolean>;
  events: Array<{
    name: string;
    time: number; // Unix milliseconds
    attributes: Record<string, string | number | boolean>;
  }>;
  source: 'live' | 'demo' | 'synthetic';
}
```

Imports validate version, IDs, names, times, status, kinds, and event/attribute shapes, then sanitize again. The structural validator allows at most 100,000 spans, but the HTTP 2 MiB body limit is usually lower in practice. Stored imports keep at most the configured `maxSpans`. Importing via the collector replaces its current history and resets connected dashboards. Download an export first if you want to preserve the current session.

Retention uses **local receipt time**, so importing an old session preserves its historical timestamps while starting a fresh retention interval. Session files are unencrypted JSON; review them before sharing.

## Retention settings

```http
PATCH /api/settings
Content-Type: application/json

{"retentionMinutes":60,"maxSpans":10000}
```

Fields are optional, but unknown fields are rejected. `retentionMinutes` must be an integer from **1–1440**; `maxSpans` must be an integer from **100–50000**. The response contains both effective fields. Applying settings prunes history and sends a reset. Collector settings apply to the current process and are not persisted across restarts in v0.2.0.

## WebSocket stream

Connect to `ws://127.0.0.1:4318/ws` from a permitted browser origin. Messages contain a `type` and normalized `spans`:

```ts
type StreamMessage = {
  type: 'snapshot' | 'batch' | 'reset';
  spans: NormalizedSpan[];
};
```

- `snapshot`: current retained spans immediately after connection.
- `batch`: newly accepted spans, emitted in approximately 200 ms batches.
- `reset`: replace local state after deletion/import/settings changes or retention pruning.

The browser merges spans by identity and reconnects with bounded exponential delay. It receives a fresh snapshot after reconnecting. The stream only sends telemetry; client messages close the connection with policy code 1008. Excess clients or excessive send backlog use retry-later code 1013. These bounds favor freshness over guaranteed delivery of every animation.
