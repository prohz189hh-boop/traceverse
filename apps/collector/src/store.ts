import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { NormalizedSpan } from '@traceverse/core';

export interface RetentionSettings { retentionMinutes: number; maxSpans: number }
export function validateSettings(input: RetentionSettings): RetentionSettings {
  if (!Number.isInteger(input.retentionMinutes) || input.retentionMinutes < 1 || input.retentionMinutes > 1440) throw new Error('retentionMinutes must be an integer from 1 to 1440');
  if (!Number.isInteger(input.maxSpans) || input.maxSpans < 100 || input.maxSpans > 50000) throw new Error('maxSpans must be an integer from 100 to 50000');
  return input;
}
export class CollectorStore {
  private readonly database: DatabaseSync;
  private config: RetentionSettings;
  private prunedSinceRead = 0;
  constructor(path: string, settings: RetentionSettings) {
    this.config = validateSettings(settings);
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; CREATE TABLE IF NOT EXISTS spans (id TEXT PRIMARY KEY, received_at INTEGER NOT NULL, start_time REAL NOT NULL, payload TEXT NOT NULL); CREATE INDEX IF NOT EXISTS spans_received ON spans(received_at, start_time);');
    this.prune();
  }
  settings(): RetentionSettings { return { ...this.config }; }
  configure(settings: RetentionSettings): void { this.config = validateSettings(settings); this.prune(); }
  all(): NormalizedSpan[] {
    this.prune();
    return this.database.prepare('SELECT payload FROM spans ORDER BY start_time ASC, id ASC').all().map((row) => JSON.parse(String(row.payload)) as NormalizedSpan);
  }
  add(spans: readonly NormalizedSpan[], receivedAt = Date.now()): NormalizedSpan[] {
    const accepted: NormalizedSpan[] = [];
    const insert = this.database.prepare('INSERT OR IGNORE INTO spans (id, received_at, start_time, payload) VALUES (?, ?, ?, ?)');
    this.database.exec('BEGIN');
    try {
      for (const span of spans) {
        const result = insert.run(`${span.traceId}:${span.spanId}`, receivedAt, span.startTime, JSON.stringify(span));
        if (result.changes > 0) accepted.push(span);
      }
      this.database.exec('COMMIT');
    } catch (error) { this.database.exec('ROLLBACK'); throw error; }
    this.prune();
    return accepted;
  }
  replace(spans: readonly NormalizedSpan[]): void {
    this.database.exec('BEGIN');
    try {
      this.database.exec('DELETE FROM spans');
      const insert = this.database.prepare('INSERT OR IGNORE INTO spans (id, received_at, start_time, payload) VALUES (?, ?, ?, ?)');
      const time = Date.now();
      for (const span of spans.slice(-this.config.maxSpans)) insert.run(`${span.traceId}:${span.spanId}`, time, span.startTime, JSON.stringify(span));
      this.database.exec('COMMIT');
    } catch (error) { this.database.exec('ROLLBACK'); throw error; }
  }
  clear(): void { this.database.exec('DELETE FROM spans; PRAGMA wal_checkpoint(TRUNCATE);'); }
  takePrunedCount(): number { const count = this.prunedSinceRead; this.prunedSinceRead = 0; return count; }
  /** Retention uses local receipt time, so importing old sessions keeps their original timeline. */
  prune(now = Date.now()): number {
    const expired = this.database.prepare('DELETE FROM spans WHERE received_at < ?').run(now - this.config.retentionMinutes * 60000);
    const excess = this.database.prepare('DELETE FROM spans WHERE id IN (SELECT id FROM spans ORDER BY received_at DESC, start_time DESC, id DESC LIMIT -1 OFFSET ?)').run(this.config.maxSpans);
    const count = Number(expired.changes) + Number(excess.changes);
    this.prunedSinceRead += count;
    return count;
  }
  close(): void { this.database.close(); }
}
