import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Auth() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const toggleMode = () => {
    setMode((m) => (m === "signin" ? "signup" : "signin"));
    setError("");
    setNotice("");
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setSubmitting(true);

    const { error: authError } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setSubmitting(false);

    if (authError) {
      setError(authError.message);
    } else if (mode === "signup") {
      setNotice("Account created. Please sign in.");
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
