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

  async function handleGoogleLogin() {
    setError('');
    // redirectTo trỏ thẳng về /student — sau khi đăng nhập Google xong, học sinh vào thẳng app,
    // không quay lại trang đăng nhập này. Hồ sơ users/students được tự tạo ở /student nếu là lần đầu.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/student` },
    });
    if (error) setError(error.message);
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

        <div className="flex items-center gap-3 my-4">
          <span className="flex-1 h-px bg-sand-100" />
          <span className="text-[11px] font-semibold text-ink-400">HOẶC</span>
          <span className="flex-1 h-px bg-sand-100" />
        </div>

        <button
          type="button" onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-2.5 border border-sand-100 rounded-xl py-3 text-sm font-bold text-ink hover:bg-sand-50 transition-colors">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.1 17.7 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.6H24v9.1h12.6c-.5 2.9-2.2 5.4-4.7 7l7.6 5.9c4.4-4.1 7-10.1 7-17.4z"/>
            <path fill="#FBBC05" d="M10.5 19.3c-.5 1.5-.8 3.1-.8 4.7s.3 3.2.8 4.7l-7.9 6.1C.9 31.4 0 27.8 0 24s.9-7.4 2.6-10.8l7.9 6.1z"/>
            <path fill="#34A853" d="M24 48c6.3 0 11.6-2.1 15.5-5.6l-7.6-5.9c-2.1 1.4-4.8 2.3-7.9 2.3-6.3 0-11.6-3.6-13.5-8.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/>
          </svg>
          Đăng nhập nhanh bằng Google
        </button>

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
