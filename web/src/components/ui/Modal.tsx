import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

export interface ModalProps {
  open: boolean;
  /** Called on Esc, backdrop click and the close button. */
  onClose: () => void;
  title: ReactNode;
  /** Short explanation; referenced by aria-describedby. */
  description?: ReactNode;
  children?: ReactNode;
  /** Action buttons, right-aligned (stacked on phones). */
  footer?: ReactNode;
  /** Element to focus on open (default: first [data-autofocus], then first focusable). */
  initialFocusRef?: RefObject<HTMLElement | null>;
  size?: "sm" | "md" | "lg";
  hideCloseButton?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

function focusablesIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
}

/** Open dialogs, innermost last; only the top one traps focus and handles Esc. */
const openStack: HTMLElement[] = [];

/** Accessible modal dialog: portal, focus trap, Esc/backdrop close, scroll lock and focus restore. */
export function Modal(props: ModalProps) {
  if (!props.open) return null;
  return createPortal(<ModalSurface {...props} />, document.body);
}

function ModalSurface({ onClose, title, description, children, footer, initialFocusRef, size = "md", hideCloseButton }: ModalProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descId = `${id}-desc`;
  const dialogRef = useRef<HTMLDivElement>(null);
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openStack.push(dialog);

    const { overflow, paddingRight } = document.body.style;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;

    const initial =
      initialFocusRef?.current ?? dialog.querySelector<HTMLElement>("[data-autofocus]") ?? focusablesIn(dialog)[0] ?? dialog;
    initial.focus();

    // Pull focus back if it escapes (e.g. a click on something outside, or assistive tech).
    const onFocusIn = (e: FocusEvent) => {
      if (openStack[openStack.length - 1] !== dialog) return;
      if (e.target instanceof Node && !dialog.contains(e.target)) (focusablesIn(dialog)[0] ?? dialog).focus();
    };
    document.addEventListener("focusin", onFocusIn);

    return () => {
      document.removeEventListener("focusin", onFocusIn);
      openStack.splice(openStack.indexOf(dialog), 1);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
    // Runs once per opening; initialFocusRef is read at open time only.
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dialog = dialogRef.current;
    if (!dialog || openStack[openStack.length - 1] !== dialog) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const items = focusablesIn(dialog);
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialog)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="ui-modal-overlay"
      onPointerDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        // Only a press that started and ended on the backdrop closes (not a text-selection drag).
        if (pressedOnBackdrop.current && e.target === e.currentTarget) onClose();
        pressedOnBackdrop.current = false;
      }}
    >
      <div
        ref={dialogRef}
        className={`ui-modal ui-modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="ui-modal__header">
          <h2 className="ui-modal__title" id={titleId}>
            {title}
          </h2>
          {!hideCloseButton && (
            <button type="button" className="ui-icon-btn" aria-label="Close dialog" onClick={onClose}>
              <span aria-hidden="true">×</span>
            </button>
          )}
        </div>
        {description && (
          <div className="ui-modal__description" id={descId}>
            {description}
          </div>
        )}
        {children && <div className="ui-modal__body">{children}</div>}
        {footer && <div className="ui-modal__footer">{footer}</div>}
      </div>
    </div>
  );
}
