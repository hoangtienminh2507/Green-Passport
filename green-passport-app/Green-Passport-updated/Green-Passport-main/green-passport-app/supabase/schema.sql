-- ============================================================
-- GREEN PASSPORT – 30 NGÀY XANH
-- Schema database cho Supabase (PostgreSQL)
-- Chạy toàn bộ file này trong Supabase Dashboard -> SQL Editor
-- ============================================================

-- Bật extension cần thiết
create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- 1. USERS / PROFILES (mở rộng từ auth.users có sẵn của Supabase)
-- ------------------------------------------------------------
create type user_role as enum ('student', 'teacher', 'admin');

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null default 'student',
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 2. CLASSES (lớp học)
-- ------------------------------------------------------------
create table if not exists public.classes (
  id uuid primary key default uuid_generate_v4(),
  name text not null,               -- vd: '10A1'
  teacher_id uuid references public.users(id),
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 3. STUDENTS (hồ sơ học sinh, gắn với users + classes)
-- ------------------------------------------------------------
create table if not exists public.students (
  id uuid primary key references public.users(id) on delete cascade,
  class_id uuid references public.classes(id),
  streak int default 0,
  evidence_count int default 0,
  current_day int default 1,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 4. TEACHERS (hồ sơ giáo viên)
-- ------------------------------------------------------------
create table if not exists public.teachers (
  id uuid primary key references public.users(id) on delete cascade,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 5. TEAMS (5 đội phụ trách 5 thử thách)
-- ------------------------------------------------------------
create table if not exists public.teams (
  id uuid primary key default uuid_generate_v4(),
  class_id uuid references public.classes(id),
  challenge_id text not null,        -- 'energy' | 'plastic' | 'waste' | 'transport' | 'green_space'
  name text not null,
  created_at timestamptz default now()
);

create table if not exists public.team_members (
  team_id uuid references public.teams(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  primary key (team_id, student_id)
);

-- ------------------------------------------------------------
-- 6. CHALLENGES (5 thử thách xanh cố định)
-- ------------------------------------------------------------
create table if not exists public.challenges (
  id text primary key,               -- 'energy' | 'plastic' | 'waste' | 'transport' | 'green_space'
  name text not null,
  title text not null,
  baseline_label text,
  unit text,
  baseline numeric,
  target numeric,
  actions jsonb not null default '[]'::jsonb   -- danh sách hành động gợi ý
);

insert into public.challenges (id, name, title, baseline_label, unit, baseline, target, actions) values
  ('energy','Energy Detective','Cửa đóng – Điện xanh','Số lần quên tắt điện / ngày (cả lớp)','lần/ngày',34,15,
   '["Tắt đèn khi ra khỏi phòng","Tắt quạt/điều hòa khi không dùng","Rút phích cắm thiết bị không dùng","Nhắc bạn cùng lớp tắt điện"]'),
  ('plastic','Plastic Detective','Mỗi người một bình nước','Số chai nhựa dùng 1 lần / ngày (cả lớp)','chai/ngày',68,47,
   '["Mang bình nước cá nhân","Không sử dụng chai nhựa dùng một lần","Từ chối ống hút nhựa","Nhắc bạn cùng thực hiện"]'),
  ('waste','Waste Detective','Rác đúng chỗ – Tài nguyên trở lại','Tỷ lệ phân loại rác đúng','%',30,70,
   '["Phân loại rác tái chế","Phân loại rác hữu cơ","Dọn góc rác chung của lớp","Nhắc bạn phân loại đúng"]'),
  ('transport','Transport Detective','Một ngày đến trường xanh','Tỷ lệ HS đi lại xanh / ngày','%',22,50,
   '["Đi bộ đến trường","Đi xe đạp đến trường","Đi phương tiện công cộng","Đi chung xe với bạn"]'),
  ('green_space','Green Space Detective','Mỗi lớp một góc xanh','Số lượt chăm sóc cây / tuần','lượt/tuần',8,25,
   '["Tưới cây góc xanh của lớp","Trồng thêm cây mới","Dọn dẹp góc xanh","Chăm sóc chậu cây cá nhân"]')
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 7. COMMITMENTS (Green Auction: học sinh cam kết I'm in / Not yet)
-- ------------------------------------------------------------
create table if not exists public.commitments (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references public.students(id) on delete cascade,
  challenge_id text references public.challenges(id),
  choice text check (choice in ('in','skip')) not null,
  created_at timestamptz default now(),
  unique (student_id, challenge_id)
);

-- ------------------------------------------------------------
-- 8. DAILY_ACTIONS (ghi nhận hành động mỗi ngày)
-- ------------------------------------------------------------
create table if not exists public.daily_actions (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references public.students(id) on delete cascade,
  challenge_id text references public.challenges(id),
  day_number int not null,             -- 1..30
  action_text text not null,
  note text,
  status text check (status in ('done','confirmed','needs')) default 'done',
  created_at timestamptz default now(),
  unique (student_id, day_number)
);

-- ------------------------------------------------------------
-- 9. EVIDENCE (ảnh minh chứng, lưu trong Supabase Storage, bảng này lưu đường dẫn)
-- ------------------------------------------------------------
create table if not exists public.evidence (
  id uuid primary key default uuid_generate_v4(),
  daily_action_id uuid references public.daily_actions(id) on delete cascade,
  file_path text not null,             -- đường dẫn trong Supabase Storage bucket 'evidence'
  confirmed_by uuid references public.users(id),
  confirmed_at timestamptz,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 10. BADGES (định nghĩa huy hiệu + huy hiệu học sinh đã đạt)
-- ------------------------------------------------------------
create table if not exists public.badges (
  id text primary key,                 -- 'first' | 'week' | 'keeper' | 'changemaker'
  name text not null,
  description text,
  need_streak int not null
);

insert into public.badges (id, name, description, need_streak) values
  ('first','First Step','Hoàn thành ngày đầu tiên',1),
  ('week','7-Day Green','Duy trì 7 ngày liên tiếp',7),
  ('keeper','Green Keeper','Duy trì 14 ngày liên tiếp',14),
  ('changemaker','30-Day Changemaker','Hoàn thành 30 ngày',30)
on conflict (id) do nothing;

create table if not exists public.student_badges (
  student_id uuid references public.students(id) on delete cascade,
  badge_id text references public.badges(id),
  earned_at timestamptz default now(),
  primary key (student_id, badge_id)
);

-- ------------------------------------------------------------
-- 11. STREAKS (lịch sử streak - tuỳ chọn, dùng để audit)
-- ------------------------------------------------------------
create table if not exists public.streaks (
  id uuid primary key default uuid_generate_v4(),
  student_id uuid references public.students(id) on delete cascade,
  streak_count int not null,
  recorded_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 12. SURVEYS / SURVEY_RESULTS (pre-survey & post-survey)
-- ------------------------------------------------------------
create table if not exists public.surveys (
  id uuid primary key default uuid_generate_v4(),
  class_id uuid references public.classes(id),
  type text check (type in ('pre','post')) not null,
  challenge_id text references public.challenges(id),
  created_at timestamptz default now()
);

create table if not exists public.survey_results (
  id uuid primary key default uuid_generate_v4(),
  survey_id uuid references public.surveys(id) on delete cascade,
  student_id uuid references public.students(id),
  value numeric,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 13. BASELINE_DATA / POST_DATA (dữ liệu trước / sau 30 ngày theo thử thách)
-- ------------------------------------------------------------
create table if not exists public.baseline_data (
  id uuid primary key default uuid_generate_v4(),
  class_id uuid references public.classes(id),
  challenge_id text references public.challenges(id),
  value numeric not null,
  measured_at timestamptz default now()
);

create table if not exists public.post_data (
  id uuid primary key default uuid_generate_v4(),
  class_id uuid references public.classes(id),
  challenge_id text references public.challenges(id),
  value numeric not null,
  measured_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 14. REPORTS (Green Data Report đã tạo)
-- ------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default uuid_generate_v4(),
  class_id uuid references public.classes(id),
  challenge_id text references public.challenges(id),
  before_value numeric,
  after_value numeric,
  change_percent numeric,
  generated_by uuid references public.users(id),
  created_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Bật RLS và policy cơ bản: học sinh chỉ thấy dữ liệu của mình,
-- giáo viên thấy dữ liệu lớp mình, admin thấy toàn bộ.
-- Bạn nên rà soát và tinh chỉnh lại các policy này trước khi
-- dùng thật cho trường học.
-- ============================================================

alter table public.users enable row level security;
alter table public.students enable row level security;
alter table public.daily_actions enable row level security;
alter table public.evidence enable row level security;
alter table public.commitments enable row level security;
alter table public.student_badges enable row level security;

-- Học sinh chỉ đọc/ghi hồ sơ và dữ liệu của chính mình
create policy "students read own profile" on public.users
  for select using (auth.uid() = id);

create policy "students read own student row" on public.students
  for select using (auth.uid() = id);

create policy "students manage own daily actions" on public.daily_actions
  for all using (auth.uid() = student_id) with check (auth.uid() = student_id);

create policy "students manage own evidence" on public.evidence
  for all using (
    exists (select 1 from public.daily_actions da where da.id = daily_action_id and da.student_id = auth.uid())
  );

create policy "students manage own commitments" on public.commitments
  for all using (auth.uid() = student_id) with check (auth.uid() = student_id);

create policy "students read own badges" on public.student_badges
  for select using (auth.uid() = student_id);

-- Lưu ý: giáo viên/admin cần policy riêng (dựa vào public.users.role)
-- để được xem toàn bộ dữ liệu của lớp mình / toàn hệ thống.
-- Ví dụ mẫu cho giáo viên xem daily_actions của học sinh lớp mình:
--
-- create policy "teachers read class daily actions" on public.daily_actions
--   for select using (
--     exists (
--       select 1 from public.students s
--       join public.classes c on c.id = s.class_id
--       where s.id = daily_actions.student_id and c.teacher_id = auth.uid()
--     )
--   );
