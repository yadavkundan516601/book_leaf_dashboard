import type { MessageSender, TicketMessageDto } from "@bookleaf/shared";
import { formatDateTime, formatRelative } from "../lib/format";
import "../styles/author-tickets.css";
import { Avatar } from "./ui";

interface ThreadProps {
  messages: TicketMessageDto[];
  /** Whose messages sit on the right ("mine"). */
  viewer: MessageSender;
  emptyText: string;
}

export const SUPPORT_NAME = "BookLeaf Support";

/** Who a message is shown as. Authors see the team as "BookLeaf Support" and themselves as "You". */
function senderLabel(m: TicketMessageDto, viewer: MessageSender): { name: string; sub?: string; avatar: string } {
  if (viewer === "author") {
    return m.sender === "admin"
      ? { name: SUPPORT_NAME, sub: m.senderName, avatar: SUPPORT_NAME }
      : { name: "You", avatar: m.senderName };
  }
  return m.sender === "admin"
    ? { name: `${m.senderName} · BookLeaf`, avatar: m.senderName }
    : { name: m.senderName, avatar: m.senderName };
}

/**
 * Chat-style conversation. The list is a polite live region, so replies that arrive while the page is open are
 * announced to screen readers.
 */
export function Thread({ messages, viewer, emptyText }: ThreadProps) {
  return (
    <div className="thread-wrap">
      {messages.length === 0 && <p className="muted thread__empty">{emptyText}</p>}
      <ol className="thread" aria-live="polite" aria-relevant="additions" aria-label="Messages">
        {messages.map((m) => {
          const who = senderLabel(m, viewer);
          const mine = m.sender === viewer;
          return (
            <li key={m.id} className={`tmsg tmsg--${m.sender}${mine ? " tmsg--mine" : ""}`}>
              <Avatar name={who.avatar} size="md" decorative />
              <div className="tmsg__bubble">
                <div className="tmsg__meta">
                  <strong className="tmsg__name">{who.name}</strong>
                  {who.sub && <span className="tmsg__sub">{who.sub}</span>}
                  <time className="tmsg__time" dateTime={m.createdAt} title={formatDateTime(m.createdAt)}>
                    {formatRelative(m.createdAt)}
                    <span className="ui-sr-only">, {formatDateTime(m.createdAt)}</span>
                  </time>
                </div>
                <div className="tmsg__body">{m.body}</div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
