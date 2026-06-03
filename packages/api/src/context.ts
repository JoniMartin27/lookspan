import { Collector } from '@lookspan/collector';
import {
  AlertsRepository,
  CostsRepository,
  DatasetsRepository,
  type LookspanDatabase,
  ReplaysRepository,
  RunsRepository,
  ScoresRepository,
  SpansRepository,
  StatsRepository,
  TracesRepository,
} from '@lookspan/storage';
import type { AlertRule } from '@lookspan/types';
import type { InferenceKeys } from './inference/provider.js';

export interface ApiContext {
  db: LookspanDatabase;
  collector: Collector;
  traces: TracesRepository;
  spans: SpansRepository;
  costs: CostsRepository;
  stats: StatsRepository;
  alerts: AlertsRepository;
  scores: ScoresRepository;
  replays: ReplaysRepository;
  datasets: DatasetsRepository;
  runs: RunsRepository;
  /** Provider API keys for replay / LLM-as-judge / dataset runs. In-memory only. */
  inferenceKeys: InferenceKeys;
}

export interface CreateContextOptions {
  alertRules?: AlertRule[];
  inferenceKeys?: InferenceKeys;
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
    replays: new ReplaysRepository(db),
    datasets: new DatasetsRepository(db),
    runs: new RunsRepository(db),
    inferenceKeys: options.inferenceKeys ?? {},
  };
}
