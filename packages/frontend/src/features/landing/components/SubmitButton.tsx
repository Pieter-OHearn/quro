import type { ReactNode } from 'react';

type SubmitButtonProps = {
  loading: boolean;
  loadingText: string;
  idleContent: ReactNode;
};

export function SubmitButton({ loading, loadingText, idleContent }: Readonly<SubmitButtonProps>) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl py-3 text-sm font-semibold transition-all flex items-center justify-center gap-2 mt-2"
    >
      {loading ? (
        <>
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          {loadingText}
        </>
      ) : (
        idleContent
      )}
    </button>
  );
}
