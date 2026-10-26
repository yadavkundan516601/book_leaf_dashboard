import type { RealtimeEvent } from "@bookleaf/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useSyncExternalStore } from "react";
import { queryKeys } from "../api/queryKeys";

export type RealtimeStatus = "connecting" | "live" | "reconnecting";
export type RealtimeEventType = RealtimeEvent["type"];

const EVENT_TYPES: RealtimeEventType[] = ["ticket.created", "ticket.updated", "ticket.message", "ticket.classified"];

const RETRY_MS = 5_000;
const POLL_MS = 20_000;
/** How many recent events the notifications menu keeps (in memory, since page load). */
export const FEED_LIMIT = 20;

// ---------------------------------------------------------------------------
// Connection status: a tiny module-level store rather than context, so hooks rendered *above* the
// component that owns the connection (e.g. nav badge queries) still stop polling once the stream is live.
// ---------------------------------------------------------------------------

let currentStatus: RealtimeStatus = "connecting";
const statusListeners = new Set<() => void>();

function setStatus(next: RealtimeStatus) {
  if (next === currentStatus) return;
  currentStatus = next;
  statusListeners.forEach((listener) => listener());
}

function subscribeStatus(listener: () => void) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export const useRealtimeStatus = (): RealtimeStatus =>
  useSyncExternalStore(subscribeStatus, () => currentStatus, () => currentStatus);

/** Polling fallback: queries refetch on an interval only while the live stream is down. */
export function usePollInterval(): number | false {
  return useRealtimeStatus() === "live" ? false : POLL_MS;
}

// ---------------------------------------------------------------------------
// Recent-events feed (ring buffer of the last FEED_LIMIT events) for the notifications menu.
// ---------------------------------------------------------------------------

export interface RealtimeNotification {
  id: number;
  type: RealtimeEventType;
  ticketId: string;
  /** Epoch ms when the event arrived. */
  at: number;
  read: boolean;
}

type FeedAction =
  | { kind: "push"; event: Omit<RealtimeNotification, "id" | "read"> }
  | { kind: "markAllRead" }
  | { kind: "clear" };

let nextNotificationId = 1;

function feedReducer(items: RealtimeNotification[], action: FeedAction): RealtimeNotification[] {
  switch (action.kind) {
    case "push":
      return [{ ...action.event, id: nextNotificationId++, read: false }, ...items].slice(0, FEED_LIMIT);
    case "markAllRead":
      return items.some((n) => !n.read) ? items.map((n) => (n.read ? n : { ...n, read: true })) : items;
    case "clear":
      return items.length ? [] : items;
  }
}

export interface RealtimeFeed {
  items: RealtimeNotification[];
  unread: number;
  markAllRead: () => void;
  clear: () => void;
}

const EMPTY_FEED: RealtimeFeed = { items: [], unread: 0, markAllRead: () => {}, clear: () => {} };

export const RealtimeFeedContext = createContext<RealtimeFeed>(EMPTY_FEED);

export const useNotifications = () => useContext(RealtimeFeedContext);

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

/**
 * Subscribes to the SSE stream and turns each event into React Query invalidations, and records it in
 * the recent-events feed. Events are thin ({type, ticketId}); data is always refetched through the API.
 * The server only sends authors their own, non-internal events, so the feed needs no extra filtering.
 */
export function useRealtime(): { status: RealtimeStatus; feed: RealtimeFeed } {
  const queryClient = useQueryClient();
  const status = useRealtimeStatus();
  const [items, dispatch] = useReducer(feedReducer, []);

  useEffect(() => {
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let hasConnected = false;

    const invalidateAll = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tickets });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
    };

    const onTicketEvent = (e: MessageEvent<string>) => {
      let event: Partial<RealtimeEvent> = {};
      try {
        event = JSON.parse(e.data) as RealtimeEvent;
      } catch {
        // Malformed payload: fall through and refresh everything.
      }
      const ticketId = event.ticketId;
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticketLists });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
      if (ticketId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.ticket(ticketId) });
        const type = event.type ?? (e.type as RealtimeEventType);
        dispatch({ kind: "push", event: { type, ticketId, at: Date.now() } });
      } else invalidateAll();
    };

    const onOpen = () => {
      // After a gap we may have missed events, so catch up once.
      if (hasConnected) invalidateAll();
      hasConnected = true;
      setStatus("live");
    };

    const connect = () => {
      source = new EventSource("/api/v1/events", { withCredentials: true });
      source.addEventListener("open", onOpen);
      source.addEventListener("ready", onOpen);
      EVENT_TYPES.forEach((type) => source?.addEventListener(type, onTicketEvent));
      source.addEventListener("error", () => {
        setStatus("reconnecting");
        // The browser retries on its own unless the stream was closed for good (e.g. HTTP error).
        if (source?.readyState === EventSource.CLOSED) {
          source.close();
          retryTimer = setTimeout(connect, RETRY_MS);
        }
      });
    };

    setStatus("connecting");
    connect();
    return () => {
      clearTimeout(retryTimer);
      source?.close();
      // Nobody owns a stream any more (e.g. signed out): fall back to polling semantics.
      setStatus("connecting");
    };
  }, [queryClient]);

  const markAllRead = useCallback(() => dispatch({ kind: "markAllRead" }), []);
  const clear = useCallback(() => dispatch({ kind: "clear" }), []);
  const feed = useMemo<RealtimeFeed>(
    () => ({ items, unread: items.filter((n) => !n.read).length, markAllRead, clear }),
    [items, markAllRead, clear],
  );

  return { status, feed };
}
