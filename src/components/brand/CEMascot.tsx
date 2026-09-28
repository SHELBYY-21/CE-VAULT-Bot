// Official CE EMPIRE mascot — React port ของ scripts/ce-mascot.mjs
// กฎ "One Mascot" (docs/mascot-motion-lock.md): ทุกพื้นผิวต้องใช้หุ่นตัวนี้ตัวเดียว
// ห้ามแก้ geometry ในไฟล์นี้โดยลำพัง — แก้ที่ scripts/ce-mascot.mjs แล้ว sync ทั้งคู่

export type CEExpression = 'happy' | 'focused' | 'closed' | 'sad' | 'wink' | 'wide';

interface CEMascotProps {
  expression?: CEExpression;
  size?: number;
  armL?: number;
  armR?: number;
  className?: string;
}

function Face({ expression }: { expression: CEExpression }) {
  switch (expression) {
    case 'focused':
      return (
        <g>
          <ellipse cx="35" cy="42" rx="5" ry="6" fill="#00D4FF" />
          <ellipse cx="53" cy="42" rx="5" ry="6" fill="#00D4FF" />
          <circle cx="36" cy="40.5" r="1.5" fill="#fff" />
          <circle cx="54" cy="40.5" r="1.5" fill="#fff" />
          <path d="M29 35.5 L40 37.5" stroke="#8B97A5" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M59 35.5 L48 37.5" stroke="#8B97A5" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M40 51 L48 51" stroke="#05090E" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      );
    case 'closed':
      return (
        <g>
          <path d="M29.5 42 Q35 38 40.5 42" stroke="#00D4FF" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <path d="M47.5 42 Q53 38 58.5 42" stroke="#00D4FF" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <path d="M38 50 Q44 55 50 50" stroke="#05090E" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'sad':
      return (
        <g>
          <path d="M29.5 41 Q35 45 40.5 41" stroke="#00D4FF" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <path d="M47.5 41 Q53 45 58.5 41" stroke="#00D4FF" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <circle cx="62" cy="48" r="2.2" fill="#00D4FF" opacity=".8" />
          <path d="M39 53 Q44 49.5 49 53" stroke="#05090E" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'wink':
      return (
        <g>
          <ellipse cx="35" cy="42" rx="5.5" ry="7" fill="#00D4FF" />
          <circle cx="36.8" cy="39.5" r="1.8" fill="#fff" />
          <path d="M47.5 42 Q53 38.5 58.5 42" stroke="#00D4FF" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <path d="M38 50 Q44 54.5 50 50" stroke="#05090E" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'wide':
      return (
        <g>
          <ellipse cx="35" cy="42" rx="6.5" ry="8" fill="#00D4FF" />
          <ellipse cx="53" cy="42" rx="6.5" ry="8" fill="#00D4FF" />
          <circle cx="35" cy="42.5" r="2.6" fill="#05090E" />
          <circle cx="53" cy="42.5" r="2.6" fill="#05090E" />
          <ellipse cx="44" cy="51.5" rx="4" ry="2.6" fill="#05090E" />
        </g>
      );
    case 'happy':
    default:
      return (
        <g>
          <ellipse cx="35" cy="42" rx="5.5" ry="7" fill="#00D4FF" />
          <ellipse cx="53" cy="42" rx="5.5" ry="7" fill="#00D4FF" />
          <circle cx="36.8" cy="39.5" r="1.8" fill="#fff" />
          <circle cx="54.8" cy="39.5" r="1.8" fill="#fff" />
          <path d="M38 50 Q44 54.5 50 50" stroke="#05090E" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </g>
      );
  }
}

export default function CEMascot({
  expression = 'happy',
  size = 96,
  armL = 0,
  armR = 0,
  className,
}: CEMascotProps) {
  return (
    <svg
      width={size}
      height={Math.round((size * 96) / 88)}
      viewBox="0 0 88 96"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="CE EMPIRE mascot"
    >
      {/* ฮาโล cyan */}
      <circle cx="44" cy="38" r="33" fill="none" stroke="#00D4FF" strokeOpacity=".14" strokeWidth="2.5" />
      <circle cx="44" cy="38" r="30" fill="none" stroke="#00D4FF" strokeOpacity=".1" strokeWidth="1.4" strokeDasharray="5,7" />
      {/* มงกุฎทอง */}
      <path d="M30 21 L28 8 L36 13 L44 4 L52 13 L60 8 L58 21 Z" fill="#F0B429" stroke="#C58F1A" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M31.5 19 L30 10.5" stroke="#FFD766" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="28" cy="8" r="2" fill="#FFD766" />
      <circle cx="44" cy="4" r="2" fill="#FFD766" />
      <circle cx="60" cy="8" r="2" fill="#FFD766" />
      {/* หัวกรมท่า/เงิน */}
      <path d="M16 42 Q16 19 44 19 Q72 19 72 42 L72 53 Q44 61 16 53 Z" fill="#0C1520" stroke="#8B97A5" strokeWidth="1.2" />
      <path d="M20 30 Q24 22 34 21" stroke="#152030" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".9" />
      {/* หน้ากากเงิน */}
      <rect x="24" y="30" width="40" height="24" rx="11" fill="#C9D2DC" />
      <path d="M26 49 Q44 54 62 49 L62 52.5 Q44 57.5 26 52.5 Z" fill="#8B97A5" opacity=".3" />
      {/* หู */}
      <rect x="8" y="40" width="8" height="14" rx="4" fill="#05090E" stroke="#00D4FF" strokeWidth="1.1" />
      <rect x="72" y="40" width="8" height="14" rx="4" fill="#05090E" stroke="#00D4FF" strokeWidth="1.1" />
      <circle cx="12" cy="47" r="1.9" fill="#00D4FF" />
      <circle cx="76" cy="47" r="1.9" fill="#00D4FF" />
      <Face expression={expression} />
      {/* คอ */}
      <rect x="38" y="57" width="12" height="5" rx="1.6" fill="#8B97A5" />
      {/* ลำตัว */}
      <path d="M26 63 Q44 58 62 63 L65.5 84 Q44 91 22.5 84 Z" fill="#0C1520" stroke="#05090E" strokeWidth="1.2" />
      <circle cx="23" cy="63" r="5.4" fill="#F0B429" stroke="#C58F1A" strokeWidth="1.1" />
      <circle cx="65" cy="63" r="5.4" fill="#F0B429" stroke="#C58F1A" strokeWidth="1.1" />
      {/* แขน (หมุนได้ตาม prop) */}
      <g transform={`rotate(${armL} 22 66)`}>
        <path d="M22 66 Q16 74 16.5 83" stroke="#C9D2DC" strokeWidth="6.5" fill="none" strokeLinecap="round" />
        <circle cx="16.5" cy="85" r="4.6" fill="#F0B429" stroke="#C58F1A" strokeWidth="1" />
      </g>
      <g transform={`rotate(${armR} 66 66)`}>
        <path d="M66 66 Q72 74 71.5 83" stroke="#C9D2DC" strokeWidth="6.5" fill="none" strokeLinecap="round" />
        <circle cx="71.5" cy="85" r="4.6" fill="#F0B429" stroke="#C58F1A" strokeWidth="1" />
      </g>
      {/* ป้าย CE ทอง */}
      <rect x="33" y="66" width="22" height="15" rx="4.5" fill="#F0B429" stroke="#C58F1A" strokeWidth="1.1" />
      <text x="44" y="77.5" textAnchor="middle" fontSize="10" fontWeight="900" fill="#05090E" fontFamily="Arial, Helvetica, sans-serif">CE</text>
      <path d="M29 81 H33" stroke="#00D4FF" strokeWidth="1.1" strokeLinecap="round" opacity=".55" />
      <path d="M55 81 H59" stroke="#00D4FF" strokeWidth="1.1" strokeLinecap="round" opacity=".55" />
      {/* ขา */}
      <rect x="33" y="87" width="9" height="8" rx="3" fill="#05090E" />
      <rect x="46" y="87" width="9" height="8" rx="3" fill="#05090E" />
    </svg>
  );
}
