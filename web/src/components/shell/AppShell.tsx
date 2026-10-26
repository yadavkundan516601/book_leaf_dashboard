import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import type { RealtimeStatus } from "../../realtime/useRealtime";
import { useMediaQuery } from "./hooks";
import { SidebarNav } from "./SidebarNav";
import { TopBar } from "./TopBar";
import type { NavGroup, Portal } from "./types";

/** Below this width the sidebar is an off-canvas drawer (keep in sync with shell.css). */
const DRAWER_QUERY = "(max-width: 1023.98px)";
const RAIL_STORAGE_KEY = "bl-sidebar-rail";

function readRail(): boolean {
  try {
    return localStorage.getItem(RAIL_STORAGE_KEY) === "1";
  } catch {
    return false; // storage blocked (private mode): default to the full sidebar
  }
}

function writeRail(rail: boolean) {
  try {
    localStorage.setItem(RAIL_STORAGE_KEY, rail ? "1" : "0");
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
}

interface AppShellProps {
  groups: NavGroup[];
  portal: Portal;
  status: RealtimeStatus;
  children: ReactNode;
}

export function AppShell({ groups, portal, status, children }: AppShellProps) {
  const isDrawer = useMediaQuery(DRAWER_QUERY);
  const [collapsed, setCollapsed] = useState(readRail);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const location = useLocation();

  const rail = !isDrawer && collapsed;
  const drawerVisible = isDrawer && drawerOpen;

  // Navigating (including from a drawer link) or growing past the breakpoint closes the drawer.
  useEffect(() => setDrawerOpen(false), [location.pathname, location.search, isDrawer]);

  useEffect(() => {
    if (!drawerVisible) {
      // Return focus to the hamburger when the drawer closes, so keyboard users are not lost.
      if (wasOpen.current) menuButtonRef.current?.focus();
      wasOpen.current = false;
      return;
    }
    wasOpen.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.querySelector<HTMLElement>("#shell-sidebar .shell-nav__link")?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerVisible]);

  function onMenuClick() {
    if (isDrawer) {
      setDrawerOpen((open) => !open);
      return;
    }
    setCollapsed((c) => {
      writeRail(!c);
      return !c;
    });
  }

  const classes = ["shell", rail && "shell--rail", drawerVisible && "shell--drawer-open"].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <a
        className="shell-skip"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>

      <SidebarNav
        id="shell-sidebar"
        groups={groups}
        portal={portal}
        rail={rail}
        drawer={isDrawer}
        drawerOpen={drawerOpen}
        onCloseDrawer={() => setDrawerOpen(false)}
      />
      {drawerVisible && <div className="shell-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}

      {/* While the drawer is open it behaves as a modal: the rest of the app is inert. */}
      <div className="shell__main" inert={drawerVisible}>
        <TopBar
          portal={portal}
          status={status}
          menuButtonRef={menuButtonRef}
          sidebarExpanded={isDrawer ? drawerOpen : !collapsed}
          menuButtonLabel={isDrawer ? "Open menu" : collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onMenuClick={onMenuClick}
        />
        <main id="main-content" className="page" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
