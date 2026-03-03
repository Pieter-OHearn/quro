import { X } from 'lucide-react';
import { QuroLogo } from '@/components/ui/QuroLogo';

type ModalHeaderProps = {
  onClose: () => void;
  title: string;
  subtitle: string;
};

export function ModalHeader({ onClose, title, subtitle }: Readonly<ModalHeaderProps>) {
  return (
    <div className="bg-gradient-to-br from-[#0a0f1e] to-[#1a2550] px-8 pt-8 pb-10 text-center relative flex-shrink-0">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
      >
        <X size={16} />
      </button>
      <div className="flex justify-center mb-4">
        <QuroLogo size={52} showBg={false} />
      </div>
      <h2 className="font-black text-white text-2xl tracking-tight">{title}</h2>
      <p className="text-indigo-300 text-sm mt-1">{subtitle}</p>
    </div>
  );
}
