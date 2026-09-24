'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { CHALLENGES } from '../../lib/challenges';

const TABS = [
  { id: 'dashboard', ic: '📊', label: 'Dashboard' },
  { id: 'students', ic: '🧑‍🎓', label: 'Học sinh' },
  { id: 'evidence', ic: '🖼️', label: 'Minh chứng' },
  { id: 'challenges', ic: '🎯', label: 'Thử thách' },
];

export default function TeacherPage() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('dashboard');

  const [students, setStudents] = useState([]);       // rows từ bảng students, đã ghép tên từ users
  const [pendingActions, setPendingActions] = useState([]); // daily_actions status='done' chờ xác nhận
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentActions, setStudentActions] = useState([]);
  const [toast, setToast] = useState('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2600); };

  const loadData = useCallback(async () => {
    // Lấy toàn bộ học sinh + tên (2 truy vấn riêng rồi ghép, tránh lỗi cú pháp join phức tạp)
    const { data: studentRows } = await supabase.from('students').select('*');
    const { data: userRows } = await supabase.from('users').select('id, full_name, role');
    const userMap = {};
    (userRows || []).forEach((u) => { userMap[u.id] = u; });
    const merged = (studentRows || []).map((s) => ({ ...s, full_name: userMap[s.id]?.full_name || '(chưa rõ tên)' }));
    setStudents(merged);

    // Lấy các hành động đang chờ xác nhận (status = 'done')
    const { data: actions } = await supabase
      .from('daily_actions')
      .select('*')
      .eq('status', 'done')
      .order('created_at', { ascending: false });
    const pending = (actions || []).map((a) => ({ ...a, full_name: userMap[a.student_id]?.full_name || '(chưa rõ tên)' }));
    setPendingActions(pending);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace('/'); return; }
      setSession(data.session);
      const { data: userRow } = await supabase.from('users').select('*').eq('id', data.session.user.id).single();
      setProfile(userRow || null);
      if (userRow && (userRow.role === 'teacher' || userRow.role === 'admin')) {
        await loadData();
      }
      setLoading(false);
    });
  }, [router, loadData]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  async function openStudent(s) {
    setSelectedStudent(s);
    const { data } = await supabase
      .from('daily_actions')
      .select('*')
      .eq('student_id', s.id)
      .order('day_number', { ascending: false })
      .limit(10);
    setStudentActions(data || []);
  }

  async function confirmAction(actionId) {
    await supabase.from('daily_actions').update({ status: 'confirmed' }).eq('id', actionId);
    await supabase.from('evidence').update({ confirmed_by: session.user.id, confirmed_at: new Date().toISOString() }).eq('daily_action_id', actionId);
    showToast('Đã xác nhận minh chứng.');
    await loadData();
    if (selectedStudent) await openStudent(selectedStudent);
  }

  async function requestMoreAction(actionId) {
    await supabase.from('daily_actions').update({ status: 'needs' }).eq('id', actionId);
    showToast('Đã yêu cầu học sinh bổ sung minh chứng.');
    await loadData();
    if (selectedStudent) await openStudent(selectedStudent);
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-ink-600">Đang tải dữ liệu...</div>;

  if (!profile || (profile.role !== 'teacher' && profile.role !== 'admin')) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-6">
        <div className="text-lg font-bold">Trang này chỉ dành cho Giáo viên / Admin</div>
        <div className="text-sm text-ink-600 max-w-sm">
          Tài khoản của bạn hiện có vai trò <code>{profile?.role || 'không rõ'}</code>.
          Để dùng trang này, vào Supabase → Table Editor → bảng <code>users</code> → sửa cột <code>role</code> của tài khoản này thành <code>teacher</code>.
        </div>
        <button onClick={handleLogout} className="mt-2 bg-forest-700 text-white px-4 py-2 rounded-lg text-sm font-bold">Đăng xuất</button>
      </div>
    );
  }

  const kpi = {
    total: students.length,
    withProgress: students.filter((s) => (s.current_day || 1) > 1).length,
    pendingCount: pendingActions.length,
    keeping: students.filter((s) => (s.streak || 0) >= 3).length,
  };

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <div className="hidden md:flex w-60 flex-none bg-forest-800 text-white flex-col p-3.5 sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 px-1.5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: 'linear-gradient(145deg,#52B788,#2D6A4F)' }}>🌱</div>
          <div>
            <div className="font-display font-bold text-white">Green Passport</div>
            <div className="text-[11px] text-white/55 font-semibold">30 NGÀY XANH</div>
          </div>
        </div>
        <ul className="mt-6 flex flex-col gap-0.5">
          {TABS.map((t) => (
            <li key={t.id} onClick={() => { setTab(t.id); setSelectedStudent(null); }}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-bold cursor-pointer ${tab === t.id ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
              <span className="w-5 text-center">{t.ic}</span>{t.label}
            </li>
          ))}
        </ul>
        <div className="mt-auto pt-3.5 border-t border-white/10">
          <div className="flex items-center gap-2.5 px-1.5 py-2">
            <div className="w-8.5 h-8.5 rounded-full flex items-center justify-center text-white font-bold text-xs flex-none" style={{ width: 34, height: 34, background: 'linear-gradient(145deg,#74C69D,#2D6A4F)' }}>
              {profile.full_name?.split(' ').slice(-2).map((w) => w[0]).join('').toUpperCase()}
            </div>
            <div>
              <div className="text-xs font-bold">{profile.full_name}</div>
              <div className="text-[11px] text-white/55">Giáo viên</div>
            </div>
          </div>
          <button onClick={handleLogout} className="mt-1.5 w-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold py-2 rounded-lg">Đăng xuất</button>
        </div>
      </div>

      {/* mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-20 bg-forest-800 text-white px-4 py-3 flex items-center justify-between">
        <div className="font-display font-bold text-sm">🌱 Green Passport — Giáo viên</div>
        <button onClick={handleLogout} className="text-xs bg-white/15 px-2.5 py-1 rounded-lg">Đăng xuất</button>
      </div>

      <div className="flex-1">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 pt-16 md:pt-8 pb-16">
          {/* mobile tabs */}
          <div className="md:hidden flex gap-2 overflow-x-auto mb-5 pb-1">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => { setTab(t.id); setSelectedStudent(null); }}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold ${tab === t.id ? 'bg-forest-700 text-white' : 'bg-sand-100 text-ink-600'}`}>
                {t.ic} {t.label}
              </button>
            ))}
          </div>

          {tab === 'dashboard' && <DashboardTab kpi={kpi} pendingActions={pendingActions} onGotoEvidence={() => setTab('evidence')} />}
          {tab === 'students' && !selectedStudent && <StudentsTab students={students} onOpen={openStudent} />}
          {tab === 'students' && selectedStudent && (
            <StudentDetail student={selectedStudent} actions={studentActions} onBack={() => setSelectedStudent(null)}
              onConfirm={confirmAction} onRequestMore={requestMoreAction} />
          )}
          {tab === 'evidence' && <EvidenceTab pendingActions={pendingActions} onConfirm={confirmAction} onRequestMore={requestMoreAction} />}
          {tab === 'challenges' && <ChallengesTab students={students} />}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-forest-800 text-white px-5 py-3 rounded-full text-sm font-semibold shadow-lg">✅ {toast}</div>
      )}
    </div>
  );
}

/* ---------------- Sub views ---------------- */

function SectionTitle({ text }) {
  return <h2 className="font-display font-bold text-xl mb-1">{text}</h2>;
}

function DashboardTab({ kpi, pendingActions, onGotoEvidence }) {
  return (
    <div>
      <SectionTitle text="👩‍🏫 Teacher Dashboard" />
      <p className="text-sm text-ink-600 mb-5">Tổng quan hành trình 30 ngày xanh — dữ liệu thật từ Supabase.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-6">
        <Kpi icon="🧑‍🎓" num={kpi.total} lbl="Học sinh" bg="#DDF2E6" />
        <Kpi icon="✅" num={kpi.withProgress} lbl="Đã bắt đầu" bg="#FBEBCF" />
        <Kpi icon="🖼️" num={kpi.pendingCount} lbl="Chờ xác nhận" bg="#E4E9F5" />
        <Kpi icon="🔥" num={kpi.keeping} lbl="Streak ≥ 3" bg="#FBE3E3" />
      </div>
      <div className="bg-white rounded-2xl shadow p-4.5">
        <div className="text-sm font-bold mb-3">🖼️ Minh chứng chờ xác nhận gần đây</div>
        {pendingActions.length === 0 && <div className="text-xs text-ink-600">Không có minh chứng nào đang chờ 🎉</div>}
        {pendingActions.slice(0, 5).map((a) => (
          <div key={a.id} className="flex items-center gap-3 py-2.5 border-b border-sand-100 last:border-0">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-leaf-100 text-lg flex-none">{CHALLENGES[a.challenge_id]?.icon || '🌱'}</div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold truncate">{a.full_name}</div>
              <div className="text-[11px] text-ink-600">Ngày {a.day_number} · {CHALLENGES[a.challenge_id]?.name}</div>
            </div>
          </div>
        ))}
        {pendingActions.length > 0 && (
          <button onClick={onGotoEvidence} className="mt-3 w-full border border-sand-100 rounded-lg py-2 text-xs font-bold">Xem tất cả</button>
        )}
      </div>
    </div>
  );
}
function Kpi({ icon, num, lbl, bg }) {
  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <div className="w-8.5 h-8.5 rounded-lg flex items-center justify-center text-base mb-2" style={{ width: 34, height: 34, background: bg }}>{icon}</div>
      <div className="font-display font-extrabold text-xl">{num}</div>
      <div className="text-[11.5px] text-ink-600">{lbl}</div>
    </div>
  );
}

function StudentsTab({ students, onOpen }) {
  return (
    <div>
      <SectionTitle text="🧑‍🎓 Danh sách học sinh" />
      <p className="text-sm text-ink-600 mb-4">Bấm vào một học sinh để xem chi tiết & xác nhận minh chứng.</p>
      <div className="bg-white rounded-2xl shadow overflow-hidden">
        {students.length === 0 && <div className="p-4 text-sm text-ink-600">Chưa có học sinh nào đăng ký.</div>}
        {students.map((s) => {
          const ch = CHALLENGES[s.challenge_id] || CHALLENGES.plastic;
          return (
            <div key={s.id} onClick={() => onOpen(s)}
              className="flex items-center gap-3 px-4 py-3 border-b border-sand-100 last:border-0 cursor-pointer hover:bg-sand-50">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs flex-none" style={{ background: 'linear-gradient(145deg,#74C69D,#2D6A4F)' }}>
                {s.full_name?.split(' ').slice(-2).map((w) => w[0]).join('').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate">{s.full_name}</div>
                <div className="text-[11px] text-ink-600">{ch.icon} {ch.name} · Ngày {s.current_day}/30 · 🔥 {s.streak}</div>
              </div>
              <div className="text-xs text-ink-400">Xem →</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StudentDetail({ student, actions, onBack, onConfirm, onRequestMore }) {
  const ch = CHALLENGES[student.challenge_id] || CHALLENGES.plastic;
  return (
    <div>
      <button onClick={onBack} className="text-xs text-ink-600 font-semibold mb-3">← Quay lại danh sách</button>
      <SectionTitle text={student.full_name} />
      <span className="inline-flex items-center gap-1 bg-sand-100 text-ink-600 text-[11px] font-bold px-2.5 py-1 rounded-full mt-1">{ch.icon} {ch.name}</span>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 mb-6">
        <Kpi icon="📅" num={`${student.current_day}/30`} lbl="Ngày" bg="#DDF2E6" />
        <Kpi icon="🔥" num={student.streak} lbl="Streak" bg="#FBEBCF" />
        <Kpi icon="📷" num={student.evidence_count} lbl="Minh chứng" bg="#E4E9F5" />
        <Kpi icon="✅" num={actions.filter((a) => a.status === 'confirmed').length} lbl="Đã xác nhận" bg="#FBE3E3" />
      </div>
      <div className="text-sm font-bold mb-2.5">Lịch sử gần đây</div>
      <div className="bg-white rounded-2xl shadow overflow-hidden">
        {actions.length === 0 && <div className="p-4 text-sm text-ink-600">Chưa có hành động nào được ghi nhận.</div>}
        {actions.map((a) => (
          <div key={a.id} className="flex items-center gap-3 px-4 py-3 border-b border-sand-100 last:border-0">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold">Ngày {a.day_number} · {a.action_text}</div>
              {a.note && <div className="text-[11px] text-ink-600 mt-0.5">Ghi chú: "{a.note}"</div>}
              <StatusChip status={a.status} />
            </div>
            {a.status === 'done' && (
              <div className="flex gap-1.5 flex-none">
                <button onClick={() => onConfirm(a.id)} className="bg-leaf-500 text-forest-900 text-[11.5px] font-bold px-2.5 py-1.5 rounded-lg">✅ Xác nhận</button>
                <button onClick={() => onRequestMore(a.id)} className="border border-sand-100 text-[11.5px] font-bold px-2.5 py-1.5 rounded-lg">↻ Bổ sung</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
function StatusChip({ status }) {
  const map = {
    confirmed: { t: '🔵 Đã xác nhận', c: 'bg-leaf-100 text-forest-700' },
    done: { t: '🟡 Chờ xác nhận', c: 'bg-amber-100 text-[#8a5a12]' },
    needs: { t: '🟠 Cần bổ sung', c: 'bg-amber-100 text-[#8a5a12]' },
  };
  const s = map[status] || map.done;
  return <span className={`inline-block text-[10.5px] font-bold px-2 py-0.5 rounded-full mt-1 ${s.c}`}>{s.t}</span>;
}

function EvidenceTab({ pendingActions, onConfirm, onRequestMore }) {
  return (
    <div>
      <SectionTitle text="🖼️ Xác nhận minh chứng" />
      <p className="text-sm text-ink-600 mb-4">{pendingActions.length} minh chứng đang chờ xác nhận.</p>
      <div className="bg-white rounded-2xl shadow overflow-hidden">
        {pendingActions.length === 0 && <div className="p-4 text-sm text-ink-600">Không có minh chứng nào đang chờ 🎉</div>}
        {pendingActions.map((a) => (
          <div key={a.id} className="flex items-center gap-3 px-4 py-3 border-b border-sand-100 last:border-0">
            <div className="w-11 h-11 rounded-lg flex items-center justify-center bg-leaf-100 text-lg flex-none">{CHALLENGES[a.challenge_id]?.icon || '🌱'}</div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold">{a.full_name}</div>
              <div className="text-[11px] text-ink-600">Ngày {a.day_number} · {CHALLENGES[a.challenge_id]?.name} · "{a.action_text}"</div>
              {a.note && <div className="text-[10.5px] text-ink-400 mt-0.5">Ghi chú: {a.note}</div>}
            </div>
            <div className="flex gap-1.5 flex-none">
              <button onClick={() => onConfirm(a.id)} className="bg-leaf-500 text-forest-900 text-[11.5px] font-bold px-2.5 py-1.5 rounded-lg">✅ Xác nhận</button>
              <button onClick={() => onRequestMore(a.id)} className="border border-sand-100 text-[11.5px] font-bold px-2.5 py-1.5 rounded-lg">↻ Bổ sung</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChallengesTab({ students }) {
  return (
    <div>
      <SectionTitle text="🎯 Dashboard theo thử thách" />
      <p className="text-sm text-ink-600 mb-4">Số học sinh đang tham gia mỗi thử thách (theo hồ sơ đã đăng ký).</p>
      <div className="grid md:grid-cols-2 gap-3.5">
        {Object.values(CHALLENGES).map((ch) => {
          const count = students.filter((s) => (s.challenge_id || 'plastic') === ch.id).length;
          return (
            <div key={ch.id} className="bg-white rounded-2xl shadow p-4.5">
              <span className="inline-flex items-center gap-1 bg-leaf-100 text-forest-700 text-[11.5px] font-bold px-2.5 py-1 rounded-full">{ch.icon} {ch.name}</span>
              <div className="font-display font-bold text-sm mt-2">{ch.title}</div>
              <div className="flex justify-between text-[12.5px] py-1.5 border-b border-dashed border-sand-100 mt-2">
                <span className="text-ink-600 font-semibold">Dữ liệu ban đầu</span><span className="font-bold">{ch.baseline} {ch.unit}</span>
              </div>
              <div className="flex justify-between text-[12.5px] py-1.5 border-b border-dashed border-sand-100">
                <span className="text-ink-600 font-semibold">Mục tiêu</span><span className="font-bold">≤ {ch.target} {ch.unit}</span>
              </div>
              <div className="flex justify-between text-[12.5px] py-1.5">
                <span className="text-ink-600 font-semibold">Học sinh tham gia</span><span className="font-bold">{count}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-[11.5px] text-ink-400 mt-4">
        Ghi chú: số liệu "hiện tại" cần khảo sát thật (post-survey) để tính chính xác — hiện đang hiển thị số học sinh cam kết theo thử thách.
      </div>
    </div>
  );
}
