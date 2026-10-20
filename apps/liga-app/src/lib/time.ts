export function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}
export const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export const daysSince = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : Infinity);
