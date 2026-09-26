'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

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
  const [challenges, setChallenges] = useState([]);    // danh sách thử thách lấy trực tiếp từ Supabase
  const [challengeModal, setChallengeModal] = useState(null); // null = đóng, 'new' = thêm mới, object = đang sửa
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

    const actionIds = (actions || []).map((a) => a.id);
    let evidenceMap = {};
    if (actionIds.length > 0) {
      const { data: evidenceRows } = await supabase.from('evidence').select('*').in('daily_action_id', actionIds);
      (evidenceRows || []).forEach((e) => { evidenceMap[e.daily_action_id] = e.file_path; });
    }
    const pending = (actions || []).map((a) => ({
      ...a,
      full_name: userMap[a.student_id]?.full_name || '(chưa rõ tên)',
      photo_path: evidenceMap[a.id] || null,
    }));
    setPendingActions(pending);

    // Lấy danh sách thử thách (nguồn dữ liệu thật, giáo viên có thể sửa trực tiếp)
    const { data: chRows } = await supabase.from('challenges').select('*').order('name');
    setChallenges(chRows || []);
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
    const actionIds = (data || []).map((a) => a.id);
    let evidenceMap = {};
    if (actionIds.length > 0) {
      const { data: evidenceRows } = await supabase.from('evidence').select('*').in('daily_action_id', actionIds);
      (evidenceRows || []).forEach((e) => { evidenceMap[e.daily_action_id] = e.file_path; });
    }
    setStudentActions((data || []).map((a) => ({ ...a, photo_path: evidenceMap[a.id] || null })));
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

  async function saveChallenge(payload, isNew) {
    if (isNew) {
      const { error } = await supabase.from('challenges').insert(payload);
      if (error) { showToast('Lỗi tạo thử thách: ' + error.message); return; }
      showToast('Đã thêm thử thách mới!');
    } else {
      const { id, ...rest } = payload;
      const { error } = await supabase.from('challenges').update(rest).eq('id', id);
      if (error) { showToast('Lỗi cập nhật: ' + error.message); return; }
      showToast('Đã cập nhật thử thách.');
    }
    setChallengeModal(null);
    await loadData();
  }

  async function deleteChallenge(id) {
    const { error } = await supabase.from('challenges').delete().eq('id', id);
    if (error) { showToast('Không thể xoá — có thể đang được học sinh sử dụng.'); return; }
    showToast('Đã xoá thử thách.');
    setChallengeModal(null);
    await loadData();
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

  const challengesMap = {};
  challenges.forEach((c) => { challengesMap[c.id] = c; });
  const fallbackCh = { icon: '🌱', name: 'Chưa rõ', title: '', unit: '', baseline: '-', target: '-' };

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

          {tab === 'dashboard' && <DashboardTab kpi={kpi} pendingActions={pendingActions} challengesMap={challengesMap} fallbackCh={fallbackCh} onGotoEvidence={() => setTab('evidence')} />}
          {tab === 'students' && !selectedStudent && <StudentsTab students={students} challengesMap={challengesMap} fallbackCh={fallbackCh} onOpen={openStudent} />}
          {tab === 'students' && selectedStudent && (
            <StudentDetail student={selectedStudent} actions={studentActions} challengesMap={challengesMap} fallbackCh={fallbackCh} onBack={() => setSelectedStudent(null)}
              onConfirm={confirmAction} onRequestMore={requestMoreAction} />
          )}
          {tab === 'evidence' && <EvidenceTab pendingActions={pendingActions} challengesMap={challengesMap} fallbackCh={fallbackCh} onConfirm={confirmAction} onRequestMore={requestMoreAction} />}
          {tab === 'challenges' && (
            <ChallengesTab challenges={challenges} students={students} onSave={saveChallenge} onDelete={deleteChallenge} />
          )}
        </div>
      </div>


      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-forest-800 text-white px-5 py-3 rounded-full text-sm font-semibold shadow-lg">✅ {toast}</div>
      )}
    </div>
  );
}

/* ---------------- Sub views ---------------- */

