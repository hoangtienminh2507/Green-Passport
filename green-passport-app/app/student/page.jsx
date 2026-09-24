'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { CHALLENGES, BADGE_DEFS } from '../../lib/challenges';
import AppHeader from '../../components/AppHeader';
import Avatar from '../../components/Avatar';
import LeafDecor from '../../components/LeafDecor';

// Mỗi tab có một màu pastel riêng (theo mẫu). Tab đang chọn chuyển sang xanh đậm.
const TABS = [
  { id: 'home', ic: '🏠', label: 'Trang chủ', color: '#C6E5D8' },
  { id: 'journey', ic: '📅', label: 'Hành trình', color: '#B0CBF8' },
  { id: 'auction', ic: '🏷️', label: 'Green Auction', color: '#F5CD90' },
  { id: 'wall', ic: '🌍', label: 'Green Wall', color: '#90CEE5' },
  { id: 'meter', ic: '📊', label: 'Green Meter', color: '#A7D7AD' },
  { id: 'profile', ic: '🎖️', label: 'Hồ sơ', color: '#F4AF88' },
];

const ROLE_LABEL = { student: 'Học sinh', teacher: 'Giáo viên', admin: 'Quản trị viên' };

const CARD = 'rounded-[20px] bg-white shadow-soft';

export default function StudentPage() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);   // hàng trong bảng users
  const [student, setStudent] = useState(null);   // hàng trong bảng students
  const [classLabel, setClassLabel] = useState(null); // tên lớp (bảng classes), null nếu chưa gán lớp
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

    let cls = null;
    if (studentRow && studentRow.class_id) {
      const { data } = await supabase.from('classes').select('name').eq('id', studentRow.class_id).single();
      cls = data;
    }

    setProfile(userRow || null);
    setStudent(studentRow || null);
    setClassLabel(cls ? cls.name : null);
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
    return (
      <div className="flex min-h-screen items-center justify-center text-sm font-medium text-ink-600">
        Đang tải dữ liệu...
      </div>
    );
  }
  if (!student || !profile) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <LeafDecor />
        <div className="relative z-10 flex flex-col items-center gap-3">
          <div className="text-lg font-bold">Chưa tìm thấy hồ sơ học sinh</div>
          <div className="max-w-sm text-sm text-ink-600">
            Tài khoản này chưa có dữ liệu trong bảng <code>users</code> / <code>students</code>.
            Hãy kiểm tra lại bước tạo hồ sơ sau khi đăng ký, hoặc thêm thủ công trong Supabase Dashboard.
          </div>
          <button onClick={handleLogout} className="mt-2 rounded-[10px] bg-pine-700 px-5 py-2.5 text-sm font-bold text-white hover:brightness-95">Đăng xuất</button>
        </div>
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
    <div className="relative min-h-screen">
      <LeafDecor />
      <AppHeader
        user={{ name: profile.full_name, role: ROLE_LABEL[profile.role] || profile.role }}
        onOpenProfile={() => setTab('profile')}
        onLogout={handleLogout}
      />

      <main className="relative z-10 mx-auto w-full max-w-[880px] px-4 pb-28 pt-6 sm:px-6 md:pb-14 md:pt-8">
        {/* Thanh tab màu (desktop) */}
        <nav aria-label="Điều hướng chính" className="mb-7 hidden grid-cols-6 gap-3 md:grid">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[64px] items-center justify-center rounded-[14px] px-4 py-3 text-center text-[14px] font-bold leading-snug transition-[transform,box-shadow] hover:-translate-y-0.5 ${active ? 'text-white shadow-soft' : 'text-header'}`}
                style={{ backgroundColor: active ? '#113B25' : t.color }}
              >
                <span>
                  <span aria-hidden="true" className="mr-1.5">{t.ic}</span>
                  {t.label}
                </span>
              </button>
            );
          })}
        </nav>

        {tab === 'home' && (
          <HomeTab profile={profile} student={student} classLabel={classLabel} ch={ch} progress={progress}
            doneToday={doneToday} today={today} onRecord={() => setModalOpen(true)}
            commitments={commitments} setCommitment={setCommitment} challengeId={challengeId} />
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
      </main>

      {/* Thanh điều hướng dưới (mobile) */}
      <nav aria-label="Điều hướng chính"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 gap-1 border-t border-line bg-white/95 px-1.5 pt-2 backdrop-blur md:hidden"
        style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom,0px))' }}>
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-0.5 py-1.5 text-center text-[10px] font-semibold leading-tight ${active ? 'text-white' : 'text-ink-600'}`}
              style={active ? { backgroundColor: '#113B25' } : undefined}>
              <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-lg text-[16px]"
                style={active ? undefined : { backgroundColor: t.color }}>{t.ic}</span>
              {t.label}
            </button>
          );
        })}
      </nav>

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
        <div role="status" className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 animate-rise whitespace-nowrap rounded-full bg-header px-5 py-3 text-sm font-semibold text-white shadow-pop md:bottom-6">
          ✅ {toast}
        </div>
      )}
    </div>
  );
}

