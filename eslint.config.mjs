import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  { ignores: [".next/**", "node_modules/**", "public/**", "supabase/functions/**", "next-env.d.ts", "playwright-report/**", "coverage/**"] },
  ...nextVitals,
  ...nextTs,
];

export default config;
