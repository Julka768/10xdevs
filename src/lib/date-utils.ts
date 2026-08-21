export interface WeekBounds {
  currentWeekStart: string;
  currentWeekEnd: string;
  priorWeekStart: string;
  priorWeekEnd: string;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Monday-Sunday week containing `referenceDate`, plus the 7 days immediately
 * before it. Computed in UTC (not local time) so the result is deterministic
 * regardless of the host machine's timezone.
 */
export function getWeekBounds(referenceDate: Date): WeekBounds {
  const offset = (referenceDate.getUTCDay() + 6) % 7; // Mon=0 ... Sun=6

  const currentStart = new Date(referenceDate);
  currentStart.setUTCHours(0, 0, 0, 0);
  currentStart.setUTCDate(currentStart.getUTCDate() - offset);

  const currentEnd = new Date(currentStart);
  currentEnd.setUTCDate(currentEnd.getUTCDate() + 6);

  const priorEnd = new Date(currentStart);
  priorEnd.setUTCDate(priorEnd.getUTCDate() - 1);

  const priorStart = new Date(priorEnd);
  priorStart.setUTCDate(priorStart.getUTCDate() - 6);

  return {
    currentWeekStart: toDateString(currentStart),
    currentWeekEnd: toDateString(currentEnd),
    priorWeekStart: toDateString(priorStart),
    priorWeekEnd: toDateString(priorEnd),
  };
}
