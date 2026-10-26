import { loginSchema } from "@bookleaf/shared";
import { useRef, useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router";
import { ApiError, errorMessage } from "../api/client";
import { homeFor, useAuth } from "../auth/AuthProvider";
import { FormField, toFieldErrors } from "../components/FormField";
import { CheckIcon, EyeIcon, EyeOffIcon } from "../components/icons";
import { Spinner } from "../components/Spinner";
import { ThemeToggle } from "../components/ThemeToggle";

const DEMO_ACCOUNTS = [
  { email: "priya.sharma@email.com", password: "Author@123", label: "Priya Sharma", note: "Author · live books with royalties" },
  { email: "sneha.kulkarni@email.com", password: "Author@123", label: "Sneha Kulkarni", note: "Author · has a book in production" },
  { email: "kavita.deshmukh@email.com", password: "Author@123", label: "Kavita Deshmukh", note: "Author · pending below payout threshold" },
  { email: "admin@bookleaf.test", password: "Admin@123", label: "BookLeaf Admin", note: "Support team · ticket queue" },
];

const BENEFITS = [
  "See every book's status, sales and royalties at a glance",
  "Ask a question and follow the conversation in one thread",
  "Get notified the moment our team replies",
];

const showDemoAccounts = import.meta.env.VITE_SHOW_DEMO_ACCOUNTS !== "false";

type Field = "email" | "password";

export function LoginPage() {
  const { user, isLoading, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  if (isLoading) return <Spinner fullPage />;
  if (user) {
    // Resume a deep link only if it belongs to this user's portal (/author/... or /admin/...).
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from?.startsWith(`/${user.role}/`) ? from : homeFor(user.role)} replace />;
  }

  /** Inline validation on blur, once the field has something in it (or is already flagged). */
  function validateField(field: Field, value: string) {
    if (!value && !fieldErrors[field]) return;
    const result = loginSchema.shape[field].safeParse(value);
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (result.success) delete next[field];
      else next[field] = result.error.issues[0]?.message ?? "Check this field";
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errors = toFieldErrors(parsed.error.issues);
      setFieldErrors(errors);
      (errors.email ? emailRef : passwordRef).current?.focus();
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
      <section className="login-brand" aria-labelledby="login-headline">
        <div className="login-brand__inner">
          <span className="login-brand__plate">
            <img className="login-brand__logo" src="/logo.svg" alt="BookLeaf Publishing" width={140} height={60} />
          </span>
          <h1 id="login-headline" className="login-brand__headline">
            Your books, royalties and support, in one place
          </h1>
          <ul className="login-brand__benefits">
            {BENEFITS.map((b) => (
              <li key={b}>
                <span className="login-brand__check">
                  <CheckIcon size={14} />
                </span>
                {b}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <main className="login-main">
        <ThemeToggle className="shell-iconbtn login-main__toggle" />
        <div className="login-main__inner">
          <div className="login-card card">
            <h2 className="login-card__title">Sign in</h2>
            <p className="muted">Welcome back. Sign in to the BookLeaf Author Support portal.</p>
            <form onSubmit={(e) => void onSubmit(e)} noValidate className="stack login-card__form">
              {formError && (
                <div className="alert alert--error" role="alert">
                  {formError}
                </div>
              )}
              <FormField label="Email" error={fieldErrors.email} hint="Use the email address registered with BookLeaf.">
                {(p) => (
                  <input
                    {...p}
                    ref={emailRef}
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={(e) => validateField("email", e.target.value)}
                    autoFocus
                  />
                )}
              </FormField>
              <FormField label="Password" error={fieldErrors.password}>
                {(p) => (
                  <div className="login-password">
                    <input
                      {...p}
                      ref={passwordRef}
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onBlur={(e) => validateField("password", e.target.value)}
                    />
                    <button
                      type="button"
                      className="login-password__toggle"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-pressed={showPassword}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                    </button>
                  </div>
                )}
              </FormField>
              <button
                type="submit"
                className="btn btn--primary btn--block"
                disabled={submitting}
                aria-busy={submitting || undefined}
              >
                <span>{submitting ? "Signing in…" : "Sign in"}</span>
              </button>
              {submitting && (
                <p className="sr-only" role="status">
                  Signing in…
                </p>
              )}
            </form>
          </div>

          {showDemoAccounts && (
            <section className="login-demo" aria-labelledby="demo-heading">
              <h2 id="demo-heading" className="login-demo__title">
                Demo accounts
              </h2>
              <p className="small muted">Pick one to fill the form, then press Sign in.</p>
              <ul className="login-demo__list">
                {DEMO_ACCOUNTS.map((a) => (
                  <li key={a.email}>
                    <button
                      type="button"
                      className="login-demo__account"
                      onClick={() => {
                        setEmail(a.email);
                        setPassword(a.password);
                        setFieldErrors({});
                        setFormError(null);
                      }}
                    >
                      <span className="login-demo__name">{a.label}</span>
                      <span className="login-demo__note">{a.note}</span>
                      <span className="login-demo__email">{a.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
