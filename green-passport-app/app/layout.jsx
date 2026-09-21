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
      <body>{children}</body>
    </html>
  );
}
