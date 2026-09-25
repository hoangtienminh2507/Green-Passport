'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { CHALLENGES, BADGE_DEFS } from '../../lib/challenges';

const TABS = [
  { id: 'home', ic: '🏠', label: 'Trang chủ' },
  { id: 'journey', ic: '📅', label: 'Hành trình' },
  { id: 'auction', ic: '🏷️', label: 'Green Auction' },
  { id: 'wall', ic: '🌍', label: 'Green Wall' },
  { id: 'meter', ic: '📊', label: 'Green Meter' },
  { id: 'profile', ic: '🎖️', label: 'Hồ sơ' },
];

// Tính "ngày thứ mấy" của học sinh dựa trên ngày thực tế (started_at) thay vì đếm theo số lần gửi minh chứng.
// Nhờ vậy dù học sinh gửi bao nhiêu minh chứng trong cùng 1 ngày thực, hệ thống vẫn chỉ tính là 1 ngày;
// và ngày chỉ thật sự tăng lên khi sang ngày mới theo lịch.
function computeDayNumber(startedAt) {
  if (!startedAt) return 1;
  const start = new Date(startedAt + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today - start) / 86400000);
  return Math.min(30, Math.max(1, diffDays + 1));
}

export default function StudentPage() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);   // hàng trong bảng users
  const [student, setStudent] = useState(null);   // hàng trong bảng students
  const [dailyActions, setDailyActions] = useState([]); // toàn bộ daily_actions của học sinh
  const [commitments, setCommitments] = useState({});   // { challenge_id: 'in' | 'skip' }
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('home');
  const [modalOpen, setModalOpen] = useState(false);
  const [recordChoice, setRecordChoice] = useState(null);
  const [recordChId, setRecordChId] = useState(null); // thử thách đang ghi nhận (chọn từ tab Green Auction)
  const [note, setNote] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [toast, setToast] = useState('');
  const [openDay, setOpenDay] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2600); };

  const loadAll = useCallback(async (userId) => {
    const { data: userRow } = await supabase.from('users').select('*').eq('id', userId).single();
    const { data: studentRow } = await supabase.from('students').select('*').eq('id', userId).single();
    const { data: actions } = await supabase.from('daily_actions').select('*').eq('student_id', userId).order('day_number');
    const { data: commits } = await supabase.from('commitments').select('*').eq('student_id', userId);

    setProfile(userRow || null);
    // Đồng bộ current_day theo ngày thực tế (started_at), phòng trường hợp học sinh không mở app trong vài ngày
    let syncedStudent = studentRow;
    if (studentRow) {
      const realDay = computeDayNumber(studentRow.started_at);
      if (realDay !== studentRow.current_day) {
        await supabase.from('students').update({ current_day: realDay }).eq('id', userId);
        syncedStudent = { ...studentRow, current_day: realDay };
      }
    }
    setStudent(syncedStudent || null);
    setDailyActions(actions || []);
    const commitMap = {};
    (commits || []).forEach((c) => { commitMap[c.challenge_id] = c.choice; });
    setCommitments(commitMap);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.replace('/'); return; }
      setSession(data.session);
      loadAll(data.session.user.id);
    });
  }, [router, loadAll]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  function handlePhotoChange(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
  }

  async function submitEvidence() {
    if (recordChoice === null || !student) return;
    const challengeId = recordChId || student.challenge_id || 'plastic';
    const dayNumber = computeDayNumber(student.started_at); // ngày theo thời gian thực, dùng để hiển thị đúng ô trong hành trình 30 ngày

    setSubmitting(true);
    const ch = CHALLENGES[challengeId];
    const actionText = ch.actions[recordChoice];

    const { data: actionRow, error } = await supabase
      .from('daily_actions')
      .insert({
        student_id: session.user.id,
        challenge_id: challengeId,
        day_number: dayNumber,
        action_text: actionText,
        note: note || null,
        status: 'done',
      })
      .select()
      .single();

    if (error) {
      showToast('Có lỗi khi gửi minh chứng: ' + error.message);
      setSubmitting(false);
      return;
    }

    // Tải ảnh minh chứng thật lên Supabase Storage (bucket "evidence"), nếu có chọn ảnh
    if (photoFile && actionRow) {
      const ext = photoFile.name.split('.').pop() || 'jpg';
      const filePath = `${session.user.id}/day-${dayNumber}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('evidence').upload(filePath, photoFile);
      if (!uploadError) {
        await supabase.from('evidence').insert({
          daily_action_id: actionRow.id,
          file_path: filePath,
        });
      } else {
        showToast('Đã ghi nhận hành động, nhưng lỗi khi tải ảnh: ' + uploadError.message);
      }
    }

    // Mọi lần gửi đều được tính vào tổng số minh chứng (và do đó vẫn cộng vào Green Wall / Green Meter),
    // nhưng streak chỉ tăng thêm 1 lần duy nhất cho mỗi ngày thực — gửi thêm trong cùng ngày không cộng dồn streak.
    const todayStr = new Date().toISOString().slice(0, 10);
    const alreadyCountedToday = student.last_streak_date === todayStr;
    const newStreak = alreadyCountedToday ? (student.streak || 0) : (student.streak || 0) + 1;
    const newEvidence = (student.evidence_count || 0) + 1;

    // current_day giữ nguyên = dayNumber vừa tính (theo ngày thực) — KHÔNG tự +1 nữa,
    // ngày chỉ tăng khi computeDayNumber() tính ra ngày mới ở lần tải trang tiếp theo.
    await supabase.from('students').update({
      streak: newStreak,
      last_streak_date: todayStr,
      current_day: dayNumber,
      evidence_count: newEvidence,
    }).eq('id', session.user.id);

    const earnedBadge = alreadyCountedToday ? null : BADGE_DEFS.find((b) => b.needStreak === newStreak);
    if (earnedBadge) {
      await supabase.from('student_badges').upsert({
        student_id: session.user.id,
        badge_id: earnedBadge.id,
      });
    }

    setModalOpen(false);
    setRecordChoice(null);
    setNote('');
    setPhotoFile(null);
    setPhotoPreview(null);
    setSubmitting(false);
    await loadAll(session.user.id);
    showToast(earnedBadge
      ? `Chúc mừng! Bạn vừa đạt huy hiệu "${earnedBadge.name}"`
      : alreadyCountedToday
        ? 'Đã ghi nhận thêm minh chứng cho hôm nay!'
        : 'Ngày hôm nay đã được ghi nhận!');
  }

  async function setCommitment(challengeId, choice) {
    await supabase.from('commitments').upsert({
      student_id: session.user.id,
      challenge_id: challengeId,
      choice,
    }, { onConflict: 'student_id,challenge_id' });
    setCommitments((prev) => ({ ...prev, [challengeId]: choice }));
    showToast(choice === 'in' ? 'Bạn đã tham gia thử thách!' : 'Đã ghi nhận — bạn có thể tham gia sau.');
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-ink-600">Đang tải dữ liệu...</div>;
  }
  if (!student || !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-6">
        <div className="text-lg font-bold">Chưa tìm thấy hồ sơ học sinh</div>
        <div className="text-sm text-ink-600 max-w-sm">
          Tài khoản này chưa có dữ liệu trong bảng <code>users</code> / <code>students</code>.
          Hãy kiểm tra lại bước tạo hồ sơ sau khi đăng ký, hoặc thêm thủ công trong Supabase Dashboard.
        </div>
        <button onClick={handleLogout} className="mt-2 bg-forest-700 text-white px-4 py-2 rounded-lg text-sm font-bold">Đăng xuất</button>
      </div>
    );
  }

  const challengeId = student.challenge_id || 'plastic';
  const ch = CHALLENGES[challengeId];
  const progress = Math.round(((student.current_day || 1) / 30) * 100);
  const today = dailyActions.find((d) => d.day_number === student.current_day);
  const doneToday = !!today;
  const dayMap = {};
  dailyActions.forEach((d) => { dayMap[d.day_number] = d; });

  return (
    <div className="min-h-screen flex flex-col">
      <div className="sticky top-0 z-20 text-white"
           style={{ background: 'linear-gradient(100deg,#1D4A3E,#2B7461)', paddingTop: 'env(safe-area-inset-top,0px)' }}>
        <div className="mx-auto flex h-[62px] w-full max-w-[1120px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 text-[18px]" aria-hidden="true">🌱</span>
            <span className="font-display text-[17px] font-bold tracking-tight">Green Passport</span>
          </div>
          <button onClick={handleLogout} aria-label="Đăng xuất"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-sm transition-colors hover:bg-white/25">⏻</button>
        </div>
      </div>

      <div className="flex-1 flex justify-center">
        <div className="w-full max-w-[1120px] px-4 py-6 pb-24 sm:px-6">

          {/* desktop tabs */}
          <div className="hidden md:flex gap-1 bg-white p-1.5 rounded-[18px] shadow-card mb-8">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-1 px-4 py-2.5 rounded-[13px] text-sm flex items-center justify-center gap-2 whitespace-nowrap transition-colors ${tab === t.id ? 'bg-leaf-100 text-forest-700 font-bold' : 'text-ink-600 font-medium hover:bg-sand-100'}`}>
                <span aria-hidden="true">{t.ic}</span> {t.label}
              </button>
            ))}
          </div>

          {tab === 'home' && (
            <HomeTab profile={profile} student={student} progress={progress} commitments={commitments}
              dailyActions={dailyActions} onGoAuction={() => setTab('auction')} />
          )}
          {tab === 'journey' && (
            <JourneyTab student={student} dayMap={dayMap} openDay={openDay} setOpenDay={setOpenDay} />
          )}
          {tab === 'auction' && (
            <AuctionTab commitments={commitments} setCommitment={setCommitment} student={student} dailyActions={dailyActions}
              onRecord={(id) => { setRecordChId(id); setRecordChoice(null); setModalOpen(true); }} />
          )}
          {tab === 'wall' && <WallTab />}
          {tab === 'meter' && <MeterTab />}
          {tab === 'profile' && <ProfileTab profile={profile} student={student} onLogout={handleLogout} />}
        </div>
      </div>

      {/* bottom nav (mobile) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-sand-100 flex justify-around py-2 pb-[calc(8px+env(safe-area-inset-bottom,0px))]">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex flex-col items-center gap-0.5 text-[10.5px] font-semibold px-2 py-1 rounded-lg ${tab === t.id ? 'text-forest-700' : 'text-ink-400'}`}>
            <span className="text-lg">{t.ic}</span>{t.label}
          </button>
        ))}
      </div>

      {modalOpen && (
        <RecordModal
          ch={CHALLENGES[recordChId] || ch} dayNumber={student.current_day} recordChoice={recordChoice} setRecordChoice={setRecordChoice}
          note={note} setNote={setNote}
          photoPreview={photoPreview} onPhotoChange={handlePhotoChange}
          onClose={() => { setModalOpen(false); setPhotoFile(null); setPhotoPreview(null); }}
          onSubmit={submitEvidence} submitting={submitting}
        />
      )}

      {toast && (
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-forest-800 text-white px-5 py-3 rounded-full text-sm font-semibold shadow-lg">
          ✅ {toast}
        </div>
      )}
    </div>
  );
}

/* ---------------- Sub-components ---------------- */

function HomeTab({ profile, student, progress, commitments, dailyActions, onGoAuction }) {
  const joined = Object.values(CHALLENGES).filter((c) => commitments[c.id] === 'in');
  const countOf = (id) => dailyActions.filter((d) => d.challenge_id === id).length;
  const initials = (profile.full_name || '').split(' ').slice(-2).map((w) => w[0]).join('').toUpperCase();
  const streak = student.streak || 0;
  const nextBadge = BADGE_DEFS.find((b) => b.needStreak > streak);
  const nextPct = nextBadge ? Math.min(100, Math.round((streak / nextBadge.needStreak) * 100)) : 100;

  return (
    <div className="grid items-start gap-6 md:grid-cols-[1.15fr_1fr]">
      <div>
        {/* Thẻ Passport */}
        <div className="relative overflow-hidden rounded-[28px] p-6 text-white shadow-[0_20px_40px_-18px_rgba(29,74,62,.55)] sm:p-7"
             style={{ background: 'linear-gradient(150deg,#1D4A3E,#2B7461)' }}>
          <span className="pointer-events-none absolute -right-20 -top-24 h-60 w-60 rounded-full bg-white/[.07]" />
          <span className="pointer-events-none absolute -bottom-20 right-12 h-40 w-40 rounded-full bg-white/[.07]" />
          <div className="relative">
            <div className="flex items-center gap-3.5">
              <div className="flex h-14 w-14 items-center justify-center rounded-full text-[19px] font-extrabold ring-[3px] ring-white/20"
                   style={{ background: 'linear-gradient(145deg,#8FE0BD,#2AA37C)' }}>{initials}</div>
              <div>
                <div className="font-display text-[22px] font-extrabold leading-tight tracking-tight">{profile.full_name}</div>
                <div className="text-[13.5px] text-white/75">Green Passport · Lớp {student.class_id ? student.class_id.slice(0, 8) : '—'}</div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3 rounded-[20px] bg-white/[.12] px-4 py-3.5">
              <div>
                <div className="text-xs text-white/75">Bạn đang tham gia</div>
                <div className="font-display text-base font-bold">{joined.length} thử thách</div>
              </div>
              <span className="flex-none rounded-full bg-leaf-100 px-3 py-1 text-[13px] font-bold text-forest-700">Ngày {student.current_day}/30</span>
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[.18]">
              <div className="h-full rounded-full" style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#8FE0BD,#C8F4DD)' }} />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {[[`${progress}%`, 'Tiến độ'], [`🔥 ${streak}`, 'Streak'], [`📷 ${student.evidence_count || 0}`, 'Minh chứng']].map(([num, lbl]) => (
                <div key={lbl} className="rounded-[18px] bg-white/[.12] px-2 py-3.5 text-center">
                  <div className="font-display text-2xl font-extrabold leading-tight">{num}</div>
                  <div className="text-[12.5px] text-white/80">{lbl}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Hướng dẫn ghi nhận (thay cho nút ghi nhận cũ) */}
        <div className="mt-3.5 flex flex-wrap items-center gap-3.5 rounded-[22px] bg-white px-[18px] py-4 shadow-card">
          <div className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] bg-leaf-100 text-[22px]" aria-hidden="true">🏷️</div>
          <p className="min-w-[180px] flex-1 text-sm text-ink-600">
            <b className="block text-[15px] text-ink">{joined.length ? 'Muốn ghi nhận hành động hôm nay?' : 'Bạn chưa chọn thử thách nào'}</b>
            {joined.length ? 'Vào Green Auction, chọn thử thách của bạn rồi tải minh chứng.' : 'Vào Green Auction, chọn "I\'M IN" để bắt đầu.'}
          </p>
          <button type="button" onClick={onGoAuction}
            className="rounded-[15px] bg-gradient-to-br from-leaf-500 to-forest-700 px-5 py-3 text-sm font-bold text-white transition hover:brightness-110">Đến Green Auction</button>
        </div>
      </div>

      <div>
        <h2 className="mb-3 font-display text-lg font-extrabold tracking-tight">Green Streak</h2>
        <div className="rounded-[26px] bg-white p-5 shadow-card">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 flex-none items-center justify-center rounded-[20px] bg-honey-soft text-[32px] ring-1 ring-inset ring-[#EFD5AC]" aria-hidden="true">🔥</div>
            <div>
              <div className="font-display text-[21px] font-extrabold leading-tight">Duy trì {streak} ngày liên tiếp!</div>
              <p className="text-[13.5px] text-ink-600">Streak chỉ để tạo động lực, không xếp hạng.</p>
            </div>
          </div>
          <div className="mt-4 border-t border-line pt-4">
            <div className="mb-2 flex justify-between text-[13.5px] font-semibold">
              <span>{nextBadge ? `Huy hiệu tiếp theo: ${nextBadge.name}` : 'Bạn đã đạt tất cả huy hiệu'}</span>
              {nextBadge && <span className="font-medium text-ink-600">{streak}/{nextBadge.needStreak} ngày</span>}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-sand-100">
              <div className="h-full rounded-full bg-gradient-to-r from-[#8FE0BD] to-leaf-500" style={{ width: `${nextPct}%` }} />
            </div>
          </div>
        </div>

        <h2 className="mb-3 mt-6 font-display text-lg font-extrabold tracking-tight">Thử thách của bạn</h2>
        <div className="rounded-[26px] bg-white p-4 shadow-card">
          {joined.length ? (
            <div className="flex flex-col gap-2">
              {joined.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-2xl bg-sand-100/70 px-2.5 py-2">
                  <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl text-lg ${TINT[c.id] || 'bg-leaf-100'}`} aria-hidden="true">{c.icon}</span>
                  <span className="flex-1 text-sm font-bold">{c.title.split('–').pop().trim()}</span>
                  <span className="rounded-full bg-leaf-100 px-3 py-0.5 text-xs font-semibold text-forest-700">{countOf(c.id)} lần ghi nhận</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-1 py-1 text-sm text-ink-600">Bạn chưa tham gia thử thách nào. Vào Green Auction để chọn.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBox({ num, lbl }) {
  return (
    <div className="bg-white/10 rounded-xl px-2 py-2.5 text-center">
      <div className="font-display font-bold text-lg">{num}</div>
      <div className="text-[10px] text-white/65 mt-0.5">{lbl}</div>
    </div>
  );
}
function SectionTitle({ icon, text }) {
  return <div className="text-sm font-bold mb-3 flex items-center gap-1.5">{icon} {text}</div>;
}

const TINT = {
  energy: 'bg-[#FCF1E1]',
  plastic: 'bg-[#DFF1F6]',
  waste: 'bg-[#DCF3EA]',
  transport: 'bg-[#ECE9F8]',
  green_space: 'bg-[#E6F3D9]',
};

function AuctionCard({ ch, choice, onJoin }) {
  const total = 80, in_ = 62;
  const pct = Math.round((in_ / total) * 100);
  const goingDown = ch.target < ch.baseline;
  return (
    <article className="flex h-full flex-col rounded-[28px] bg-white p-5 shadow-card sm:p-6">
      <div className="flex items-center gap-3.5">
        <div className={`flex h-[52px] w-[52px] flex-none items-center justify-center rounded-[17px] text-[26px] ${TINT[ch.id] || 'bg-leaf-100'}`} aria-hidden="true">{ch.icon}</div>
        <div>
          <div className="text-[13px] font-medium text-ink-600">{ch.name}</div>
          <h3 className="font-display text-[18px] font-bold leading-snug tracking-tight">{ch.title}</h3>
        </div>
      </div>

      <p className="mt-4 text-sm text-ink-600">{ch.baselineLabel} còn {goingDown ? 'cao' : 'thấp'}</p>

      <div className="mt-3.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-[20px] bg-sand-100/70 px-[18px] py-4">
        <div>
          <div className="text-xs text-ink-600">Hiện tại</div>
          <div className="font-display text-2xl font-extrabold leading-tight tracking-tight">
            {ch.baseline}<span className="ml-1 text-[13px] font-medium text-ink-600">{ch.unit}</span>
          </div>
        </div>
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-white text-leaf-500 shadow-sm" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </div>
        <div className="text-right">
          <div className="text-xs text-ink-600">Mục tiêu</div>
          <div className="font-display text-2xl font-extrabold leading-tight tracking-tight text-forest-700">
            {goingDown ? '≤ ' : '≥ '}{ch.target}<span className="ml-1 text-[13px] font-medium text-ink-600">{ch.unit}</span>
          </div>
        </div>
      </div>

      <div className="mt-[18px]">
        <div className="mb-2 flex justify-between text-sm font-semibold">
          <span>{in_}/{total} học sinh tham gia</span>
          <span className="text-forest-700">{pct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-sand-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-gradient-to-r from-[#8FE0BD] to-leaf-500 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="mt-auto pt-5">
        {choice === 'in' && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-2 rounded-full bg-leaf-100 py-2 pl-2.5 pr-4 text-sm font-bold text-forest-700">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-leaf-500 text-white">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              </span>
              Bạn đã tham gia · I'M IN
            </span>
            <button type="button" onClick={() => onJoin(ch.id, 'skip')} className="text-[13px] text-ink-600 underline hover:text-ink">Rút lại</button>
          </div>
        )}
        {choice === 'skip' && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center rounded-full bg-sand-100 px-4 py-2 text-sm font-semibold text-ink-600">Bạn chọn · NOT YET</span>
            <button type="button" onClick={() => onJoin(ch.id, 'in')} className="text-[13px] font-semibold text-forest-700 underline">Tham gia ngay</button>
          </div>
        )}
        {!choice && (
          <div className="flex gap-2.5">
            <button type="button" onClick={() => onJoin(ch.id, 'in')}
              className="flex-1 rounded-[15px] bg-gradient-to-br from-leaf-500 to-forest-700 py-3 text-sm font-bold text-white transition hover:brightness-110">I'M IN</button>
            <button type="button" onClick={() => onJoin(ch.id, 'skip')}
              className="flex-1 rounded-[15px] bg-sand-100 py-3 text-sm font-bold text-ink-600 transition-colors hover:bg-line">NOT YET</button>
          </div>
        )}
      </div>
    </article>
  );
}

function Row({ k, v, last }) {
  return (
    <div className={`flex justify-between gap-2.5 py-2 text-[12.5px] ${last ? '' : 'border-b border-dashed border-sand-100'}`}>
      <span className="text-ink-600 font-semibold">{k}</span><span className="font-bold text-right">{v}</span>
    </div>
  );
}

const DAY_STYLE = {
  confirmed: 'bg-gradient-to-br from-[#45C295] to-[#238F6E] text-white shadow-[0_6px_14px_rgba(35,143,110,.25)]',
  done: 'bg-leaf-100 text-leaf-600',
  needs: 'bg-honey-soft text-[#A8691F] ring-1 ring-inset ring-honey',
  empty: 'bg-sand-100 text-ink-400',
};
const STATUS_LABEL = { confirmed: 'Giáo viên đã xác nhận', done: 'Đã thực hiện', needs: 'Cần bổ sung minh chứng', empty: 'Chưa cập nhật' };

function DayIcon({ status }) {
  if (status === 'confirmed' || status === 'done') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    );
  }
  if (status === 'needs') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true">
        <path d="M12 6v8" /><circle cx="12" cy="18.5" r=".6" fill="currentColor" />
      </svg>
    );
  }
  return <span className="h-4" />;
}

function JourneyTab({ student, dayMap, openDay, setOpenDay }) {
  const cur = student.current_day || 1;
  const entry = openDay ? dayMap[openDay] : null;
  const statusOf = (day) => {
    const e = dayMap[day];
    if (e) return e.status;
    return day >= cur ? 'empty' : 'done';
  };
  const statuses = Array.from({ length: 30 }, (_, i) => statusOf(i + 1));
  const doneCount = statuses.filter((x) => x === 'confirmed' || x === 'done').length;
  const needsCount = statuses.filter((x) => x === 'needs').length;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-tight sm:text-[32px]">Hành trình xanh 30 ngày</h1>
          <p className="mt-1.5 text-sm text-ink-600">Mỗi ngày một hành động nhỏ cho môi trường. Hôm nay là ngày {cur}.</p>
        </div>
        <div className="flex gap-3">
          <div className="min-w-[110px] rounded-2xl bg-white px-5 py-3 shadow-card">
            <div className="font-display text-2xl font-extrabold leading-tight">{doneCount}/30</div>
            <div className="text-xs text-ink-600">ngày hoàn thành</div>
          </div>
          <div className="min-w-[110px] rounded-2xl bg-white px-5 py-3 shadow-card">
            <div className="font-display text-2xl font-extrabold leading-tight">{needsCount}</div>
            <div className="text-xs text-ink-600">cần bổ sung</div>
          </div>
        </div>
      </div>

      <div className="rounded-[28px] bg-white p-5 shadow-card sm:p-7">
        <div className="mb-6 h-2 overflow-hidden rounded-full bg-sand-100">
          <div className="h-full rounded-full bg-gradient-to-r from-[#8FE0BD] to-leaf-500 transition-all duration-700" style={{ width: `${Math.round((doneCount / 30) * 100)}%` }} />
        </div>

        <div className="grid grid-cols-5 gap-2.5 sm:grid-cols-6 md:grid-cols-10 md:gap-3">
          {Array.from({ length: 30 }, (_, idx) => {
            const day = idx + 1;
            const status = statuses[idx];
            const isToday = day === cur;
            const isOpen = day === openDay;
            return (
              <button key={day} onClick={() => setOpenDay(day)}
                aria-label={`Ngày ${day}: ${STATUS_LABEL[status]}`}
                className={`aspect-square rounded-2xl flex flex-col items-center justify-center gap-0.5 text-[15px] font-semibold transition-transform hover:-translate-y-0.5 ${DAY_STYLE[status]} ${isToday ? 'ring-2 ring-leaf-500 ring-offset-[3px]' : ''} ${isOpen && !isToday ? 'ring-2 ring-ink ring-offset-[3px]' : ''}`}>
                <DayIcon status={status} />
                <span>{day}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-5 text-[13.5px] text-ink-600">
          <Legend swatch="bg-gradient-to-br from-[#45C295] to-[#238F6E]" label="Giáo viên đã xác nhận" />
          <Legend swatch="bg-leaf-100 ring-1 ring-inset ring-leaf-500" label="Đã thực hiện" />
          <Legend swatch="bg-honey-soft ring-1 ring-inset ring-honey" label="Cần bổ sung minh chứng" />
          <Legend swatch="bg-sand-100" label="Chưa cập nhật" />
        </div>
      </div>

      {openDay && (
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-card text-[13.5px]">
          <div className="font-display text-base font-bold">Ngày {openDay}{openDay === cur ? ' · hôm nay' : ''}</div>
          {entry ? (
            <div className="mt-2 space-y-1.5">
              <Row k="Hành động" v={entry.action_text || '—'} />
              <Row k="Trạng thái" v={STATUS_LABEL[entry.status] || STATUS_LABEL.done} last />
            </div>
          ) : (
            <p className="mt-1 text-ink-600">{openDay > cur ? 'Chưa đến ngày này.' : 'Chưa có dữ liệu cho ngày này.'}</p>
          )}
        </div>
      )}
    </div>
  );
}
function Legend({ swatch, label }) {
  return <span className="inline-flex items-center gap-2"><span className={`h-3.5 w-3.5 rounded-[5px] ${swatch}`} />{label}</span>;
}

function AuctionTab({ commitments, setCommitment, student, dailyActions, onRecord }) {
  const list = Object.values(CHALLENGES);
  const [selId, setSelId] = useState(list[0].id);
  const ch = CHALLENGES[selId];
  const choice = commitments[ch.id];
  const joinedCount = list.filter((c) => commitments[c.id] === 'in').length;
  const total = 80, in_ = 62;
  const pct = Math.round((in_ / total) * 100);
  const goingDown = ch.target < ch.baseline;
  const recordedCount = dailyActions.filter((d) => d.challenge_id === ch.id).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="font-display text-[22px] font-extrabold leading-tight tracking-tight sm:text-[28px]">Green Auction: đấu giá thử thách xanh</h1>
        <p className="text-sm text-ink-600">Không đấu giá bằng tiền. Chọn một thử thách để xem và cam kết tham gia.</p>
      </div>

      <div className="grid items-stretch gap-4 md:grid-cols-[340px_minmax(0,1fr)]">
        {/* Danh sách thử thách */}
        <div role="tablist" aria-label="Danh sách thử thách"
             className="flex gap-1.5 overflow-x-auto rounded-[22px] bg-white p-2 shadow-card md:flex-col md:gap-1 md:rounded-[26px] md:p-2.5">
          <div className="hidden justify-between px-3 pb-1.5 pt-2 text-[13px] font-semibold text-ink-600 md:flex">
            <span>Thử thách</span><span>Đã tham gia {joinedCount}/{list.length}</span>
          </div>
          {list.map((c) => {
            const ch_ = commitments[c.id];
            const active = c.id === selId;
            return (
              <button key={c.id} type="button" role="tab" aria-selected={active} onClick={() => setSelId(c.id)}
                className={`relative flex min-w-[96px] flex-col items-center gap-1.5 rounded-[18px] px-2 py-2.5 text-center transition-colors md:min-w-0 md:flex-row md:gap-3 md:px-3 md:text-left ${active ? 'bg-leaf-100' : 'hover:bg-sand-100'}`}>
                <span className={`flex h-11 w-11 flex-none items-center justify-center rounded-[14px] text-[22px] ${TINT[c.id] || 'bg-leaf-100'}`} aria-hidden="true">{c.icon}</span>
                <span className="min-w-0 md:flex-1">
                  <span className="hidden text-xs leading-tight text-ink-600 md:block">{c.name}</span>
                  <span className="block text-[12.5px] font-bold leading-tight md:text-[14.5px]">{c.title.split('–').pop().trim()}</span>
                </span>
                <span aria-label={ch_ === 'in' ? 'Đã tham gia' : ch_ === 'skip' ? 'Chưa tham gia' : 'Chưa chọn'}
                  className={`absolute right-2 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold md:static md:h-6 md:w-6 md:text-xs ${ch_ === 'in' ? 'bg-leaf-500 text-white' : ch_ === 'skip' ? 'bg-sand-100 text-ink-600' : 'border-2 border-dashed border-line'}`}>
                  {ch_ === 'in' ? '✓' : ch_ === 'skip' ? '–' : ''}
                </span>
              </button>
            );
          })}
        </div>

        {/* Chi tiết thử thách đang chọn */}
        <section aria-live="polite" className="flex flex-col rounded-[28px] bg-white p-5 shadow-card sm:px-7 sm:py-6">
          <div className="flex items-center gap-4">
            <div className={`flex h-[60px] w-[60px] flex-none items-center justify-center rounded-[20px] text-[30px] ${TINT[ch.id] || 'bg-leaf-100'}`} aria-hidden="true">{ch.icon}</div>
            <div>
              <div className="text-[13px] font-medium text-ink-600">{ch.name}</div>
              <h2 className="font-display text-[20px] font-extrabold leading-snug tracking-tight sm:text-[22px]">{ch.title}</h2>
            </div>
          </div>

          <p className="mt-3.5 text-sm text-ink-600">{ch.baselineLabel} còn {goingDown ? 'cao' : 'thấp'}</p>

          <div className="mt-3.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-[20px] bg-sand-100/70 px-5 py-4">
            <div>
              <div className="text-xs text-ink-600">Hiện tại</div>
              <div className="font-display text-[22px] font-extrabold leading-tight tracking-tight sm:text-[28px]">
                {ch.baseline}<span className="ml-1 text-[13px] font-medium text-ink-600">{ch.unit}</span>
              </div>
            </div>
            <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-white text-leaf-500 shadow-sm" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </div>
            <div className="text-right">
              <div className="text-xs text-ink-600">Mục tiêu</div>
              <div className="font-display text-[22px] font-extrabold leading-tight tracking-tight text-forest-700 sm:text-[28px]">
                {goingDown ? '≤ ' : '≥ '}{ch.target}<span className="ml-1 text-[13px] font-medium text-ink-600">{ch.unit}</span>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex justify-between text-sm font-semibold">
              <span>{in_}/{total} học sinh tham gia</span>
              <span className="text-forest-700">{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-sand-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-gradient-to-r from-[#8FE0BD] to-leaf-500 transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {choice === 'in' ? (
            <div className="mt-4 flex flex-wrap items-center gap-4 rounded-[22px] bg-honey-soft px-5 py-4 ring-1 ring-inset ring-[#EFD5AC]">
              <div className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] bg-white text-[22px]" aria-hidden="true">📷</div>
              <div className="min-w-[180px] flex-1">
                <div className="font-display text-base font-bold">Ghi nhận hành động ngày {student.current_day}</div>
                <p className="text-[13.5px] text-ink-600">{recordedCount ? `Bạn đã ghi nhận ${recordedCount} lần cho thử thách này. ` : ''}Chụp ảnh minh chứng, chỉ mất khoảng 20–30 giây.</p>
              </div>
              <button type="button" onClick={() => onRecord(ch.id)}
                className="rounded-[15px] bg-gradient-to-br from-leaf-500 to-forest-700 px-5 py-3 text-sm font-bold text-white transition hover:brightness-110">Tải minh chứng</button>
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-4 rounded-[22px] bg-sand-100/70 px-5 py-4">
              <div className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] bg-white text-[22px]" aria-hidden="true">🔒</div>
              <div>
                <div className="font-display text-base font-bold">Tham gia để ghi nhận hành động</div>
                <p className="text-[13.5px] text-ink-600">Chọn "I'M IN" để mở phần tải minh chứng cho thử thách này.</p>
              </div>
            </div>
          )}

          <div className="mt-auto pt-5">
            {choice === 'in' && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-2 rounded-full bg-leaf-100 py-2 pl-2.5 pr-4 text-sm font-bold text-forest-700">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-leaf-500 text-xs text-white">✓</span>
                  Bạn đã tham gia · I'M IN
                </span>
                <button type="button" onClick={() => setCommitment(ch.id, 'skip')} className="text-[13px] text-ink-600 underline hover:text-ink">Rút lại</button>
              </div>
            )}
            {choice === 'skip' && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center rounded-full bg-sand-100 px-4 py-2 text-sm font-semibold text-ink-600">Bạn chọn · NOT YET</span>
                <button type="button" onClick={() => setCommitment(ch.id, 'in')} className="text-[13px] font-semibold text-forest-700 underline">Tham gia ngay</button>
              </div>
            )}
            {!choice && (
              <div className="flex max-w-[420px] gap-2.5">
                <button type="button" onClick={() => setCommitment(ch.id, 'in')}
                  className="flex-1 rounded-[15px] bg-gradient-to-br from-leaf-500 to-forest-700 py-3 text-sm font-bold text-white transition hover:brightness-110">I'M IN</button>
                <button type="button" onClick={() => setCommitment(ch.id, 'skip')}
                  className="flex-1 rounded-[15px] bg-sand-100 py-3 text-sm font-bold text-ink-600 transition-colors hover:bg-line">NOT YET</button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// Nhãn hiển thị + màu riêng cho từng loại thử thách trên Green Wall.
// Thử thách nào không có trong danh sách này vẫn hiển thị bình thường, dùng màu mặc định.
const WALL_META = {
  plastic:     { label: 'hành động giảm nhựa',      glow: '#ff9f5a', bg: '#fff1e0', fg: '#c96b1f' },
  energy:      { label: 'hành động tiết kiệm điện', glow: '#f3c34a', bg: '#fff6da', fg: '#a97a1f' },
  waste:       { label: 'lần phân loại rác',        glow: '#2aa37c', bg: '#dcf3ea', fg: '#23594a' },
  green_space: { label: 'lượt chăm sóc cây',        glow: '#4fa3ff', bg: '#e4f1ff', fg: '#2b6fc9' },
  transport:   { label: 'lượt đi lại xanh',         glow: '#b98bea', bg: '#f1e7fb', fg: '#7a4bb0' },
};
const WALL_DEFAULT = { glow: '#8fa699', bg: '#eef4f1', fg: '#23594a' };

// Đếm số tăng dần (mượt khi số liệu thay đổi) — dùng ở Green Meter và Green Wall
function useCountUp(target, ms = 1200) {
  const [v, setV] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      prev.current = target; setV(target); return undefined;
    }
    const t0 = performance.now();
    let raf;
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(Math.round(from + (target - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick); else prev.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function WallRing({ pct, color }) {
  const C = 113; // chu vi vòng tròn r=18
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    requestAnimationFrame(() => { el.style.strokeDashoffset = C * (1 - pct / 100); });
  }, [pct]);
  return (
    <svg viewBox="0 0 44 44" className="h-11 w-11 -rotate-90">
      <circle cx="22" cy="22" r="18" fill="none" strokeWidth="5" className="stroke-sand-100" />
      <circle ref={ref} cx="22" cy="22" r="18" fill="none" strokeWidth="5" stroke={color}
        strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C}
        style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)' }} />
    </svg>
  );
}

function WallTab() {
  const [rows, setRows] = useState(null); // null = đang tải, [] = chưa có hành động nào hôm nay
  const [status, setStatus] = useState('loading');
  const total = useCountUp(rows ? rows.reduce((s, r) => s + r.action_count, 0) : 0, 1400);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data, error: err } = await supabase.rpc('get_wall_stats');
      if (!alive) return;
      if (err) { console.error('get_wall_stats:', err.message); setStatus('error'); return; }
      setRows((data || []).sort((a, b) => b.action_count - a.action_count));
      setStatus('ok');
    };
    load();
    const timer = setInterval(load, 30000); // tự làm mới mỗi 30 giây
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  if (status === 'error') {
    return (
      <div className="rounded-3xl bg-white p-6 text-sm text-ink-600 shadow-card">
        Chưa tải được số liệu cộng đồng. Hãy kiểm tra đã chạy file SQL <b>get_wall_stats</b> trên Supabase chưa.
      </div>
    );
  }
  const maxCount = rows && rows.length ? Math.max(...rows.map((r) => r.action_count)) : 1;

  return (
    <div>
      <section className="relative isolate overflow-hidden rounded-[32px] bg-[#081512] p-6 sm:p-10">
        {/* Nền cực quang chuyển động nhẹ */}
        <div className="pointer-events-none absolute -inset-[20%] -z-10 opacity-75 blur-[60px]" aria-hidden="true">
          <span className="absolute left-[-8%] top-[-10%] aspect-square w-[46%] animate-[wallFloat1_16s_ease-in-out_infinite] rounded-full"
            style={{ background: 'radial-gradient(circle,#2AA37C,transparent 70%)' }} />
          <span className="absolute right-[-6%] top-[5%] aspect-square w-[40%] animate-[wallFloat2_20s_ease-in-out_infinite] rounded-full"
            style={{ background: 'radial-gradient(circle,#4FA3FF,transparent 70%)' }} />
          <span className="absolute bottom-[-16%] left-[30%] aspect-square w-[38%] animate-[wallFloat3_18s_ease-in-out_infinite] rounded-full"
            style={{ background: 'radial-gradient(circle,#F3C34A,transparent 70%)' }} />
        </div>

        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.08] px-3.5 py-1.5 text-[13px] font-semibold text-[#dff3ea]">
          <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-[#4ee8a4] shadow-[0_0_0_4px_rgba(78,232,164,.22)]" />
          Cập nhật trực tiếp hôm nay
        </span>
        <h1 className="mt-4 font-display text-[26px] font-extrabold leading-tight tracking-tight text-white sm:text-[34px]">Green Wall — Cộng đồng hành động</h1>
        <p className="mt-2 max-w-[52ch] text-[15px] text-[#dff3ea]/65">Mọi hành động xanh của cộng đồng hôm nay, gộp lại thành một nhịp đập chung.</p>

        <div className="mt-8 grid items-center gap-8 sm:grid-cols-[auto_1fr]">
          <div className="relative mx-auto h-44 w-44 flex-none sm:mx-0">
            <svg viewBox="0 0 176 176" className="h-full w-full -rotate-90">
              <circle cx="88" cy="88" r="76" fill="none" strokeWidth="14" className="stroke-white/[.08]" />
              <circle cx="88" cy="88" r="76" fill="none" strokeWidth="14" strokeLinecap="round"
                stroke="#4ee8a4" style={{ filter: 'drop-shadow(0 0 10px rgba(78,232,164,.55))' }}
                strokeDasharray={477.5} strokeDashoffset={status === 'ok' ? 0 : 477.5}
                className="transition-[stroke-dashoffset] duration-[1400ms] ease-out" />
            </svg>
            <div className="absolute inset-0 grid place-content-center text-center">
              <b className="font-display text-[44px] font-extrabold leading-none text-white">{total}</b>
              <span className="mt-0.5 text-[11.5px] uppercase tracking-wider text-[#dff3ea]/60">Hôm nay</span>
            </div>
          </div>
          <div className="text-center sm:text-left">
            <b className="block text-[15px] font-bold text-white">
              {status === 'loading' ? 'Đang tải số liệu cộng đồng…' : `${total} hành động xanh được cộng đồng thực hiện hôm nay`}
            </b>
            <p className="mt-1 max-w-[38ch] text-[13.5px] text-[#dff3ea]/62">Từ giảm nhựa, tiết kiệm điện, phân loại rác đến chăm sóc cây — mỗi hành động nhỏ đều được tính.</p>
            <span className="mt-3.5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.06] px-3.5 py-1.5 text-[12.5px] text-[#dff3ea]/65">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
              Không hiển thị bảng xếp hạng cá nhân — chỉ dữ liệu tổng hợp
            </span>
          </div>
        </div>
      </section>

      {rows && rows.length === 0 && status === 'ok' && (
        <p className="mt-4 rounded-2xl bg-white p-5 text-sm text-ink-600 shadow-card">Chưa có hành động nào được ghi nhận hôm nay. Hãy là người đầu tiên!</p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(rows || []).map((r) => (
          <WallCard key={r.challenge_id} challengeId={r.challenge_id} count={r.action_count} maxCount={maxCount} />
        ))}
      </div>
    </div>
  );
}

// Thẻ riêng cho từng loại hành động trên Green Wall.
// Tách thành component riêng để useCountUp (một Hook) luôn được gọi đúng 1 lần cho mỗi thẻ,
// dù danh sách "rows" thay đổi độ dài khi dữ liệu tải xong hoặc cập nhật.
function WallCard({ challengeId, count, maxCount }) {
  const meta = WALL_META[challengeId] || WALL_DEFAULT;
  const label = meta.label || CHALLENGES[challengeId]?.title || challengeId;
  const pct = Math.round((count / maxCount) * 100);
  const shown = useCountUp(count, 1100);
  return (
    <div className="relative isolate overflow-hidden rounded-3xl bg-white p-[22px] shadow-card">
      <span className="pointer-events-none absolute -right-10 -top-10 -z-10 h-[140px] w-[140px] rounded-full opacity-35 blur-[38px]" style={{ background: meta.glow }} />
      <div className="flex items-center justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-[14px] text-[22px]" style={{ background: meta.bg, color: meta.fg }} aria-hidden="true">
          {CHALLENGES[challengeId]?.icon || '🌱'}
        </div>
        <div className="relative">
          <WallRing pct={pct} color={meta.glow} />
          <span className="pointer-events-none absolute inset-0 grid place-content-center text-[10px] font-extrabold" style={{ color: meta.fg }}>{pct}%</span>
        </div>
      </div>
      <b className="mt-4 block font-display text-[34px] font-extrabold leading-none tracking-tight">{shown}</b>
      <span className="mt-1 block text-[13.5px] font-medium text-ink-600">{label}</span>
    </div>
  );
}

// Bảng màu cho từng "chiếc lá" trong Green Meter, khớp với màu chấm tròn trong chú thích (chips) bên dưới:
// 's' = đang duy trì (vàng), 'j' = đã tham gia (xanh), 'n' = chưa tham gia (viền đứt, mờ)
const LEAF = {
  s: 'bg-[#E8B654]',
  j: 'bg-[#4FC79B]',
  n: 'border border-dashed border-white/30 bg-white/[.06]',
};

function MeterTab() {
  const [meter, setMeter] = useState(null);   // dữ liệu lớp, hoặc {} nếu chưa có lớp
  const [status, setStatus] = useState('loading'); // 'loading' | 'ok' | 'error'
  const [filter, setFilter] = useState(null); // lọc theo nhóm lá khi bấm vào chú thích: 's' | 'j' | 'n' | null

  // Lấy số liệu thật của lớp từ Supabase (hàm get_class_meter), tự làm mới mỗi 30 giây
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data, error: err } = await supabase.rpc('get_class_meter');
      if (!alive) return;
      if (err) { console.error('get_class_meter:', err.message); setStatus('error'); return; }
      // Hàm SQL trả về 0 dòng khi tài khoản chưa gán vào lớp nào -> coi là {} thay vì để trống mãi
      setMeter((Array.isArray(data) ? data[0] : data) || {});
      setStatus('ok');
    };
    load();
    const timer = setInterval(load, 30000);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  const total = meter?.total || 0;
  const joined = Math.min(meter?.joined || 0, total);
  const actions = meter?.actions || 0;
  const keeping = Math.min(meter?.keeping || 0, total);
  const pct = total ? Math.round((joined / total) * 100) : 0;
  const keepPct = joined ? Math.min(100, Math.round((keeping / joined) * 100)) : 0;
  const avg = joined ? Math.round(actions / joined) : 0;
  const remain = Math.max(0, total - joined);

  const actionsShown = useCountUp(actions);

  // Mỗi học sinh là một chiếc lá: vàng = đang duy trì, xanh = đã tham gia, nét đứt = chưa tham gia
  const nS = keeping;
  const nJ = Math.max(0, joined - keeping);
  const nN = Math.max(0, total - nS - nJ);
  const leaves = [...Array(nS).fill('s'), ...Array(nJ).fill('j'), ...Array(nN).fill('n')];
  const chips = [
    { id: 's', label: 'Đang duy trì', n: nS, dot: 'bg-[#E8B654]' },
    { id: 'j', label: 'Đã tham gia', n: nJ, dot: 'bg-[#4FC79B]' },
    { id: 'n', label: 'Chưa tham gia', n: nN, dot: 'border-[1.5px] border-dashed border-current' },
  ];

  if (status === 'loading') {
    return <div className="rounded-3xl bg-white p-6 text-sm text-ink-600 shadow-card">Đang tải số liệu của lớp…</div>;
  }
  if (status === 'error') {
    return (
      <div className="rounded-3xl bg-white p-6 text-sm text-ink-600 shadow-card">
        Chưa tải được số liệu của lớp. Hãy kiểm tra đã chạy file SQL <b>get_class_meter</b> trên Supabase chưa,
        và tài khoản đã đăng nhập đúng chưa.
      </div>
    );
  }
  if (!total) {
    return (
      <div className="rounded-3xl bg-white p-6 text-sm text-ink-600 shadow-card">
        Tài khoản của bạn chưa được gán vào lớp nào, nên chưa có số liệu để hiển thị.
        Hãy nhờ giáo viên/admin gán lớp (cột <b>class_id</b> trong bảng <b>students</b>).
      </div>
    );
  }

  return (
    <div>
      <section aria-label={`Khu vườn xanh của lớp ${meter.class_name || ''}`}
        className="relative grid gap-x-10 gap-y-2 overflow-hidden rounded-[32px] p-6 text-white shadow-[0_24px_50px_-22px_rgba(15,45,36,.7)] sm:p-9 md:grid-cols-[0.9fr_1.1fr]"
        style={{ background: 'radial-gradient(700px 380px at 78% 20%,#2F7D68 0%,transparent 70%),linear-gradient(160deg,#143A2F,#0F2D24)' }}>
        <span className="pointer-events-none absolute -bottom-40 -left-32 h-80 w-80 rounded-full bg-[#8FE0BD]/10" />

        <div className="relative flex flex-col">
          <span className="self-start rounded-full bg-white/15 px-4 py-1 text-sm font-bold">Lớp {meter.class_name || '—'}</span>
          <div className="mt-5 bg-gradient-to-b from-white to-[#B9EFD5] bg-clip-text font-display text-[clamp(52px,8vw,84px)] font-extrabold leading-none tracking-tighter text-transparent">
            {actionsShown.toLocaleString('vi-VN')}
          </div>
          <div className="mt-1.5 text-lg font-semibold text-[#D9F8E8]">hành động xanh của cả lớp</div>
          <p className="mt-4 max-w-[36ch] text-[15px] text-white/80">
            <b className="text-white">{joined} trên {total}</b> bạn đang cùng hành động. Mỗi chiếc lá là một học sinh của lớp.
          </p>
          <div className="mt-5">
            <div className="mb-2 flex justify-between text-[13.5px] font-semibold"><span>Tỷ lệ tham gia</span><span>{pct}%</span></div>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/[.14]">
              <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#8FE0BD,#F3D48A)' }} />
            </div>
          </div>
          <p className="mt-auto pt-6 font-semibold text-[#C8F4DD]">“Tôi hành động → Lớp tiến lên.”</p>
        </div>

        <div className="relative flex flex-col justify-center">
          <div className="grid grid-cols-10 gap-[clamp(6px,1.2vw,12px)]" role="img"
               aria-label={`${total} học sinh: ${nS} đang duy trì, ${nJ} đã tham gia, ${nN} chưa tham gia`}>
            {leaves.map((t, i) => (
              <div key={i} aria-hidden="true"
                className={`leaf-in aspect-square rounded-[0_100%_0_100%] transition-[opacity,filter] ${LEAF[t]} ${filter && filter !== t ? 'opacity-20 saturate-50' : ''}`}
                style={{ animationDelay: `${Math.min(i * 14, 1200)}ms` }} />
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {chips.map((c) => (
              <button key={c.id} type="button" aria-pressed={filter === c.id} onClick={() => setFilter(filter === c.id ? null : c.id)}
                className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13.5px] font-semibold transition-colors ${filter === c.id ? 'bg-white text-ink' : 'bg-white/10 hover:bg-white/20'}`}>
                <i className={`block h-3 w-3 rounded-[0_100%_0_100%] ${c.dot}`} />{c.label} <b className="font-extrabold">{c.n}</b>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="mt-4 grid gap-3.5 md:grid-cols-3">
        {[
          { icon: '🔥', bg: 'bg-[#FCF1E1]', num: `${keepPct}%`, lbl: 'bạn tham gia đang giữ streak' },
          { icon: '🌿', bg: 'bg-[#DFF1F6]', num: `≈ ${avg}`, lbl: 'hành động mỗi bạn tham gia' },
          { icon: '🎯', bg: 'bg-[#ECE9F8]', num: remain ? `${remain} bạn` : '100%', lbl: remain ? 'nữa là cả lớp cùng hành động' : 'cả lớp cùng hành động!' },
        ].map((f) => (
          <div key={f.lbl} className="flex items-center gap-3.5 rounded-[22px] bg-white px-5 py-[18px] shadow-card">
            <div className={`flex h-11 w-11 flex-none items-center justify-center rounded-[14px] text-[22px] ${f.bg}`} aria-hidden="true">{f.icon}</div>
            <div>
              <div className="font-display text-[22px] font-extrabold leading-tight tracking-tight">{f.num}</div>
              <div className="text-[13px] text-ink-600">{f.lbl}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniCard({ icon, num, lbl }) {
  return (
    <div className="bg-white rounded-2xl shadow p-3.5">
      <div className="text-lg">{icon}</div>
      <div className="font-display font-bold text-lg mt-1">{num}</div>
      <div className="text-[11px] text-ink-600 mt-0.5">{lbl}</div>
    </div>
  );
}

function ProfileTab({ profile, student, onLogout }) {
  const streak = student.streak || 0;
  const initials = (profile.full_name || '').split(' ').slice(-2).map((w) => w[0]).join('').toUpperCase();
  const badges = BADGE_DEFS.map((b) => ({
    ...b,
    earned: streak >= b.needStreak || (b.id === 'first' && student.current_day > 1),
  }));
  const earnedCount = badges.filter((b) => b.earned).length;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      {/* Hồ sơ */}
      <section aria-label="Hồ sơ của tôi">
        <h2 className="mb-3.5 font-display text-xl font-extrabold tracking-tight">Hồ sơ của tôi</h2>
        <div className="relative overflow-hidden rounded-[28px] p-7 text-white shadow-[0_20px_40px_-18px_rgba(29,74,62,.55)]"
             style={{ background: 'linear-gradient(150deg,#1D4A3E,#2B7461)' }}>
          <span className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/[.07]" />
          <span className="pointer-events-none absolute -bottom-16 right-10 h-36 w-36 rounded-full bg-white/[.07]" />
          <div className="relative">
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full text-2xl font-extrabold ring-4 ring-white/20"
                 style={{ background: 'linear-gradient(145deg,#8FE0BD,#2AA37C)' }}>
              {initials}
            </div>
            <div className="mt-4 font-display text-[22px] font-extrabold leading-tight tracking-tight">{profile.full_name}</div>
            <span className="mt-1.5 inline-block rounded-full bg-white/15 px-3 py-0.5 text-[13px] font-medium capitalize">{profile.role}</span>

            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <div className="rounded-[18px] bg-white/[.12] px-4 py-3.5">
                <div className="font-display text-[26px] font-extrabold leading-tight">{student.current_day}/30</div>
                <div className="text-[13px] text-white/80">Ngày tham gia</div>
              </div>
              <div className="rounded-[18px] bg-white/[.12] px-4 py-3.5">
                <div className="font-display text-[26px] font-extrabold leading-tight">{student.evidence_count}</div>
                <div className="text-[13px] text-white/80">Minh chứng đã gửi</div>
              </div>
            </div>

            <button onClick={onLogout}
              className="mt-3.5 w-full rounded-2xl bg-white/15 py-3 text-sm font-semibold transition-colors hover:bg-white/25">
              Đăng xuất
            </button>
          </div>
        </div>
      </section>

      {/* Huy hiệu */}
      <section aria-label="Huy hiệu của tôi">
        <div className="mb-3.5 flex items-baseline justify-between">
          <h2 className="font-display text-xl font-extrabold tracking-tight">Huy hiệu của tôi</h2>
          <span className="text-sm text-ink-600">{earnedCount}/{badges.length} đã đạt</span>
        </div>
        <div className="grid grid-cols-1 gap-3.5 min-[420px]:grid-cols-2">
          {badges.map((b) => {
            const pct = Math.min(100, Math.round((streak / b.needStreak) * 100));
            return (
              <article key={b.id} className="flex flex-col gap-1 rounded-3xl bg-white p-5 shadow-card">
                <div className={`mb-2.5 flex h-14 w-14 items-center justify-center rounded-[18px] text-[28px] ${b.earned ? 'bg-honey-soft ring-1 ring-inset ring-[#EFD5AC]' : 'bg-sand-100 opacity-60 grayscale'}`}>
                  {b.icon}
                </div>
                <h3 className={`text-base font-bold ${b.earned ? '' : 'text-ink-600'}`}>{b.name}</h3>
                <p className="text-[13px] text-ink-600">{b.desc}</p>
                {b.earned ? (
                  <span className="mt-2.5 self-start rounded-full bg-leaf-100 px-3 py-0.5 text-xs font-semibold text-forest-700">Đã đạt</span>
                ) : (
                  <div className="mt-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-sand-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#8FE0BD] to-leaf-500" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-1.5 text-xs text-ink-600">{streak}/{b.needStreak} ngày</div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function RecordModal({ ch, dayNumber, recordChoice, setRecordChoice, note, setNote, photoPreview, onPhotoChange, onClose, onSubmit, submitting }) {
  return (
    <div className="fixed inset-0 z-50 bg-forest-900/55 flex items-end sm:items-center justify-center backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[88vh] overflow-auto">
        <div className="flex items-center justify-between mb-3.5">
          <h3 className="font-bold text-base">📷 Ghi nhận hành động hôm nay</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-sand-100 text-xs">✕</button>
        </div>
        <div className="flex gap-2 mb-4">
          <span className="bg-sand-100 text-ink-600 text-[11.5px] font-bold px-2.5 py-1 rounded-full">Ngày {dayNumber}/30</span>
          <span className="bg-leaf-100 text-forest-700 text-[11.5px] font-bold px-2.5 py-1 rounded-full">{ch.icon} {ch.name}</span>
        </div>
        <div className="mb-3.5">
          <label className="block text-xs font-bold mb-1.5">Hành động của bạn</label>
          {ch.actions.map((a, i) => (
            <label key={i} className={`flex items-center gap-2.5 border rounded-xl px-3 py-2.5 mb-2 text-[13px] font-semibold cursor-pointer ${recordChoice === i ? 'border-leaf-500 bg-leaf-100' : 'border-sand-100'}`}>
              <input type="radio" name="action" checked={recordChoice === i} onChange={() => setRecordChoice(i)} className="accent-forest-700 w-4 h-4" />
              {a}
            </label>
          ))}
        </div>
        <div className="mb-3.5">
          <label className="block text-xs font-bold mb-1.5">Ảnh minh chứng (không bắt buộc)</label>
          <label className="border border-dashed border-sand-100 rounded-xl p-4 text-center text-ink-600 text-xs bg-sand-50 block cursor-pointer">
            {photoPreview ? (
              <img src={photoPreview} alt="Xem trước ảnh minh chứng" className="mx-auto max-h-36 rounded-lg mb-1.5 object-cover" />
            ) : (
              <div className="py-2">📷 Chạm để chụp ảnh hoặc tải ảnh lên</div>
            )}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhotoChange} />
          </label>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-bold mb-1.5">Ghi chú (không bắt buộc)</label>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Ví dụ: mình đã mang bình nước cả ngày..."
            className="w-full border border-sand-100 rounded-xl px-3 py-2.5 text-[13.5px] focus:outline-none focus:border-leaf-500" />
        </div>
        <button onClick={onSubmit} disabled={recordChoice === null || submitting}
          className="w-full bg-leaf-500 text-forest-900 font-bold rounded-xl py-3 text-[13.5px] disabled:opacity-50">
          {submitting ? 'Đang gửi...' : '🌱 GỬI MINH CHỨNG'}
        </button>
      </div>
    </div>
  );
}
