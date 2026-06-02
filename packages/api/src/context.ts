import { Collector } from '@lookspan/collector';
import {
  AlertsRepository,
  CostsRepository,
  type LookspanDatabase,
  ScoresRepository,
  SpansRepository,
  StatsRepository,
  TracesRepository,
} from '@lookspan/storage';
import type { AlertRule } from '@lookspan/types';

export interface ApiContext {
  db: LookspanDatabase;
  collector: Collector;
  traces: TracesRepository;
  spans: SpansRepository;
  costs: CostsRepository;
  stats: StatsRepository;
  alerts: AlertsRepository;
  scores: ScoresRepository;
}

export interface CreateContextOptions {
  alertRules?: AlertRule[];
}

export function createContext(
  db: LookspanDatabase,
  options: CreateContextOptions = {},
): ApiContext {
  return {
    db,
    collector: new Collector({ db, alertRules: options.alertRules }),
    traces: new TracesRepository(db),
    spans: new SpansRepository(db),
    costs: new CostsRepository(db),
    stats: new StatsRepository(db),
    alerts: new AlertsRepository(db),
    scores: new ScoresRepository(db),
  };
}
