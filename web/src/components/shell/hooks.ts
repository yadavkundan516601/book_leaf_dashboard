import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

/** Live result of a CSS media query. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

/** True when a key press is aimed at a text field, so global shortcuts must not hijack it. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

const ITEM_SELECTOR = "[data-menu-item]:not([disabled])";

/**
 * Dropdown behaviour shared by the top-bar menus: toggle from a trigger button, close on outside click,
 * Esc and Tab-away, arrow/Home/End navigation between `[data-menu-item]` elements, and focus returning to
 * the trigger when closed from the keyboard or by choosing an item.
 */
export function useMenu() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const focusOnOpen = useRef<"first" | "last">("first");

  const items = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const openWith = (target: "first" | "last") => {
    focusOnOpen.current = target;
    setOpen(true);
  };

  // Move focus into the panel once it has rendered (WAI-ARIA menu button pattern).
  useEffect(() => {
    if (!open) return;
    const list = items();
    const target = focusOnOpen.current === "last" ? list[list.length - 1] : list[0];
    (target ?? panelRef.current)?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const node = e.target as Node;
      if (!panelRef.current?.contains(node) && !triggerRef.current?.contains(node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(true);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  const onTriggerClick = () => (open ? close(false) : openWith("first"));

  const onTriggerKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openWith(e.key === "ArrowDown" ? "first" : "last");
    }
  };

  const onPanelKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "Tab") {
      setOpen(false); // let focus move on naturally
      return;
    }
    const list = items();
    if (!list.length) return;
    const index = list.indexOf(document.activeElement as HTMLElement);
    let next: HTMLElement | undefined;
    if (e.key === "ArrowDown") next = list[(index + 1) % list.length];
    else if (e.key === "ArrowUp") next = list[index <= 0 ? list.length - 1 : index - 1];
    else if (e.key === "Home") next = list[0];
    else if (e.key === "End") next = list[list.length - 1];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  return { open, close, triggerRef, panelRef, onTriggerClick, onTriggerKeyDown, onPanelKeyDown };
}
