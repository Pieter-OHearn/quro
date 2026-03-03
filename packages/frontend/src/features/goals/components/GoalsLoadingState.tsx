import { Loader2 } from 'lucide-react';

export function GoalsLoadingState() {
  return (
    <div className="p-6 flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
    </div>
  );
}
