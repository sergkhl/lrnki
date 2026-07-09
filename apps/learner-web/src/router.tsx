import { Outlet, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { DuelPage } from "./routes/DuelPage";
import { ExpeditionPage } from "./routes/ExpeditionPage";
import { JournalPage } from "./routes/JournalPage";

// Code-based routes (KTD4): browser history + the 404.html fallback keep deep links
// like /expedition/:enrichmentId alive on GitHub Pages without a router change.
const rootRoute = createRootRoute({
  component: () => (
    <main className="learn-journal">
      <div className="learn-journal-shell">
        <Outlet />
      </div>
    </main>
  )
});

const journalRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: JournalPage });
const expeditionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/expedition/$enrichmentId",
  component: ExpeditionPage
});
const duelRoute = createRoute({ getParentRoute: () => rootRoute, path: "/duel", component: DuelPage });

export const router = createRouter({
  routeTree: rootRoute.addChildren([journalRoute, expeditionRoute, duelRoute]),
  basepath: import.meta.env.BASE_URL
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
