'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';
import AppHeader from '../components/AppHeader';
import LeafDecor from '../components/LeafDecor';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/student');
      else setCheckingSession(false);
    });
  }, [router]);

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    router.push('/student');
  }

  async function handleSignup(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { setLoading(false); setError(error.message); return; }

    // Tạo hồ sơ trong bảng public.users + public.students (role mặc định: student)
    if (data.user) {
      await supabase.from('users').insert({
        id: data.user.id,
        full_name: fullName || email,
        role: 'student',
      });
      await supabase.from('students').insert({
        id: data.user.id,
        streak: 0,
        evidence_count: 0,
        current_day: 1,
      });
    }
    setLoading(false);
    router.push('/student');
  }

  if (checkingSession) {
    return <div className="flex min-h-screen items-center justify-center text-sm font-medium text-ink-600">Đang kiểm tra đăng nhập...</div>;
  }

  const inputCls =
    'w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm placeholder:text-ink-400 focus:border-pine-700 focus:outline-none';

  return (
    <div className="relative min-h-screen">
      <LeafDecor />
      <AppHeader />

      <main className="relative z-10 flex justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-md">
          <div
            className="relative overflow-hidden rounded-[22px] p-7 text-white shadow-hero"
            style={{ background: 'radial-gradient(420px 240px at 100% 0%, rgba(116,198,157,.20), transparent 62%), linear-gradient(165deg,#256A5E 0%,#205656 38%,#1A3B40 100%)' }}
          >
            <div className="text-[12px] font-semibold uppercase tracking-wide text-[#6FCB9F]">30 Ngày Xanh</div>
            <h1 className="mt-1 text-[26px] font-bold leading-tight">
              {mode === 'login' ? 'Chào mừng quay lại' : 'Tạo tài khoản học sinh'}
            </h1>
            <p className="mt-2 text-[13.5px] leading-relaxed text-white/80">
              Mỗi học sinh một hành trình – Mỗi hành động một dữ liệu – Cả lớp cùng thay đổi.
            </p>
          </div>

          <div className="mt-4 rounded-[20px] bg-white p-6 shadow-soft">
            <form onSubmit={mode === 'login' ? handleLogin : handleSignup} className="space-y-3">
              {mode === 'signup' && (
                <input
                  type="text" placeholder="Họ và tên" aria-label="Họ và tên" value={fullName}
                  onChange={(e) => setFullName(e.target.value)} required
                  className={inputCls}
                />
              )}
              <input
                type="email" placeholder="Email" aria-label="Email" value={email}
                onChange={(e) => setEmail(e.target.value)} required
                className={inputCls}
              />
              <input
                type="password" placeholder="Mật khẩu" aria-label="Mật khẩu" value={password}
                onChange={(e) => setPassword(e.target.value)} required minLength={6}
                className={inputCls}
              />
              {error && <div role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-xs text-red-700">{error}</div>}
              <button
                type="submit" disabled={loading}
                className="w-full rounded-[10px] bg-pine-700 py-3 text-sm font-bold text-white hover:brightness-95 disabled:opacity-60"
              >
                {loading ? 'Đang xử lý...' : mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}
              </button>
            </form>

            <button
              type="button"
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}
              className="mt-4 w-full text-center text-[13px] font-semibold text-pine-700 underline underline-offset-2"
            >
              {mode === 'login' ? 'Chưa có tài khoản? Đăng ký ngay' : 'Đã có tài khoản? Đăng nhập'}
            </button>
          </div>

          <div className="mt-5 text-center text-[11px] text-ink-400">
            Tài khoản được tạo qua Supabase Auth thật — dữ liệu lưu trong database của bạn.
          </div>
        </div>
      </main>
    </div>
  );
}
