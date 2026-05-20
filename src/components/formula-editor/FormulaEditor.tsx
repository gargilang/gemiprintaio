"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Edge,
  type Node,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { nodeTypes } from "./FormulaNode";
import {
  NODE_DEFS,
  NODE_GROUPS,
  type NodeKind,
} from "./node-defs";
import { astToGraph, graphToAST } from "@/lib/ast/graph";
import { validateAST } from "@/lib/ast/validate";
import type { ASTNode } from "@/lib/ast/types";

export interface FormulaEditorProps {
  initialAst: ASTNode;
  partners: Array<{ id: string; name: string }>;
  outputColumns: string[];
  /** Called when the user presses "Simpan" with a structurally valid AST. */
  onSave: (ast: ASTNode) => void | Promise<void>;
  /** Called when the user presses "Uji coba"; receives the current AST. */
  onTest?: (ast: ASTNode) => void;
  /** Disables the save button. */
  saving?: boolean;
}

interface UndoState {
  nodes: Node[];
  edges: Edge[];
}

function genNodeId(kind: NodeKind, counter: number): string {
  return `${kind}-${Date.now()}-${counter}`;
}

function defaultDataFor(kind: NodeKind): Record<string, unknown> {
  switch (kind) {
    case "literal":
      return { kind: "number", value: 0 };
    case "columnRef":
      return { column: "C" };
    case "prevOutput":
      return { column: "G" };
    case "outputRef":
      return { column: "G" };
    case "partnerRef":
      return { partnerId: "" };
    case "binaryOp":
      return { op: "+" };
    default:
      return {};
  }
}

function injectGlobals(
  nodes: Node[],
  partners: Array<{ id: string; name: string }>,
  outputColumns: string[]
): Node[] {
  return nodes.map((n) => ({
    ...n,
    data: {
      ...(n.data as Record<string, unknown>),
      __partners: partners,
      __outputColumns: outputColumns,
    },
  }));
}

