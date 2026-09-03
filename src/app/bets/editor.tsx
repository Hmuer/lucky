"use client";
import { useEffect, useMemo, useState } from "react";

type Type = "single" | "complex" | "danTuo";

interface BetStat {
  bet_id: number;
  periods: number;
  wins_count: number;
  cost: number;
  win_amount: number;
  profit: number;
  best_win: number;
  tier_counts: { 1: number; 2: number; 3: number; 4: number; 5: number; 6: number };
}

interface Bet {
  id?: number;
  name: string;
  type: Type;
  payload: any;
  unit_price: number;
  buy_enabled: number;
  active: number;
  start_code: string | null;
}

interface EditorProps {
  initial: Bet[];
  defaultStartCode: string | null;
}

function emptyByType(t: Type) {
  if (t === "single") return { red: [] as number[], blue: [] as number[] };
  if (t === "complex") return { red: [] as number[], blue: [] as number[] };
  return { redDan: [] as number[], redTuo: [] as number[], blue: [] as number[] };
}

function BallPicker({ value, range, onChange, color }: { value: number[]; range: [number, number]; onChange: (v: number[]) => void; color: "red" | "blue" }) {
  const [lo, hi] = range;
  const set = new Set(value);
  const toggle = (n: number) => {
    if (set.has(n)) onChange(value.filter((x) => x !== n));
    else onChange([...value, n].sort((a, b) => a - b));
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: hi - lo + 1 }, (_, i) => i + lo).map((n) => {
        const on = set.has(n);
        return (
          <button
            key={n}
            type="button"
            onClick={() => toggle(n)}
            className={`w-9 h-9 rounded-full text-sm font-bold transition ${
              on
                ? color === "red"
                  ? "ball-red"
                  : "ball-blue"
                : "ball-pick-off hover:bg-ink-500"
            }`}
          >
            {String(n).padStart(2, "0")}
          </button>
        );
      })}
    </div>
  );
}

function comb(n: number, k: number) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return Math.round(r);
}

function countUnits(type: Type, p: any): number {
  if (type === "single") return p.red.length === 6 && p.blue.length === 1 ? 1 : 0;
  if (type === "complex") return comb(p.red.length, 6) * Math.max(p.blue.length, 1);
  return comb(p.redTuo.length, 6 - p.redDan.length) * Math.max(p.blue.length, 1);
}

function perPeriodUnits(b: Bet): number {
  return countUnits(b.type, b.payload);
}

