import { Brain, Clock, Sparkles } from 'lucide-react';
import { type JobPhase } from '../../hooks/usePensionImportModalController';

export const PIPELINE: {
  key: JobPhase;
  label: string;
  sublabel: string;
  Icon: React.ElementType;
  activeCls: string;
  completeCls: string;
}[] = [
  {
    key: 'queuing',
    label: 'Queued',
    sublabel: 'Waiting in queue',
    Icon: Clock,
    activeCls: 'bg-fg-strong text-fg-inverted',
    completeCls: 'bg-fg-strong text-fg-inverted',
  },
  {
    key: 'processing',
    label: 'Processing',
    sublabel: 'AI reading your PDF',
    Icon: Brain,
    activeCls: 'bg-brand text-fg-inverted',
    completeCls: 'bg-brand-accent text-fg-inverted',
  },
  {
    key: 'ready',
    label: 'Review Ready',
    sublabel: 'Transactions extracted',
    Icon: Sparkles,
    activeCls: 'bg-success text-fg-inverted',
    completeCls: 'bg-success-accent text-fg-inverted',
  },
];

export const PHASE_IDX: Record<JobPhase, number> = {
  queuing: 0,
  processing: 1,
  ready: 2,
};
