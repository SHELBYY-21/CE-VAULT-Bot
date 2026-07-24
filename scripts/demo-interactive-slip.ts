import { writeFileSync, mkdirSync } from 'fs';
import {
  interactiveSlipReceived,
  interactiveSlipChecking,
  interactiveSlipComplete,
} from '../src/lib/botUi';

function strip(s: string) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

const stages: [string, { text: string; reply_markup?: unknown }][] = [
  ['① ส่งสลิปเสร็จ', interactiveSlipReceived()],
  ['② กำลังตรวจสอบ (55%)', interactiveSlipChecking(55)],
  [
    '③ เสร็จสิ้น',
    interactiveSlipComplete({
      thb: 5000,
      usdt: 125,
      bank: 'KBANK',
      last4: '7890',
      confidence: 96,
      ledgerRef: 'CE-20260724-DEMO',
      transactionId: 'demo-tx',
      pinMatched: true,
      profitThb: 62.5,
      title: '✔ OCR สำเร็จ · บันทึกแล้ว',
      subtitle: 'ตรงบัญชีปักหมุด',
    }),
  ],
];

let md = '# Interactive slip UI — ตัวอย่าง 3 สถานะ\n\n';
for (const [title, m] of stages) {
  md += `## ${title}\n\n\`\`\`\n${strip(m.text)}\n\`\`\`\n\n`;
  const kb = (m.reply_markup as { inline_keyboard?: { text: string }[][] } | undefined)
    ?.inline_keyboard;
  if (kb) md += 'ปุ่ม: ' + kb.flat().map((b) => b.text).join(' · ') + '\n\n';
}

mkdirSync('/opt/cursor/artifacts', { recursive: true });
writeFileSync('/opt/cursor/artifacts/interactive-slip-ui-demo.md', md);
writeFileSync('/tmp/interactive-slip-ui-demo.md', md);
console.log(md);
