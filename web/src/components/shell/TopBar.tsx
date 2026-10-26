import { useEffect, useRef, useState, type FormEvent, type Ref } from "react";
import { Link, useNavigate } from "react-router";
import type { RealtimeStatus } from "../../realtime/useRealtime";
import { MenuIcon, PlusIcon, SearchIcon } from "../icons";
import { ThemeToggle } from "../ThemeToggle";
import { isTypingTarget } from "./hooks";
import { NotificationsMenu } from "./NotificationsMenu";
import type { Portal } from "./types";
import { UserMenu } from "./UserMenu";

const STATUS_TEXT: Record<RealtimeStatus, string> = {
  connecting: "Connecting…",
  live: "Live",
  reconnecting: "Reconnecting…",
};

function LiveIndicator({ status }: { status: RealtimeStatus }) {
  return (
    <span
      className={`live live--${status}`}
      role="status"
      title={status === "live" ? "Updates appear automatically" : "Live updates paused; refreshing every 20 seconds"}
    >
      <span className="live__dot" aria-hidden="true" />
      <span className="live__text">{STATUS_TEXT[status]}</span>
    </span>
  );
}

/** Admin ticket search: "/" focuses it from anywhere, Enter opens the queue filtered by the text. */
function GlobalSearch() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = text.trim();
    navigate(q ? `/admin/tickets?q=${encodeURIComponent(q)}` : "/admin/tickets");
    // The queue page shows the query in its own search box; clear this one so they never disagree.
    setText("");
    inputRef.current?.blur();
  }

  return (
    <form role="search" className="shell-search" onSubmit={onSubmit}>
      <label htmlFor="shell-search-input" className="sr-only">
        Search tickets
      </label>
      <span className="shell-search__icon">
        <SearchIcon size={18} />
      </span>
      <input
        ref={inputRef}
        id="shell-search-input"
        type="search"
        className="shell-search__input"
        placeholder="Search tickets, authors, references…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") e.currentTarget.blur();
        }}
        aria-keyshortcuts="/"
        autoComplete="off"
        enterKeyHint="search"
      />
      <kbd className="shell-search__kbd" aria-hidden="true">
        /
      </kbd>
    </form>
  );
}

interface TopBarProps {
  portal: Portal;
  status: RealtimeStatus;
  menuButtonRef: Ref<HTMLButtonElement>;
  sidebarExpanded: boolean;
  menuButtonLabel: string;
  onMenuClick: () => void;
}

export function TopBar({ portal, status, menuButtonRef, sidebarExpanded, menuButtonLabel, onMenuClick }: TopBarProps) {
  return (
    <header className="shell-topbar">
      <button
        ref={menuButtonRef}
        type="button"
        className="shell-iconbtn"
        onClick={onMenuClick}
        aria-label={menuButtonLabel}
        aria-expanded={sidebarExpanded}
        aria-controls="shell-sidebar"
      >
        <MenuIcon />
      </button>

      {portal === "admin" ? <GlobalSearch /> : <span className="shell-topbar__spacer" />}

      <div className="shell-topbar__actions">
        {portal === "author" && (
          <Link to="/author/tickets/new" className="btn btn--primary btn--sm shell-topbar__new">
            <PlusIcon size={16} />
            <span className="shell-topbar__new-label">New query</span>
          </Link>
        )}
        <LiveIndicator status={status} />
        <ThemeToggle className="shell-iconbtn" />
        <NotificationsMenu portal={portal} />
        <UserMenu />
      </div>
    </header>
  );
}
