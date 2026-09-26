import { createClient } from '@supabase/supabase-js';

// CHỈ dùng trong các API route phía server (app/api/**) — KHÔNG BAO GIỜ import file này
// vào bất kỳ component nào có 'use client', vì SUPABASE_SERVICE_ROLE_KEY là khoá toàn quyền,
// lộ ra trình duyệt sẽ để lộ toàn bộ dữ liệu của mọi người dùng.
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong biến môi trường.');
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
