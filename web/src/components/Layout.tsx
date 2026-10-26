import { NavLink, Outlet } from "react-router";
import { useAuth } from "../auth/AuthProvider";
import { ThemeToggle } from "./ThemeToggle";
import { RealtimeStatusContext, useRealtime, type RealtimeStatus } from "../realtime/useRealtime";

export interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

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
      {STATUS_TEXT[status]}
    </span>
  );
}

/** Signed-in shell: owns the realtime connection so it survives navigation within a portal. */
export function Layout({ nav, portal }: { nav: NavItem[]; portal: string }) {
  const { user, logout } = useAuth();
  const status = useRealtime();

  return (
    <RealtimeStatusContext value={status}>
      <header className="topbar">
        <div className="topbar__inner">
          <span className="brand">
            <img className="brand__logo" src="/logo.svg" alt="BookLeaf Publishing" />
            <span className="brand__portal">{portal}</span>
          </span>
          <nav className="nav" aria-label="Main">
            {nav.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className="nav__link">
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="topbar__user">
            <LiveIndicator status={status} />
            <ThemeToggle />
            <span className="topbar__name">{user?.name}</span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </RealtimeStatusContext>
  );
}
