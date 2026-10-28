"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignInForm() {
  const router = useRouter();

  const [mode, setMode] = useState<"sign-in" | "create">("sign-in");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  function switchMode(nextMode: "sign-in" | "create") {
    setMode(nextMode);
    setMessage("");
    setIsError(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setIsError(false);
    setLoading(true);

    const form = new FormData(event.currentTarget);

    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const username = String(form.get("username") ?? "").trim();

    try {
      // Missing or malformed configuration must produce a friendly UI error,
      // not an exception before the error handler begins.
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setMessage(
          "Accounts are unavailable because Supabase is not configured. Contact the project administrator.",
        );
        setIsError(true);
        return;
      }

      if (mode === "create") {
        if (username.length < 3) {
          setMessage("Username must be at least 3 characters long.");
          setIsError(true);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username,
            },
          },
        });

        if (error) {
          setMessage(error.message);
          setIsError(true);
          return;
        }

        // If email confirmation is disabled, Supabase creates
        // a session immediately and we can go straight to Profile.
        if (data.session) {
          router.push("/profile");
          router.refresh();
          return;
        }

        // If email confirmation is enabled, Supabase will require
        // the user to confirm their email before signing in.
        setMessage(
          "Account created! Check your email to confirm your account, then come back and sign in.",
        );

        setMode("sign-in");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setMessage(error.message);
          setIsError(true);
          return;
        }

        router.push("/profile");
        router.refresh();
      }
    } catch {
      setMessage("Something went wrong. Please try again.");
      setIsError(true);
    } finally {
      setLoading(false);
    }
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
        <p className="eyebrow">YOUR ACCOUNT</p>

        <h1 id="auth-heading">
          {mode === "sign-in" ? "Welcome back." : "Start improving."}
        </h1>

        <p className="auth-intro">
          {mode === "sign-in"
            ? "Sign in for authenticated Ranked matches and account settings. Practice reviews remain temporary in this browser tab."
            : "Create an account for authenticated Ranked matches. Practice game history is not yet saved to your account."}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "create" && (
            <label className="field-group">
              <span>Username</span>

              <span className="input-shell">
                <UserRound size={18} aria-hidden="true" />

                <input
                  name="username"
                  type="text"
                  placeholder="YourUsername"
                  autoComplete="username"
                  minLength={3}
                  required
                />
              </span>
            </label>
          )}

          <label className="field-group">
            <span>Email</span>

            <span className="input-shell">
              <Mail size={18} aria-hidden="true" />

              <input
                name="email"
                type="email"
                placeholder="name@example.com"
                autoComplete="email"
                required
              />
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

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading
              ? mode === "sign-in"
                ? "Signing In..."
                : "Creating Account..."
              : mode === "sign-in"
                ? "Sign In"
                : "Create Account"}
          </button>
        </form>

        {message && (
          <p className={`auth-message${isError ? " error" : ""}`} role="status">
            {message}
          </p>
        )}

        <p className="auth-footnote">
          Your account is securely handled through Supabase authentication.
        </p>
      </div>
    </section>
  );
}
