import { useCallback, useEffect, useRef } from "react";
import { useBlocker, type BlockerFunction } from "react-router";
import { useConfirm, type ConfirmOptions } from "../../../components/ui";

const APP_NAME = "BookLeaf Author Support";

/** Sets `document.title` to "<title> | BookLeaf Author Support" while the page is mounted. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} | ${APP_NAME}`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

const LEAVE_DEFAULTS: ConfirmOptions = {
  title: "Leave without sending?",
  message: "Your text will be lost.",
  confirmLabel: "Leave without sending",
  cancelLabel: "Stay and keep editing",
  // "danger" puts the initial focus on the safe choice (stay).
  tone: "danger",
};

/**
 * Guards unsent text. While `when` is true:
 * - in-app navigations to another page (links, `navigate()`, and the browser back/forward buttons) are held by
 *   react-router's `useBlocker` and only continue if the author confirms "Leave without sending?";
 * - reloads and tab closes get the browser's own `beforeunload` prompt.
 * A change of search/hash on the same page is not blocked.
 *
 * Returns `allowNextNavigation()`, for a navigation the page itself starts after the text was handled (e.g. after
 * a successful submit, before React has re-rendered with the cleared text).
 */
export function useLeaveGuard(when: boolean, options: Partial<ConfirmOptions> = {}) {
  const confirm = useConfirm();
  const allowNext = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) => {
      if (allowNext.current) {
        allowNext.current = false;
        return false;
      }
      return when && currentLocation.pathname !== nextLocation.pathname;
    },
    [when],
  );
  const blocker = useBlocker(shouldBlock);

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    let settled = false;
    void confirm({ ...LEAVE_DEFAULTS, ...optionsRef.current }).then((leave) => {
      if (settled) return;
      settled = true;
      if (leave) blocker.proceed();
      else blocker.reset();
    });
    return () => {
      settled = true;
    };
  }, [blocker, confirm]);

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

  return useCallback(() => {
    allowNext.current = true;
  }, []);
}

/** localStorage helpers that never throw (private mode, quota, disabled storage). */
export const safeStorage = {
  read<T>(key: string, parse: (raw: unknown) => T | null): T | null {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? parse(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  },
  write(key: string, value: unknown) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage unavailable: the draft just isn't kept.
    }
  },
  remove(key: string) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};
