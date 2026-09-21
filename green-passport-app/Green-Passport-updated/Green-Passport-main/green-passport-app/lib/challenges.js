// Dữ liệu tĩnh dùng cho UI — khớp với bảng `challenges` và `badges` trong Supabase.
// Khi đã nối Supabase thật, bạn có thể thay bằng fetch từ database (xem app/student/page.jsx).

export const CHALLENGES = {
  energy: {
    id: 'energy', icon: '💡', name: 'Energy Detective', title: 'Cửa đóng – Điện xanh',
    baselineLabel: 'Số lần quên tắt điện / ngày (cả lớp)', unit: 'lần/ngày', baseline: 34, target: 15,
    actions: ['Tắt đèn khi ra khỏi phòng', 'Tắt quạt/điều hòa khi không dùng', 'Rút phích cắm thiết bị không dùng', 'Nhắc bạn cùng lớp tắt điện'],
  },
  plastic: {
    id: 'plastic', icon: '🥤', name: 'Plastic Detective', title: 'Mỗi người một bình nước',
    baselineLabel: 'Số chai nhựa dùng 1 lần / ngày (cả lớp)', unit: 'chai/ngày', baseline: 68, target: 47,
    actions: ['Mang bình nước cá nhân', 'Không sử dụng chai nhựa dùng một lần', 'Từ chối ống hút nhựa', 'Nhắc bạn cùng thực hiện'],
  },
  waste: {
    id: 'waste', icon: '♻️', name: 'Waste Detective', title: 'Rác đúng chỗ – Tài nguyên trở lại',
    baselineLabel: 'Tỷ lệ phân loại rác đúng', unit: '%', baseline: 30, target: 70,
    actions: ['Phân loại rác tái chế', 'Phân loại rác hữu cơ', 'Dọn góc rác chung của lớp', 'Nhắc bạn phân loại đúng'],
  },
  transport: {
    id: 'transport', icon: '🚲', name: 'Transport Detective', title: 'Một ngày đến trường xanh',
    baselineLabel: 'Tỷ lệ HS đi lại xanh / ngày', unit: '%', baseline: 22, target: 50,
    actions: ['Đi bộ đến trường', 'Đi xe đạp đến trường', 'Đi phương tiện công cộng', 'Đi chung xe với bạn'],
  },
  green_space: {
    id: 'green_space', icon: '🌳', name: 'Green Space Detective', title: 'Mỗi lớp một góc xanh',
    baselineLabel: 'Số lượt chăm sóc cây / tuần', unit: 'lượt/tuần', baseline: 8, target: 25,
    actions: ['Tưới cây góc xanh của lớp', 'Trồng thêm cây mới', 'Dọn dẹp góc xanh', 'Chăm sóc chậu cây cá nhân'],
  },
};

export const BADGE_DEFS = [
  { id: 'first', icon: '🌱', name: 'First Step', desc: 'Hoàn thành ngày đầu tiên', needStreak: 1 },
  { id: 'week', icon: '🔥', name: '7-Day Green', desc: 'Duy trì 7 ngày liên tiếp', needStreak: 7 },
  { id: 'keeper', icon: '🌿', name: 'Green Keeper', desc: 'Duy trì 14 ngày liên tiếp', needStreak: 14 },
  { id: 'changemaker', icon: '🌍', name: '30-Day Changemaker', desc: 'Hoàn thành 30 ngày', needStreak: 30 },
];
