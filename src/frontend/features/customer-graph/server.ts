import "server-only";
export type CustomerGraphPageBootstrap = { workspaceId: string };
export function customerGraphPageBootstrap(workspaceId: string): CustomerGraphPageBootstrap { return { workspaceId }; }
