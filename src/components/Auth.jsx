import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Auth() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [resending, setResending] = useState(false);

  const toggleMode = () => {
    setMode((m) => (m === "signin" ? "signup" : "signin"));
    setError("");
    setNotice("");
    setNeedsConfirmation(false);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setNeedsConfirmation(false);
    setSubmitting(true);

    const { data, error: authError } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setSubmitting(false);

    if (authError) {
      // Supabase returns this specific message when "Confirm email" is
      // enabled in the dashboard and the account hasn't clicked the link yet.
      if (authError.message.toLowerCase().includes("email not confirmed")) {
        setNeedsConfirmation(true);
        setError("Please confirm your email first — check your inbox for the link we sent you.");
      } else {
        setError(authError.message);
      }
      return;
    }

    if (mode === "signup") {
      // If "Confirm email" is off in Supabase, signUp already returns a
      // session and data.session will be set — no need to wait for anything.
      if (data.session) {
        setNotice("Account created!");
      } else {
        setNotice("Almost there — check your email to confirm your account before signing in.");
        setMode("signin");
      }
    }
  };

  const onResend = async () => {
    if (!email) {
      setError("Enter your email above first, then tap resend.");
      return;
    }
    setResending(true);
    setError("");
    const { error: resendError } = await supabase.auth.resend({ type: "signup", email });
    setResending(false);
    if (resendError) {
      setError(resendError.message);
    } else {
      setNotice("Confirmation email sent again — check your inbox.");
      setNeedsConfirmation(false);
    }
  };

  return (
    <section id="auth-screen" className="screen">
      <div className="auth-card">
        <h1 className="brand">Keepsake</h1>
        <p className="tagline">a cozy little place for your pictures, videos &amp; songs</p>
        <div className="card-panel">
          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="auth-email">email</label>
              <input
                type="email"
                id="auth-email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="auth-password">password</label>
              <input
                type="password"
                id="auth-password"
                required
                minLength={6}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="form-error">{error}</p>}
            {notice && <p className="form-notice">{notice}</p>}
            {needsConfirmation && (
              <button
                type="button"
                className="link-btn"
                onClick={onResend}
                disabled={resending}
                style={{ marginBottom: 12 }}
              >
                {resending ? "Sending…" : "Resend confirmation email"}
              </button>
            )}
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "just a sec…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
          <div className="switch-mode">
            <button className="link-btn" onClick={toggleMode}>
              {mode === "signin" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}