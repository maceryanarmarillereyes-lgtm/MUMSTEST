// Static runtime configuration for MEYS/MUMS.
//
// This app is deployed as static HTML/JS (GitHub Pages / Vercel). Static sites cannot read
// server-side environment variables at runtime, so we keep config in this committed file.
//
// Fill these in:
// - SUPABASE_URL: Supabase Dashboard → Project Settings → API → Project URL
// - SUPABASE_ANON_KEY: Supabase Dashboard → Project Settings → API → Publishable key
// - SUPABASE_FUNCTIONS_BASE: typically `${SUPABASE_URL}/functions/v1`
window.__MEYS_ENV = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  SUPABASE_FUNCTIONS_BASE: "",
};
