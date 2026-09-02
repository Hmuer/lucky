/** 红/蓝号码球 */
export function Balls({ red, blue, size = 9 }: { red: number[]; blue: number[]; size?: number }) {
  const cls = size === 7 ? "w-7 h-7 text-xs" : size === 9 ? "w-9 h-9 text-sm" : "w-11 h-11 text-base";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {red.map((n) => (
        <span key={`r${n}`} className={`inline-flex items-center justify-center rounded-full ball-red font-bold ${cls}`}>
          {String(n).padStart(2, "0")}
        </span>
      ))}
      {blue.map((n) => (
        <span key={`b${n}`} className={`inline-flex items-center justify-center rounded-full ball-blue font-bold ${cls}`}>
          {String(n).padStart(2, "0")}
        </span>
      ))}
    </div>
  );
}
