import { useAuth } from "../../auth/AuthProvider";
import { ChevronDownIcon, LogOutIcon } from "../icons";
import { useMenu } from "./hooks";

/** Stable, readable avatar colours (white text on each passes AA for large text). */
const AVATAR_COLOURS = ["#f26979", "#3762ea", "#04a08b", "#d9822b", "#7c5cd6", "#0b8bc4", "#c2477a", "#4f7a28"];

function avatarColour(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLOURS[hash % AVATAR_COLOURS.length] ?? AVATAR_COLOURS[0]!;
}

const initialOf = (name: string) => name.trim().charAt(0).toUpperCase() || "?";

export function UserMenu() {
  const { user, logout } = useAuth();
  const menu = useMenu();
  if (!user) return null;

  const roleLabel = user.role === "admin" ? "Support team" : "Author";
  const avatar = (
    <span className="shell-avatar" style={{ background: avatarColour(user.name) }} aria-hidden="true">
      {initialOf(user.name)}
    </span>
  );

  return (
    <div className="shell-menu">
      <button
        ref={menu.triggerRef}
        type="button"
        className="shell-user"
        aria-label={`Account: ${user.name}`}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls="shell-user-menu"
        onClick={menu.onTriggerClick}
        onKeyDown={menu.onTriggerKeyDown}
      >
        {avatar}
        <span className="shell-user__text">
          <span className="shell-user__name">{user.name}</span>
          <span className="shell-user__role">{roleLabel}</span>
        </span>
        <ChevronDownIcon size={16} />
      </button>

      {menu.open && (
        <div ref={menu.panelRef} className="shell-menu__panel shell-usermenu" onKeyDown={menu.onPanelKeyDown}>
          <div className="shell-usermenu__head">
            {avatar}
            <div className="shell-usermenu__who">
              <p className="shell-usermenu__name">{user.name}</p>
              <p className="shell-usermenu__email">{user.email}</p>
              <span className="badge badge--primary">{roleLabel}</span>
            </div>
          </div>
          <ul id="shell-user-menu" role="menu" aria-label="Account" className="shell-usermenu__list">
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className="shell-usermenu__item"
                data-menu-item
                onClick={() => {
                  menu.close(false);
                  void logout();
                }}
              >
                <LogOutIcon size={18} />
                Sign out
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
