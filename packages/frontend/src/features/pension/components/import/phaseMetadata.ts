import { Brain, Clock, Sparkles } from 'lucide-react';
import { type JobPhase } from '../../hooks/usePensionImportModalController';

export const PIPELINE: {
  key: JobPhase;
  label: string;
  sublabel: string;
  Icon: React.ElementType;
}[] = [
  { key: 'queuing', label: 'Queued', sublabel: 'Waiting in queue', Icon: Clock },
  { key: 'processing', label: 'Processing', sublabel: 'AI reading your PDF', Icon: Brain },
  { key: 'ready', label: 'Review ready', sublabel: 'Transactions extracted', Icon: Sparkles },
];

export const PHASE_IDX: Record<JobPhase, number> = {
  queuing: 0,
  processing: 1,
  ready: 2,
};
