export const CRM_HOME_DEMO_PREVIEW = Object.freeze({
  source: "demo" as const,
  notice: "Sample values only — this feature is not connected to workspace data.",
  cards: Object.freeze([
    Object.freeze({title:"Deals",value:"$248k",detail:"Sample pipeline value"}),
    Object.freeze({title:"Conversion",value:"24%",detail:"Sample funnel conversion"}),
    Object.freeze({title:"Projects",value:"8",detail:"Sample active projects"}),
    Object.freeze({title:"Delivery",value:"On track",detail:"Sample delivery health"}),
    Object.freeze({title:"Reporting",value:"Preview",detail:"Sample reporting state"}),
  ]),
});
