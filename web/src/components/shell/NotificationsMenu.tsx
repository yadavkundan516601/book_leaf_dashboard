import type { Paginated } from "@bookleaf/shared";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { api } from "../../api/client";
import { queryKeys } from "../../api/queryKeys";
import { formatRelative } from "../../lib/format";
import { useNotifications, type RealtimeEventType, type RealtimeNotification } from "../../realtime/useRealtime";
import { BellIcon, ChatIcon, CheckCircleIcon, RefreshIcon, SparkIcon, TicketIcon } from "../icons";
import { useMenu } from "./hooks";
import type { Portal } from "./types";

interface TicketRef {
  id: string;
  reference: string;
  subject: string;
}

function findInLists(queryClient: QueryClient, id: string): TicketRef | undefined {
  for (const [, page] of queryClient.getQueriesData<Paginated<TicketRef>>({ queryKey: queryKeys.ticketLists })) {
    const hit = page?.data?.find((t) => t.id === id);
    if (hit) return hit;
  }
  return undefined;
}

/** Reference + subject for a ticket: from any cached list first, else a lightweight detail fetch. */
function useTicketRef(id: string) {
  const queryClient = useQueryClient();
  const fromList = useMemo(() => findInLists(queryClient, id), [queryClient, id]);
  const detail = useQuery({
    queryKey: queryKeys.ticket(id),
    queryFn: () => api<TicketRef>(`/tickets/${id}`),
    enabled: !fromList,
    staleTime: 60_000,
  });
  return { ticket: detail.data ?? fromList ?? null, failed: !fromList && detail.isError };
}

const EVENT_META: Record<RealtimeEventType, { icon: ReactNode; tone: string; text: Record<Portal, (ref: string) => string> }> = {
  "ticket.created": {
    icon: <TicketIcon size={16} />,
    tone: "primary",
    text: { admin: (r) => `New ticket ${r}`, author: (r) => `${r} was received` },
  },
  "ticket.message": {
    icon: <ChatIcon size={16} />,
    tone: "blue",
    text: { admin: (r) => `New message on ${r}`, author: (r) => `New reply on ${r}` },
  },
  "ticket.updated": {
    icon: <RefreshIcon size={16} />,
    tone: "warning",
    text: { admin: (r) => `${r} was updated`, author: (r) => `Status update on ${r}` },
  },
  "ticket.classified": {
    icon: <SparkIcon />,
    tone: "success",
    text: { admin: (r) => `${r} was classified`, author: (r) => `${r} was classified` },
  },
};

function NotificationItem({
  item,
  portal,
  highlight,
  onSelect,
}: {
  item: RealtimeNotification;
  portal: Portal;
  highlight: boolean;
  onSelect: () => void;
}) {
  const { ticket, failed } = useTicketRef(item.ticketId);
  const meta = EVENT_META[item.type];
  const at = new Date(item.at).toISOString();

  return (
    <li>
      <Link
        to={`/${portal}/tickets/${item.ticketId}`}
        className={`shell-notif__item${highlight ? " is-new" : ""}`}
        data-menu-item
        onClick={onSelect}
      >
        <span className={`shell-notif__icon shell-notif__icon--${meta.tone}`}>{meta.icon}</span>
        <span className="shell-notif__body">
          {ticket ? (
            <>
              <span className="shell-notif__text">{meta.text[portal](ticket.reference)}</span>
              <span className="shell-notif__sub">{ticket.subject}</span>
            </>
          ) : failed ? (
            <span className="shell-notif__text">{meta.text[portal]("a ticket")}</span>
          ) : (
            <>
              <span className="skeleton-line" aria-hidden="true" />
              <span className="sr-only">Loading ticket details</span>
            </>
          )}
          <time className="shell-notif__time" dateTime={at}>
            {formatRelative(at)}
          </time>
        </span>
        {highlight && <span className="sr-only">(new)</span>}
      </Link>
    </li>
  );
}

export function NotificationsMenu({ portal }: { portal: Portal }) {
  const feed = useNotifications();
  const menu = useMenu();
  // Items that were unread when the menu opened stay highlighted while it is open, even though
  // opening marks them read (which clears the bell badge).
  const [seenAsNew, setSeenAsNew] = useState<ReadonlySet<number>>(new Set());

  const onTriggerClick = () => {
    if (!menu.open) {
      setSeenAsNew(new Set(feed.items.filter((n) => !n.read).map((n) => n.id)));
      feed.markAllRead();
    } else feed.markAllRead();
    menu.onTriggerClick();
  };

  const badge = feed.unread > 9 ? "9+" : String(feed.unread);
  const label = feed.unread ? `Notifications, ${feed.unread} unread` : "Notifications";

  return (
    <div className="shell-menu">
      <button
        ref={menu.triggerRef}
        type="button"
        className="shell-iconbtn"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={menu.open}
        aria-controls="shell-notifications"
        onClick={onTriggerClick}
        onKeyDown={(e) => {
          if (!menu.open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            setSeenAsNew(new Set(feed.items.filter((n) => !n.read).map((n) => n.id)));
            feed.markAllRead();
          }
          menu.onTriggerKeyDown(e);
        }}
      >
        <BellIcon />
        {feed.unread > 0 && (
          <span className="shell-iconbtn__badge" aria-hidden="true">
            {badge}
          </span>
        )}
      </button>

      {menu.open && (
        <div
          ref={menu.panelRef}
          id="shell-notifications"
          className="shell-menu__panel shell-notif"
          role="dialog"
          aria-label="Notifications"
          tabIndex={-1}
          onKeyDown={menu.onPanelKeyDown}
        >
          <div className="shell-notif__head">
            <h2 className="shell-notif__title">Notifications</h2>
            <div className="shell-notif__actions">
              {feed.unread > 0 && (
                <button type="button" className="link-action" data-menu-item onClick={feed.markAllRead}>
                  Mark all read
                </button>
              )}
              {feed.items.length > 0 && (
                <button
                  type="button"
                  className="link-action"
                  data-menu-item
                  onClick={() => {
                    feed.clear();
                    menu.panelRef.current?.focus();
                  }}
                >
                  Clear all
                </button>
              )}
            </div>
          </div>
          {feed.items.length ? (
            <ul className="shell-notif__list">
              {feed.items.map((item) => (
                <NotificationItem
                  key={item.id}
                  item={item}
                  portal={portal}
                  highlight={!item.read || seenAsNew.has(item.id)}
                  onSelect={() => menu.close(true)}
                />
              ))}
            </ul>
          ) : (
            <div className="shell-notif__empty">
              <CheckCircleIcon size={28} />
              <p className="shell-notif__empty-title">You're all caught up</p>
              <p className="small muted">
                New tickets, replies and status changes appear here while this tab is open.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
