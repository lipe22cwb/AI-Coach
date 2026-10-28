import type { Metadata } from "next";

import { Navbar } from "@/components/play/navbar";
import { PracticeProfile } from "@/components/profile/practice-profile";
import "@/styles/practice-profile.css";

export const metadata: Metadata = {
  title: "Practice Review | AI-Coach",
  description: "Review a small temporary set of Practice games and their recordings.",
};

export default function ProfilePage() {
  return (
    <>
      <Navbar />
      <PracticeProfile />
    </>
  );
}
