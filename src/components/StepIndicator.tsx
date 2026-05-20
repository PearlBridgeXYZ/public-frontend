interface Props {
  steps: string[];
  current: number;
}

export function StepIndicator({ steps, current }: Props) {
  return (
    <div className="flex items-center gap-1">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center gap-1 flex-1" aria-label={label}>
          <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 ${
            i < current ? "bg-[#00e5d0] text-black"
            : i === current ? "bg-[#00e5d0]/20 border border-[#00e5d0] text-[#00e5d0]"
            : "bg-white/10 text-gray-500"
          }`}>
            {i < current ? "✓" : i + 1}
          </div>
          {i < steps.length - 1 && (
            <div className={`h-px flex-1 ${i < current ? "bg-[#00e5d0]" : "bg-white/10"}`} />
          )}
        </div>
      ))}
    </div>
  );
}
