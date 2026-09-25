import './globals.css';

export const metadata = {
  title: 'Green Passport – 30 Ngày Xanh',
  description: 'Mỗi học sinh một hành trình – Mỗi hành động một dữ liệu – Cả lớp cùng thay đổi.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body className="flex min-h-screen flex-col">
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}

function Footer() {
  return (
    <footer
      className="mt-auto py-4 text-center text-[13px] font-medium text-white"
      style={{ background: 'linear-gradient(100deg,#1D4A3E,#2B7461)' }}
    >
      © {new Date().getFullYear()} Green Passport. All rights reserved.
    </footer>
  );
}
