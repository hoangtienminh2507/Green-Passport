'use client';

import { usePathname } from 'next/navigation';

// Chân trang chỉ hiện ở các trang học sinh (/student và các trang con của nó),
// ẩn ở trang giáo viên (/teacher) và trang đăng nhập (/).
export default function ConditionalFooter() {
  const pathname = usePathname();
  const showFooter = pathname?.startsWith('/student');

  if (!showFooter) return null;

  return (
    <footer
      className="mt-auto py-4 text-center text-[13px] font-medium text-white"
      style={{ background: 'linear-gradient(100deg,#1D4A3E,#2B7461)' }}
    >
      © {new Date().getFullYear()} Green Passport. All rights reserved.
    </footer>
  );
}
