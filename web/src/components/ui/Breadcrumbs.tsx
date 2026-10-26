import { Link } from "react-router";

export interface BreadcrumbItem {
  label: string;
  /** Route path; omitted for the current page (always the last item). */
  to?: string;
}

export interface BreadcrumbsProps {
  items: readonly BreadcrumbItem[];
}

/** Breadcrumb trail; on phones the middle items collapse to "…". */
export function Breadcrumbs({ items }: BreadcrumbsProps) {
  if (items.length === 0) return null;
  const lastIndex = items.length - 1;
  return (
    <nav className="ui-breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, i) => {
          const isLast = i === lastIndex;
          const isMiddle = i > 0 && i < lastIndex - 1;
          return (
            <li key={i} className={isMiddle ? "ui-breadcrumbs__item ui-breadcrumbs__item--middle" : "ui-breadcrumbs__item"}>
              {i === lastIndex - 1 && lastIndex > 2 && (
                <span className="ui-breadcrumbs__ellipsis" aria-hidden="true">
                  …<span className="ui-breadcrumbs__sep">›</span>
                </span>
              )}
              {isLast || !item.to ? (
                <span className="ui-breadcrumbs__current" aria-current={isLast ? "page" : undefined} title={item.label}>
                  {item.label}
                </span>
              ) : (
                <Link to={item.to}>{item.label}</Link>
              )}
              {!isLast && (
                <span className="ui-breadcrumbs__sep" aria-hidden="true">
                  ›
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
