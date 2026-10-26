import { Link, useLocation, type Location } from "react-router";
import { version } from "../../../package.json";
import { CloseIcon, CodeIcon, ExternalIcon, HelpIcon } from "../icons";
import type { NavGroup, NavItem, Portal } from "./types";

interface SidebarNavProps {
  id: string;
  groups: NavGroup[];
  portal: Portal;
  /** Desktop icon-rail mode (labels become tooltips). */
  rail: boolean;
  /** Below the desktop breakpoint the sidebar is an off-canvas drawer. */
  drawer: boolean;
  drawerOpen: boolean;
  onCloseDrawer: () => void;
}

/** How well a nav item matches the current location: null = no match, higher = more specific. */
function matchScore(item: NavItem, location: Location): number | null {
  if (item.external) return null;
  const [path = "", query] = item.to.split("?");
  const here = location.pathname.replace(/\/+$/, "") || "/";
  const pathMatches = item.end ? here === path : here === path || here.startsWith(`${path}/`);
  if (!pathMatches) return null;
  if (!query) return path.length;
  // Query shortcuts (e.g. ?assignee=me) only match when every one of their params is present as given.
  const wanted = new URLSearchParams(query);
  const current = new URLSearchParams(location.search);
  for (const key of new Set(wanted.keys())) {
    const a = wanted.getAll(key).sort().join("\n");
    const b = current.getAll(key).sort().join("\n");
    if (a !== b) return null;
  }
  return 10_000 + path.length + [...wanted.keys()].length;
}

/** The single most specific matching item, so "Ticket Queue" and "Unassigned" are never both current. */
function activeItem(groups: NavGroup[], location: Location): NavItem | null {
  let best: NavItem | null = null;
  let bestScore = -1;
  for (const group of groups) {
    for (const item of group.items) {
      const score = matchScore(item, location);
      if (score !== null && score > bestScore) {
        best = item;
        bestScore = score;
      }
    }
  }
  return best;
}

const formatBadge = (n: number) => (n > 99 ? "99+" : String(n));

function NavEntry({ item, active, rail }: { item: NavItem; active: boolean; rail: boolean }) {
  const badge = item.badge ? (
    <span className={`shell-nav__badge${item.badgeTone === "danger" ? " shell-nav__badge--danger" : ""}`}>
      {formatBadge(item.badge)}
    </span>
  ) : null;
  const content = (
    <>
      <span className="shell-nav__icon">{item.icon}</span>
      <span className="shell-nav__label">{item.label}</span>
      {item.external && (
        <span className="shell-nav__ext">
          <ExternalIcon size={14} />
          <span className="sr-only"> (opens in a new tab)</span>
        </span>
      )}
      {badge}
    </>
  );
  const tooltip = rail ? item.label : undefined;

  if (item.external) {
    return (
      <a className="shell-nav__link" href={item.to} target="_blank" rel="noreferrer" data-tooltip={tooltip}>
        {content}
      </a>
    );
  }
  return (
    <Link
      className="shell-nav__link"
      to={item.to}
      aria-current={active ? "page" : undefined}
      data-tooltip={tooltip}
    >
      {content}
    </Link>
  );
}

function HelpCard({ portal, rail }: { portal: Portal; rail: boolean }) {
  const isAdmin = portal === "admin";
  const label = isAdmin ? "API docs" : "Help & FAQ";
  const icon = isAdmin ? <CodeIcon size={18} /> : <HelpIcon size={18} />;

  if (rail) {
    return isAdmin ? (
      <a className="shell-nav__link" href="/api/docs" target="_blank" rel="noreferrer" data-tooltip="Need help? API docs">
        <span className="shell-nav__icon">{icon}</span>
        <span className="shell-nav__label">Need help? {label} (opens in a new tab)</span>
      </a>
    ) : (
      <Link className="shell-nav__link" to="/author/help" data-tooltip="Need help? Help & FAQ">
        <span className="shell-nav__icon">{icon}</span>
        <span className="shell-nav__label">Need help? {label}</span>
      </Link>
    );
  }

  return (
    <div className="shell-help">
      <span className="shell-help__icon">{icon}</span>
      <p className="shell-help__title">Need help?</p>
      <p className="shell-help__text">
        {isAdmin
          ? "Endpoints, payloads and error codes for the support API."
          : "Answers to common questions about books, royalties and payouts."}
      </p>
      {isAdmin ? (
        <a className="btn btn--sm btn--block shell-help__action" href="/api/docs" target="_blank" rel="noreferrer">
          Open API docs <ExternalIcon size={14} />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : (
        <Link className="btn btn--sm btn--block shell-help__action" to="/author/help">
          Visit Help &amp; FAQ
        </Link>
      )}
    </div>
  );
}

export function SidebarNav({ id, groups, portal, rail, drawer, drawerOpen, onCloseDrawer }: SidebarNavProps) {
  const location = useLocation();
  const current = activeItem(groups, location);
  const hidden = drawer && !drawerOpen;

  return (
    <aside
      id={id}
      className="shell-sidebar"
      // Off-screen drawer content must not be reachable by Tab or a screen reader.
      inert={hidden}
      aria-hidden={hidden || undefined}
    >
      <div className="shell-sidebar__head">
        <Link to={`/${portal}`} className="shell-sidebar__brand" aria-label="BookLeaf Publishing: home">
          <img className="shell-logo" src="/logo.svg" alt="" width={94} height={40} />
        </Link>
        {drawer && (
          <button type="button" className="shell-iconbtn" onClick={onCloseDrawer} aria-label="Close menu">
            <CloseIcon />
          </button>
        )}
      </div>

      <nav className="shell-nav" aria-label="Main navigation">
        {groups.map((group) => (
          <div key={group.label} className="shell-nav__group" role="group" aria-label={group.label}>
            <p className="shell-nav__group-label" aria-hidden="true">
              {group.label}
            </p>
            <ul className="shell-nav__list">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavEntry item={item} active={item === current} rail={rail} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shell-sidebar__foot">
        <HelpCard portal={portal} rail={rail} />
        <p className="shell-sidebar__version">BookLeaf Support v{version}</p>
      </div>
    </aside>
  );
}
