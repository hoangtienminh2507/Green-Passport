// Cành lá mờ ở 4 góc nền trang (theo mẫu giao diện).
// Toạ độ được tính sẵn một lần ở cấp module nên server và client render giống hệt nhau.

const P0 = [14, 262];
const P1 = [34, 120];
const P2 = [132, 14];

const bez = (t) => {
  const u = 1 - t;
  return [
    u * u * P0[0] + 2 * u * t * P1[0] + t * t * P2[0],
    u * u * P0[1] + 2 * u * t * P1[1] + t * t * P2[1],
  ];
};
const tangentDeg = (t) => {
  const u = 1 - t;
  const dx = 2 * u * (P1[0] - P0[0]) + 2 * t * (P2[0] - P1[0]);
  const dy = 2 * u * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1]);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
};
const leafPath = (len) => {
  const w = len * 0.3;
  const f = (n) => n.toFixed(1);
  return `M0 0C${f(len * 0.25)} ${f(-w)} ${f(len * 0.75)} ${f(-w)} ${f(len)} 0C${f(len * 0.75)} ${f(w)} ${f(len * 0.25)} ${f(w)} 0 0Z`;
};

const LEAVES = (() => {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const t = 0.16 + i * 0.125;
    const [x, y] = bez(t);
    const side = i % 2 === 0 ? -1 : 1;
    const rot = tangentDeg(t) + side * 44;
    const len = 66 - i * 4.5;
    out.push({ d: leafPath(len), tf: `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)})` });
  }
  const [tx, ty] = bez(1);
  out.push({ d: leafPath(40), tf: `translate(${tx.toFixed(1)} ${ty.toFixed(1)}) rotate(${tangentDeg(1).toFixed(1)})` });
  return out;
})();

function Sprig({ className = '' }) {
  return (
    <svg
      viewBox="0 0 220 280"
      className={`absolute overflow-visible text-[#E3E9DC] ${className}`}
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        d={`M${P0[0]} ${P0[1]}Q${P1[0]} ${P1[1]} ${P2[0]} ${P2[1]}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {LEAVES.map((l, i) => (
        <path key={i} d={l.d} transform={l.tf} />
      ))}
    </svg>
  );
}

export default function LeafDecor() {
  const size = 'w-[110px] sm:w-[190px] lg:w-[230px]';
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <Sprig className={`${size} left-[-28px] top-[52px] scale-y-[-1] sm:left-[-40px]`} />
      <Sprig className={`${size} hidden bottom-[-30px] left-[-30px] sm:block`} />
      <Sprig className={`${size} right-[-28px] top-[52px] scale-[-1] sm:right-[-40px]`} />
      <Sprig className={`${size} hidden bottom-[-30px] right-[-30px] scale-x-[-1] sm:block`} />
    </div>
  );
}
