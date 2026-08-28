import { LoadingState } from "@/frontend/design-system";
export default function Loading() { return <section className="mx-auto grid w-full max-w-4xl gap-5 py-5" aria-busy="true"><h1 className="text-2xl font-semibold tracking-tight text-ink">Preparing Edit lead</h1><LoadingState label="Loading authorized operational choices" rows={5}/></section>; }
