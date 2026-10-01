// Public values: the URL and publishable key are designed to ship to browsers.
// Access is enforced by row-level security in the database, not by hiding these.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://uwhgahpsivwkvxmbchmk.supabase.co";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_ladSngKal-EjKyvVjfp6Lg_VfssqayS";
export const POLICY_VERSION = "privacy-2026-10";