function fmtYuan(cents: number) {
  return (cents / 100).toLocaleString("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2 });
}

const TIER_STYLES: Record<1 | 2 | 3 | 4 | 5 | 6, { on: string; label: string }> = {
  1: { on: "bg-rose-500/20 text-rose-300 border-rose-500/40", label: "一等" },
  2: { on: "bg-orange-500/20 text-orange-300 border-orange-500/40", label: "二等" },
  3: { on: "bg-amber-500/20 text-amber-300 border-amber-500/40", label: "三等" },
  4: { on: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40", label: "四等" },
  5: { on: "bg-sky-500/20 text-sky-300 border-sky-500/40", label: "五等" },
  6: { on: "bg-teal-500/20 text-teal-300 border-teal-500/40", label: "六等" },
};

function TierBadge({ tier, count }: { tier: 1 | 2 | 3 | 4 | 5 | 6; count: number }) {
  if (!count) return <span className="px-1.5 py-0.5 rounded border border-ink-300 text-ink-200 text-[10px]">{TIER_STYLES[tier].label} 0</span>;
  return (
    <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${TIER_STYLES[tier].on}`}>
      {TIER_STYLES[tier].label} ×{count}
    </span>
  );
}

export function BetsEditor({ initial, defaultStartCode }: EditorProps) {
  const [list, setList] = useState<Bet[]>(initial);
  const [stats, setStats] = useState<Record<number, BetStat>>({});
  const [draft, setDraft] = useState<Bet>({
    name: "",
    type: "complex",
    payload: { red: [], blue: [] as number[] },
    unit_price: 200,
    buy_enabled: 1,
    active: 1,
    start_code: defaultStartCode,
  });
  const [err, setErr] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editStart, setEditStart] = useState<string>("");
  const [editUnit, setEditUnit] = useState<string>("");

  // 拉取所有守号的中奖统计
  const refreshStats = async () => {
    try {
      const r = await fetch("/api/bets/stats");
      const j = await r.json();
      const map: Record<number, BetStat> = {};
      for (const s of j.stats) map[s.bet_id] = s;
      setStats(map);
    } catch {}
  };
  useEffect(() => {
    refreshStats();
  }, [list.length]);

  const changeType = (t: Type) => {
    setDraft({ ...draft, type: t, payload: emptyByType(t) });
  };

  const draftUnits = useMemo(() => countUnits(draft.type, draft.payload), [draft]);
  const draftTotal = draftUnits * draft.unit_price;

  const submit = async () => {
    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/bets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: draft.name || "未命名",
          type: draft.type,
          payload: draft.payload,
          unit_price: draft.unit_price,
          buy_enabled: draft.buy_enabled,
          start_code: draft.start_code,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "failed");
      setList([...list, { ...draft, id: j.id }]);
      setDraft({ ...draft, name: "", payload: emptyByType(draft.type) });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id?: number) => {
    if (!id) return;
    if (!confirm("确认删除该守号？")) return;
    await fetch(`/api/bets?id=${id}`, { method: "DELETE" });
    setList(list.filter((b) => b.id !== id));
  };

  const toggle = async (b: Bet, key: "buy_enabled" | "active") => {
    const v = b[key] ? 0 : 1;
    await fetch("/api/bets", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: b.id, [key]: v }),
    });
    setList(list.map((x) => (x.id === b.id ? { ...x, [key]: v } : x)));
    refreshStats();
  };

  const startEdit = (b: Bet) => {
    setEditingId(b.id ?? null);
    setEditStart(b.start_code ?? "");
    setEditUnit(String(b.unit_price / 100));
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const patch: any = { id: editingId };
    if (editStart !== "") patch.start_code = editStart.trim() || null;
    if (editUnit) patch.unit_price = Math.round(parseFloat(editUnit) * 100);
    const r = await fetch("/api/bets", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const j = await r.json();
    if (!r.ok) { alert(j.error ?? "保存失败"); return; }
    setList(list.map((x) => (x.id === editingId ? { ...x, ...(patch.start_code !== undefined ? { start_code: patch.start_code } : {}), ...(patch.unit_price !== undefined ? { unit_price: patch.unit_price } : {}) } : x)));
    setEditingId(null);
    refreshStats();
  };

  const summarize = (b: Bet) => {
    const p = b.payload;
    if (b.type === "single") return `${p.red.length}红 + ${p.blue.length}蓝`;
    if (b.type === "complex") return `${p.red.length}红 × ${p.blue.length}蓝（${countUnits(b.type, p)} 注）`;
    return `胆${p.redDan.length} + 拖${p.redTuo.length} × ${p.blue.length}蓝（${countUnits(b.type, p)} 注）`;
  };

  return (
    <>
      <div className="card p-6">
        <h2 className="font-semibold mb-3">新增守号</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {(["single", "complex", "danTuo"] as Type[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => changeType(t)}
              className={`px-3 py-1.5 rounded-md border transition ${
                draft.type === t
                  ? "bg-ink-50 text-ink-900 border-ink-50"
                  : "bg-transparent text-ink-100 border-ink-300 hover:bg-ink-500"
              }`}
            >
              {t === "single" ? "单式" : t === "complex" ? "复式" : "胆拖"}
            </button>
          ))}
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-ink-100">名称</label>
            <input className="input mt-1" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="例如：生日组合" />
          </div>
          <div>
            <label className="text-xs text-ink-100">每期金额</label>
            <div className="mt-1 px-3 py-2 rounded border border-ink-300 bg-ink-500/30 min-h-[40px] flex flex-col justify-center">
              {draftUnits > 0 ? (
                <>
                  <div className="font-mono text-base font-semibold text-ink-50">{fmtYuan(draftTotal)}</div>
                  <div className="text-[11px] text-ink-200">{draftUnits} 注 × {(draft.unit_price / 100).toFixed(2)} 元/注（单注固定 2 元）</div>
                </>
              ) : (
                <span className="text-sm text-ink-200">选完号码自动计算</span>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs text-ink-100">从哪期开始守</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                className="input"
                placeholder={`默认 ${defaultStartCode ?? "下一期"}`}
                value={draft.start_code ?? ""}
                onChange={(e) => setDraft({ ...draft, start_code: e.target.value.trim() || null })}
              />
              <button type="button" className="btn btn-ghost text-xs px-2 py-1" onClick={() => setDraft({ ...draft, start_code: defaultStartCode })}>
                下一期
              </button>
              <button type="button" className="btn btn-ghost text-xs px-2 py-1" onClick={() => setDraft({ ...draft, start_code: null })}>
                全历史
              </button>
            </div>
            <div className="text-xs text-ink-100 mt-1">
              {draft.start_code
                ? `从 ${draft.start_code} 期及之后才会结算`
                : "从所有历史期开始结算（含已开奖）"}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!draft.buy_enabled} onChange={(e) => setDraft({ ...draft, buy_enabled: e.target.checked ? 1 : 0 })} />
            每期购买
          </label>
        </div>

        <div className="mt-4 space-y-3">
          {draft.type === "danTuo" ? (
            <>
              <div>
                <div className="text-xs text-ink-100 mb-1">红胆（1~5 个）</div>
                <BallPicker value={draft.payload.redDan} range={[1, 33]} onChange={(v) => setDraft({ ...draft, payload: { ...draft.payload, redDan: v } })} color="red" />
              </div>
              <div>
                <div className="text-xs text-ink-100 mb-1">红拖（不能含胆码）</div>
                <BallPicker value={draft.payload.redTuo} range={[1, 33]} onChange={(v) => setDraft({ ...draft, payload: { ...draft.payload, redTuo: v } })} color="red" />
              </div>
            </>
          ) : (
            <div>
              <div className="text-xs text-ink-100 mb-1">红球（1~33）</div>
              <BallPicker value={draft.payload.red} range={[1, 33]} onChange={(v) => setDraft({ ...draft, payload: { ...draft.payload, red: v } })} color="red" />
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-ink-100">蓝球（1~16）</div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="btn btn-ghost text-[11px] px-2 py-0.5"
                  onClick={() => setDraft({ ...draft, payload: { ...draft.payload, blue: Array.from({ length: 16 }, (_, i) => i + 1) } })}
                >
                  全选
                </button>
                <button
                  type="button"
                  className="btn btn-ghost text-[11px] px-2 py-0.5"
                  onClick={() => setDraft({ ...draft, payload: { ...draft.payload, blue: [] } })}
                >
                  清空
                </button>
              </div>
            </div>
            <BallPicker value={draft.payload.blue} range={[1, 16]} onChange={(v) => setDraft({ ...draft, payload: { ...draft.payload, blue: v } })} color="blue" />
          </div>
        </div>

        {err && <div className="mt-3 text-sm text-rose-400">{err}</div>}
        <div className="mt-4 flex items-center gap-3">
          <button className="btn" disabled={busy} onClick={submit}>保存守号</button>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold mb-3">已有守号</h2>
        {list.length === 0 ? (
          <div className="text-sm text-ink-100">暂无。</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>名称</th>
                <th>类型</th>
                <th>号码</th>
                <th>开始期</th>
                <th>每期金额</th>
                <th>购买</th>
                <th>启用</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((b) => {
                const s = b.id ? stats[b.id] : undefined;
                return (
                  <tr key={b.id}>
                    <td className="font-medium">
                      <div>{b.name}</div>
                      {s && s.periods > 0 && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <TierBadge tier={1} count={s.tier_counts[1]} />
                          <TierBadge tier={2} count={s.tier_counts[2]} />
                          <TierBadge tier={3} count={s.tier_counts[3]} />
                          <TierBadge tier={4} count={s.tier_counts[4]} />
                          <TierBadge tier={5} count={s.tier_counts[5]} />
                          <TierBadge tier={6} count={s.tier_counts[6]} />
                          <span className="text-ink-200">
                            · 期 {s.periods} / 中过 {s.wins_count} / 盈亏
                            <span className={s.profit >= 0 ? "text-emerald-400 ml-1" : "text-rose-400 ml-1"}>
                              {fmtYuan(s.profit)}
                            </span>
                          </span>
                        </div>
                      )}
                    </td>
                    <td>{b.type === "single" ? "单式" : b.type === "complex" ? "复式" : "胆拖"}</td>
                    <td className="font-mono text-xs">{summarize(b)}</td>
                    <td className="font-mono text-xs">
                      {editingId === b.id ? (
                        <input className="input py-1 px-2 w-24" value={editStart} onChange={(e) => setEditStart(e.target.value)} placeholder="留空=全部" />
                      ) : (
                        <span>{b.start_code ?? "全部"}</span>
                      )}
                    </td>
                    <td className="font-mono text-xs">
                      {editingId === b.id ? (
                        <div className="flex flex-col gap-1">
                          <input className="input py-1 px-2 w-20" type="number" step="0.1" value={editUnit} onChange={(e) => setEditUnit(e.target.value)} title="每注单价（元）" />
                          <span className="text-[10px] text-ink-200">每注元</span>
                        </div>
                      ) : (
                        <div>
                          <div className="font-mono">{fmtYuan(b.unit_price * perPeriodUnits(b))}</div>
                          <div className="text-[10px] text-ink-200">{perPeriodUnits(b)} 注 × {(b.unit_price / 100).toFixed(2)} 元</div>
                        </div>
                      )}
                    </td>
                    <td>
                      <button className={`btn ${b.buy_enabled ? "btn-success" : "btn-ghost"}`} onClick={() => toggle(b, "buy_enabled")}>
                        {b.buy_enabled ? "是" : "否"}
                      </button>
                    </td>
                    <td>
                      <button className={`btn ${b.active ? "btn-success" : "btn-ghost"}`} onClick={() => toggle(b, "active")}>
                        {b.active ? "启用" : "停用"}
                      </button>
                    </td>
                    <td className="flex gap-2">
                      {editingId === b.id ? (
                        <>
                          <button className="btn" onClick={saveEdit}>保存</button>
                          <button className="btn btn-ghost" onClick={() => setEditingId(null)}>取消</button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn-ghost" onClick={() => startEdit(b)}>编辑</button>
                          <button className="btn btn-danger" onClick={() => remove(b.id)}>删除</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
