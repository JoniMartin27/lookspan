import { Collector } from '@lookspan/collector';
import {
  CostsRepository,
  type LookspanDatabase,
  SpansRepository,
  StatsRepository,
  TracesRepository,
} from '@lookspan/storage';

export interface ApiContext {
  db: LookspanDatabase;
  collector: Collector;
  traces: TracesRepository;
  spans: SpansRepository;
  costs: CostsRepository;
  stats: StatsRepository;
}

export function createContext(db: LookspanDatabase): ApiContext {
  return {
    db,
    collector: new Collector({ db }),
    traces: new TracesRepository(db),
    spans: new SpansRepository(db),
    costs: new CostsRepository(db),
    stats: new StatsRepository(db),
  };
}
