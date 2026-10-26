export const queryKeys = {
  me: ["me"] as const,
  books: ["books"] as const,
  tickets: ["tickets"] as const,
  ticketLists: ["tickets", "list"] as const,
  ticketList: (scope: "author" | "admin", params: object) => ["tickets", "list", scope, params] as const,
  ticket: (id: string) => ["tickets", "detail", id] as const,
  stats: ["admin", "stats"] as const,
  team: ["admin", "team"] as const,
};
