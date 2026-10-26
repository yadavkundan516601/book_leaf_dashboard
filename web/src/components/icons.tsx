import type { ReactNode } from "react";

/** Small stroke icons (16px) used in card fact rows. Decorative: always aria-hidden. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const BookIcon = () => (
  <Icon>
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
    <path d="M4 19V5M9 7h6" />
  </Icon>
);
export const GlobeIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </Icon>
);
export const PrinterIcon = () => (
  <Icon>
    <path d="M6 9V3h12v6M6 18H4v-7h16v7h-2" />
    <rect x="6" y="14" width="12" height="7" />
  </Icon>
);
export const TagIcon = () => (
  <Icon>
    <path d="M3 12V4h8l10 10-8 8z" />
    <circle cx="7.5" cy="8.5" r="1" />
  </Icon>
);
export const ClipIcon = () => (
  <Icon>
    <path d="M21 11l-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8" />
  </Icon>
);
export const SparkIcon = () => (
  <Icon>
    <path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z" />
  </Icon>
);

// ---------------------------------------------------------------------------
// App shell icons (navigation, top bar, menus). Same 24px stroke grid; size via the `size` prop.
// ---------------------------------------------------------------------------

function ShellIcon({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

type IconProps = { size?: number };

export const MenuIcon = (p: IconProps) => (
  <ShellIcon {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </ShellIcon>
);
export const CloseIcon = (p: IconProps) => (
  <ShellIcon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </ShellIcon>
);
export const SearchIcon = (p: IconProps) => (
  <ShellIcon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </ShellIcon>
);
export const BellIcon = (p: IconProps) => (
  <ShellIcon {...p}>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
    <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
  </ShellIcon>
);
export const DashboardIcon = (p: IconProps) => (
  <ShellIcon {...p}>
    <rect x="3.5" y="3.5" width="7" height="8" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
    <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
    <rect x="3.5" y="14.5" width="7" height="6" rx="1.5" />
  </ShellIcon>
);
export const InboxIcon = (p: IconProps) => (
  <ShellIcon {...p}>
    <path d="M4 13l2.5-8h11L20 13v6H4z" />
    <path d="M4 13h4.5l1 2h5l1-2H20" />
  </ShellIcon>
);
export const UserCheckIcon = (p: IconProps) => (
  <ShellIcon {...p}>
    <circle cx="9.5" cy="8" r="3.5" />
    <path d="M3.5 20a6 6 0 0 1 12 0M16 11.5l2 2 3.5-4" />
  </ShellIcon>
);
export const UserQuestionIcon = (p: IconProps) => (
  <ShellIcon {...p}>
    <circle cx="9.5" cy="8" r="3.5" />
    <path d="M3.5 20a6 6 0 0 1 12 0M17 8.5a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9v.4M19 14.2v.1" />
  </ShellIcon>
);
export const AlarmIcon = (p: IconProps) => (
  <ShellIcon {...p}>
    <circle cx="12" cy="13" r="7.5" />
    <path d="M12 9v4.5M12 16.5v.1M3.5 5.5L6 3.5M20.5 5.5L18 3.5" />
  </ShellIcon>
);
export const CodeIcon = (p: IconProps) => (
  <ShellIcon {...p}>
    <path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15" />
  </ShellIcon>
);
export const ExternalIcon = (p: IconProps) => (
  <ShellIcon {...p}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </ShellIcon>
);
export const BooksIcon = (p: IconProps) => (
  <ShellIcon {...p}>
    <path d="M4.5 5.5A1.5 1.5 0 0 1 6 4h12.5v14H6a1.5 1.5 0 0 0-1.5 1.5z" />
    <path d="M4.5 19.5A1.5 1.5 0 0 0 6 21h12.5v-3M9 8h5.5" />
  </ShellIcon>
);
export const ChatIcon = (p: IconProps) => (
  <ShellIcon {...p}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4V16A1.5 1.5 0 0 1 4 14.5z" />
    <path d="M8.5 9h7M8.5 12h4.5" />
  </ShellIcon>
);
export const PlusIcon = (p: IconProps) => (
  <ShellIcon {...p}>
    <path d="M12 5v14M5 12h14" />
  </ShellIcon>
);
export const PlusCircleIcon = (p: IconProps) => (
  <ShellIcon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 8.5v7M8.5 12h7" />
  </ShellIcon>
);
export const HelpIcon = (p: IconProps) => (
  <ShellIcon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.4v.4M12 16.6v.1" />
  </ShellIcon>
);
export const LogOutIcon = (p: IconProps) => (
  <ShellIcon {...p}>
    <path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10M15 8l4 4-4 4M19 12H9.5" />
  </ShellIcon>
);
export const CheckIcon = (p: IconProps) => (
  <ShellIcon {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </ShellIcon>
);
export const CheckCircleIcon = (p: IconProps) => (
  <ShellIcon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.5 12.3l2.4 2.4 4.6-5" />
  </ShellIcon>
);
export const EyeIcon = (p: IconProps) => (
  <ShellIcon {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </ShellIcon>
);
export const EyeOffIcon = (p: IconProps) => (
  <ShellIcon {...p}>
    <path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.4M6.6 6.6A15.6 15.6 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 5.4-1.6" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3.5 3.5l17 17" />
  </ShellIcon>
);
export const TicketIcon = (p: IconProps) => (
  <ShellIcon {...p}>
    <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4z" />
    <path d="M14 6v12" strokeDasharray="2 2" />
  </ShellIcon>
);
export const RefreshIcon = (p: IconProps) => (
  <ShellIcon {...p}>
    <path d="M19.5 11a7.5 7.5 0 0 0-13.6-3.6L4.5 9M4.5 4.5V9H9M4.5 13a7.5 7.5 0 0 0 13.6 3.6l1.4-1.6M19.5 19.5V15H15" />
  </ShellIcon>
);
export const ChevronDownIcon = (p: IconProps) => (
  <ShellIcon {...p}>
    <path d="M6 9l6 6 6-6" />
  </ShellIcon>
);
