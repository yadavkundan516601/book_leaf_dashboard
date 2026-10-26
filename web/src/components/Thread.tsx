import type { MessageSender, TicketMessageDto } from "@bookleaf/shared";
import { formatDateTime, formatRelative } from "../lib/format";

interface ThreadProps {
  messages: TicketMessageDto[];
  /** Whose messages sit on the right ("mine"). */
  viewer: MessageSender;
  emptyText: string;
}

export function Thread({ messages, viewer, emptyText }: ThreadProps) {
  if (messages.length === 0) return <p className="muted thread__empty">{emptyText}</p>;
  return (
    <ol className="thread">
      {messages.map((m) => (
        <li key={m.id} className={`bubble bubble--${m.sender} ${m.sender === viewer ? "bubble--mine" : ""}`}>
          <div className="bubble__meta">
            <strong>{m.sender === "admin" ? `${m.senderName} · BookLeaf` : m.senderName}</strong>
            <time dateTime={m.createdAt} title={formatDateTime(m.createdAt)}>
              {formatRelative(m.createdAt)}
            </time>
          </div>
          <div className="bubble__body">{m.body}</div>
        </li>
      ))}
    </ol>
  );
}
