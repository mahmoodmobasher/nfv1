import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const authorizedHandlers = [
  ["src/app/api/workspaces/[workspaceId]/invitations/route.ts", "GET"],
  ["src/app/api/workspaces/[workspaceId]/invitations/route.ts", "POST"],
  [
    "src/app/api/workspaces/[workspaceId]/invitations/[invitationId]/resend/route.ts",
    "POST",
  ],
  [
    "src/app/api/workspaces/[workspaceId]/invitations/[invitationId]/revoke/route.ts",
    "POST",
  ],
  [
    "src/app/api/workspaces/[workspaceId]/memberships/[membershipId]/teams/route.ts",
    "PUT",
  ],
  ["src/app/api/workspaces/[workspaceId]/ownership/transfer/route.ts", "POST"],
  ["src/app/api/workspaces/[workspaceId]/roles/[roleId]/policy/route.ts", "PATCH"],
  ["src/app/api/workspaces/[workspaceId]/settings/route.ts", "GET"],
  ["src/app/api/workspaces/[workspaceId]/teams/[teamId]/route.ts", "PATCH"],
  ["src/app/api/workspaces/[workspaceId]/teams/route.ts", "GET"],
] as const;

function handlerFor(path: string, exportName: string) {
  const sourceText = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const source = ts.createSourceFile(
    path,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const handler = source.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === exportName,
  );
  expect(handler, `${path} must export ${exportName}`).toBeDefined();
  return handler!;
}

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? routeFiles(path)
      : entry.isFile() && entry.name === "route.ts"
        ? [path]
        : [];
  });
}

function callName(node: ts.CallExpression) {
  return ts.isIdentifier(node.expression) ? node.expression.text : undefined;
}

function auditedFailureCalls(handler: ts.FunctionDeclaration) {
  const calls: Array<{ call: ts.CallExpression; awaited: boolean }> = [];
  const visit = (node: ts.Node, withinAwait = false) => {
    const awaited = withinAwait || ts.isAwaitExpression(node);
    if (ts.isCallExpression(node) && callName(node) === "auditedFailure") {
      calls.push({ call: node, awaited });
    }
    ts.forEachChild(node, (child) => visit(child, awaited));
  };
  visit(handler);
  return calls;
}

function hasAwaitedPoolEnd(handler: ts.FunctionDeclaration) {
  let found = false;
  const visit = (node: ts.Node, withinAwait = false) => {
    const awaited = withinAwait || ts.isAwaitExpression(node);
    if (
      awaited &&
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "pool" &&
      node.expression.name.text === "end"
    ) {
      found = true;
    }
    ts.forEachChild(node, (child) => visit(child, awaited));
  };
  visit(handler);
  return found;
}

describe("UAT-GAP-013 audited denial pool lifecycle source invariant", () => {
  it("awaits auditedFailure before route-owned pool shutdown in exactly the ten authorized handlers", () => {
    expect(authorizedHandlers).toHaveLength(10);

    for (const [path, exportName] of authorizedHandlers) {
      const label = `${exportName} ${path}`;
      const handler = handlerFor(path, exportName);
      const calls = auditedFailureCalls(handler);

      expect(hasAwaitedPoolEnd(handler), `${label} must await its owned pool.end()`).toBe(
        true,
      );
      expect(calls, `${label} must contain its single route-owned auditedFailure`).toHaveLength(
        1,
      );
      expect(
        calls.every(({ awaited }) => awaited),
        `${label} must await auditedFailure before its finally block closes the pool`,
      ).toBe(true);
    }
  });

  it("rejects every un-awaited auditedFailure in an API handler that owns pool shutdown", () => {
    const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
    const apiRoot = join(repositoryRoot, "src/app/api");

    for (const absolutePath of routeFiles(apiRoot)) {
      const path = relative(repositoryRoot, absolutePath);
      const source = ts.createSourceFile(
        path,
        readFileSync(absolutePath, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );

      for (const statement of source.statements) {
        if (!ts.isFunctionDeclaration(statement) || !statement.name) continue;
        const calls = auditedFailureCalls(statement);
        if (!calls.length || !hasAwaitedPoolEnd(statement)) continue;
        expect(
          calls.every(({ awaited }) => awaited),
          `${statement.name.text} ${path} must await every auditedFailure before pool.end()`,
        ).toBe(true);
      }
    }
  });
});
