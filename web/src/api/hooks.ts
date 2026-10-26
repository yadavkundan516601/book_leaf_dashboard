import type {
  AdminRefDto,
  AdminStatsDto,
  AdminTicketDto,
  AdminTicketSummaryDto,
  AuthorTicketDto,
  AuthorTicketSummaryDto,
  CreateMessageInput,
  CreateNoteInput,
  CreateTicketInput,
  DraftDto,
  ListTicketsQuery,
  MyBooksResponse,
  Paginated,
  TicketMessageDto,
  TicketNoteDto,
  UpdateTicketInput,
} from "@bookleaf/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePollInterval } from "../realtime/useRealtime";
import { api, toQueryString } from "./client";
import { queryKeys } from "./queryKeys";

/** List query params; the shared schema coerces page/pageSize from strings, the client always sends numbers. */
export type TicketListParams = Omit<ListTicketsQuery, "page" | "pageSize"> & { page?: number; pageSize?: number };

// ---------------------------------------------------------------------------
// Author
// ---------------------------------------------------------------------------

export function useMyBooks() {
  return useQuery({ queryKey: queryKeys.books, queryFn: () => api<MyBooksResponse>("/books") });
}

export function useAuthorTickets(params: TicketListParams) {
  const refetchInterval = usePollInterval();
  return useQuery({
    queryKey: queryKeys.ticketList("author", params),
    queryFn: () => api<Paginated<AuthorTicketSummaryDto>>(`/tickets${toQueryString({ ...params })}`),
    placeholderData: keepPreviousData,
    refetchInterval,
  });
}

export function useAuthorTicket(id: string) {
  const refetchInterval = usePollInterval();
  return useQuery({
    queryKey: queryKeys.ticket(id),
    queryFn: () => api<AuthorTicketDto>(`/tickets/${id}`),
    refetchInterval,
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTicketInput) =>
      api<AuthorTicketDto>("/tickets", { method: "POST", body: input }),
    onSuccess: (ticket) => {
      queryClient.setQueryData(queryKeys.ticket(ticket.id), ticket);
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticketLists });
    },
  });
}

// ---------------------------------------------------------------------------
// Shared ticket actions
// ---------------------------------------------------------------------------

export function useSendMessage(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMessageInput) =>
      api<TicketMessageDto>(`/tickets/${ticketId}/messages`, { method: "POST", body: input }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticket(ticketId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticketLists });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
    },
  });
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export function useAdminTickets(params: TicketListParams) {
  const refetchInterval = usePollInterval();
  return useQuery({
    queryKey: queryKeys.ticketList("admin", params),
    queryFn: () => api<Paginated<AdminTicketSummaryDto>>(`/tickets${toQueryString({ ...params })}`),
    placeholderData: keepPreviousData,
    refetchInterval,
  });
}

export function useAdminTicket(id: string) {
  const refetchInterval = usePollInterval();
  return useQuery({
    queryKey: queryKeys.ticket(id),
    queryFn: () => api<AdminTicketDto>(`/tickets/${id}`),
    refetchInterval,
  });
}

export function useAdminStats() {
  const refetchInterval = usePollInterval();
  return useQuery({
    queryKey: queryKeys.stats,
    queryFn: () => api<AdminStatsDto>("/admin/stats"),
    refetchInterval,
  });
}

export function useTeam() {
  return useQuery({
    queryKey: queryKeys.team,
    queryFn: () => api<{ data: AdminRefDto[] }>("/admin/team").then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}

/** Writes the returned ticket into the cache, then refreshes lists and stats that depend on it. */
function useAdminTicketWrite<TInput>(ticketId: string, request: (input: TInput) => Promise<AdminTicketDto>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (ticket) => {
      queryClient.setQueryData(queryKeys.ticket(ticketId), ticket);
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticketLists });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stats });
    },
  });
}

export function useUpdateTicket(ticketId: string) {
  return useAdminTicketWrite(ticketId, (input: UpdateTicketInput) =>
    api<AdminTicketDto>(`/tickets/${ticketId}`, { method: "PATCH", body: input }),
  );
}

export function useReclassify(ticketId: string) {
  return useAdminTicketWrite(ticketId, () =>
    api<AdminTicketDto>(`/tickets/${ticketId}/reclassify`, { method: "POST" }),
  );
}

export function useAddNote(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateNoteInput) =>
      api<TicketNoteDto>(`/tickets/${ticketId}/notes`, { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.ticket(ticketId) }),
  });
}

export function useGenerateDraft(ticketId: string) {
  return useMutation({
    mutationFn: (regenerate: boolean) =>
      api<DraftDto>(`/tickets/${ticketId}/draft`, { method: "POST", body: { regenerate } }),
  });
}
