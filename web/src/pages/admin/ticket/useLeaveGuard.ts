import { useEffect, useRef } from "react";
import { useBlocker } from "react-router";
import { useConfirm } from "../../../components/ui";

/**
 * Asks "Leave without sending?" before leaving the page while `when` is true: in-app navigations (links,
 * back/forward) are held by react-router's `useBlocker`; reloads and tab closes get the browser's own
 * `beforeunload` prompt. Search-only URL changes on the same page are not blocked.
 */
export function useLeaveGuard(when: boolean) {
  const confirm = useConfirm();
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => when && currentLocation.pathname !== nextLocation.pathname,
  );
  const blockerRef = useRef(blocker);
  blockerRef.current = blocker;

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    let active = true;
    void confirm({
      title: "Leave without sending?",
      message: "Your text will be lost.",
      confirmLabel: "Leave",
      cancelLabel: "Stay",
      // "danger" puts the initial focus on the safe choice, Stay.
      tone: "danger",
    }).then((leave) => {
      const current = blockerRef.current;
      if (!active || current.state !== "blocked") return;
      if (leave) current.proceed();
      else current.reset();
    });
    return () => {
      active = false;
    };
  }, [blocker.state, confirm]);

  useEffect(() => {
    if (!when) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older browsers need returnValue set to show the prompt.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [when]);
}
