import { LoadingState } from "@/frontend/design-system";
export function CustomerGraphLoading({ label = "Loading customer records…" }: { label?: string }) { return <LoadingState label={label} rows={5}/>; }
