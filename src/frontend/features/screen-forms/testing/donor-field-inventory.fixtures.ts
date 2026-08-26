/**
 * Label-only business inventory transcribed from the supplied screenshots and
 * pinned donor. It is presentation evidence, never a transport or authority
 * contract.
 */
export const donorFieldInventory = {
  company: [
    { section: "Company profile", labels: ["Company name", "Domain", "Website", "Industry", "Size band", "Employees", "Annual revenue", "Parent Company"] },
    { section: "Contact and address", labels: ["Phone", "Street", "City", "State/Province", "Postal code", "Country"] },
  ],
  lead: [
    { section: "Primary information", labels: ["Salutation", "First name", "Last name", "Company", "Job title"] },
    { section: "Contact channels", labels: ["Primary email", "Secondary email", "Office phone", "Mobile", "Fax", "Website", "Twitter handle", "Promotional email opt-out"] },
    { section: "Lead and profiling", labels: ["Source", "Status", "Rating", "Industry", "Annual revenue", "Employees"] },
    { section: "Address", labels: ["Street", "City", "State/Province", "Postal code", "Country"] },
  ],
  contact: [
    { section: "Basic details", labels: ["Salutation", "First name", "Last name", "Job title", "Department", "Company"] },
    { section: "Contact channels", labels: ["Primary email", "Secondary email", "Direct phone", "Mobile", "LinkedIn"] },
    { section: "Lifecycle and assignment", labels: ["Lifecycle stage", "Assigned owner"] },
    { section: "Address and notes", labels: ["Street", "City", "State/Province", "Postal code", "Country", "Add internal note"] },
  ],
} as const;

export type DonorFieldInventoryKind = keyof typeof donorFieldInventory;
