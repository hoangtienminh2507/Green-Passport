'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';

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
    return <div className="min-h-screen flex items-center justify-center text-ink-600">Đang kiểm tra đăng nhập...</div>;
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-5"
      style={{
        background:
          'radial-gradient(1200px 600px at 15% -10%, rgba(82,183,136,.35), transparent 60%),' +
          'radial-gradient(900px 500px at 100% 10%, rgba(58,143,183,.18), transparent 55%),' +
          'linear-gradient(180deg,#0F2A20,#1B4332 60%,#163C2C)',
      }}
    >
      <div className="w-full max-w-md bg-white rounded-lg p-8 shadow-2xl">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
               style={{ background: 'linear-gradient(145deg,#52B788,#2D6A4F)' }}>🌱</div>
          <div>
            <div className="font-display font-bold text-lg text-forest-800">Green Passport</div>
            <div className="text-xs font-semibold text-ink-400 tracking-wide">30 NGÀY XANH</div>
          </div>
        </div>

        <h1 className="mt-6 text-xl font-bold">{mode === 'login' ? 'Chào mừng quay lại 👋' : 'Tạo tài khoản học sinh'}</h1>
        <p className="text-sm text-ink-600 mt-1 mb-6 leading-relaxed">
          Mỗi học sinh một hành trình – Mỗi hành động một dữ liệu – Cả lớp cùng thay đổi.
        </p>

        <form onSubmit={mode === 'login' ? handleLogin : handleSignup} className="space-y-3">
          {mode === 'signup' && (
            <input
              type="text" placeholder="Họ và tên" value={fullName}
              onChange={(e) => setFullName(e.target.value)} required
              className="w-full border border-sand-100 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:border-leaf-500"
            />
          )}
          <input
            type="email" placeholder="Email" value={email}
            onChange={(e) => setEmail(e.target.value)} required
            className="w-full border border-sand-100 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:border-leaf-500"
          />
          <input
            type="password" placeholder="Mật khẩu" value={password}
            onChange={(e) => setPassword(e.target.value)} required minLength={6}
            className="w-full border border-sand-100 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:border-leaf-500"
          />
          {error && <div className="text-xs text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</div>}
          <button
            type="submit" disabled={loading}
            className="w-full bg-forest-700 hover:bg-forest-800 text-white font-bold rounded-xl py-3 text-sm disabled:opacity-60"
          >
            {loading ? 'Đang xử lý...' : mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}
          </button>
        </form>

        <button
          onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}
          className="w-full text-center text-xs text-ink-600 mt-4 underline"
        >
          {mode === 'login' ? 'Chưa có tài khoản? Đăng ký ngay' : 'Đã có tài khoản? Đăng nhập'}
        </button>

        <div className="text-[11px] text-ink-400 text-center mt-5">
          Tài khoản được tạo qua Supabase Auth thật — dữ liệu lưu trong database của bạn.
        </div>
      </div>
    </div>
  );
}
