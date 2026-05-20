"use client";

import { memo } from "react";
import {
  Handle,
  Position,
  type NodeProps,
  useReactFlow,
} from "@xyflow/react";
import { NODE_DEFS, BINARY_OP_OPTIONS, type NodeKind } from "./node-defs";

interface FormulaNodeData extends Record<string, unknown> {
  /** Custom label override; if omitted, falls back to NODE_DEFS[kind].label. */
  label?: string;
  /** Free-form data per node kind. */
  value?: string | number | boolean;
  kind?: string;
  column?: string;
  op?: string;
  partnerId?: string;
  /** Partner list passed into the node for the partner picker. */
  __partners?: Array<{ id: string; name: string }>;
  /** Output column list passed in for prevOutput / outputRef pickers. */
  __outputColumns?: string[];
}

const SOURCE_HANDLE_STYLE = "!w-3 !h-3 !bg-emerald-500 !border-emerald-700";
const TARGET_HANDLE_STYLE = "!w-3 !h-3 !bg-slate-400 !border-slate-600";

function NodeShell({
  kind,
  title,
  children,
  inputs,
  hasOutput,
  subtitle,
}: {
  kind: NodeKind;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  inputs: string[];
  hasOutput: boolean;
}) {
  const def = NODE_DEFS[kind];
  const inputCount = inputs.length;

  return (
    <div className="rounded-lg shadow-md border-2 border-slate-300 bg-white min-w-[180px] max-w-[260px]">
      <div
        className={`${def.color} text-white px-3 py-1.5 rounded-t-md text-xs font-semibold tracking-wide flex items-center justify-between`}
      >
        <span>{title}</span>
        {subtitle && (
          <span className="text-white/80 text-[10px]">{subtitle}</span>
        )}
      </div>
      <div className="p-2 text-xs text-slate-700 space-y-1.5">{children}</div>

      {inputs.map((handleId, idx) => {
        const top = inputCount === 1 ? 50 : 25 + (50 / (inputCount - 1)) * idx;
        return (
          <Handle
            key={handleId}
            type="target"
            position={Position.Left}
            id={handleId}
            className={TARGET_HANDLE_STYLE}
            style={{ top: `${top}%` }}
          >
            <span className="absolute left-3 -translate-y-1/2 top-1/2 text-[10px] text-slate-500 whitespace-nowrap">
              {handleLabel(handleId)}
            </span>
          </Handle>
        );
      })}

      {hasOutput && (
        <Handle
          type="source"
          position={Position.Right}
          id="out"
          className={SOURCE_HANDLE_STYLE}
        />
      )}
    </div>
  );
}

function handleLabel(handle: string): string {
  switch (handle) {
    case "in-find":
      return "cari";
    case "in-within":
      return "di dalam";
    case "in-arg":
      return "arg";
    case "in-left":
      return "kiri";
    case "in-right":
      return "kanan";
    case "in-cond":
      return "kondisi";
    case "in-then":
      return "jika benar";
    case "in-else":
      return "jika salah";
    case "in-value":
      return "nilai";
    default:
      return handle.replace(/^in-/, "");
  }
}

function useDataUpdate(nodeId: string) {
  const { setNodes } = useReactFlow();
  return (patch: Record<string, unknown>) => {
    setNodes((nodes) =>
      nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...(n.data as Record<string, unknown>), ...patch } }
          : n
      )
    );
  };
}

// ── Individual node renderers ──────────────────────────────────────────────

export const LiteralNode = memo(({ id, data }: NodeProps) => {
  const d = data as FormulaNodeData;
  const update = useDataUpdate(id);
  const kind = (d.kind as string) || "number";
  return (
    <NodeShell
      kind="literal"
      title="Konstanta"
      subtitle={kind === "boolean" ? "benar/salah" : kind === "text" ? "teks" : "angka"}
      inputs={[]}
      hasOutput
    >
      <select
        className="w-full border border-slate-300 rounded px-1.5 py-1 text-xs"
        value={kind}
        onChange={(e) => {
          const newKind = e.target.value;
          const newValue =
            newKind === "number" ? 0 : newKind === "boolean" ? true : "";
          update({ kind: newKind, value: newValue });
        }}
      >
        <option value="number">Angka</option>
        <option value="text">Teks</option>
        <option value="boolean">Benar/Salah</option>
      </select>
      {kind === "boolean" ? (
        <select
          className="w-full border border-slate-300 rounded px-1.5 py-1 text-xs"
          value={d.value ? "true" : "false"}
          onChange={(e) => update({ value: e.target.value === "true" })}
        >
          <option value="true">BENAR</option>
          <option value="false">SALAH</option>
        </select>
      ) : (
        <input
          className="w-full border border-slate-300 rounded px-1.5 py-1 text-xs"
          type={kind === "number" ? "number" : "text"}
          step="any"
          value={d.value == null ? "" : String(d.value)}
          onChange={(e) =>
            update({
              value:
                kind === "number"
                  ? Number(e.target.value) || 0
                  : e.target.value,
            })
          }
        />
      )}
    </NodeShell>
  );
});
LiteralNode.displayName = "LiteralNode";

export const ColumnRefNode = memo(({ id, data }: NodeProps) => {
  const d = data as FormulaNodeData;
  const update = useDataUpdate(id);
  return (
    <NodeShell kind="columnRef" title="Kolom transaksi" inputs={[]} hasOutput>
      <select
        className="w-full border border-slate-300 rounded px-1.5 py-1 text-xs"
        value={(d.column as string) ?? "C"}
        onChange={(e) => update({ column: e.target.value })}
      >
        <option value="C">C — Kategori</option>
        <option value="D">D — Debit</option>
        <option value="E">E — Kredit</option>
        <option value="F">F — Keperluan</option>
      </select>
    </NodeShell>
  );
});
ColumnRefNode.displayName = "ColumnRefNode";

