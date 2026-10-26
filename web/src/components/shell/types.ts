import type { ReactNode } from "react";

export type Portal = "author" | "admin";

export interface NavItem {
  /** App path (may carry a query string, e.g. "/admin/tickets?assignee=me"), or a URL when `external`. */
  to: string;
  label: string;
  icon: ReactNode;
  /** Only active on an exact path match (default: the path or any sub-path). */
  end?: boolean;
  /** Count shown next to the label; hidden when null/undefined/0. */
  badge?: number | null;
  /** Red badge for counts that need attention (e.g. SLA breaches). */
  badgeTone?: "default" | "danger";
  /** Opens in a new tab as a plain link (not a client-side route). */
  external?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}