/* ---------------- Sub-components ---------------- */

function useMountedFlag() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return ready;
}

function CameraIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#fff" d="M17 9c-1 0-1.9.5-2.4 1.4L13.2 13H8a4 4 0 0 0-4 4v20a4 4 0 0 0 4 4h32a4 4 0 0 0 4-4V17a4 4 0 0 0-4-4h-5.2l-1.4-2.6C32.9 9.5 32 9 31 9H17z" />
      <circle cx="24" cy="26" r="8.5" fill="#257167" />
      <circle cx="24" cy="26" r="5.5" fill="#fff" />
      <circle cx="24" cy="26" r="2.5" fill="#257167" />
    </svg>
  );
}

// Hoa văn địa hình mờ ở góc trên phải của thẻ Passport
function CardTexture() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 400 420"
      preserveAspectRatio="xMaxYMin slice" fill="none" aria-hidden="true">
      <path d="M230 0c30 40 10 80 60 110s70 70 110 60V0z" fill="#fff" fillOpacity=".045" />
      <path d="M300 0c-10 50 30 70 50 100s30 60 50 70V0z" fill="#fff" fillOpacity=".04" />
      <g stroke="#fff" strokeOpacity=".08" strokeWidth="1.2">
        <path d="M180 0c40 50 20 110 80 150s90 40 140 20" />
        <path d="M210 0c40 50 20 100 80 135s80 35 110 15" />
        <path d="M250 0c30 40 10 80 60 105s60 30 90 15" />
        <path d="M120 420c60-60 120-40 170-100s40-90 110-120" />
        <path d="M150 420c60-50 110-30 160-90s45-85 90-105" />
      </g>
    </svg>
  );
}

