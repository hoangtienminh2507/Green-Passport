import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';

export async function POST(req) {
  try {
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: 'Thiếu userId' }, { status: 400 });

    const admin = getSupabaseAdmin();

    // Lấy email thật từ auth.users (Admin API) và tên + token xác nhận từ bảng students/users
    const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(userId);
    if (authErr || !authUser?.user?.email) {
      return NextResponse.json({ error: 'Không tìm thấy email của tài khoản này' }, { status: 404 });
    }
    const email = authUser.user.email;

    const { data: userRow } = await admin.from('users').select('full_name').eq('id', userId).single();
    const { data: studentRow } = await admin.from('students').select('confirm_token, email_confirmed').eq('id', userId).single();

    if (studentRow?.email_confirmed) {
      return NextResponse.json({ ok: true, alreadyConfirmed: true });
    }

    const token = studentRow?.confirm_token;
    if (!token) return NextResponse.json({ error: 'Không tìm thấy mã xác nhận' }, { status: 404 });

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || req.headers.get('origin') || '';
    const confirmUrl = `${siteUrl}/api/confirm?token=${token}`;
    const fullName = userRow?.full_name || 'bạn';

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return NextResponse.json({ error: 'Chưa cấu hình RESEND_API_KEY trên server' }, { status: 500 });
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'Green Passport <onboarding@resend.dev>',
        to: [email],
        subject: '🌱 Xác nhận tài khoản Green Passport – 30 Ngày Xanh',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
            <h2 style="color:#1B4332;">🌱 Green Passport – 30 Ngày Xanh</h2>
            <p>Chào ${fullName},</p>
            <p>Bạn vừa đăng nhập vào Green Passport bằng tài khoản Google. Bấm nút bên dưới để xác nhận và bắt đầu hành trình 30 ngày xanh:</p>
            <p style="text-align:center;margin:28px 0;">
              <a href="${confirmUrl}" style="background:#52B788;color:#0F2A20;padding:12px 24px;border-radius:12px;text-decoration:none;font-weight:bold;display:inline-block;">
                ✅ Xác nhận tài khoản
              </a>
            </p>
            <p style="font-size:12px;color:#7E9084;">Nếu nút không bấm được, copy link sau vào trình duyệt:<br>${confirmUrl}</p>
          </div>
        `,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      return NextResponse.json({ error: 'Gửi email thất bại: ' + errText }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Lỗi không xác định' }, { status: 500 });
  }
}
