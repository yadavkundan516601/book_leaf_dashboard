import { useMemo } from "react";
import { Link, Navigate, Route, Routes } from "react-router";
import { useAdminStats, useAuthorTickets } from "./api/hooks";
import { homeFor, useAuth } from "./auth/AuthProvider";
import { RequireRole } from "./auth/RequireRole";
import { EmptyState } from "./components/EmptyState";
import {
  AlarmIcon,
  BooksIcon,
  ChatIcon,
  CodeIcon,
  DashboardIcon,
  HelpIcon,
  InboxIcon,
  PlusCircleIcon,
  UserCheckIcon,
  UserQuestionIcon,
} from "./components/icons";
import { Layout, type NavGroup } from "./components/Layout";
import { Spinner } from "./components/Spinner";
import { AdminTicketPage } from "./pages/admin/AdminTicketPage";
import { DashboardPage } from "./pages/admin/DashboardPage";
import { QueuePage } from "./pages/admin/QueuePage";
import { AuthorTicketPage } from "./pages/author/AuthorTicketPage";
import { HelpPage } from "./pages/author/HelpPage";
import { MyBooksPage } from "./pages/author/MyBooksPage";
import { MyTicketsPage } from "./pages/author/MyTicketsPage";
import { NewTicketPage } from "./pages/author/NewTicketPage";
import { OverviewPage } from "./pages/author/OverviewPage";
import { LoginPage } from "./pages/LoginPage";
import { UiKitPage } from "./pages/UiKitPage";

/**
 * "SLA breached" shortcut. The queue has no SLA filter yet, so this approximates it with the unresolved
 * critical/high tickets (the ones with the tightest first-response windows); the badge itself is the exact
 * `slaBreached` count from the stats endpoint.
 */
const SLA_SHORTCUT = "/admin/tickets?status=open&status=in_progress&priority=critical&priority=high";

function AdminLayout() {
  const { data: stats } = useAdminStats();
  const groups = useMemo<NavGroup[]>(
    () => [
      { label: "Overview", items: [{ to: "/admin/dashboard", label: "Dashboard", icon: <DashboardIcon /> }] },
      {
        label: "Support",
        items: [
          {
            to: "/admin/tickets",
            label: "Ticket Queue",
            icon: <InboxIcon />,
            badge: stats ? stats.byStatus.open + stats.byStatus.in_progress : null,
          },
          { to: "/admin/tickets?assignee=me", label: "Assigned to me", icon: <UserCheckIcon /> },
          {
            to: "/admin/tickets?assignee=unassigned",
            label: "Unassigned",
            icon: <UserQuestionIcon />,
            badge: stats?.unassignedOpen ?? null,
          },
          {
            to: SLA_SHORTCUT,
            label: "SLA breached",
            icon: <AlarmIcon />,
            badge: stats?.slaBreached ?? null,
            badgeTone: "danger",
          },
        ],
      },
      { label: "Resources", items: [{ to: "/api/docs", label: "API docs", icon: <CodeIcon />, external: true }] },
    ],
    [stats],
  );
  return <Layout groups={groups} portal="admin" />;
}

function AuthorLayout() {
  // One list fetch, refreshed by the usual realtime invalidations; counts tickets with an unread team reply.
  const { data: tickets } = useAuthorTickets({ pageSize: 100, sort: "updated" });
  const awaiting = tickets?.data.filter((t) => t.awaitingAuthor).length ?? null;
  const groups = useMemo<NavGroup[]>(
    () => [
      { label: "Overview", items: [{ to: "/author/overview", label: "Dashboard", icon: <DashboardIcon /> }] },
      {
        label: "My account",
        items: [
          { to: "/author/books", label: "My Books", icon: <BooksIcon /> },
          { to: "/author/tickets", label: "My Tickets", icon: <ChatIcon />, badge: awaiting },
          { to: "/author/tickets/new", label: "New Query", icon: <PlusCircleIcon /> },
        ],
      },
      { label: "Help", items: [{ to: "/author/help", label: "Help & FAQ", icon: <HelpIcon /> }] },
    ],
    [awaiting],
  );
  return <Layout groups={groups} portal="author" />;
}

function RootRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Spinner fullPage />;
  return <Navigate to={user ? homeFor(user.role) : "/login"} replace />;
}

function NotFound() {
  return (
    <main className="page">
      <EmptyState
        title="Page not found"
        action={
          <Link className="btn" to="/">
            Go home
          </Link>
        }
      >
        The link may be out of date.
      </EmptyState>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/author"
        element={
          <RequireRole role="author">
            <AuthorLayout />
          </RequireRole>
        }
      >
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<OverviewPage />} />
        <Route path="books" element={<MyBooksPage />} />
        <Route path="tickets" element={<MyTicketsPage />} />
        <Route path="tickets/new" element={<NewTicketPage />} />
        <Route path="tickets/:id" element={<AuthorTicketPage />} />
        <Route path="help" element={<HelpPage />} />
      </Route>
      <Route
        path="/admin"
        element={
          <RequireRole role="admin">
            <AdminLayout />
          </RequireRole>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="tickets" element={<QueuePage />} />
        <Route path="tickets/:id" element={<AdminTicketPage />} />
      </Route>
      {import.meta.env.DEV && <Route path="/ui-kit" element={<UiKitPage />} />}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