function getPhotoUrl(filePath) {
  if (!filePath) return null;
  const { data } = supabase.storage.from('evidence').getPublicUrl(filePath);
  return data?.publicUrl || null;
}

function EvidenceThumb({ photoPath, fallbackIcon }) {
  const url = getPhotoUrl(photoPath);
  if (!url) {
    return <div className="w-11 h-11 rounded-lg flex items-center justify-center bg-leaf-100 text-lg flex-none">{fallbackIcon}</div>;
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="flex-none">
      <img src={url} alt="Ảnh minh chứng" className="w-11 h-11 rounded-lg object-cover border border-sand-100" />
    </a>
  );
}

function SectionTitle({ text }) {
  return <h2 className="font-display font-bold text-xl mb-1">{text}</h2>;
}

function DashboardTab({ kpi, pendingActions, challengesMap, fallbackCh, onGotoEvidence }) {
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
        {pendingActions.slice(0, 5).map((a) => {
          const ch = challengesMap[a.challenge_id] || fallbackCh;
          return (
          <div key={a.id} className="flex items-center gap-3 py-2.5 border-b border-sand-100 last:border-0">
            <EvidenceThumb photoPath={a.photo_path} fallbackIcon={ch.icon} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold truncate">{a.full_name}</div>
              <div className="text-[11px] text-ink-600">Ngày {a.day_number} · {ch.name}</div>
            </div>
          </div>
          );
        })}
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

function StudentsTab({ students, challengesMap, fallbackCh, onOpen }) {
  return (
    <div>
      <SectionTitle text="🧑‍🎓 Danh sách học sinh" />
      <p className="text-sm text-ink-600 mb-4">Bấm vào một học sinh để xem chi tiết & xác nhận minh chứng.</p>
      <div className="bg-white rounded-2xl shadow overflow-hidden">
        {students.length === 0 && <div className="p-4 text-sm text-ink-600">Chưa có học sinh nào đăng ký.</div>}
        {students.map((s) => {
          const ch = challengesMap[s.challenge_id] || fallbackCh;
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

function StudentDetail({ student, actions, challengesMap, fallbackCh, onBack, onConfirm, onRequestMore }) {
  const ch = challengesMap[student.challenge_id] || fallbackCh;
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
            <EvidenceThumb photoPath={a.photo_path} fallbackIcon={ch.icon} />
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

function EvidenceTab({ pendingActions, challengesMap, fallbackCh, onConfirm, onRequestMore }) {
  return (
    <div>
      <SectionTitle text="🖼️ Xác nhận minh chứng" />
      <p className="text-sm text-ink-600 mb-4">{pendingActions.length} minh chứng đang chờ xác nhận.</p>
      <div className="bg-white rounded-2xl shadow overflow-hidden">
        {pendingActions.length === 0 && <div className="p-4 text-sm text-ink-600">Không có minh chứng nào đang chờ 🎉</div>}
        {pendingActions.map((a) => {
          const ch = challengesMap[a.challenge_id] || fallbackCh;
          return (
          <div key={a.id} className="flex items-center gap-3 px-4 py-3 border-b border-sand-100 last:border-0">
            <EvidenceThumb photoPath={a.photo_path} fallbackIcon={ch.icon} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold">{a.full_name}</div>
              <div className="text-[11px] text-ink-600">Ngày {a.day_number} · {ch.name} · "{a.action_text}"</div>
              {a.note && <div className="text-[10.5px] text-ink-400 mt-0.5">Ghi chú: {a.note}</div>}
            </div>
            <div className="flex gap-1.5 flex-none">
              <button onClick={() => onConfirm(a.id)} className="bg-leaf-500 text-forest-900 text-[11.5px] font-bold px-2.5 py-1.5 rounded-lg">✅ Xác nhận</button>
              <button onClick={() => onRequestMore(a.id)} className="border border-sand-100 text-[11.5px] font-bold px-2.5 py-1.5 rounded-lg">↻ Bổ sung</button>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

const CH_TINTS = ['bg-sand-100', 'bg-mint-100', 'bg-leaf-100', 'bg-[#F1ECFB]', 'bg-[#EEF8E2]'];

function ChallengesTab({ challenges, students, onSave, onDelete }) {
  const [selectedId, setSelectedId] = useState(challenges[0]?.id || null);
  const [creatingNew, setCreatingNew] = useState(false);

  const joinedCount = (chId) => students.filter((s) => (s.challenge_id || null) === chId).length;
  const totalJoined = challenges.reduce((sum, c) => sum + joinedCount(c.id), 0);
  const needsCount = challenges.filter((c) => joinedCount(c.id) === 0).length;
  const selected = creatingNew ? null : challenges.find((c) => c.id === selectedId) || null;

  // Nếu thử thách đang chọn không còn tồn tại nữa (vừa bị xoá), tự chọn lại thử thách đầu tiên
  useEffect(() => {
    if (!creatingNew && selectedId && !challenges.some((c) => c.id === selectedId)) {
      setSelectedId(challenges[0]?.id || null);
    }
  }, [challenges, selectedId, creatingNew]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3.5 mb-1">
        <div>
          <SectionTitle text="🎯 Dashboard theo thử thách" />
          <p className="text-[13.5px] text-ink-600 mt-1">Chọn 1 thử thách bên trái để sửa ngay bên phải — không cần cuộn qua danh sách dài.</p>
        </div>
        <button onClick={() => { setCreatingNew(true); setSelectedId(null); }}
          className="flex-none inline-flex items-center gap-1.5 bg-gradient-to-br from-leaf-500 to-forest-700 text-white text-[13.5px] font-bold px-4 py-2.5 rounded-xl whitespace-nowrap shadow-[0_10px_22px_-10px_rgba(35,143,110,.55)]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          Thêm thử thách
        </button>
      </div>

      <div className="flex flex-wrap gap-2 my-4">
        <span className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-white shadow-card text-[13px] font-semibold">📋 <b className="font-extrabold text-[14.5px]">{challenges.length}</b> thử thách</span>
        <span className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-white shadow-card text-[13px] font-semibold">🙋 <b className="font-extrabold text-[14.5px]">{totalJoined}</b> học sinh đã tham gia</span>
        {needsCount > 0 && (
          <span className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-honey-soft text-[#A8691F] text-[13px] font-semibold">⚠️ <b className="font-extrabold text-[14.5px]">{needsCount}</b> chưa có ai tham gia</span>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-[280px_minmax(0,1fr)] items-start">
        <div className="bg-white rounded-[22px] p-2 shadow-card max-h-[560px] overflow-y-auto" role="listbox" aria-label="Danh sách thử thách">
          {challenges.length === 0 && !creatingNew && <div className="text-sm text-ink-600 p-3">Chưa có thử thách nào.</div>}
          {challenges.map((ch, i) => {
            const n = joinedCount(ch.id);
            const active = !creatingNew && ch.id === selectedId;
            return (
              <button key={ch.id} type="button" role="option" aria-selected={active}
                onClick={() => { setCreatingNew(false); setSelectedId(ch.id); }}
                className={`w-full flex items-center gap-2.5 p-2.5 rounded-[15px] text-left transition-colors ${active ? 'bg-leaf-100' : 'hover:bg-sand-50'}`}>
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-none ${CH_TINTS[i % CH_TINTS.length]}`}>{ch.icon}</span>
                <span className="flex-1 min-w-0">
                  <b className="block text-[13.5px] font-bold truncate">{ch.title || '(Chưa có tiêu đề)'}</b>
                  <span className="block text-[11.5px] text-ink-600 truncate">{ch.name}</span>
                </span>
                <span className={`w-[9px] h-[9px] rounded-full flex-none ${n ? 'bg-leaf-500' : 'bg-amber-400'}`} title={n ? 'Đã có học sinh tham gia' : 'Chưa có học sinh'} />
              </button>
            );
          })}
        </div>

        <ChallengePanel
          key={creatingNew ? 'new' : selectedId}
          initial={selected}
          joinedCount={selected ? joinedCount(selected.id) : 0}
          onSave={async (payload, isNew) => { await onSave(payload, isNew); if (isNew) { setCreatingNew(false); setSelectedId(payload.id); } }}
          onDelete={async (id) => { await onDelete(id); setCreatingNew(false); setSelectedId(null); }}
          onCancelNew={() => { setCreatingNew(false); setSelectedId(challenges[0]?.id || null); }}
        />
      </div>

      <div className="text-[11.5px] text-ink-400 mt-4">
        Ghi chú: số liệu "hiện tại" cần khảo sát thật (post-survey) để tính chính xác — hiện đang hiển thị số học sinh cam kết theo thử thách.
      </div>
    </div>
  );
}

function ChallengePanel({ initial, joinedCount, onSave, onDelete, onCancelNew }) {
  const isNew = !initial;
  const [id, setId] = useState(initial?.id || '');
  const [icon, setIcon] = useState(initial?.icon || '🌱');
  const [name, setName] = useState(initial?.name || '');
  const [title, setTitle] = useState(initial?.title || '');
  const [baselineLabel, setBaselineLabel] = useState(initial?.baseline_label || '');
  const [unit, setUnit] = useState(initial?.unit || '');
  const [baseline, setBaseline] = useState(initial?.baseline ?? '');
  const [target, setTarget] = useState(initial?.target ?? '');
  const [actionsText, setActionsText] = useState((initial?.actions || []).join('\n'));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savedTick, setSavedTick] = useState(false);

  // Hướng mục tiêu (tăng/giảm) suy trực tiếp từ 2 số, không cần lưu thêm cột trong Supabase
  const goingDown = Number(target) < Number(baseline);

  async function handleSave() {
    if (!id.trim() || !name.trim()) return;
    setSaving(true);
    await onSave({
      id: id.trim(),
      icon: icon.trim() || '🌱',
      name: name.trim(),
      title: title.trim(),
      baseline_label: baselineLabel.trim(),
      unit: unit.trim(),
      baseline: baseline === '' ? null : Number(baseline),
      target: target === '' ? null : Number(target),
      actions: actionsText.split('\n').map((s) => s.trim()).filter(Boolean),
    }, isNew);
    setSaving(false);
    if (!isNew) { setSavedTick(true); setTimeout(() => setSavedTick(false), 1500); }
  }

  if (!initial && !isNew) return null; // an toàn: chưa có gì để hiển thị

  return (
    <section className="bg-white rounded-3xl p-5 sm:p-6 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <input value={icon} onChange={(e) => setIcon(e.target.value)} aria-label="Icon"
            className="w-11 h-11 flex-none rounded-2xl bg-sand-100 text-xl text-center border-0 focus:ring-2 focus:ring-leaf-500" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên nhóm (vd: Energy Detective)"
            className="min-w-0 flex-1 font-bold text-sm border-0 bg-transparent px-0 focus:ring-0" />
        </div>
        {!isNew && (
          confirmDelete ? (
            <div className="flex-none flex items-center gap-1.5">
              <button onClick={() => onDelete(initial.id)} className="text-[12px] font-bold text-white bg-red-600 px-2.5 py-1.5 rounded-lg">Xác nhận xoá</button>
              <button onClick={() => setConfirmDelete(false)} className="text-[12px] font-bold text-ink-600 bg-sand-100 px-2.5 py-1.5 rounded-lg">Huỷ</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="flex-none text-[12.5px] font-bold text-red-600 bg-red-50 px-3 py-2 rounded-[11px]">🗑️ Xoá</button>
          )
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mt-4">
        {isNew && (
          <Field label="Mã định danh (id, không dấu, không trùng)">
            <input value={id} onChange={(e) => setId(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
              placeholder="vd: energy" className="w-full border border-sand-100 rounded-xl px-3 py-2.5 text-sm" />
          </Field>
        )}
        <Field label={isNew ? 'Tiêu đề hiển thị' : 'Tiêu đề thử thách'}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ví dụ: Mỗi người một bình nước"
            className="w-full border border-sand-100 rounded-xl px-3 py-2.5 text-sm" />
        </Field>
        <Field label="Mô tả chỉ số">
          <input value={baselineLabel} onChange={(e) => setBaselineLabel(e.target.value)} placeholder="vd: Số chai nhựa dùng 1 lần / ngày"
            className="w-full border border-sand-100 rounded-xl px-3 py-2.5 text-sm" />
        </Field>
        <Field label="Đơn vị">
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="lần/ngày, %..."
            className="w-full border border-sand-100 rounded-xl px-3 py-2.5 text-sm" />
        </Field>
        <Field label="Số liệu ban đầu">
          <input type="number" value={baseline} onChange={(e) => setBaseline(e.target.value)}
            className="w-full border border-sand-100 rounded-xl px-3 py-2.5 text-sm" />
        </Field>
        <Field label="Mục tiêu">
          <input type="number" value={target} onChange={(e) => setTarget(e.target.value)}
            className="w-full border border-sand-100 rounded-xl px-3 py-2.5 text-sm" />
        </Field>
      </div>

      {baseline !== '' && target !== '' && (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mt-4 px-4 py-3 rounded-2xl bg-sand-50">
          <div><span className="block text-[11px] text-ink-600">Ban đầu</span><b className="text-lg font-extrabold">{baseline}<em className="not-italic text-[11.5px] font-medium text-ink-600 ml-1">{unit}</em></b></div>
          <span className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-leaf-500">→</span>
          <div className="text-right"><span className="block text-[11px] text-ink-600">Mục tiêu</span><b className="text-lg font-extrabold text-forest-700">{goingDown ? '≤ ' : '≥ '}{target}<em className="not-italic text-[11.5px] font-medium text-ink-600 ml-1">{unit}</em></b></div>
        </div>
      )}

      <div className="mt-3">
        <Field label="Danh sách hành động gợi ý (mỗi dòng 1 hành động)">
          <textarea rows={3} value={actionsText} onChange={(e) => setActionsText(e.target.value)}
            className="w-full border border-sand-100 rounded-xl px-3 py-2.5 text-sm resize-none" />
        </Field>
      </div>

      <div className="flex items-center justify-between gap-3 mt-5 flex-wrap">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-bold ${isNew ? 'bg-sand-100 text-ink-600' : joinedCount ? 'bg-leaf-100 text-forest-700' : 'bg-honey-soft text-[#A8691F]'}`}>
          {isNew ? 'Chưa lưu' : joinedCount ? `🙋 ${joinedCount} học sinh tham gia` : '⚠️ Chưa có học sinh'}
        </span>
        <div className="flex items-center gap-3">
          {savedTick && <span className="text-[12.5px] font-bold text-forest-700">✓ Đã lưu</span>}
          {isNew && <button onClick={onCancelNew} className="text-[13px] font-bold text-ink-600 px-3 py-2">Huỷ</button>}
          <button onClick={handleSave} disabled={saving || !id.trim() || !name.trim()}
            className="bg-gradient-to-br from-leaf-500 to-forest-700 text-white font-bold rounded-xl px-5 py-2.5 text-sm disabled:opacity-50">
            {saving ? 'Đang lưu...' : isNew ? '🌱 Tạo thử thách' : '💾 Lưu thay đổi'}
          </button>
        </div>
      </div>
    </section>
  );
}

function ChallengeFormModal({ initial, onClose, onSave, onDelete }) {
  const isNew = !initial;
  const [id, setId] = useState(initial?.id || '');
  const [icon, setIcon] = useState(initial?.icon || '🌱');
  const [name, setName] = useState(initial?.name || '');
  const [title, setTitle] = useState(initial?.title || '');
  const [baselineLabel, setBaselineLabel] = useState(initial?.baseline_label || '');
  const [unit, setUnit] = useState(initial?.unit || '');
  const [baseline, setBaseline] = useState(initial?.baseline ?? '');
  const [target, setTarget] = useState(initial?.target ?? '');
  const [actionsText, setActionsText] = useState((initial?.actions || []).join('\n'));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleSave() {
    if (!id.trim() || !name.trim()) return;
    setSaving(true);
    await onSave({
      id: id.trim(),
      icon: icon.trim() || '🌱',
      name: name.trim(),
      title: title.trim(),
      baseline_label: baselineLabel.trim(),
      unit: unit.trim(),
      baseline: baseline === '' ? null : Number(baseline),
      target: target === '' ? null : Number(target),
      actions: actionsText.split('\n').map((s) => s.trim()).filter(Boolean),
    }, isNew);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 bg-forest-900/55 flex items-end sm:items-center justify-center backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[88vh] overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-base">{isNew ? '➕ Thêm thử thách mới' : '✎ Sửa thử thách'}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-sand-100 text-xs">✕</button>
        </div>

        <div className="grid grid-cols-[70px_1fr] gap-2.5 mb-3">
          <Field label="Icon">
            <input value={icon} onChange={(e) => setIcon(e.target.value)} className="w-full border border-sand-100 rounded-lg px-2.5 py-2 text-center text-lg" />
          </Field>
          <Field label="Mã định danh (id, không dấu, không trùng)">
            <input value={id} onChange={(e) => setId(e.target.value.toLowerCase().replace(/\s+/g, '_'))} disabled={!isNew}
              placeholder="vd: energy" className="w-full border border-sand-100 rounded-lg px-2.5 py-2 text-sm disabled:bg-sand-50 disabled:text-ink-400" />
          </Field>
        </div>

        <Field label="Tên thử thách (vd: Energy Detective)">
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-sand-100 rounded-lg px-2.5 py-2 text-sm mb-3" />
        </Field>
        <Field label="Tiêu đề hiển thị (vd: Cửa đóng – Điện xanh)">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border border-sand-100 rounded-lg px-2.5 py-2 text-sm mb-3" />
        </Field>
        <Field label="Mô tả chỉ số (vd: Số lần quên tắt điện / ngày)">
          <input value={baselineLabel} onChange={(e) => setBaselineLabel(e.target.value)} className="w-full border border-sand-100 rounded-lg px-2.5 py-2 text-sm mb-3" />
        </Field>

        <div className="grid grid-cols-3 gap-2.5 mb-3">
          <Field label="Ban đầu">
            <input type="number" value={baseline} onChange={(e) => setBaseline(e.target.value)} className="w-full border border-sand-100 rounded-lg px-2 py-2 text-sm" />
          </Field>
          <Field label="Mục tiêu">
            <input type="number" value={target} onChange={(e) => setTarget(e.target.value)} className="w-full border border-sand-100 rounded-lg px-2 py-2 text-sm" />
          </Field>
          <Field label="Đơn vị">
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="vd: chai/ngày" className="w-full border border-sand-100 rounded-lg px-2 py-2 text-sm" />
          </Field>
        </div>

        <Field label="Danh sách hành động gợi ý (mỗi dòng 1 hành động)">
          <textarea rows={4} value={actionsText} onChange={(e) => setActionsText(e.target.value)}
            className="w-full border border-sand-100 rounded-lg px-2.5 py-2 text-sm mb-4 resize-none" />
        </Field>

        <button onClick={handleSave} disabled={saving || !id.trim() || !name.trim()}
          className="w-full bg-leaf-500 text-forest-900 font-bold rounded-xl py-3 text-sm disabled:opacity-50">
          {saving ? 'Đang lưu...' : isNew ? '🌱 Tạo thử thách' : '💾 Lưu thay đổi'}
        </button>

        {!isNew && (
          <div className="mt-3">
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} className="w-full text-red-600 text-xs font-bold py-2">🗑️ Xoá thử thách này</button>
            ) : (
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <div className="text-xs text-red-700 font-semibold mb-2">Xoá vĩnh viễn "{initial.name}"? Không thể hoàn tác.</div>
                <div className="flex gap-2">
                  <button onClick={() => onDelete(initial.id)} className="flex-1 bg-red-600 text-white text-xs font-bold py-2 rounded-lg">Xác nhận xoá</button>
                  <button onClick={() => setConfirmDelete(false)} className="flex-1 border border-sand-100 text-xs font-bold py-2 rounded-lg">Huỷ</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-ink-600 mb-1">{label}</label>
      {children}
    </div>
  );
}
