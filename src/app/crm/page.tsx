import Link from "next/link";
import { CrmShell } from "./crm-shell";
import { crmPageContext } from "@/server/crm/page";
import { listLeads, pipelineStages } from "@/server/crm/leads";
import { crmPeriodStart, parseCrmHomeFilters } from "@/server/crm/home";

export const dynamic="force-dynamic";
export const metadata={title:"Leads | NexaFlow"};

export default async function Crm({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const raw=await searchParams,q=typeof raw.q==="string"?raw.q:"";
  const filters=parseCrmHomeFilters(Object.fromEntries(Object.entries(raw).filter(([key])=>key!=="q")));
  const{pool,workspace,context}=await crmPageContext("/crm");
  const listFilters={status:filters.status==="all"?undefined:filters.status,stageId:filters.stage==="all"?undefined:filters.stage,ownerMembershipId:filters.owner==="all"?undefined:filters.owner==="mine"?context.membershipId:filters.owner,teamId:filters.team==="all"?undefined:filters.team,createdSince:crmPeriodStart(filters.period)};
  try{
    const[leads,stages]=await Promise.all([listLeads(pool,context,q,listFilters),pipelineStages(pool,context)]),filtered=Object.values(filters).some(value=>value!=="all");
    return <CrmShell workspace={workspace.name} role={context.role}><section className="admin-content"><p className="eyebrow">Local CRM</p><header className="crm-page-heading"><div><h1>Leads</h1><p className="lead">Track prospects from first contact through a won or lost outcome.</p></div><Link className="primary link-button" href="/crm/leads/new">Add lead</Link></header><form className="admin-toolbar" action="/crm"><label>Search leads<input name="q" type="search" defaultValue={q} placeholder="Name, email, or company"/></label>{Object.entries(filters).filter(([,value])=>value!=="all").map(([name,value])=><input key={name} type="hidden" name={name} value={value}/>) }<button className="secondary">Search</button>{(q||filtered)&&<Link className="secondary link-button" href="/crm">Clear filters</Link>}</form>{filtered&&<p className="filter-context">Showing leads for the validated dashboard filters in this URL.</p>}<p role="status">{leads.length} {leads.length===1?"lead":"leads"} shown across {stages.length} pipeline stages.</p>{leads.length===0?<div className="empty"><h2>{q||filtered?"No matching leads":"Add your first lead"}</h2><p>{q||filtered?"Clear filters or try a different search.":"Create a shared customer record and begin tracking follow-up."}</p>{q||filtered?<Link className="secondary link-button" href="/crm">Clear filters</Link>:<Link className="primary link-button" href="/crm/leads/new">Add lead</Link>}</div>:<div className="lead-grid">{leads.map(lead=><article className="lead-card" key={lead.id}><div><span className={`lead-status ${lead.status}`}>{lead.status}</span><span>{lead.stage_name}</span></div><h2><Link href={`/crm/leads/${lead.id}`}>{lead.first_name} {lead.last_name}</Link></h2><p>{lead.company}</p><span className="wrap-email">{lead.email_display}</span><small>Owner: {lead.owner_name} · {lead.visibility==="workspace"?"Workspace visibility":`${lead.teams.length} team${lead.teams.length===1?"":"s"}`}</small></article>)}</div>}</section></CrmShell>;
  }finally{await pool.end()}
}
