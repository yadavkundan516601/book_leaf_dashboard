import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface TabItem<T extends string = string> {
  id: T;
  label: ReactNode;
  /** Small count shown after the label. */
  badge?: number;
  disabled?: boolean;
}

export interface TabsProps<T extends string = string> {
  tabs: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: "segmented" | "underline";
  /** Accessible name of the tab list, e.g. "Ticket status". */
  label: string;
  /** Base id; when set, tabs point at a matching <TabPanel tabsId={id}> via aria-controls. */
  id?: string;
}

export const tabDomId = (tabsId: string, tab: string) => `${tabsId}-tab-${tab}`;
export const tabPanelDomId = (tabsId: string) => `${tabsId}-panel`;

/** Segmented control or underline tabs (role=tablist) with arrow/Home/End keys and automatic activation. */
export function Tabs<T extends string>({ tabs, value, onChange, variant = "segmented", label, id }: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const enabled = tabs.filter((t) => !t.disabled);
  // Roving tabindex: the selected tab, or the first enabled one if nothing matches `value`.
  const focusId = enabled.some((t) => t.id === value) ? value : enabled[0]?.id;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = enabled.findIndex((t) => t.id === value);
    let next: TabItem<T> | undefined;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = enabled[(index + 1) % enabled.length];
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = enabled[(index - 1 + enabled.length) % enabled.length];
    else if (e.key === "Home") next = enabled[0];
    else if (e.key === "End") next = enabled[enabled.length - 1];
    if (!next) return;
    e.preventDefault();
    onChange(next.id);
    const nextIndex = tabs.indexOf(next);
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
  };

  return (
    <div
      ref={listRef}
      className={`ui-tabs ui-tabs--${variant}`}
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
    >
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={id ? tabDomId(id, tab.id) : undefined}
            aria-controls={id ? tabPanelDomId(id) : undefined}
            aria-selected={selected}
            tabIndex={tab.id === focusId ? 0 : -1}
            disabled={tab.disabled}
            className="ui-tabs__tab"
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
            {tab.badge !== undefined && <span className="ui-tabs__badge">{tab.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps {
  /** Same id given to the Tabs component. */
  tabsId: string;
  /** Currently selected tab id. */
  value: string;
  children: ReactNode;
}

/** Panel for the selected tab, labelled by it. */
export function TabPanel({ tabsId, value, children }: TabPanelProps) {
  return (
    <div role="tabpanel" id={tabPanelDomId(tabsId)} aria-labelledby={tabDomId(tabsId, value)} tabIndex={0} className="ui-tabpanel">
      {children}
    </div>
  );
}
