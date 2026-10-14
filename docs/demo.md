# Real local demo

```sh
npm install
npm run demo
```

Open the dashboard at http://127.0.0.1:5173 and keep **Demo** selected. The sample frontend at http://127.0.0.1:4600 provides a scenario selector and a **Run request** button. Automatic traffic cycles through scenarios every 2.5 seconds.

## Actual services and work

| Port | Service           | Behavior                                                            |
| ---- | ----------------- | ------------------------------------------------------------------- |
| 4600 | `web-frontend`    | Local HTML page and scenario request entry point                    |
| 4601 | `api-service`     | Checkout orchestration over HTTP                                    |
| 4602 | `user-service`    | Reads a local SQLite users table                                    |
| 4603 | `order-service`   | Reads orders and calls the payment sandbox                          |
| 4604 | `payment-sandbox` | Local simulated external dependency; no payment provider connection |

Five Express HTTP listeners run locally in the example process. They perform real requests and SQLite queries, use official OpenTelemetry providers/exporters, and propagate W3C trace context over HTTP. Separate resources identify each logical service. The database is `.traceverse/demo.sqlite`; it contains only seeded example records.

The graph can infer a database dependency from actual database spans. The sandbox's external category describes its role in the sample architecture; it still runs on your computer.

## Deterministic scenarios

| Scenario   | Result                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------ |
| `success`  | Checkout calls users, orders, SQLite, and the payment sandbox successfully                 |
| `slow`     | An order database operation adds a 420 ms delay around the real SQLite query               |
| `error`    | Payment sandbox returns a deterministic error, propagated back through the caller services |
| `multi`    | Checkout adds another user-service request                                                 |
| `recovery` | A successful request after an error scenario; the response marks recovery                  |

You can also visit `http://127.0.0.1:4600/scenario/success`, replacing the final path segment with `slow`, `error`, `multi`, or `recovery`. The frontend scenario response flushes the telemetry batch before returning. Failed scenarios return HTTP 500 by design; they are part of the demo rather than a startup failure.

Every exported sample span carries source `demo`. Choose **Live** when observing your application. Choose **Synthetic** for generated interface samples, or **Replay** to inspect saved history. Demo is real local behavior with deterministic scenarios; it is not production application traffic.

To disable automatic example traffic in PowerShell:

```powershell
$env:TRACEVERSE_DEMO_AUTOTRAFFIC = '0'
npm run demo
```

In a POSIX shell: `TRACEVERSE_DEMO_AUTOTRAFFIC=0 npm run demo`. Manual scenario requests still work. Remove/reset the environment variable before enabling automatic traffic again.

## Optional framework fixtures

Start the dashboard/collector with `npm run dev`, then start one example in another terminal:

```sh
npm run dev --workspace examples/node-http-demo
npm run dev --workspace examples/fastify-demo
```

These separate commands run `node-http-example` on http://127.0.0.1:4800 and `fastify-example` on http://127.0.0.1:4801/tested, respectively. Their spans are labeled **Live**. The optional Next.js fixture runs on 4700; see [instrumentation](instrumentation.md).
