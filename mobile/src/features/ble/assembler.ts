import { ProtocolError, parseNotification, readTestMessage } from "@/features/ble/protocol";

/**
 * Reassembles fragmented BLE notifications.
 *
 * The firmware splits a 28-byte frame into 16-byte chunks, so a frame normally
 * arrives as two notifications. Nothing here assumes notifications are
 * delivered in order, once, or at all.
 */
export const MAX_FRAGMENTS = 32;
export const MAX_MESSAGE_BYTES = 4096;
export const DEFAULT_FRAGMENT_TIMEOUT_MS = 2000;

export type AssemblyResult =
  | { kind: "pending"; sequence: number; received: number; expected: number }
  | { kind: "complete"; sequence: number; bytes: Uint8Array; fragments: number }
  | { kind: "test"; text: string }
  | { kind: "ignored"; reason: "duplicate" }
  | {
      kind: "rejected";
      reason:
        | "too_short"
        | "bad_header"
        | "bad_fragment"
        | "fragment_timeout"
        | "duplicate_conflict"
        | "too_large"
        | "superseded";
      detail: string;
    };

interface PendingMessage {
  sequence: number;
  count: number;
  parts: Map<number, Uint8Array>;
  firstAt: number;
}

export interface AssemblerOptions {
  maxFragments?: number;
  maxMessageBytes?: number;
  timeoutMs?: number;
  now?: () => number;
}

export class FragmentAssembler {
  private pending: PendingMessage | null = null;
  private readonly maxFragments: number;
  private readonly maxMessageBytes: number;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(options: AssemblerOptions = {}) {
    this.maxFragments = options.maxFragments ?? MAX_FRAGMENTS;
    this.maxMessageBytes = options.maxMessageBytes ?? MAX_MESSAGE_BYTES;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_FRAGMENT_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
  }

  reset(): void {
    this.pending = null;
  }

  /** Drops a partial message that has exceeded the reassembly timeout. */
  checkTimeout(): boolean {
    if (!this.pending) return false;
    if (this.now() - this.pending.firstAt < this.timeoutMs) return false;
    this.pending = null;
    return true;
  }

  add(bytes: Uint8Array, at: number = this.now()): AssemblyResult {
    const test = readTestMessage(bytes);
    if (test !== null) return { kind: "test", text: test };

    let header;
    try {
      header = parseNotification(bytes);
    } catch (error) {
      const code = error instanceof ProtocolError ? error.code : "bad_fragment";
      const reason =
        code === "too_short" || code === "bad_header" || code === "bad_fragment"
          ? code
          : "bad_fragment";
      return {
        kind: "rejected",
        reason,
        detail: error instanceof Error ? error.message : "Malformed notification.",
      };
    }

    if (header.count > this.maxFragments) {
      return {
        kind: "rejected",
        reason: "bad_header",
        detail: `Fragment count ${header.count} exceeds the ${this.maxFragments} limit.`,
      };
    }

    if (this.pending && this.now() - this.pending.firstAt > this.timeoutMs) {
      this.pending = null;
      return {
        kind: "rejected",
        reason: "fragment_timeout",
        detail: `No complete message within ${this.timeoutMs} ms.`,
      };
    }

    // A new sequence number supersedes an incomplete older message: the
    // firmware sends fragments of one frame before starting the next. The new
    // fragment is still accepted — dropping it would lose real data.
    let superseded = false;
    if (this.pending && this.pending.sequence !== header.sequence) {
      this.pending = null;
      superseded = true;
    }

    if (!this.pending) {
      this.pending = {
        sequence: header.sequence,
        count: header.count,
        parts: new Map(),
        firstAt: at,
      };
    } else if (this.pending.count !== header.count) {
      this.pending = null;
      return {
        kind: "rejected",
        reason: "bad_header",
        detail: "Fragment count changed mid-message.",
      };
    }

    const existing = this.pending.parts.get(header.index);
    if (existing) {
      const identical =
        existing.byteLength === header.payload.byteLength &&
        existing.every((byte, index) => byte === header.payload[index]);
      if (identical) return { kind: "ignored", reason: "duplicate" };

      this.pending = null;
      return {
        kind: "rejected",
        reason: "duplicate_conflict",
        detail: `Fragment ${header.index} arrived twice with different content.`,
      };
    }

    // Copy: the BLE layer may reuse the underlying buffer.
    this.pending.parts.set(header.index, Uint8Array.from(header.payload));

    if (this.pending.parts.size < this.pending.count) {
      if (superseded) {
        return {
          kind: "rejected",
          reason: "superseded",
          detail: `Sequence ${header.sequence} started before the previous message completed. Its first fragment was kept.`,
        };
      }
      return {
        kind: "pending",
        sequence: this.pending.sequence,
        received: this.pending.parts.size,
        expected: this.pending.count,
      };
    }

    const parts: Uint8Array[] = [];
    for (let index = 0; index < this.pending.count; index += 1) {
      const part = this.pending.parts.get(index);
      if (!part) {
        this.pending = null;
        return {
          kind: "rejected",
          reason: "bad_fragment",
          detail: `Missing fragment ${index}.`,
        };
      }
      parts.push(part);
    }

    const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
    const sequence = this.pending.sequence;
    const fragments = this.pending.count;
    this.pending = null;

    if (total > this.maxMessageBytes) {
      return {
        kind: "rejected",
        reason: "too_large",
        detail: `Reassembled message is ${total} bytes; limit is ${this.maxMessageBytes}.`,
      };
    }

    const joined = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      joined.set(part, offset);
      offset += part.byteLength;
    }

    return { kind: "complete", sequence, bytes: joined, fragments };
  }
}
