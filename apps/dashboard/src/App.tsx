import { lazy, Suspense } from 'react';
import { Route, Switch } from 'wouter';
import Layout from './components/Layout.tsx';
import TraceList from './views/TraceList.tsx';

// Heavy, route-specific deps (React Flow, Recharts) are split into their own
// chunks and only fetched when their route is visited. TraceList is the
// landing view, so it stays in the main bundle.
const TraceDetail = lazy(() => import('./views/TraceDetail.tsx'));
const CostsView = lazy(() => import('./views/CostsView.tsx'));
const AlertsView = lazy(() => import('./views/AlertsView.tsx'));
const SessionsView = lazy(() => import('./views/SessionsView.tsx'));
const SessionDetail = lazy(() => import('./views/SessionDetail.tsx'));

function Loading() {
  return <div className="p-8 text-neutral-400">Loading…</div>;
}

export default function App() {
  return (
    <Layout>
      <Suspense fallback={<Loading />}>
        <Switch>
          <Route path="/" component={TraceList} />
          <Route path="/traces/:id" component={TraceDetail} />
          <Route path="/sessions" component={SessionsView} />
          <Route path="/sessions/:id" component={SessionDetail} />
          <Route path="/costs" component={CostsView} />
          <Route path="/alerts" component={AlertsView} />
          <Route>
            <div className="p-8 text-neutral-400">Not found.</div>
          </Route>
        </Switch>
      </Suspense>
    </Layout>
  );
}
