"use client";
import { useState } from "react";

export function SyncButton({ onResult }: { onResult?: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const sync = async (code?: string) => {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(code ? { code } : {}) });
      const j = await r.json();
      const text = `拉取 ${j.fetched ?? 0} 期 · 入库 ${j.saved ?? 0} · 结算 ${j.hits ?? 0} 次${j.errors?.length ? " · 错误 " + j.errors.length : ""}`;
      setMsg(text);
      onResult?.(text);
    } catch (e: any) {
      setMsg(`失败: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button className="btn" disabled={busy} onClick={() => sync()}>
        {busy ? "同步中…" : "立即同步开奖"}
      </button>
      <button className="btn btn-ghost" disabled={busy} onClick={() => {
        const code = prompt("输入要补录的期号，如 2024024");
        if (code) sync(code.trim());
      }}>补录指定期</button>
      {msg && <span className="text-sm text-ink-100">{msg}</span>}
    </div>
  );
}
