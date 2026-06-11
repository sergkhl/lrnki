import Link from "next/link";

const VIEWS = [
  { key: "graph", label: "Graph explorer", href: "/admin/lab" },
  { key: "runs", label: "Run inspector", href: "/admin/lab/runs" },
  { key: "sources", label: "Source explorer", href: "/admin/lab/sources" }
] as const;

export type AdminView = (typeof VIEWS)[number]["key"];

export function AdminShell({ active = "graph", children }: Readonly<{ active?: AdminView; children: React.ReactNode }>) {
  return (
    <main className="shell">
      <header className="header">
        <div>
          <p className="eyebrow">Lrnki</p>
          <h1>Admin Lab</h1>
          <p className="muted">Learner-neutral core concept graph</p>
        </div>
        <div className="status">Read only</div>
      </header>
      <nav className="nav">
        {VIEWS.map((view) => (
          <Link key={view.key} href={view.href} className={view.key === active ? "active" : ""}>{view.label}</Link>
        ))}
      </nav>
      {children}
    </main>
  );
}
