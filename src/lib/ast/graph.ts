/**
 * Bidirectional compiler between the React Flow visual graph and the
 * persisted AST representation.
 *
 * Graph model (simplified):
 *   • Every node has an `id`, a `type` (matches an AST node type), and a
 *     `data` payload (numeric literals, column letters, partner ids, etc.).
 *   • Exactly ONE "output" node sits at the root. Its single input edge
 *     receives the formula's final value.
 *   • Every other node connects its outputs into the parent node's inputs.
 *     A node with two inputs (e.g. AND, IF) uses port handles "in-left" and
 *     "in-right" / "in-cond", "in-then", "in-else".
 *
 * Compiling graph → AST walks the tree starting from the output node and
 * recursively builds AST children from incoming edges. Compiling AST → graph
 * does the inverse, generating fresh node ids on the fly.
 */

import type { ASTNode } from "./types";

/** Generic graph node consumed by the React Flow editor. */
export interface GraphNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface FormulaGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Id of the root "output" node. */
  rootId: string;
}

const ROOT_ID = "output-root";

function genId(prefix: string, counter: { n: number }): string {
  counter.n += 1;
  return `${prefix}-${counter.n}`;
}

/**
 * Compile an AST tree into a React Flow graph.
 *
 * Layout uses a simple left-to-right tree walker — the editor lets the user
 * re-arrange nodes after import, so spacing only needs to be readable.
 */
export function astToGraph(ast: ASTNode): FormulaGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const counter = { n: 0 };

  const rootNode: GraphNode = {
    id: ROOT_ID,
    type: "output",
    position: { x: 800, y: 200 },
    data: { label: "Hasil" },
  };
  nodes.push(rootNode);

  let yCursor = 0;
  const X_STEP = 240;
  const Y_STEP = 110;

  /** @returns node id of the created subtree's root */
  function emit(node: ASTNode, depth: number): string {
    const id = genId(node.type, counter);
    const y = yCursor;
    yCursor += Y_STEP;
    const x = 800 - depth * X_STEP;

    const data: Record<string, unknown> = {};
    switch (node.type) {
      case "literal":
        data.value = node.value;
        data.kind =
          typeof node.value === "number"
            ? "number"
            : typeof node.value === "boolean"
              ? "boolean"
              : "text";
        break;
      case "columnRef":
        data.column = node.column;
        break;
      case "prevOutput":
      case "outputRef":
        data.column = node.column;
        break;
      case "partnerRef":
        data.partnerId = node.partnerId;
        break;
      case "binaryOp":
        data.op = node.op;
        break;
    }

    nodes.push({ id, type: node.type, position: { x, y }, data });

    switch (node.type) {
      case "search": {
        const findId = emit(node.find, depth + 1);
        const withinId = emit(node.within, depth + 1);
        edges.push({
          id: `e-${findId}-${id}`,
          source: findId,
          target: id,
          targetHandle: "in-find",
        });
        edges.push({
          id: `e-${withinId}-${id}`,
          source: withinId,
          target: id,
          targetHandle: "in-within",
        });
        break;
      }
      case "iserror":
      case "not":
      case "negate": {
        const argId = emit(node.arg, depth + 1);
        edges.push({
          id: `e-${argId}-${id}`,
          source: argId,
          target: id,
          targetHandle: "in-arg",
        });
        break;
      }
      case "and":
      case "or":
      case "binaryOp": {
        const lid = emit(node.left, depth + 1);
        const rid = emit(node.right, depth + 1);
        edges.push({
          id: `e-${lid}-${id}`,
          source: lid,
          target: id,
          targetHandle: "in-left",
        });
        edges.push({
          id: `e-${rid}-${id}`,
          source: rid,
          target: id,
          targetHandle: "in-right",
        });
        break;
      }
      case "if": {
        const cid = emit(node.cond, depth + 1);
        const tid = emit(node.then, depth + 1);
        const eid = emit(node.else, depth + 1);
        edges.push({
          id: `e-${cid}-${id}`,
          source: cid,
          target: id,
          targetHandle: "in-cond",
        });
        edges.push({
          id: `e-${tid}-${id}`,
          source: tid,
          target: id,
          targetHandle: "in-then",
        });
        edges.push({
          id: `e-${eid}-${id}`,
          source: eid,
          target: id,
          targetHandle: "in-else",
        });
        break;
      }
      default:
        break;
    }

    return id;
  }

  const childId = emit(ast, 1);
  edges.push({
    id: `e-${childId}-${ROOT_ID}`,
    source: childId,
    target: ROOT_ID,
    targetHandle: "in-value",
  });

  return { nodes, edges, rootId: ROOT_ID };
}

