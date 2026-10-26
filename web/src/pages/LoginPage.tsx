import { loginSchema } from "@bookleaf/shared";
import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router";
import { ApiError, errorMessage } from "../api/client";
import { homeFor, useAuth } from "../auth/AuthProvider";
import { FormField, toFieldErrors } from "../components/FormField";
import { Spinner } from "../components/Spinner";
import { ThemeToggle } from "../components/ThemeToggle";

const DEMO_ACCOUNTS = [
  { email: "priya.sharma@email.com", password: "Author@123", label: "Priya Sharma", note: "Author · live books with royalties" },
  { email: "sneha.kulkarni@email.com", password: "Author@123", label: "Sneha Kulkarni", note: "Author · has a book in production" },
  { email: "kavita.deshmukh@email.com", password: "Author@123", label: "Kavita Deshmukh", note: "Author · pending below payout threshold" },
  { email: "admin@bookleaf.test", password: "Admin@123", label: "BookLeaf Admin", note: "Support team · ticket queue" },
];

const showDemoAccounts = import.meta.env.VITE_SHOW_DEMO_ACCOUNTS !== "false";

export function LoginPage() {
  const { user, isLoading, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) return <Spinner fullPage />;
  if (user) {
    // Resume a deep link only if it belongs to this user's portal (/author/... or /admin/...).
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from?.startsWith(`/${user.role}/`) ? from : homeFor(user.role)} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error.issues));
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      // On success the user is set and the redirect above takes over.
      await login(parsed.data);
    } catch (error) {
      if (error instanceof ApiError && error.details.length) setFieldErrors(toFieldErrors(error.details));
      setFormError(errorMessage(error));
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <header className="login-hero">
        <ThemeToggle className="login-hero__toggle" />
        <img className="login-hero__logo" src="/logo.svg" alt="BookLeaf Publishing" />
        <h1>
          The BookLeaf <span>Author Support</span> Portal
        </h1>
        <p>Track your books and royalties, and get answers from our team.</p>
      </header>
      <div className="login">
        <div className="login__card card">
          <h2 className="login__title">Sign in</h2>
          <p className="muted">Use the email registered with BookLeaf.</p>
          <form onSubmit={(e) => void onSubmit(e)} noValidate className="stack">
            {formError && (
              <div className="alert alert--error" role="alert">
                {formError}
              </div>
            )}
            <FormField label="Email" error={fieldErrors.email}>
              {(p) => (
                <input
                  {...p}
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                />
              )}
            </FormField>
            <FormField label="Password" error={fieldErrors.password}>
              {(p) => (
                <input
                  {...p}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}
            </FormField>
            <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        {showDemoAccounts && (
          <section className="login__demo card" aria-labelledby="demo-heading">
            <h2 id="demo-heading">Demo accounts</h2>
            <p className="muted small">Click to fill the form, then sign in.</p>
            <ul className="demo-list">
              {DEMO_ACCOUNTS.map((a) => (
                <li key={a.email}>
                  <button
                    type="button"
                    className="demo-account"
                    onClick={() => {
                      setEmail(a.email);
                      setPassword(a.password);
                      setFieldErrors({});
                      setFormError(null);
                    }}
                  >
                    <strong>{a.label}</strong>
                    <span className="small muted">{a.email}</span>
                    <span className="small">{a.note}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
