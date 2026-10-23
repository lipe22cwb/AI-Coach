import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Sparkles } from "lucide-react";

import { SignInForm } from "@/components/account/sign-in-form";
import { Navbar } from "@/components/play/navbar";

export const metadata: Metadata = {
  title: "Sign In | AI-Coach",
  description: "Sign in to your AI-Coach player profile.",
};

export default function SignInPage() {
  return (
    <>
      <Navbar />
      <main className="account-page">
        <section className="auth-layout">
          <div className="auth-copy">
            <Link className="back-link" href="/">
              <ArrowLeft size={17} aria-hidden="true" />
              Back to Play
            </Link>

            <p className="eyebrow">BUILD YOUR HISTORY</p>
            <h2>
              One profile. Every game. Better feedback over time
              <span className="title-period">.</span>
            </h2>
            <p className="auth-copy-text">
              Your account will eventually connect your Ranked record, game history,
              Current Focus, and conversations with the AI coach. For now, this page is
              the visual shell for that system.
            </p>

            <div className="auth-benefits">
              <div>
                <Sparkles size={19} aria-hidden="true" />
                <span>
                  <strong>Personal coaching</strong>
                  Feedback that can build on your previous games.
                </span>
              </div>
              <div>
                <ShieldCheck size={19} aria-hidden="true" />
                <span>
                  <strong>Private by default</strong>
                  Coaching history and conversations stay tied to your account.
                </span>
              </div>
            </div>
          </div>

          <SignInForm />
        </section>
      </main>
    </>
  );
}