/**
 * Compile a React Flow graph back to an AST tree.
 *
 * @throws Error when the root has no input or any required handle is missing.
 */
export function graphToAST(graph: FormulaGraph): ASTNode {
  const byId = new Map<string, GraphNode>();
  for (const n of graph.nodes) byId.set(n.id, n);

  const incoming = new Map<string, GraphEdge[]>();
  for (const e of graph.edges) {
    if (!incoming.has(e.target)) incoming.set(e.target, []);
    incoming.get(e.target)!.push(e);
  }

  function inputFor(nodeId: string, handle: string): ASTNode {
    const edges = incoming.get(nodeId) ?? [];
    const edge = edges.find((e) => (e.targetHandle ?? "") === handle);
    if (!edge) {
      throw new Error(
        `Node ${nodeId} kekurangan input pada handle "${handle}"`
      );
    }
    return build(edge.source);
  }

  function build(nodeId: string): ASTNode {
    const node = byId.get(nodeId);
    if (!node) throw new Error(`Simpul tidak ditemukan: ${nodeId}`);
    switch (node.type) {
      case "output":
        return inputFor(nodeId, "in-value");
      case "literal": {
        const value = node.data.value;
        if (
          typeof value !== "string" &&
          typeof value !== "number" &&
          typeof value !== "boolean"
        ) {
          throw new Error("Konstanta tidak memiliki nilai.");
        }
        return { type: "literal", value };
      }
      case "columnRef":
        return { type: "columnRef", column: node.data.column as "C" | "D" | "E" | "F" };
      case "prevOutput":
        return { type: "prevOutput", column: String(node.data.column ?? "") };
      case "outputRef":
        return { type: "outputRef", column: String(node.data.column ?? "") };
      case "partnerRef":
        return { type: "partnerRef", partnerId: String(node.data.partnerId ?? "") };
      case "row":
        return { type: "row" };
      case "search":
        return {
          type: "search",
          find: inputFor(nodeId, "in-find"),
          within: inputFor(nodeId, "in-within"),
        };
      case "iserror":
        return { type: "iserror", arg: inputFor(nodeId, "in-arg") };
      case "not":
        return { type: "not", arg: inputFor(nodeId, "in-arg") };
      case "negate":
        return { type: "negate", arg: inputFor(nodeId, "in-arg") };
      case "and":
        return {
          type: "and",
          left: inputFor(nodeId, "in-left"),
          right: inputFor(nodeId, "in-right"),
        };
      case "or":
        return {
          type: "or",
          left: inputFor(nodeId, "in-left"),
          right: inputFor(nodeId, "in-right"),
        };
      case "if":
        return {
          type: "if",
          cond: inputFor(nodeId, "in-cond"),
          then: inputFor(nodeId, "in-then"),
          else: inputFor(nodeId, "in-else"),
        };
      case "binaryOp": {
        const opName = node.data.op;
        return {
          type: "binaryOp",
          op: opName as
            | "+"
            | "-"
            | "*"
            | "/"
            | "="
            | "<>"
            | ">"
            | "<"
            | ">="
            | "<=",
          left: inputFor(nodeId, "in-left"),
          right: inputFor(nodeId, "in-right"),
        };
      }
      default:
        throw new Error(`Tipe simpul tidak dikenal: ${node.type}`);
    }
  }

  return build(graph.rootId);
}

/**
 * Convert an AST to a compact human-readable string (used in lists / tooltips).
 * Not intended for round-trip parsing — purely informational.
 */
export function astToText(node: ASTNode): string {
  switch (node.type) {
    case "literal":
      if (typeof node.value === "string") return `"${node.value}"`;
      return String(node.value);
    case "columnRef":
      return node.column;
    case "prevOutput":
      return `${node.column}_prev`;
    case "outputRef":
      return node.column;
    case "partnerRef":
      return `mitra(${node.partnerId})`;
    case "row":
      return "ROW()";
    case "search":
      return `SEARCH(${astToText(node.find)}, ${astToText(node.within)})`;
    case "iserror":
      return `ISERROR(${astToText(node.arg)})`;
    case "not":
      return `NOT(${astToText(node.arg)})`;
    case "negate":
      return `-(${astToText(node.arg)})`;
    case "and":
      return `AND(${astToText(node.left)}, ${astToText(node.right)})`;
    case "or":
      return `OR(${astToText(node.left)}, ${astToText(node.right)})`;
    case "if":
      return `IF(${astToText(node.cond)}, ${astToText(node.then)}, ${astToText(node.else)})`;
    case "binaryOp":
      return `(${astToText(node.left)} ${node.op} ${astToText(node.right)})`;
  }
  return "?";
}

export const FORMULA_OUTPUT_NODE_ID = ROOT_ID;
