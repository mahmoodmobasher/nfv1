export const plans = {
  essentials: { name: "Essentials" },
  growth: { name: "Growth" },
  scale: { name: "Scale" },
} as const;

export type PlanKey = keyof typeof plans;
export type Cadence = "monthly" | "annual";

export function selection(params: Pick<URLSearchParams, "get">) {
  const raw = params.get("plan") || "growth";
  const plan = raw in plans ? (raw as PlanKey) : "growth";
  const cadence: Cadence = params.get("cadence") === "annual" ? "annual" : "monthly";
  return { plan, cadence } as const;
}

export function query(plan: PlanKey, cadence: string, extra = "") {
  return `plan=${plan}&cadence=${cadence}${extra}`;
}

export const validEmail = (value: string): boolean => /^\S+@\S+\.\S+$/.test(value);
export const validPassword = (value: string): boolean => value.length >= 12 && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);

export function clearDemoState(storage: Pick<Storage, "removeItem" | "key" | "length">): void {
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key?.startsWith("nexaDemo")) storage.removeItem(key);
  }
}
