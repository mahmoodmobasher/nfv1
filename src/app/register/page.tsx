import { Suspense } from "react";
import { RegisterForm } from "../onboarding/forms";
import { websiteProvider } from "../onboarding/provider";
import { WebsiteEnvironmentNotice, WebsiteShell } from "../onboarding/website-shell";
import { activeCommercialCatalog } from "@/server/commercial/catalog";

export default async function Page({searchParams}:{searchParams:Promise<{plan?:string;cadence?:string}>}){const provider=websiteProvider(),params=await searchParams;let presentation;try{const cadence=params.cadence==="monthly"||params.cadence==="annual"?params.cadence:undefined;const plan=cadence?(await activeCommercialCatalog()).find(item=>item.code===params.plan&&item.allowedCadences.includes(cadence)):undefined;if(plan&&cadence){presentation={plan:plan.code,name:plan.name,cadence,seats:plan.seats,priceCents:cadence==="annual"?plan.annualMonthlyEquivalentCents:plan.monthlyCents}as const}}catch{}return <WebsiteShell action="login"><WebsiteEnvironmentNotice>Identity and password security are server-backed. Use only credentials approved for this environment.</WebsiteEnvironmentNotice><Suspense><RegisterForm provider={provider} presentation={presentation} /></Suspense></WebsiteShell>}
