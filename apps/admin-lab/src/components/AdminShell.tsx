export function AdminShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return <main className="shell"><header className="header"><div><p className="eyebrow">Lrnki</p><h1>Admin Lab</h1><p className="muted">Learner-neutral core concept graph scaffold</p></div><div className="status">Scaffold · read only</div></header><nav className="nav"><span className="active">Graph explorer</span><span>Sources</span><span>Runs</span><span>Candidates</span><span>Artifacts</span><span>Publications</span></nav>{children}</main>;
}
