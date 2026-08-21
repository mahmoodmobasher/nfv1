import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "src/server/db/migrations/meta/**"],
    rules: { "react-hooks/set-state-in-effect": "off" },
  },
  { files: ["src/app/crm/page.tsx"], rules: { "@next/next/no-location-assign-relative-destination": "off" } },
];

export default config;