function OutputColumnPicker({
  id,
  data,
  kind,
}: {
  id: string;
  data: FormulaNodeData;
  kind: "prevOutput" | "outputRef";
}) {
  const update = useDataUpdate(id);
  const cols = (data.__outputColumns as string[]) ?? [
    "G",
    "H",
    "I",
    "J",
    "K",
    "L",
    "M",
    "N",
    "O",
  ];
  return (
    <NodeShell
      kind={kind}
      title={kind === "prevOutput" ? "Baris sebelumnya" : "Kolom hasil"}
      inputs={[]}
      hasOutput
    >
      <select
        className="w-full border border-slate-300 rounded px-1.5 py-1 text-xs"
        value={(data.column as string) ?? cols[0]}
        onChange={(e) => update({ column: e.target.value })}
      >
        {cols.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </NodeShell>
  );
}

export const PrevOutputNode = memo(({ id, data }: NodeProps) => (
  <OutputColumnPicker
    id={id}
    data={data as FormulaNodeData}
    kind="prevOutput"
  />
));
PrevOutputNode.displayName = "PrevOutputNode";

export const OutputRefNode = memo(({ id, data }: NodeProps) => (
  <OutputColumnPicker
    id={id}
    data={data as FormulaNodeData}
    kind="outputRef"
  />
));
OutputRefNode.displayName = "OutputRefNode";

export const PartnerRefNode = memo(({ id, data }: NodeProps) => {
  const d = data as FormulaNodeData;
  const update = useDataUpdate(id);
  const partners = (d.__partners as Array<{ id: string; name: string }>) ?? [];
  return (
    <NodeShell kind="partnerRef" title="Mitra" inputs={[]} hasOutput>
      <select
        className="w-full border border-slate-300 rounded px-1.5 py-1 text-xs"
        value={(d.partnerId as string) ?? partners[0]?.id ?? ""}
        onChange={(e) => update({ partnerId: e.target.value })}
      >
        {partners.length === 0 && <option value="">(belum ada mitra)</option>}
        {partners.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </NodeShell>
  );
});
PartnerRefNode.displayName = "PartnerRefNode";

export const RowNode = memo(() => (
  <NodeShell kind="row" title="Nomor baris" inputs={[]} hasOutput>
    <div className="text-[11px] text-slate-500">
      Mengembalikan nomor baris (mulai dari 2).
    </div>
  </NodeShell>
));
RowNode.displayName = "RowNode";

export const BinaryOpNode = memo(({ id, data }: NodeProps) => {
  const d = data as FormulaNodeData;
  const update = useDataUpdate(id);
  return (
    <NodeShell
      kind="binaryOp"
      title="Operasi"
      inputs={["in-left", "in-right"]}
      hasOutput
      subtitle={(d.op as string) ?? "+"}
    >
      <select
        className="w-full border border-slate-300 rounded px-1.5 py-1 text-xs"
        value={(d.op as string) ?? "+"}
        onChange={(e) => update({ op: e.target.value })}
      >
        {BINARY_OP_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </NodeShell>
  );
});
BinaryOpNode.displayName = "BinaryOpNode";

function FixedShellNode({ kind }: { kind: NodeKind }) {
  const def = NODE_DEFS[kind];
  return (
    <NodeShell
      kind={kind}
      title={def.label}
      inputs={def.inputs}
      hasOutput={def.hasOutput}
    >
      <div className="text-[11px] text-slate-500">{def.description}</div>
    </NodeShell>
  );
}

export const IfNode = memo(() => <FixedShellNode kind="if" />);
IfNode.displayName = "IfNode";

export const AndNode = memo(() => <FixedShellNode kind="and" />);
AndNode.displayName = "AndNode";

export const OrNode = memo(() => <FixedShellNode kind="or" />);
OrNode.displayName = "OrNode";

export const NotNode = memo(() => <FixedShellNode kind="not" />);
NotNode.displayName = "NotNode";

export const NegateNode = memo(() => <FixedShellNode kind="negate" />);
NegateNode.displayName = "NegateNode";

export const SearchNode = memo(() => <FixedShellNode kind="search" />);
SearchNode.displayName = "SearchNode";

export const IsErrorNode = memo(() => <FixedShellNode kind="iserror" />);
IsErrorNode.displayName = "IsErrorNode";

export const OutputNode = memo(() => (
  <NodeShell
    kind="output"
    title="Hasil akhir"
    inputs={["in-value"]}
    hasOutput={false}
  >
    <div className="text-[11px] text-slate-500">
      Sambungkan ke simpul ini untuk menentukan nilai kolom yang disimpan.
    </div>
  </NodeShell>
));
OutputNode.displayName = "OutputNode";

export const nodeTypes = {
  literal: LiteralNode,
  columnRef: ColumnRefNode,
  prevOutput: PrevOutputNode,
  outputRef: OutputRefNode,
  partnerRef: PartnerRefNode,
  row: RowNode,
  binaryOp: BinaryOpNode,
  if: IfNode,
  and: AndNode,
  or: OrNode,
  not: NotNode,
  negate: NegateNode,
  search: SearchNode,
  iserror: IsErrorNode,
  output: OutputNode,
};
