import { astToGraph, graphToAST } from "../graph";
import { DEFAULT_FORMULAS } from "../defaults";

describe("Graph ↔ AST round-trip", () => {
  test.each(DEFAULT_FORMULAS.map((f) => [f.column, f]))(
    "default formula %s round-trips through the graph",
    (_col, formula) => {
      const graph = astToGraph(formula.ast);
      const ast2 = graphToAST(graph);
      expect(JSON.stringify(ast2)).toEqual(JSON.stringify(formula.ast));
    }
  );

  test("rejects a graph with a disconnected root", () => {
    expect(() => graphToAST({ nodes: [], edges: [], rootId: "missing" })).toThrow();
  });
});
