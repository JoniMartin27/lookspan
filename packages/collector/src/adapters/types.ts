import type { FrameworkAdapter } from '@lookspan/types';

export interface CollectorAdapter extends FrameworkAdapter {
  readonly description: string;
}
