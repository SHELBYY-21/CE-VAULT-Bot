/** Bangkok calendar helpers (pure — safe for client + server) */

/** วันที่ปัจจุบันตามโซนไทย YYYY-MM-DD */
export function bangkokDate(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** เวลาปัจจุบันไทย อ่านง่าย */
export function bangkokNowLabel(d = new Date()): string {
  return d.toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
