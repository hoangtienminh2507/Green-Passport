# 🌱 Green Passport – 30 Ngày Xanh

Website học sinh cho chương trình thử thách môi trường 30 ngày.
Dự án Next.js (App Router) + Tailwind CSS + Supabase (Auth + Database).

Đây là bản mã nguồn được tách ra từ bản demo tĩnh, đã nối vào **Supabase thật**
(đăng ký/đăng nhập thật, dữ liệu ghi nhận hành động được lưu vào database thật,
mỗi học sinh có tài khoản riêng — không còn dùng chung `localStorage` như bản demo).

---

## 1. Cấu trúc dự án

```
green-passport-app/
├── app/
│   ├── layout.jsx          # layout gốc
│   ├── page.jsx            # trang đăng nhập / đăng ký (Supabase Auth)
│   ├── globals.css         # Tailwind + font
│   └── student/
│       └── page.jsx        # toàn bộ trang học sinh (Passport, Journey, Auction, Wall, Meter, Hồ sơ)
├── lib/
│   ├── supabaseClient.js   # khởi tạo Supabase client
│   └── challenges.js       # dữ liệu 5 thử thách + huy hiệu (khớp với bảng challenges/badges)
├── supabase/
│   └── schema.sql          # toàn bộ schema database (16 bảng) + RLS policies
├── package.json
├── tailwind.config.js
├── next.config.js
├── .env.local.example
└── README.md  ← file này
```

> Bản này tập trung vào **website học sinh**. Trang Giáo viên/Admin dùng cùng
> schema Supabase (đã có sẵn trong `supabase/schema.sql`) nhưng chưa có giao diện
> trong bản mã này — có thể làm tiếp theo cùng cấu trúc `app/teacher/` và `app/admin/`.

---

## 2. Thiết lập Supabase (làm trước tiên)

1. Vào [supabase.com](https://supabase.com) → tạo tài khoản miễn phí → **New Project**.
2. Đặt tên project, chọn mật khẩu database, chọn khu vực gần Việt Nam (Singapore).
3. Sau khi project khởi tạo xong, vào **SQL Editor** → **New query**.
4. Copy toàn bộ nội dung file `supabase/schema.sql` trong dự án này → dán vào → bấm **Run**.
   → Việc này tạo toàn bộ 16 bảng dữ liệu + dữ liệu mẫu 5 thử thách + 4 huy hiệu + các policy bảo mật (RLS).
5. Vào **Project Settings → API**, lấy 2 giá trị:
   - `Project URL`
   - `anon public key`
6. (Tuỳ chọn nhưng nên làm) Vào **Authentication → Providers**, đảm bảo **Email** provider đang bật.
   Nếu muốn học sinh đăng ký không cần xác nhận email (phù hợp môi trường lớp học thử nghiệm):
   **Authentication → Settings → Email Auth → tắt "Confirm email"**.
7. (Tuỳ chọn) Vào **Storage → Create bucket**, đặt tên `evidence`, để lưu ảnh minh chứng thật
   (bản mã hiện tại chưa upload ảnh thật, chỉ có chỗ trống UI sẵn — xem ghi chú trong
   `app/student/page.jsx` phần `RecordModal`).

---

## 3. Chạy thử trên máy (tuỳ chọn, cần Node.js ≥ 18)

```bash
npm install
cp .env.local.example .env.local
# Mở .env.local, dán NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_ANON_KEY vừa lấy ở bước 2
npm run dev
```

Mở `http://localhost:3000` → đăng ký tài khoản học sinh mới để thử.

---

## 4. Đẩy code lên GitHub

```bash
cd green-passport-app
git init
git add .
git commit -m "Green Passport - khoi tao du an"
```

Sau đó lên [github.com](https://github.com) → **New repository** (để trống, không tick "Add README") → copy 2 dòng lệnh GitHub đưa ra, dạng:

```bash
git remote add origin https://github.com/<ten-ban>/<ten-repo>.git
git branch -M main
git push -u origin main
```

> File `.env.local` đã được thêm vào `.gitignore` nên sẽ **không** bị đẩy lên GitHub —
> điều này đúng và an toàn (khoá Supabase sẽ khai báo riêng trên Vercel ở bước sau).

---

## 5. Deploy lên Vercel

1. Vào [vercel.com](https://vercel.com) → đăng nhập bằng tài khoản GitHub.
2. Bấm **Add New → Project** → chọn repo vừa đẩy lên.
3. Vercel tự nhận diện đây là dự án Next.js — không cần chỉnh build command.
4. Trước khi bấm **Deploy**, mở mục **Environment Variables**, thêm đúng 2 biến:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL lấy ở bước 2 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key lấy ở bước 2 |

5. Bấm **Deploy**. Sau khoảng 1–2 phút, Vercel cấp cho bạn link dạng
   `https://ten-du-an.vercel.app` — đây là website thật, ai cũng vào được.

Từ lần sau, mỗi khi bạn `git push` lên GitHub, Vercel **tự động deploy lại** — không cần thao tác thủ công.

---

## 6. Tạo tài khoản demo để test nhanh

Sau khi deploy xong, vào trang web → bấm "Chưa có tài khoản? Đăng ký ngay" → tạo 1 tài khoản học sinh thử.
Tài khoản này sẽ tự động có 1 dòng trong bảng `users` (role = `student`) và 1 dòng trong bảng `students`
(current_day = 1, streak = 0). Bạn có thể vào Supabase → **Table Editor → students** để gán thử
`challenge_id = 'plastic'` cho tài khoản đó nếu muốn học sinh bắt đầu với thử thách Plastic Detective.

---

## 7. Việc còn cần làm thêm (gợi ý bước tiếp theo)

- [ ] Giao diện Giáo viên (`app/teacher/`): xem danh sách học sinh, xác nhận minh chứng,
      dashboard theo thử thách, Green Data Report — dùng chung schema đã có.
- [ ] Giao diện Admin (`app/admin/`): quản lý lớp/đội/tài khoản.
- [ ] Upload ảnh minh chứng thật lên Supabase Storage (bucket `evidence`).
- [ ] Green Wall / Green Meter hiện đang dùng số liệu mẫu cố định — có thể thay bằng
      truy vấn tổng hợp thật từ bảng `daily_actions` (đã ghi chú vị trí cần sửa trong code).
- [ ] Gán `class_id`, `challenge_id` cho học sinh khi đăng ký (hiện đang để trống, cần chọn
      lớp/thử thách trong form đăng ký hoặc để giáo viên gán sau trong Admin).
- [ ] Tinh chỉnh lại RLS policy cho vai trò giáo viên/admin (đã có chú thích mẫu trong
      `supabase/schema.sql`).

---

**Thông điệp:** “Một lựa chọn → Một hành động → Một con số → Một thay đổi.”
