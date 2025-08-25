import { addDays, addMonths, endOfMonth, endOfWeek, isAfter, isBefore, parseISO, startOfMonth, startOfWeek } from "date-fns";
import type { Task } from "./types";

export function expandRecurrence(task: Task, start: Date, end: Date): { date: Date; baseId: string }[] {
  const results: { date: Date; baseId: string }[] = [];
  const baseDue = parseISO(task.dueDate);
  const r = task.recurrence;
  if (r.type === "none") {
    if (!isBefore(baseDue, start) && !isAfter(baseDue, end)) results.push({ date: baseDue, baseId: task.id });
    return results;
  }
  if (r.type === "daily") {
    let d = new Date(baseDue);
    while (isBefore(d, start)) d = addDays(d, r.interval);
    while (!isAfter(d, end)) { results.push({ date: d, baseId: task.id }); d = addDays(d, r.interval); }
    return results;
  }
  if (r.type === "weekly") {
    let w = startOfWeek(new Date(Math.max(+baseDue, +start)), { weekStartsOn: 0 });
    while (!isAfter(w, end)) {
      for (const wd of (task.recurrence.type === "weekly" ? task.recurrence.weekdays : []).sort()) {
        const occ = addDays(w, wd);
        if (!isBefore(occ, start) && !isAfter(occ, end)) results.push({ date: occ, baseId: task.id });
      }
      w = addDays(w, 7 * (task.recurrence.type === "weekly" ? task.recurrence.interval : 1));
    }
    return results;
  }
  // monthly
  let m = new Date(baseDue);
  const interval = task.recurrence.type === "monthly" ? task.recurrence.interval : 1;
  const day = task.recurrence.type === "monthly" ? task.recurrence.day : baseDue.getDate();
  while (isBefore(m, start)) m = addMonths(m, interval);
  while (!isAfter(m, end)) {
    const occ = new Date(m.getFullYear(), m.getMonth(), day, baseDue.getHours(), baseDue.getMinutes());
    if (!isBefore(occ, start) && !isAfter(occ, end)) results.push({ date: occ, baseId: task.id });
    m = addMonths(m, interval);
  }
  return results;
}

export function monthGridRange(viewDate: Date) {
  const start = startOfWeek(startOfMonth(viewDate), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(viewDate), { weekStartsOn: 0 });
  return { start, end };
}
