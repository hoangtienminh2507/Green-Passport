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

  async function submitEvidence() {
    if (recordChoice === null || !student) return;
    setSubmitting(true);
    const challengeId = student.challenge_id || 'plastic';
    const ch = CHALLENGES[challengeId];
    const dayNumber = student.current_day || 1;
    const actionText = ch.actions[recordChoice];

    const { error } = await supabase.from('daily_actions').insert({
      student_id: session.user.id,
      challenge_id: challengeId,
      day_number: dayNumber,
      action_text: actionText,
      note: note || null,
      status: 'done',
    });

    if (error) {
      showToast('Có lỗi khi gửi minh chứng: ' + error.message);
      setSubmitting(false);
      return;
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
      <div className="sticky top-0 z-20 text-white px-4 py-3.5 flex items-center justify-between"
           style={{ background: 'linear-gradient(180deg,#163C2C,#1B4332)', paddingTop: 'calc(14px + env(safe-area-inset-top,0px))' }}>
        <div className="flex items-center gap-2">
          <span className="text-lg">🌱</span>
          <span className="font-display font-bold text-sm">Green Passport</span>
        </div>
        <button onClick={handleLogout} className="w-8 h-8 rounded-full bg-white/15 text-xs">⏻</button>
      </div>

      <div className="flex-1 flex justify-center">
        <div className="w-full max-w-3xl px-4 py-5 pb-24">

          {/* desktop tabs */}
          <div className="hidden md:flex gap-1.5 bg-white p-1.5 rounded-xl shadow mb-6 w-fit">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 ${tab === t.id ? 'bg-forest-700 text-white' : 'text-ink-600 hover:bg-sand-100'}`}>
                {t.ic} {t.label}
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
          note={note} setNote={setNote} onClose={() => setModalOpen(false)} onSubmit={submitEvidence} submitting={submitting}
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

function AuctionCard({ ch, choice, onJoin }) {
  const total = 80, in_ = 62;
  const pct = Math.round((in_ / total) * 100);
  return (
    <div className="bg-white rounded-2xl shadow overflow-hidden mb-3.5">
      <div className="px-4 pt-3.5">
        <span className="inline-flex items-center gap-1 bg-leaf-100 text-forest-700 text-[11.5px] font-bold px-2.5 py-1 rounded-full">{ch.icon} {ch.name}</span>
        <div className="font-display font-bold text-[15px] mt-2">{ch.title}</div>
      </div>
      <div className="px-4 pb-4 pt-1.5">
        <Row k="Vấn đề" v={`${ch.baselineLabel} còn cao`} />
        <Row k="Dữ liệu ban đầu" v={`${ch.baseline} ${ch.unit}`} />
        <Row k="Mục tiêu" v={`≤ ${ch.target} ${ch.unit}`} last />
        {choice ? (
          <>
            <div className="mt-3 bg-sand-50 rounded-xl px-3 py-2.5">
              <div className="flex justify-between text-xs font-bold mb-1.5"><span>{in_}/{total} học sinh tham gia</span><span>{pct}%</span></div>
              <div className="h-2 rounded-full bg-sand-100 overflow-hidden"><div className="h-full rounded-full bg-forest-600" style={{ width: `${pct}%` }} /></div>
            </div>
            <div className={`mt-3 inline-block text-xs font-bold px-2.5 py-1 rounded-full ${choice === 'in' ? 'bg-leaf-100 text-forest-700' : 'bg-sand-100 text-ink-600'}`}>
              {choice === 'in' ? "🟢 Bạn đã tham gia — I'M IN" : '🔴 Bạn chọn — NOT YET'}
            </div>
          </>
        ) : (
          <div className="flex gap-2.5 mt-3">
            <button onClick={() => onJoin(ch.id, 'in')} className="flex-1 bg-leaf-500 text-forest-900 font-bold rounded-xl py-2.5 text-[13px]">🟢 I'M IN</button>
            <button onClick={() => onJoin(ch.id, 'skip')} className="flex-1 border border-sand-100 font-bold rounded-xl py-2.5 text-[13px]">🔴 NOT YET</button>
          </div>
        )}
      </div>
    </div>
  );
}
function Row({ k, v, last }) {
  return (
    <div className={`flex justify-between gap-2.5 py-2 text-[12.5px] ${last ? '' : 'border-b border-dashed border-sand-100'}`}>
      <span className="text-ink-600 font-semibold">{k}</span><span className="font-bold text-right">{v}</span>
    </div>
  );
}

function JourneyTab({ student, dayMap, openDay, setOpenDay }) {
  const entry = openDay ? dayMap[openDay] : null;
  return (
    <div>
      <SectionTitle icon="📅" text="My Green Journey — Hành trình 30 ngày" />
      <div className="bg-white rounded-2xl shadow p-4.5">
        <div className="grid grid-cols-6 sm:grid-cols-10 gap-2">
          {Array.from({ length: 30 }, (_, idx) => {
            const day = idx + 1;
            const e = dayMap[day];
            const status = e ? e.status : (day > student.current_day ? 'empty' : day === student.current_day ? 'empty' : 'done');
            const bg = status === 'confirmed' ? 'bg-forest-600' : status === 'done' ? 'bg-leaf-500' : status === 'needs' ? 'bg-amber-500' : 'bg-sand-100 text-ink-400';
            const icon = status === 'confirmed' ? '🔵' : status === 'done' ? '🟢' : status === 'needs' ? '🟡' : '⚪';
            return (
              <button key={day} onClick={() => setOpenDay(day)}
                className={`aspect-square rounded-lg flex flex-col items-center justify-center text-white text-[11px] font-bold ${bg} ${day === student.current_day ? 'ring-2 ring-forest-800 ring-offset-1' : ''}`}>
                <div className="text-[13px]">{icon}</div><div className="text-[10px] opacity-85">{day}</div>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 mt-3.5 text-[11.5px] text-ink-600">
          <Legend color="#2D6A4F" label="Giáo viên đã xác nhận" />
          <Legend color="#52B788" label="Đã thực hiện" />
          <Legend color="#E3A63C" label="Cần bổ sung minh chứng" />
          <Legend color="#DCE6DC" label="Chưa cập nhật" />
        </div>
        {entry && (
          <div className="mt-3.5 bg-sand-50 rounded-xl p-3.5 text-[12.5px] space-y-1.5">
            <Row k="Ngày" v={`${openDay}/30`} />
            <Row k="Hành động" v={entry.action_text || '—'} />
            <Row k="Trạng thái" v={entry.status === 'confirmed' ? '🔵 Đã xác nhận' : entry.status === 'needs' ? '🟡 Cần bổ sung' : '🟢 Đã thực hiện'} last />
          </div>
        )}
        {openDay && !entry && <div className="mt-3.5 bg-sand-50 rounded-xl p-3.5 text-[12.5px] text-ink-600">Chưa có dữ liệu cho ngày này.</div>}
      </div>
    </div>
  );
}
function Legend({ color, label }) {
  return <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded" style={{ background: color }} />{label}</span>;
}

function AuctionTab({ commitments, setCommitment }) {
  return (
    <div>
      <SectionTitle icon="🏷️" text="Green Auction — Đấu giá thử thách xanh" />
      <p className="text-[12.5px] text-ink-600 mb-4">Không phải đấu giá bằng tiền — mỗi thử thách dựa trên dữ liệu thật của lớp. Chọn "I'm in" để cam kết tham gia.</p>
      <div className="md:grid md:grid-cols-2 md:gap-3.5">
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
  return (
    <div>
      <SectionTitle icon="🎖️" text="Huy hiệu của tôi" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
        {BADGE_DEFS.map((b) => (
          <div key={b.id} className={`rounded-2xl p-3.5 text-center ${student.streak >= b.needStreak || (b.id === 'first' && student.current_day > 1) ? 'shadow' : 'bg-sand-100 text-ink-400'}`}
               style={student.streak >= b.needStreak ? { background: 'linear-gradient(160deg,#FFF7E4,#FDECC1)', color: '#8a5a12' } : {}}>
            <div className="text-2xl">{b.icon}</div>
            <div className="font-bold text-xs mt-1">{b.name}</div>
            <div className="text-[10px] opacity-80 mt-0.5">{b.desc}</div>
          </div>
        ))}
      </div>
      <SectionTitle icon="👤" text="Hồ sơ của tôi" />
      <div className="bg-white rounded-2xl shadow p-4.5">
        <div className="flex items-center gap-3">
          <div className="w-13 h-13 rounded-full flex items-center justify-center text-white font-bold" style={{ width: 52, height: 52, background: 'linear-gradient(145deg,#74C69D,#2D6A4F)' }}>
            {profile.full_name?.split(' ').slice(-2).map((w) => w[0]).join('').toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-sm">{profile.full_name}</div>
            <div className="text-xs text-ink-600 mt-0.5">{profile.role}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 mt-4">
          <MiniCard icon="📅" num={`${student.current_day}/30`} lbl="Ngày tham gia" />
          <MiniCard icon="📷" num={student.evidence_count} lbl="Minh chứng đã gửi" />
        </div>
        <button onClick={onLogout} className="w-full bg-sand-100 font-bold rounded-xl py-2.5 text-sm mt-4">Đăng xuất</button>
      </div>
    </div>
  );
}

function RecordModal({ ch, dayNumber, recordChoice, setRecordChoice, note, setNote, onClose, onSubmit, submitting }) {
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
          <label className="block text-xs font-bold mb-1.5">Ảnh minh chứng</label>
          <div className="border border-dashed border-sand-100 rounded-xl p-5 text-center text-ink-600 text-xs bg-sand-50">
            📷 Chạm để chụp ảnh hoặc tải ảnh lên<br />
            <span className="text-[10px] text-ink-400">(Kết nối Supabase Storage bucket "evidence" để lưu ảnh thật)</span>
          </div>
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
