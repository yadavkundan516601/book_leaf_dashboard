import { useCallback, useContext, useEffect, useRef } from "react";
import { UNSAFE_NavigationContext, type Navigator, type To } from "react-router";
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
  message: "What you've written hasn't been sent yet. If you leave now it won't reach our team.",
  confirmLabel: "Leave without sending",
  cancelLabel: "Keep writing",
  tone: "danger",
};

/** Target pathname of a navigation; a search-only change counts as staying on the page. */
const pathnameOf = (to: To) =>
  typeof to === "string" ? new URL(to, window.location.href).pathname : (to.pathname ?? window.location.pathname);

/**
 * Guards unsent text: asks "Leave without sending?" before an in-app navigation to another page and sets
 * `beforeunload` for reloads/tab closes.
 *
 * The app mounts a `<BrowserRouter>`, where `useBlocker` is unavailable (it needs a data router), so in-app
 * navigations are intercepted by wrapping the router navigator's push/replace (what `<Link>`, `<NavLink>` and
 * `navigate()` call). Browser back/forward (popstate) cannot be intercepted this way.
 *
 * Returns `allowNextNavigation()`, for a navigation the page itself starts after the text was handled (e.g. after
 * a successful submit, before React has re-rendered with the cleared text).
 */
export function useLeaveGuard(when: boolean, options: Partial<ConfirmOptions> = {}) {
  const { navigator } = useContext(UNSAFE_NavigationContext);
  const confirm = useConfirm();
  const allowNext = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!when) return;
    const nav = navigator as Navigator;
    const originalPush = nav.push;
    const originalReplace = nav.replace;

    const guard =
      (original: Navigator["push"]): Navigator["push"] =>
      (to, state, opts) => {
        if (allowNext.current || pathnameOf(to) === window.location.pathname) {
          allowNext.current = false;
          original(to, state, opts);
          return;
        }
        void confirm({ ...LEAVE_DEFAULTS, ...optionsRef.current }).then((ok) => {
          if (ok) original(to, state, opts);
        });
      };

    nav.push = guard(originalPush);
    nav.replace = guard(originalReplace);

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older browsers need returnValue set to show the prompt.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      nav.push = originalPush;
      nav.replace = originalReplace;
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [when, navigator, confirm]);

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
