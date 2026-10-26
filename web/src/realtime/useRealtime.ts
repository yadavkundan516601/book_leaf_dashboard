import type { RealtimeEvent } from "@bookleaf/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState } from "react";
import { queryKeys } from "../api/queryKeys";

export type RealtimeStatus = "connecting" | "live" | "reconnecting";

const EVENT_TYPES: RealtimeEvent["type"][] = [
  "ticket.created",
  "ticket.updated",
  "ticket.message",
  "ticket.classified",
];

const RETRY_MS = 5_000;
const POLL_MS = 20_000;

/**
 * Subscribes to the SSE stream and turns each event into React Query invalidations.
 * Events are thin ({type, ticketId}); data is always refetched through the normal API.
 */
export function useRealtime(): RealtimeStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>("connecting");

  useEffect(() => {
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let hasConnected = false;

    const invalidateAll = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tickets });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
    };

    const onTicketEvent = (e: MessageEvent<string>) => {
      let ticketId: string | undefined;
      try {
        ticketId = (JSON.parse(e.data) as RealtimeEvent).ticketId;
      } catch {
        // Malformed payload: fall through and refresh everything.
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticketLists });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
      if (ticketId) void queryClient.invalidateQueries({ queryKey: queryKeys.ticket(ticketId) });
      else invalidateAll();
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

    connect();
    return () => {
      clearTimeout(retryTimer);
      source?.close();
    };
  }, [queryClient]);

  return status;
}

export const RealtimeStatusContext = createContext<RealtimeStatus>("connecting");

export const useRealtimeStatus = () => useContext(RealtimeStatusContext);

/** Polling fallback: queries refetch on an interval only while the live stream is down. */
export function usePollInterval(): number | false {
  return useRealtimeStatus() === "live" ? false : POLL_MS;
}
