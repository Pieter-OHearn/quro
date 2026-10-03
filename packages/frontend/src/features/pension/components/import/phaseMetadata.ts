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
    activeCls: 'bg-slate-700 text-white',
    completeCls: 'bg-slate-700 text-white',
  },
  {
    key: 'processing',
    label: 'Processing',
    sublabel: 'AI reading your PDF',
    Icon: Brain,
    activeCls: 'bg-indigo-600 text-white',
    completeCls: 'bg-indigo-500 text-white',
  },
  {
    key: 'ready',
    label: 'Review Ready',
    sublabel: 'Transactions extracted',
    Icon: Sparkles,
    activeCls: 'bg-emerald-600 text-white',
    completeCls: 'bg-emerald-500 text-white',
  },
];

export const PHASE_IDX: Record<JobPhase, number> = {
  queuing: 0,
  processing: 1,
  ready: 2,
};
