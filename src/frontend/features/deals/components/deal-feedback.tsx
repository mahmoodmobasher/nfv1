import { LoadingState } from "@/frontend/design-system";

export function DealLoading({ label }: { label: string }) {
  return <LoadingState label={label} rows={5}/>;
}
