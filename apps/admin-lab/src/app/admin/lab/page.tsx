import { AdminShell } from "../../../components/AdminShell";
import { GraphExplorer } from "../../../components/GraphExplorer";
import { demoSnapshot } from "../../../lib/demoSnapshot";
export default function AdminLabPage() { return <AdminShell><GraphExplorer snapshot={demoSnapshot} /></AdminShell>; }