function ProgressRing({ value, ready, size = 80 }) {
  const stroke = 4.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const shown = ready ? value : 0;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#7ED3AE" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)}
          style={{ transition: 'stroke-dashoffset .9s cubic-bezier(.22,.8,.3,1)' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-[18px] font-bold">{value}%</span>
        <span className="mt-1 text-[10.5px] text-white/70">Tiến độ</span>
      </div>
    </div>
  );
}

function HomeTab({ profile, student, classLabel, ch, progress, doneToday, today, onRecord, commitments, setCommitment, challengeId }) {
  const ready = useMountedFlag();
  const openChallenge = Object.values(CHALLENGES).find((c) => c.id !== challengeId && !commitments[c.id]);
  return (
    <div className="md:grid md:grid-cols-[1.32fr_1fr] md:items-start md:gap-6">
      <div>
        <section aria-label="Green Passport"
          className="relative overflow-hidden rounded-[22px] p-6 text-white shadow-hero"
          style={{ background: 'radial-gradient(420px 240px at 100% 0%, rgba(116,198,157,.2), transparent 62%), linear-gradient(165deg,#256A5E 0%,#205656 38%,#1A3B40 100%)' }}>
          <CardTexture />
          <div className="relative">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-[#6FCB9F]">Green Passport</div>
            <div className="mt-1 text-[26px] font-bold leading-tight">{profile.full_name}</div>
            <div className="mt-1 text-[14px] text-white/80">Lớp {classLabel || '—'}</div>

            <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3.5">
              <div className="min-w-0">
                <div className="text-[12px] font-medium text-white/70">Thử thách</div>
                <div className="mt-1 flex items-center gap-2 text-[16px] font-bold leading-snug">
                  <span aria-hidden="true">{ch.icon}</span>
                  <span>{ch.title}</span>
                </div>
              </div>
              <div className="shrink-0 rounded-full bg-mint-100 px-3 py-1.5 text-[12.5px] font-bold text-[#1B4332]">
                {student.current_day}/30 ngày
              </div>
            </div>

            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/15"
              role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Tiến độ thử thách">
              <div className="h-full rounded-full bg-mint-500"
                style={{ width: ready ? `${progress}%` : '0%', transition: 'width .9s cubic-bezier(.22,.8,.3,1)' }} />
            </div>

            <div className="mt-5 grid grid-cols-3 items-center">
              <div className="flex justify-center"><ProgressRing value={progress} ready={ready} /></div>
              <Stat icon="🔥" num={student.streak} label="Streak" />
              <Stat icon="📷" num={student.evidence_count} label="Minh chứng" />
            </div>
          </div>
        </section>

        <button type="button" onClick={onRecord}
          className={`mt-4 flex w-full items-center gap-4 rounded-[10px] px-4 py-3.5 text-left transition-[filter,transform] hover:brightness-95 active:translate-y-px ${doneToday ? 'border border-line bg-white text-ink shadow-soft' : 'bg-pine-700 text-white shadow-soft'}`}>
          {doneToday ? (
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mint-100 text-lg">✅</span>
          ) : (
            <CameraIcon className="h-9 w-9 shrink-0" />
          )}
          <span className="min-w-0">
            <span className="block text-[15px] font-bold leading-snug sm:text-[16px]">
              {doneToday ? 'Hôm nay đã được ghi nhận' : 'GHI NHẬN HÀNH ĐỘNG HÔM NAY'}
            </span>
            <span className={`mt-0.5 block text-[12.5px] ${doneToday ? 'text-ink-600' : 'text-white/85'}`}>
              {doneToday ? (today?.action_text || '') : 'Chỉ mất khoảng 20–30 giây'}
            </span>
          </span>
        </button>
      </div>

      <div className="mt-7 md:mt-0">
        <SectionTitle icon="🔥" text="Green Streak" />
        <div className={`${CARD} mb-6 flex items-center gap-4 px-5 py-4`}>
          <div className="text-[38px] leading-none" aria-hidden="true">🔥</div>
          <div>
            <div className="text-[15.5px] font-bold">Duy trì {student.streak} ngày liên tiếp!</div>
            <div className="mt-0.5 text-[12px] text-ink-600">Streak chỉ để tạo động lực, không xếp hạng.</div>
          </div>
        </div>

        <SectionTitle icon="🏷️" text="Green Auction đang mở" />
        {openChallenge ? (
          <AuctionCard ch={openChallenge} choice={commitments[openChallenge.id]} onJoin={setCommitment} />
        ) : (
          <div className={`${CARD} px-5 py-5 text-[13px] text-ink-700`}>Bạn đã phản hồi hết các thử thách đang mở.</div>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, num, label }) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-2 text-[24px] font-bold leading-none">
        <span aria-hidden="true" className="text-[22px]">{icon}</span>
        <span>{num}</span>
      </div>
      <div className="mt-1.5 text-[12px] text-white/75">{label}</div>
    </div>
  );
}

function SectionTitle({ icon, text }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-header">
      <span aria-hidden="true">{icon}</span>{text}
    </h2>
  );
}

function AuctionCard({ ch, choice, onJoin }) {
  const total = 80, in_ = 62;
  const pct = Math.round((in_ / total) * 100);
  return (
    <div className={`${CARD} mb-4 overflow-hidden`}>
      <div className="px-5 pt-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-mint-100 px-2.5 py-1 text-[12px] font-bold text-[#1B4332]">
          <span aria-hidden="true">{ch.icon}</span>{ch.name}
        </span>
        <div className="mt-2 text-[16px] font-bold">{ch.title}</div>
      </div>
      <div className="px-5 pb-5 pt-2">
        <Row k="Vấn đề" v={`${ch.baselineLabel} còn cao`} />
        <Row k="Dữ liệu ban đầu" v={`${ch.baseline} ${ch.unit}`} />
        <Row k="Mục tiêu" v={`≤ ${ch.target} ${ch.unit}`} last />
        {choice ? (
          <>
            <div className="mt-3 rounded-xl bg-canvas px-3.5 py-3">
              <div className="mb-1.5 flex justify-between text-xs font-bold"><span>{in_}/{total} học sinh tham gia</span><span>{pct}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-pine-700" style={{ width: `${pct}%` }} /></div>
            </div>
            <div className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-bold ${choice === 'in' ? 'bg-mint-100 text-[#1B4332]' : 'bg-canvas text-ink-600'}`}>
              {choice === 'in' ? "🟢 Bạn đã tham gia — I'M IN" : '🔴 Bạn chọn — NOT YET'}
            </div>
          </>
        ) : (
          <div className="mt-4 flex gap-2.5">
            <button type="button" onClick={() => onJoin(ch.id, 'in')} className="flex-1 rounded-[10px] bg-pine-700 py-2.5 text-[13px] font-bold text-white hover:brightness-95">🟢 I'M IN</button>
            <button type="button" onClick={() => onJoin(ch.id, 'skip')} className="flex-1 rounded-[10px] border border-line bg-white py-2.5 text-[13px] font-bold text-ink-700 hover:bg-canvas">🔴 NOT YET</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ k, v, last }) {
  return (
    <div className={`flex justify-between gap-3 py-2.5 text-[12.5px] ${last ? '' : 'border-b border-dashed border-line'}`}>
      <span className="shrink-0 font-semibold text-ink-600">{k}</span>
      <span className="text-right font-bold">{v}</span>
    </div>
  );
}

const DAY_STATUS = {
  confirmed: { label: 'Giáo viên đã xác nhận', bg: '#257167', fg: '#fff', mark: '✓' },
  done: { label: 'Đã thực hiện', bg: '#64BF9C', fg: '#0F2A1D', mark: '✓' },
  needs: { label: 'Cần bổ sung minh chứng', bg: '#E3A63C', fg: '#0F2A1D', mark: '!' },
  empty: { label: 'Chưa cập nhật', bg: '#E7ECE3', fg: '#7E9084', mark: '' },
};

function JourneyTab({ student, dayMap, openDay, setOpenDay }) {
  const entry = openDay ? dayMap[openDay] : null;
  return (
    <div>
      <SectionTitle icon="📅" text="My Green Journey — Hành trình 30 ngày" />
      <div className={`${CARD} p-5`}>
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-10">
          {Array.from({ length: 30 }, (_, idx) => {
            const day = idx + 1;
            const e = dayMap[day];
            const status = e ? e.status : (day >= student.current_day ? 'empty' : 'done');
            const s = DAY_STATUS[status] || DAY_STATUS.empty;
            const isToday = day === student.current_day;
            const isOpen = day === openDay;
            return (
              <button key={day} type="button" onClick={() => setOpenDay(day)}
                aria-label={`Ngày ${day} — ${s.label}`}
                className={`flex aspect-square flex-col items-center justify-center rounded-xl text-[13px] font-bold transition-transform hover:-translate-y-0.5 ${isToday ? 'ring-2 ring-header ring-offset-2' : ''} ${isOpen ? 'scale-105' : ''}`}
                style={{ backgroundColor: s.bg, color: s.fg }}>
                <span>{day}</span>
                <span className="h-3 text-[10px] leading-3 opacity-90" aria-hidden="true">{s.mark}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[11.5px] text-ink-600">
          {['confirmed', 'done', 'needs', 'empty'].map((k) => <Legend key={k} color={DAY_STATUS[k].bg} label={DAY_STATUS[k].label} />)}
        </div>
        {entry && (
          <div className="mt-4 rounded-xl bg-canvas p-4 text-[12.5px]">
            <Row k="Ngày" v={`${openDay}/30`} />
            <Row k="Hành động" v={entry.action_text || '—'} />
            <Row k="Trạng thái" v={entry.status === 'confirmed' ? '🔵 Đã xác nhận' : entry.status === 'needs' ? '🟡 Cần bổ sung' : '🟢 Đã thực hiện'} last />
          </div>
        )}
        {openDay && !entry && <div className="mt-4 rounded-xl bg-canvas p-4 text-[12.5px] text-ink-600">Chưa có dữ liệu cho ngày này.</div>}
      </div>
    </div>
  );
}

function Legend({ color, label }) {
  return <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded" style={{ background: color }} />{label}</span>;
}

function AuctionTab({ commitments, setCommitment }) {
  return (
    <div>
      <SectionTitle icon="🏷️" text="Green Auction — Đấu giá thử thách xanh" />
      <p className="mb-5 max-w-xl text-[13px] leading-relaxed text-ink-600">Không phải đấu giá bằng tiền — mỗi thử thách dựa trên dữ liệu thật của lớp. Chọn "I'm in" để cam kết tham gia.</p>
      <div className="md:grid md:grid-cols-2 md:items-start md:gap-4">
        {Object.values(CHALLENGES).map((c) => (
          <AuctionCard key={c.id} ch={c} choice={commitments[c.id]} onJoin={setCommitment} />
        ))}
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
      <p className="mb-4 text-[13px] text-ink-600">Hôm nay cộng đồng đã:</p>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon="🥤" tint="#DCEFF7" num={WALL_TODAY.plastic} lbl="hành động giảm nhựa" />
        <StatCard icon="💡" tint="#FBEBCF" num={WALL_TODAY.energy} lbl="hành động tiết kiệm điện" />
        <StatCard icon="♻️" tint="#DDF0E0" num={WALL_TODAY.waste} lbl="lần phân loại rác" />
        <StatCard icon="🌳" tint="#E6EFD9" num={WALL_TODAY.green_space} lbl="lượt chăm sóc cây" />
      </div>
      <div className="text-[12px] text-ink-400">🔒 Không hiển thị bảng xếp hạng cá nhân — chỉ dữ liệu tổng hợp cộng đồng.</div>
    </div>
  );
}

function StatCard({ icon, tint, num, lbl }) {
  return (
    <div className={`${CARD} p-4`}>
      <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-xl text-[18px]" style={{ backgroundColor: tint }}>{icon}</span>
      <div className="mt-3 text-[26px] font-extrabold leading-none text-pine-700">{num}</div>
      <div className="mt-1.5 text-[12px] text-ink-600">{lbl}</div>
    </div>
  );
}

function MeterTab() {
  // Có thể thay bằng: select count(*) from students where class_id = X, v.v.
  const CLASS_METER = { classroom: '10A1', total: 80, joined: 72, actions: 1248, keeping: 58 };
  const notJoined = CLASS_METER.total - CLASS_METER.joined;
  const activeNotKeeping = CLASS_METER.joined - CLASS_METER.keeping;
  const joinPct = Math.round((CLASS_METER.joined / CLASS_METER.total) * 100);
  const streakPct = Math.round((CLASS_METER.keeping / CLASS_METER.joined) * 100);
  const avgActions = Math.round(CLASS_METER.actions / CLASS_METER.joined);

  return (
    <div>
      <SectionTitle icon="🌱" text="Green Meter — Tiến trình của cả lớp" />

      <div className="relative overflow-hidden rounded-[22px] p-6 text-white shadow-hero sm:p-7"
        style={{ background: 'radial-gradient(480px 260px at 100% 0%, rgba(116,198,157,.18), transparent 60%), linear-gradient(165deg,#1E5449 0%,#173B32 45%,#0F2A22 100%)' }}>
        <CardTexture />
        <div className="relative md:grid md:grid-cols-[1.1fr_1fr] md:gap-8">
          {/* Cột trái: số liệu tổng hợp của lớp */}
          <div>
            <span className="inline-block rounded-full bg-white/12 px-3 py-1 text-[12.5px] font-bold">Lớp {CLASS_METER.classroom}</span>
            <div className="mt-4 font-display text-[44px] font-extrabold leading-none sm:text-[52px]">
              {CLASS_METER.actions.toLocaleString('vi-VN')}
            </div>
            <div className="mt-1.5 text-[14px] text-white/80">hành động xanh của cả lớp</div>
            <div className="mt-4 text-[13px] leading-relaxed text-white/75">
              <span className="font-bold text-white">{CLASS_METER.joined} trên {CLASS_METER.total}</span> bạn đang cùng hành động. Mỗi chiếc lá là một học sinh của lớp.
            </div>

            <div className="mt-5">
              <div className="mb-1.5 flex items-center justify-between text-[12.5px] font-bold">
                <span className="text-white/75">Tỷ lệ tham gia</span>
                <span>{joinPct}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/12">
                <div className="h-full rounded-full" style={{ width: `${joinPct}%`, background: 'linear-gradient(90deg,#8FE0BD,#E3A63C)' }} />
              </div>
            </div>
          </div>

          {/* Cột phải: mỗi chiếc lá = một học sinh của lớp */}
          <div className="mt-6 md:mt-0">
            <LeafGrid total={CLASS_METER.total} lit={CLASS_METER.joined} />
          </div>
        </div>

        <div className="relative mt-6 flex flex-wrap gap-2.5">
          <MeterBadge icon="🔥" label="Đang duy trì" num={CLASS_METER.keeping} tone="solidLight" />
          <MeterBadge icon="🌿" label="Đã tham gia" num={activeNotKeeping} tone="solidDark" />
          <MeterBadge icon="↩️" label="Chưa tham gia" num={notJoined} tone="outline" />
        </div>

        <div className="relative mt-6 text-center text-[14.5px] font-bold text-[#BFEAD3]">“Tôi hành động → Lớp tiến lên.”</div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MeterStatCard icon="🔥" tint="#FDE9D8" value={`${streakPct}%`} label="bạn tham gia đang giữ streak" />
        <MeterStatCard icon="🌱" tint="#DDF0E0" value={`≈${avgActions}`} label="hành động mỗi bạn tham gia" />
        <MeterStatCard icon="🎯" tint="#F3DCEE" value={`${notJoined} bạn`} label="nữa là cả lớp cùng hành động" />
      </div>
    </div>
  );
}

function LeafGrid({ total, lit }) {
  return (
    <div className="grid grid-cols-8 gap-2 sm:grid-cols-10 sm:gap-2.5">
      {Array.from({ length: total }, (_, i) => (
        <GreenMeterLeaf key={i} lit={i < lit} />
      ))}
    </div>
  );
}

function GreenMeterLeaf({ lit }) {
  return (
    <span
      aria-hidden="true"
      className="block"
      style={{
        width: '100%',
        aspectRatio: '1 / 1',
        borderRadius: '0 65% 0 65%',
        transform: 'rotate(45deg)',
        background: lit ? 'linear-gradient(155deg,#FBDD8B,#E3A63C)' : 'transparent',
        border: lit ? 'none' : '1.5px dashed rgba(255,255,255,.28)',
        opacity: lit ? 1 : 0.55,
        boxShadow: lit ? '0 0 14px rgba(243,197,103,.55)' : 'none',
      }}
    />
  );
}

function MeterBadge({ icon, label, num, tone }) {
  const toneClass = tone === 'solidLight'
    ? 'bg-white text-[#123725]'
    : tone === 'solidDark'
      ? 'bg-[#0F2A22] text-white ring-1 ring-inset ring-white/15'
      : 'border border-dashed border-white/35 text-white/85';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold ${toneClass}`}>
      <span aria-hidden="true">{icon}</span>{label} {num}
    </span>
  );
}

function MeterStatCard({ icon, tint, value, label }) {
  return (
    <div className={`${CARD} flex items-center gap-3.5 p-4`}>
      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[19px]" style={{ backgroundColor: tint }}>{icon}</span>
      <div>
        <div className="text-[19px] font-extrabold leading-none text-pine-700">{value}</div>
        <div className="mt-1 text-[12px] leading-snug text-ink-600">{label}</div>
      </div>
    </div>
  );
}

function MiniCard({ icon, num, lbl }) {
  return (
    <div className="rounded-2xl bg-canvas p-4">
      <div className="text-[18px]" aria-hidden="true">{icon}</div>
      <div className="mt-1 text-[20px] font-bold leading-tight">{num}</div>
      <div className="mt-0.5 text-[11.5px] text-ink-600">{lbl}</div>
    </div>
  );
}

function ProfileTab({ profile, student, onLogout }) {
  return (
    <div>
      <SectionTitle icon="🎖️" text="Huy hiệu của tôi" />
      <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {BADGE_DEFS.map((b) => {
          const earned = student.streak >= b.needStreak || (b.id === 'first' && student.current_day > 1);
          return (
            <div key={b.id} className={`rounded-[18px] p-4 text-center ${earned ? 'shadow-soft' : 'bg-[#E7ECE3] text-ink-400'}`}
              style={earned ? { background: 'linear-gradient(160deg,#FFF7E4,#FDECC1)', color: '#8a5a12' } : undefined}>
              <div className={`text-[26px] ${earned ? '' : 'opacity-50 grayscale'}`} aria-hidden="true">{b.icon}</div>
              <div className="mt-1.5 text-[12.5px] font-bold">{b.name}</div>
              <div className="mt-0.5 text-[10.5px] opacity-80">{b.desc}</div>
            </div>
          );
        })}
      </div>

      <SectionTitle icon="👤" text="Hồ sơ của tôi" />
      <div className={`${CARD} p-5`}>
        <div className="flex items-center gap-3.5">
          <Avatar size={56} />
          <div>
            <div className="text-[15px] font-bold">{profile.full_name}</div>
            <div className="mt-0.5 text-[12.5px] text-ink-600">{ROLE_LABEL[profile.role] || profile.role}</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <MiniCard icon="📅" num={`${student.current_day}/30`} lbl="Ngày tham gia" />
          <MiniCard icon="📷" num={student.evidence_count} lbl="Minh chứng đã gửi" />
        </div>
        <button type="button" onClick={onLogout} className="mt-4 w-full rounded-[10px] border border-line bg-white py-2.5 text-sm font-bold text-ink-700 hover:bg-canvas">Đăng xuất</button>
      </div>
    </div>
  );
}

function RecordModal({ ch, dayNumber, recordChoice, setRecordChoice, note, setNote, photoPreview, onPhotoChange, onClose, onSubmit, submitting }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Ghi nhận hành động hôm nay"
      className="fixed inset-0 z-50 flex items-end justify-center bg-header/60 backdrop-blur-sm sm:items-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-t-[24px] bg-white p-6 shadow-pop sm:rounded-[24px]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[17px] font-bold">📷 Ghi nhận hành động hôm nay</h3>
          <button type="button" onClick={onClose} aria-label="Đóng" className="flex h-8 w-8 items-center justify-center rounded-full bg-canvas text-xs hover:bg-line">✕</button>
        </div>
        <div className="mb-5 flex gap-2">
          <span className="rounded-full bg-canvas px-2.5 py-1 text-[11.5px] font-bold text-ink-600">Ngày {dayNumber}/30</span>
          <span className="rounded-full bg-mint-100 px-2.5 py-1 text-[11.5px] font-bold text-[#1B4332]">{ch.icon} {ch.name}</span>
        </div>
        <div className="mb-4">
          <div className="mb-2 text-xs font-bold">Hành động của bạn</div>
          {ch.actions.map((a, i) => (
            <label key={i} className={`mb-2 flex cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] font-semibold ${recordChoice === i ? 'border-pine-700 bg-mint-50' : 'border-line hover:bg-canvas'}`}>
              <input type="radio" name="action" checked={recordChoice === i} onChange={() => setRecordChoice(i)} className="h-4 w-4 accent-[#257167]" />
              {a}
            </label>
          ))}
        </div>
        <div className="mb-4">
          <div className="mb-2 text-xs font-bold">Ảnh minh chứng (không bắt buộc)</div>
          <label className="block cursor-pointer rounded-xl border border-dashed border-[#B9C9B9] bg-canvas p-4 text-center text-xs text-ink-600 hover:bg-mint-50">
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoPreview} alt="Xem trước ảnh minh chứng" className="mx-auto mb-1.5 max-h-36 rounded-lg object-cover" />
            ) : (
              <div className="py-2">📷 Chạm để chụp ảnh hoặc tải ảnh lên</div>
            )}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhotoChange} />
          </label>
        </div>
        <div className="mb-5">
          <label htmlFor="evidence-note" className="mb-2 block text-xs font-bold">Ghi chú (không bắt buộc)</label>
          <textarea id="evidence-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Ví dụ: mình đã mang bình nước cả ngày..."
            className="w-full rounded-xl border border-line px-3.5 py-2.5 text-[13.5px] focus:border-pine-700 focus:outline-none" />
        </div>
        <button type="button" onClick={onSubmit} disabled={recordChoice === null || submitting}
          className="w-full rounded-[10px] bg-pine-700 py-3 text-[14px] font-bold text-white hover:brightness-95 disabled:opacity-50">
          {submitting ? 'Đang gửi...' : '🌱 GỬI MINH CHỨNG'}
        </button>
      </div>
    </div>
  );
}
