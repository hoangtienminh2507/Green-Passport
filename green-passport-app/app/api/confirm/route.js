import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';

export async function GET(req) {
  const { searchParams, origin } = new URL(req.url);
  const token = searchParams.get('token');

  if (!token) {
    return new NextResponse('Thiếu mã xác nhận.', { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: studentRow, error } = await admin
    .from('students')
    .select('id')
    .eq('confirm_token', token)
    .single();

  if (error || !studentRow) {
    return new NextResponse(
      '<html><body style="font-family:sans-serif;text-align:center;padding:60px 20px;"><h2>❌ Link không hợp lệ hoặc đã hết hạn</h2><p>Hãy thử đăng nhập lại để nhận email xác nhận mới.</p></body></html>',
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  await admin.from('students').update({ email_confirmed: true }).eq('id', studentRow.id);

  // Chuyển thẳng vào app sau khi xác nhận xong
  return NextResponse.redirect(`${origin}/student`);
}
