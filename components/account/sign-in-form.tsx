"use client";

import { FormEvent, useState } from "react";
import { Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";

export function SignInForm() {
  const [mode, setMode] = useState<"sign-in" | "create">("sign-in");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(
      mode === "sign-in"
        ? "Sign in is a visual preview for now. Supabase authentication can be connected here later."
        : "Account creation is a visual preview for now. Supabase authentication can be connected here later.",
    );
  }

  function switchMode(nextMode: "sign-in" | "create") {
    setMode(nextMode);
    setMessage("");
  }

  return (
    <section className="auth-card" aria-labelledby="auth-heading">
      <div className="auth-tabs" role="tablist" aria-label="Account options">
        <button
          type="button"
          className={mode === "sign-in" ? "auth-tab active" : "auth-tab"}
          onClick={() => switchMode("sign-in")}
          role="tab"
          aria-selected={mode === "sign-in"}
        >
          Sign In
        </button>
        <button
          type="button"
          className={mode === "create" ? "auth-tab active" : "auth-tab"}
          onClick={() => switchMode("create")}
          role="tab"
          aria-selected={mode === "create"}
        >
          Create Account
        </button>
      </div>

      <div className="auth-card-content">
        <p className="eyebrow">YOUR COACHING PROFILE</p>
        <h1 id="auth-heading">{mode === "sign-in" ? "Welcome back." : "Start improving."}</h1>
        <p className="auth-intro">
          {mode === "sign-in"
            ? "Sign in to continue your Ranked progress, coaching history, and saved games."
            : "Create an account to save your games, build a player profile, and unlock Ranked mode later."}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "create" && (
            <label className="field-group">
              <span>Username</span>
              <span className="input-shell">
                <UserRound size={18} aria-hidden="true" />
                <input name="username" type="text" placeholder="YourUsername" autoComplete="username" required />
              </span>
            </label>
          )}

          <label className="field-group">
            <span>Email</span>
            <span className="input-shell">
              <Mail size={18} aria-hidden="true" />
              <input name="email" type="email" placeholder="name@example.com" autoComplete="email" required />
            </span>
          </label>

          <label className="field-group">
            <span>Password</span>
            <span className="input-shell password-shell">
              <LockKeyhole size={18} aria-hidden="true" />
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                minLength={6}
                required
              />
              <button
                className="password-toggle"
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>

          {mode === "sign-in" && (
            <div className="auth-options">
              <label className="remember-me">
                <input type="checkbox" />
                <span>Remember me</span>
              </label>
              <button type="button" className="text-button" title="Password reset will be added with Supabase">
                Forgot password?
              </button>
            </div>
          )}

          <button className="auth-submit" type="submit">
            {mode === "sign-in" ? "Sign In" : "Create Account"}
          </button>
        </form>

        {message && (
          <p className="auth-message" role="status">
            {message}
          </p>
        )}

        <p className="auth-footnote">
          No account data is being saved yet. This screen is ready to connect to Supabase later.
        </p>
      </div>
    </section>
  );
}
