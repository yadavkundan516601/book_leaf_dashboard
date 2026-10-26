import { Outlet } from "react-router";
import { RealtimeFeedContext, useRealtime } from "../realtime/useRealtime";
import { AppShell } from "./shell/AppShell";
import type { NavGroup, Portal } from "./shell/types";

export type { NavGroup, NavItem } from "./shell/types";

/** Signed-in shell: owns the realtime connection so it survives navigation within a portal. */
export function Layout({ groups, portal }: { groups: NavGroup[]; portal: Portal }) {
  const { status, feed } = useRealtime();

  return (
    <RealtimeFeedContext value={feed}>
      <AppShell groups={groups} portal={portal} status={status}>
        <Outlet />
      </AppShell>
    </RealtimeFeedContext>
  );
}
