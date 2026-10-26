import { useId, useState, type ReactNode } from "react";

export interface AccordionItem {
  id: string;
  title: ReactNode;
  content: ReactNode;
}

export interface AccordionProps {
  items: readonly AccordionItem[];
  /** Let several sections stay open at once (default: opening one closes the others). */
  allowMultiple?: boolean;
  /** Ids open on first render. */
  defaultOpen?: readonly string[];
  /** Heading level wrapping each trigger (default h3). */
  headingLevel?: "h2" | "h3" | "h4";
}

/** Disclosure list (e.g. FAQ): heading buttons with aria-expanded controlling labelled regions. */
export function Accordion({ items, allowMultiple = false, defaultOpen = [], headingLevel: Heading = "h3" }: AccordionProps) {
  const base = useId();
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(defaultOpen));

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(allowMultiple ? prev : []);
      if (prev.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="ui-accordion">
      {items.map((item) => {
        const expanded = open.has(item.id);
        const btnId = `${base}-${item.id}-btn`;
        const panelId = `${base}-${item.id}-panel`;
        return (
          <div className={`ui-accordion__item${expanded ? " ui-accordion__item--open" : ""}`} key={item.id}>
            <Heading className="ui-accordion__heading">
              <button
                type="button"
                id={btnId}
                className="ui-accordion__trigger"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => toggle(item.id)}
              >
                <span className="ui-accordion__title">{item.title}</span>
                <svg className="ui-accordion__chevron" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </Heading>
            <div id={panelId} role="region" aria-labelledby={btnId} className="ui-accordion__panel" hidden={!expanded}>
              {item.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
