/**
 * In-process pub/sub for real-time ticket updates, fanned out over SSE.
 *
 * Each event carries the ticket's authorId so the SSE layer can route it:
 * admins receive everything, authors only events for their own tickets.
 * Payloads are deliberately thin ({type, ticketId}); clients refetch through
 * the normal RBAC-protected endpoints, so the stream can never leak data.
 *
 * Scaling note: this works for a single instance. With multiple instances,
 * swap the EventEmitter for Postgres LISTEN/NOTIFY or Redis pub/sub behind
 * the same interface.
 */
import { EventEmitter } from "node:events";
import type { RealtimeEvent } from "@bookleaf/shared";

export interface RoutedEvent {
  event: RealtimeEvent;
  authorId: string;
}

export class EventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(event: RealtimeEvent, authorId: string): void {
    this.emitter.emit("event", { event, authorId } satisfies RoutedEvent);
  }

  subscribe(listener: (e: RoutedEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }

  listenerCount(): number {
    return this.emitter.listenerCount("event");
  }
}
