// Avatar mặc định (hình minh hoạ). Bảng users chưa có cột ảnh đại diện,
// nên khi có avatar_url sau này chỉ cần truyền vào prop `src`.
export default function Avatar({ size = 32, src }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="shrink-0 rounded-full" aria-hidden="true">
      <rect width="40" height="40" fill="#D3EBDD" />
      <path d="M5 41c1-8.5 7.5-12.5 15-12.5S34 32.5 35 41z" fill="#2F6F5E" />
      <rect x="17" y="22" width="6" height="8" rx="3" fill="#EDBE96" />
      <ellipse cx="20" cy="16.5" rx="8" ry="9" fill="#F7D3B1" />
      <path d="M11.5 16c-.9-6.8 3.5-10.8 8.8-10.8 5.5 0 9.2 3.9 8.2 10.8-1.2-3.3-3.3-5-6-5.6-3.2 1.3-7.2 1.5-11 5.6z" fill="#2B2A2A" />
      <circle cx="16.7" cy="17.8" r="1" fill="#2B2A2A" />
      <circle cx="23.3" cy="17.8" r="1" fill="#2B2A2A" />
      <path d="M17.3 21.4c1.6 1.3 3.8 1.3 5.4 0" stroke="#B5684A" strokeWidth="1.1" fill="none" strokeLinecap="round" />
    </svg>
  );
}
