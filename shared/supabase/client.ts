"use client";

import { createClient } from "@/utils/supabase/client";

export const getBrowserSupabase = () => createClient();
export const supabase = createClient();