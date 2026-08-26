import { LoadingState } from "@/frontend/design-system";
export default function Loading() { return <section className="admin-content narrow-admin" aria-busy="true"><h1>Preparing Lead operations</h1><LoadingState label="Loading authorized operational choices" rows={5}/></section>; }
