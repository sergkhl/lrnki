import type { Metadata } from "next";
import "@/components/learn/theme.css";
import { learnerTerm } from "@/components/learn/vocabulary";

export const metadata: Metadata = {
  title: `${learnerTerm("routeName")} | Lrnki`,
  description: "Learner expedition journal"
};

export default function LearnLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="learn-journal">
      <div className="learn-journal-shell">{children}</div>
    </main>
  );
}
