'use client';

import { useState, useEffect, useCallback } from 'react';
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
    setStudent(studentRow || null);
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
    setSubmitting(true);
    const challengeId = student.challenge_id || 'plastic';
    const ch = CHALLENGES[challengeId];
    const dayNumber = student.current_day || 1;
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

    const newStreak = (student.streak || 0) + 1;
    const newDay = Math.min(30, dayNumber + 1);
    const newEvidence = (student.evidence_count || 0) + 1;

    await supabase.from('students').update({
      streak: newStreak,
      current_day: newDay,
      evidence_count: newEvidence,
    }).eq('id', session.user.id);

    const earnedBadge = BADGE_DEFS.find((b) => b.needStreak === newStreak);
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
    showToast(earnedBadge ? `Chúc mừng! Bạn vừa đạt huy hiệu "${earnedBadge.name}"` : 'Ngày hôm nay đã được ghi nhận!');
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
            <HomeTab profile={profile} student={student} ch={ch} progress={progress} doneToday={doneToday} today={today}
              onRecord={() => setModalOpen(true)} commitments={commitments} setCommitment={setCommitment} challengeId={challengeId} />
          )}
          {tab === 'journey' && (
            <JourneyTab student={student} dayMap={dayMap} openDay={openDay} setOpenDay={setOpenDay} />
          )}
          {tab === 'auction' && (
            <AuctionTab commitments={commitments} setCommitment={setCommitment} />
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
          ch={ch} dayNumber={student.current_day} recordChoice={recordChoice} setRecordChoice={setRecordChoice}
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

function HomeTab({ profile, student, ch, progress, doneToday, today, onRecord, commitments, setCommitment, challengeId }) {
  const openChallenge = Object.values(CHALLENGES).find((c) => c.id !== challengeId && !commitments[c.id]);
  return (
    <div className="md:grid md:grid-cols-[1.15fr_.85fr] md:gap-6 md:items-start">
      <div>
        <div className="rounded-3xl p-6 text-white relative overflow-hidden"
             style={{ background: 'radial-gradient(400px 220px at 100% 0%, rgba(255,255,255,.14), transparent 60%), linear-gradient(150deg,#1B4332,#0F2A20)' }}>
          <div className="text-[11px] font-bold tracking-wide text-leaf-400 uppercase">Green Passport</div>
          <div className="font-display text-xl font-bold mt-0.5">{profile.full_name}</div>
          <div className="text-xs text-white/70">Lớp {student.class_id ? student.class_id.slice(0, 8) : '—'}</div>
          <div className="mt-4 bg-white/10 rounded-xl px-3.5 py-3 flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] text-white/65 font-semibold">Thử thách</div>
              <div className="font-display font-bold text-sm mt-0.5">{ch.icon} {ch.title}</div>
            </div>
            <div className="bg-leaf-100 text-forest-700 text-xs font-bold px-2.5 py-1 rounded-full">{student.current_day}/30 ngày</div>
          </div>
          <div className="h-2 rounded-full bg-white/15 overflow-hidden mt-3.5">
            <div className="h-full rounded-full" style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#74C69D,#52B788)' }} />
          </div>
          <div className="grid grid-cols-3 gap-2.5 mt-3.5">
            <StatBox num={`${progress}%`} lbl="Tiến độ" />
            <StatBox num={`🔥 ${student.streak}`} lbl="Streak" />
            <StatBox num={`📷 ${student.evidence_count}`} lbl="Minh chứng" />
          </div>
        </div>

        <button onClick={onRecord}
          className={`mt-4 w-full rounded-2xl p-4.5 flex items-center gap-3.5 text-left ${doneToday ? 'bg-sand-100 text-ink-600' : 'text-white shadow-lg'}`}
          style={!doneToday ? { background: 'linear-gradient(135deg,#52B788,#2D6A4F)' } : {}}>
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl ${doneToday ? 'bg-leaf-100 text-forest-700' : 'bg-white/20'}`}>
            {doneToday ? '✅' : '📷'}
          </div>
          <div>
            <div className="font-display font-bold text-[15px]">{doneToday ? 'Hôm nay đã được ghi nhận' : 'GHI NHẬN HÀNH ĐỘNG HÔM NAY'}</div>
            <div className="text-[11.5px] opacity-80 mt-0.5">{doneToday ? (today?.action_text || '') : 'Chỉ mất khoảng 20–30 giây'}</div>
          </div>
        </button>
      </div>

      <div className="mt-6 md:mt-0">
        <SectionTitle icon="🔥" text="Green Streak" />
        <div className="bg-white rounded-2xl shadow p-4.5 flex items-center gap-3.5 mb-4">
          <div className="text-3xl">🔥</div>
          <div>
            <div className="font-bold text-[13.5px]">Duy trì {student.streak} ngày liên tiếp!</div>
            <div className="text-[11.5px] text-ink-600 mt-0.5">Streak chỉ để tạo động lực, không xếp hạng.</div>
          </div>
        </div>
        <SectionTitle icon="🏷️" text="Green Auction đang mở" />
        {openChallenge ? (
          <AuctionCard ch={openChallenge} choice={commitments[openChallenge.id]} onJoin={setCommitment} />
        ) : (
          <div className="bg-white rounded-2xl shadow p-4 text-[12.5px] text-ink-600">Bạn đã phản hồi hết các thử thách đang mở.</div>
        )}
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

function AuctionTab({ commitments, setCommitment }) {
  const list = Object.values(CHALLENGES);
  const [selId, setSelId] = useState(list[0].id);
  const ch = CHALLENGES[selId];
  const choice = commitments[ch.id];
  const joinedCount = list.filter((c) => commitments[c.id] === 'in').length;
  const total = 80, in_ = 62;
  const pct = Math.round((in_ / total) * 100);
  const goingDown = ch.target < ch.baseline;

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

          {ch.actions && (
            <div className="mt-4">
              <h3 className="mb-2 text-[13px] font-semibold text-ink-600">Hành động gợi ý</h3>
              <div className="flex flex-wrap gap-2">
                {ch.actions.map((a) => (
                  <span key={a} className="rounded-full bg-sand-100 px-3.5 py-1.5 text-[13px]">{a}</span>
                ))}
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

function WallTab() {
  // Dữ liệu tổng hợp cộng đồng — có thể thay bằng truy vấn "select challenge_id, count(*) from daily_actions where created_at::date = current_date group by challenge_id"
  const WALL_TODAY = { plastic: 45, energy: 31, waste: 52, green_space: 28 };
  return (
    <div>
      <SectionTitle icon="🌍" text="Green Wall — Cộng đồng hành động" />
      <p className="text-[12.5px] text-ink-600 mb-3.5">Hôm nay cộng đồng đã:</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-5">
        <WallStat num={`🥤 ${WALL_TODAY.plastic}`} lbl="hành động giảm nhựa" />
        <WallStat num={`💡 ${WALL_TODAY.energy}`} lbl="hành động tiết kiệm điện" />
        <WallStat num={`♻️ ${WALL_TODAY.waste}`} lbl="lần phân loại rác" />
        <WallStat num={`🌳 ${WALL_TODAY.green_space}`} lbl="lượt chăm sóc cây" />
      </div>
      <div className="text-[11.5px] text-ink-400">🔒 Không hiển thị bảng xếp hạng cá nhân — chỉ dữ liệu tổng hợp cộng đồng.</div>
    </div>
  );
}
function WallStat({ num, lbl }) {
  return (
    <div className="bg-white rounded-2xl shadow p-3.5">
      <div className="font-display font-extrabold text-xl text-forest-700">{num}</div>
      <div className="text-[11.5px] text-ink-600 mt-0.5">{lbl}</div>
    </div>
  );
}

function MeterTab() {
  // Có thể thay bằng: select count(*) from students where class_id = X, v.v.
  const CLASS_METER = { classroom: '10A1', total: 80, joined: 72, actions: 1248, keeping: 58 };
  const pct = Math.round((CLASS_METER.joined / CLASS_METER.total) * 100);
  return (
    <div>
      <SectionTitle icon="🌱" text="Green Meter — Tiến trình của cả lớp" />
      <div className="bg-white rounded-2xl shadow p-5">
        <div className="font-display font-bold text-base">Lớp {CLASS_METER.classroom}</div>
        <div className="grid grid-cols-2 gap-2.5 mt-3.5">
          <MiniCard icon="🧑‍🤝‍🧑" num={CLASS_METER.total} lbl="Học sinh" />
          <MiniCard icon="✅" num={CLASS_METER.joined} lbl="Đã tham gia" />
          <MiniCard icon="🌱" num={CLASS_METER.actions.toLocaleString('vi-VN')} lbl="Hành động xanh" />
          <MiniCard icon="🔥" num={CLASS_METER.keeping} lbl="Đang duy trì" />
        </div>
        <div className="h-5 rounded-full bg-sand-100 overflow-hidden mt-4.5">
          <div className="h-full rounded-full flex items-center justify-end pr-2.5 text-white text-[11px] font-bold" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#52B788,#2D6A4F)' }}>{pct}%</div>
        </div>
        <div className="text-center font-display font-bold text-forest-700 text-sm mt-4">“Tôi hành động → Lớp tiến lên.”</div>
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