function FormulaEditorInner({
  initialAst,
  partners,
  outputColumns,
  onSave,
  onTest,
  saving,
}: FormulaEditorProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [validation, setValidation] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const counter = useRef(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const undoStack = useRef<UndoState[]>([]);
  const redoStack = useRef<UndoState[]>([]);
  const rf = useReactFlow();

  // Initial population from the AST. Re-runs only when the formula id (via
  // identity of `initialAst`) changes — local edits won't blow them away.
  useEffect(() => {
    const graph = astToGraph(initialAst);
    setNodes(
      injectGlobals(
        graph.nodes.map((n) => ({
          ...n,
          type: n.type,
        })) as Node[],
        partners,
        outputColumns
      )
    );
    setEdges(graph.edges as Edge[]);
    undoStack.current = [];
    redoStack.current = [];
    setValidation(null);
    setInfo(null);
  }, [initialAst, partners, outputColumns]);

  // Always keep partner + output column lists in sync with the latest props.
  useEffect(() => {
    setNodes((nodes) => injectGlobals(nodes, partners, outputColumns));
  }, [partners, outputColumns]);

  const pushUndo = useCallback(() => {
    undoStack.current.push({ nodes, edges });
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
  }, [nodes, edges]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Only checkpoint on structural changes (add / remove). Position
      // changes are noisy and unimportant for undo.
      if (changes.some((c) => c.type === "remove" || c.type === "add")) {
        pushUndo();
      }
      setNodes((n) => applyNodeChanges(changes, n));
    },
    [pushUndo]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (changes.some((c) => c.type === "remove" || c.type === "add")) {
        pushUndo();
      }
      setEdges((e) => applyEdgeChanges(changes, e));
    },
    [pushUndo]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      pushUndo();
      setEdges((eds) => {
        // A single target handle can only have one incoming edge — drop any
        // previous edge attached to the same handle before adding the new one.
        const next = eds.filter(
          (e) =>
            !(
              e.target === connection.target &&
              (e.targetHandle ?? "") === (connection.targetHandle ?? "")
            )
        );
        return addEdge(
          { ...connection, animated: false, type: "default" },
          next
        );
      });
    },
    [pushUndo]
  );

  const addNode = useCallback(
    (kind: NodeKind) => {
      pushUndo();
      const id = genNodeId(kind, counter.current++);
      const position = (() => {
        // Place new nodes near the centre of the current viewport so the user
        // doesn't have to hunt for them.
        const wrapper = wrapperRef.current;
        if (!wrapper) return { x: 100, y: 100 };
        const rect = wrapper.getBoundingClientRect();
        const center = rf.screenToFlowPosition({
          x: rect.left + rect.width / 3,
          y: rect.top + rect.height / 2,
        });
        return { x: center.x, y: center.y };
      })();
      setNodes((nodes) => [
        ...nodes,
        {
          id,
          type: kind,
          position,
          data: {
            ...defaultDataFor(kind),
            __partners: partners,
            __outputColumns: outputColumns,
          },
        } as Node,
      ]);
    },
    [pushUndo, rf, partners, outputColumns]
  );

  const undo = useCallback(() => {
    const last = undoStack.current.pop();
    if (!last) return;
    redoStack.current.push({ nodes, edges });
    setNodes(injectGlobals(last.nodes, partners, outputColumns));
    setEdges(last.edges);
  }, [nodes, edges, partners, outputColumns]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push({ nodes, edges });
    setNodes(injectGlobals(next.nodes, partners, outputColumns));
    setEdges(next.edges);
  }, [nodes, edges, partners, outputColumns]);

  const compile = useCallback((): ASTNode | null => {
    try {
      const ast = graphToAST({
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type as string,
          position: n.position,
          data: n.data as Record<string, unknown>,
        })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? null,
          targetHandle: e.targetHandle ?? null,
        })),
        rootId: "output-root",
      });
      const issues = validateAST(
        ast,
        outputColumns,
        partners.map((p) => p.id)
      );
      if (issues.length > 0) {
        setValidation(issues[0].message);
        return null;
      }
      setValidation(null);
      return ast;
    } catch (e) {
      setValidation((e as Error).message);
      return null;
    }
  }, [nodes, edges, outputColumns, partners]);

  const handleSave = useCallback(async () => {
    const ast = compile();
    if (!ast) return;
    await onSave(ast);
  }, [compile, onSave]);

  const handleTest = useCallback(() => {
    const ast = compile();
    if (!ast) return;
    onTest?.(ast);
  }, [compile, onTest]);

  const handleCheck = useCallback(() => {
    const ast = compile();
    if (ast) setInfo("Rumus valid.");
  }, [compile]);

  // Keyboard shortcuts for undo/redo. We listen at the container level so
  // editing form fields inside nodes doesn't trigger graph undo by accident.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
    }
  };

  const palette = useMemo(
    () =>
      NODE_GROUPS.map((g) => ({
        ...g,
        kinds: g.kinds.filter((k) => k !== "output"),
      })),
    []
  );

  return (
    <div
      ref={wrapperRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="flex w-full h-full min-h-[600px] outline-none"
    >
      {/* Palette */}
      <aside className="w-56 shrink-0 border-r border-slate-200 bg-slate-50 overflow-y-auto p-3 text-sm">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
          Palet simpul
        </h4>
        {palette.map((g) => (
          <div key={g.id} className="mb-3">
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-1">
              {g.title}
            </div>
            <div className="flex flex-col gap-1">
              {g.kinds.map((k) => {
                const def = NODE_DEFS[k];
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => addNode(k)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded border border-slate-200 bg-white hover:border-blue-400 hover:shadow text-left transition"
                    title={def.description}
                  >
                    <span
                      className={`${def.color} w-2.5 h-2.5 rounded-full inline-block`}
                    />
                    <span className="text-xs font-medium text-slate-700">
                      {def.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </aside>

      {/* Canvas */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={undo}
              className="px-2.5 py-1 text-xs rounded border border-slate-300 bg-white hover:bg-slate-100"
            >
              ⮌ Urungkan
            </button>
            <button
              type="button"
              onClick={redo}
              className="px-2.5 py-1 text-xs rounded border border-slate-300 bg-white hover:bg-slate-100"
            >
              ⮎ Ulangi
            </button>
            <button
              type="button"
              onClick={handleCheck}
              className="px-2.5 py-1 text-xs rounded border border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100"
            >
              Periksa
            </button>
            {onTest && (
              <button
                type="button"
                onClick={handleTest}
                className="px-2.5 py-1 text-xs rounded border border-blue-400 bg-blue-50 text-blue-900 hover:bg-blue-100"
              >
                Uji coba
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs ${
                validation
                  ? "text-rose-600"
                  : info
                    ? "text-emerald-600"
                    : "text-slate-500"
              }`}
            >
              {validation ?? info ?? "Siap"}
            </span>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 bg-slate-100">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} />
            <Controls position="bottom-left" />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}

export default function FormulaEditor(props: FormulaEditorProps) {
  return (
    <ReactFlowProvider>
      <FormulaEditorInner {...props} />
    </ReactFlowProvider>
  );
}
