import { computeStrength, PASSWORD_STRENGTH_LEVELS } from '../utils/password';

type PasswordStrengthMeterProps = {
  password: string;
};

export function PasswordStrengthMeter({ password }: Readonly<PasswordStrengthMeterProps>) {
  const { score, label, color, textColor } = computeStrength(password);
  if (!password) return null;

  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex gap-1 flex-1">
        {PASSWORD_STRENGTH_LEVELS.map((level, index) => (
          <div
            key={level}
            className={`h-1 flex-1 rounded-full transition-all ${index < score ? color : 'bg-slate-200'}`}
          />
        ))}
      </div>
      <span className={`text-[10px] font-semibold ${textColor}`}>{label}</span>
    </div>
  );
}
