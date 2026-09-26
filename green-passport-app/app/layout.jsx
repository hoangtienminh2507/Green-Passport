import './globals.css';
import ConditionalFooter from './ConditionalFooter';

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
        <ConditionalFooter />
      </body>
    </html>
  );
}
