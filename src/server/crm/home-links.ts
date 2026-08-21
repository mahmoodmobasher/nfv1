import type { CrmHomeFilters } from "./home";

const FILTER_KEYS=["status","stage","owner","team","period"] as const;
export function crmHomeQuery(filters:CrmHomeFilters,overrides:Partial<CrmHomeFilters>={}){const next={...filters,...overrides},params=new URLSearchParams();for(const key of FILTER_KEYS)if(next[key]!=="all")params.set(key,next[key]);return params.size?`?${params}`:""}
export function crmLeadHref(filters:CrmHomeFilters,overrides:Partial<CrmHomeFilters>={}){return `/crm${crmHomeQuery(filters,overrides)}`}
export function hasCrmHomeFilters(filters:CrmHomeFilters){return FILTER_KEYS.some(key=>filters[key]!=="all")}
