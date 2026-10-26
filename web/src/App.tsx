import { Link, Navigate, Route, Routes } from "react-router";
import { homeFor, useAuth } from "./auth/AuthProvider";
import { RequireRole } from "./auth/RequireRole";
import { EmptyState } from "./components/EmptyState";
import { Layout, type NavItem } from "./components/Layout";
import { Spinner } from "./components/Spinner";
import { AdminTicketPage } from "./pages/admin/AdminTicketPage";
import { QueuePage } from "./pages/admin/QueuePage";
import { AuthorTicketPage } from "./pages/author/AuthorTicketPage";
import { MyBooksPage } from "./pages/author/MyBooksPage";
import { MyTicketsPage } from "./pages/author/MyTicketsPage";
import { NewTicketPage } from "./pages/author/NewTicketPage";
import { LoginPage } from "./pages/LoginPage";
import { UiKitPage } from "./pages/UiKitPage";

const AUTHOR_NAV: NavItem[] = [
  { to: "/author/books", label: "My Books" },
  { to: "/author/tickets", label: "My Tickets", end: true },
  { to: "/author/tickets/new", label: "New Query" },
];

const ADMIN_NAV: NavItem[] = [{ to: "/admin/tickets", label: "Ticket Queue" }];

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
            <Layout nav={AUTHOR_NAV} portal="Author" />
          </RequireRole>
        }
      >
        <Route index element={<Navigate to="books" replace />} />
        <Route path="books" element={<MyBooksPage />} />
        <Route path="tickets" element={<MyTicketsPage />} />
        <Route path="tickets/new" element={<NewTicketPage />} />
        <Route path="tickets/:id" element={<AuthorTicketPage />} />
      </Route>
      <Route
        path="/admin"
        element={
          <RequireRole role="admin">
            <Layout nav={ADMIN_NAV} portal="Support" />
          </RequireRole>
        }
      >
        <Route index element={<Navigate to="tickets" replace />} />
        <Route path="tickets" element={<QueuePage />} />
        <Route path="tickets/:id" element={<AdminTicketPage />} />
      </Route>
      {import.meta.env.DEV && <Route path="/ui-kit" element={<UiKitPage />} />}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
