import { useState, useMemo } from 'react';
import { Users, Plus, Minus, Calculator, Ticket, Info, User, GraduationCap, UserRound, Baby } from 'lucide-react';
import { passengerFareRules } from '@/data/metroNetwork';
import { useMetroStore } from '@/store/metroStore';
import type { PassengerType, PassengerCount, FareCalculationResult } from '@/types/metro';
import { cn } from '@/lib/utils';

const iconMap: Record<PassengerType, React.ReactNode> = {
  adult: <User size={18} />,
  student: <GraduationCap size={18} />,
  elderly: <UserRound size={18} />,
  child: <Baby size={18} />,
};

const colorMap: Record<PassengerType, { bg: string; text: string; border: string }> = {
  adult: { bg: 'bg-indigo-100', text: 'text-indigo-600', border: 'border-indigo-200' },
  student: { bg: 'bg-emerald-100', text: 'text-emerald-600', border: 'border-emerald-200' },
  elderly: { bg: 'bg-amber-100', text: 'text-amber-600', border: 'border-amber-200' },
  child: { bg: 'bg-rose-100', text: 'text-rose-600', border: 'border-rose-200' },
};

export default function FareCalculator() {
  const { highlightedRoute } = useMetroStore();
  const [passengers, setPassengers] = useState<PassengerCount>({
    adult: 1,
    student: 0,
    elderly: 0,
    child: 0,
  });

  const baseFare = highlightedRoute?.totalFare ?? 0;

  const calculation = useMemo<FareCalculationResult | null>(() => {
    if (baseFare <= 0) return null;

    const passengerResults = passengerFareRules.map((rule) => {
      const count = passengers[rule.type];
      const discountedPrice = baseFare * rule.discount;
      const unitPrice = Math.min(Math.max(discountedPrice, rule.minFare), rule.maxFare);
      const subtotal = unitPrice * count;
      return {
        type: rule.type,
        count,
        unitPrice,
        subtotal,
      };
    });

    const totalPassengers = Object.values(passengers).reduce((sum, n) => sum + n, 0);
    const totalFare = passengerResults.reduce((sum, p) => sum + p.subtotal, 0);
    const fullPriceTotal = baseFare * totalPassengers;
    const totalDiscount = fullPriceTotal - totalFare;

    return {
      baseFarePerPerson: baseFare,
      passengers: passengerResults,
      totalPassengers,
      totalFare,
      totalDiscount,
    };
  }, [baseFare, passengers]);

  const updatePassenger = (type: PassengerType, delta: number) => {
    setPassengers((prev) => {
      const newValue = Math.max(0, prev[type] + delta);
      return { ...prev, [type]: newValue };
    });
  };

  const resetPassengers = () => {
    setPassengers({ adult: 1, student: 0, elderly: 0, child: 0 });
  };

  const totalCount = Object.values(passengers).reduce((sum, n) => sum + n, 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Calculator size={18} className="text-purple-500" />
          家庭票价合算器
        </h3>
        <button
          onClick={resetPassengers}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          重置
        </button>
      </div>

      {!highlightedRoute ? (
        <div className="text-center py-6">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center">
            <Ticket size={22} className="text-slate-400" />
          </div>
          <p className="text-sm text-slate-500">请先查询路线以获取基础票价</p>
        </div>
      ) : (
        <>
          <div className="mb-4 p-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-100">
            <div className="flex items-center justify-between">
              <span className="text-xs text-purple-600 font-medium">单人基础票价</span>
              <span className="text-xl font-bold text-purple-700">¥{baseFare.toFixed(2)}</span>
            </div>
          </div>

          <div className="space-y-2.5 mb-4">
            {passengerFareRules.map((rule) => {
              const colors = colorMap[rule.type];
              const count = passengers[rule.type];
              const discountedPrice = baseFare * rule.discount;
              const unitPrice = Math.min(Math.max(discountedPrice, rule.minFare), rule.maxFare);
              const hasCap = discountedPrice > rule.maxFare;
              const hasMin = discountedPrice < rule.minFare && rule.discount > 0;

              return (
                <div
                  key={rule.type}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-xl border transition-all',
                    count > 0
                      ? `${colors.bg} ${colors.border}`
                      : 'bg-slate-50 border-slate-100',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'w-9 h-9 rounded-lg flex items-center justify-center',
                        colors.bg,
                        colors.text,
                      )}
                    >
                      {iconMap[rule.type]}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className={cn('text-sm font-semibold', count > 0 ? 'text-slate-800' : 'text-slate-600')}>
                          {rule.label}
                        </span>
                        <span className={cn('text-xs font-medium', colors.text)}>
                          {Math.round(rule.discount * 100)}%
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-1">
                        <span>¥{unitPrice.toFixed(2)}/人</span>
                        {hasCap && <span className="text-amber-500">· 已封顶</span>}
                        {hasMin && <span className="text-emerald-500">· 起步价</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updatePassenger(rule.type, -1)}
                      disabled={count === 0}
                      className={cn(
                        'w-7 h-7 rounded-lg flex items-center justify-center transition-all',
                        count === 0
                          ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                          : `${colors.bg} ${colors.text} hover:opacity-80`,
                      )}
                    >
                      <Minus size={14} />
                    </button>
                    <span className={cn('w-7 text-center text-sm font-bold', count > 0 ? colors.text : 'text-slate-400')}>
                      {count}
                    </span>
                    <button
                      onClick={() => updatePassenger(rule.type, 1)}
                      className={cn(
                        'w-7 h-7 rounded-lg flex items-center justify-center transition-all',
                        colors.bg,
                        colors.text,
                        'hover:opacity-80',
                      )}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {calculation && totalCount > 0 && (
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Users size={14} />
                  共 {totalCount} 人
                </span>
                {calculation.totalDiscount > 0 && (
                  <span className="text-emerald-600 font-medium">
                    已优惠 ¥{calculation.totalDiscount.toFixed(2)}
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                {calculation.passengers
                  .filter((p) => p.count > 0)
                  .map((p) => {
                    const rule = passengerFareRules.find((r) => r.type === p.type)!;
                    const colors = colorMap[p.type];
                    return (
                      <div key={p.type} className="flex justify-between text-xs">
                        <span className="text-slate-500">
                          {rule.label} × {p.count}
                        </span>
                        <span className={cn('font-medium', colors.text)}>
                          ¥{p.subtotal.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-dashed border-slate-200">
                <span className="text-slate-700 font-semibold">总计票价</span>
                <span className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                  ¥{calculation.totalFare.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {totalCount === 0 && (
            <div className="text-center py-4">
              <p className="text-sm text-slate-400">请添加乘客以计算总价</p>
            </div>
          )}

          <div className="mt-4 p-3 bg-slate-50 border border-slate-100 rounded-lg">
            <div className="flex gap-2">
              <Info size={14} className="text-slate-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-500 space-y-0.5">
                <p className="font-medium text-slate-600 mb-1">票价说明</p>
                {passengerFareRules.map((rule) => (
                  <p key={rule.type}>· {rule.label}：{rule.description}</p>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
