import type { ReactNode } from "react";

export interface CardHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Buttons, links or menus shown on the right. */
  actions?: ReactNode;
  /** Heading level for the title (default h2). */
  as?: "h2" | "h3" | "h4";
  /** Id for the title, so a parent can use aria-labelledby. */
  titleId?: string;
}

/** Title row for a Card with optional subtitle and right-aligned actions. */
export function CardHeader({ title, subtitle, actions, as: Heading = "h2", titleId }: CardHeaderProps) {
  return (
    <div className="ui-card-header">
      <div className="ui-card-header__text">
        <Heading className="ui-card-header__title" id={titleId}>
          {title}
        </Heading>
        {subtitle && <p className="ui-card-header__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="ui-card-header__actions">{actions}</div>}
    </div>
  );
}
