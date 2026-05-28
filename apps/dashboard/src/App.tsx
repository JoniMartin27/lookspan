import { Route, Switch } from 'wouter';
import Layout from './components/Layout.tsx';
import CostsView from './views/CostsView.tsx';
import TraceDetail from './views/TraceDetail.tsx';
import TraceList from './views/TraceList.tsx';

export default function App() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={TraceList} />
        <Route path="/traces/:id" component={TraceDetail} />
        <Route path="/costs" component={CostsView} />
        <Route>
          <div className="p-8 text-neutral-400">Not found.</div>
        </Route>
      </Switch>
    </Layout>
  );
}
