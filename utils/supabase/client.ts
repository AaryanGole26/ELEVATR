import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config";

export const createClient = () => {
  const { url, key } = getSupabaseConfig();
  return createBrowserClient(url, key);
};
