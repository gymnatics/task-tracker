import React, { useEffect, useMemo, useState } from "react";
import { format, isBefore, isSameDay, parseISO, addMonths, subMonths } from "date-fns";
import { utcToZonedTime } from "date-fns-tz";
import emailjs from "emailjs-com";
import type { Task, Recurrence, Priority, SettingsModel } from "./types";
import { expandRecurrence, monthGridRange } from "./utils";
import "./index.css";

const TZ = "Asia/Singapore";
const uid = () => Math.random().toString(36).slice(2);
const tz = (d: Date) => utcToZonedTime(d, TZ);

function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem("task-tracker.tasks");
    return raw ? (JSON.parse(raw) as Task[]) : [];
  } catch { return []; }
}
function saveTasks(tasks: Task[]) { localStorage.setItem("task-tracker.tasks", JSON.stringify(tasks)); }

function loadSettings(): SettingsModel {
  try {
    const raw = localStorage.getItem("task-tracker.settings");
    if (!raw) return { inAppNotifications: true, emailNotifications: false, hasOnboarded: false };
    const base = JSON.parse(raw) as SettingsModel;
    return {
      inAppNotifications: base.inAppNotifications ?? true,
      emailNotifications: base.emailNotifications ?? false,
      emailTo: base.emailTo ?? undefined,
      emailServiceId: base.emailServiceId || (import.meta as any).env?.VITE_EMAILJS_SERVICE_ID,
      emailTemplateId: base.emailTemplateId || (import.meta as any).env?.VITE_EMAILJS_TEMPLATE_ID,
      emailPublicKey: base.emailPublicKey || (import.meta as any).env?.VITE_EMAILJS_PUBLIC_KEY,
      hasOnboarded: base.hasOnboarded ?? false,
    };
  } catch { return { inAppNotifications: true, emailNotifications: false, hasOnboarded: false }; }
}
function saveSettings(s: SettingsModel) { localStorage.setItem("task-tracker.settings", JSON.stringify(s)); }

export default function App() {
  const [tasks, setTasks] = useState<Task[]>(loadTasks());
  const [tab, setTab] = useState<"list" | "calendar">("list");
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [viewDate, setViewDate] = useState(new Date());
  const [settings, setSettings] = useState<SettingsModel>(loadSettings());

  useEffect(() => saveTasks(tasks), [tasks]);
  useEffect(() => saveSettings(settings), [settings]);

  useEffect(() => {
    let timer: any;
    async function ensurePermission() {
      if (!settings.inAppNotifications) return;
      if (typeof Notification === "undefined") return;
      if (Notification.permission === "default") await Notification.requestPermission();
    }
    ensurePermission();

    function tick() {
      const now = new Date();
      const nowMin = Math.floor(+now / 60000);
      setTasks((prev) =>
        prev.map((t) => {
          if (t.status !== "active") return t;
          const dueMin = Math.floor(+parseISO(t.dueDate) / 60000);
          const already = t.notifiedAt ? Math.floor(+parseISO(t.notifiedAt) / 60000) === dueMin : false;
          if (dueMin === nowMin && !already) {
            if (settings.inAppNotifications && typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification("Task due", { body: `${t.name} is due now` });
            }
            if (settings.emailNotifications && settings.emailTo && settings.emailServiceId && settings.emailTemplateId && settings.emailPublicKey) {
              try {
                emailjs.send(
                  settings.emailServiceId,
                  settings.emailTemplateId,
                  { to_email: settings.emailTo, task_name: t.name, due_at: t.dueDate },
                  settings.emailPublicKey
                );
              } catch {}
            }
            return { ...t, notifiedAt: now.toISOString() };
          }
          return t;
        })
      );
    }
    timer = setInterval(tick, 15000);
    return () => clearInterval(timer);
  }, [settings.inAppNotifications, settings.emailNotifications, settings.emailTo, settings.emailServiceId, settings.emailTemplateId, settings.emailPublicKey]);

  const { start, end } = monthGridRange(viewDate);
  const days: Date[] = []; { let d = new Date(start); while (+d <= +end) { days.push(new Date(d)); d.setDate(d.getDate()+1); } }

  const occs = useMemo(() => {
    const list: { task: Task; date: Date }[] = [];
    for (const t of tasks) {
      if (t.status === "completed" || t.status === "paused") continue;
      for (const e of expandRecurrence(t, start, end)) list.push({ task: t, date: e.date });
    }
    return list;
  }, [tasks, start, end]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => [t.name, t.description || "", t.priority, t.status, ...(t.categories || [])].join(" ").toLowerCase().includes(q));
  }, [tasks, query]);

  function upsertTask(input: Omit<Task, "id" | "createdAt"> & Partial<Pick<Task, "id" | "createdAt">>) {
    const nowIso = new Date().toISOString();
    if (!input.id) {
      const t: Task = {
        id: uid(),
        createdAt: nowIso,
        ...input,
        name: input.name || "Untitled task",
        description: input.description || "",
        categories: input.categories || []
      } as Task;
      setTasks((prev) => [t, ...prev]);
    } else {
      setTasks((prev) => prev.map((p) => (p.id === input.id ? { ...p, ...input } as Task : p)));
    }
  }
  function removeTask(id: string) { setTasks((prev) => prev.filter((t) => t.id !== id)); }
  function toggleComplete(id: string) { setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: t.status === "completed" ? "active" : "completed" } : t))); }
  function togglePause(id: string) { setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: t.status === "paused" ? "active" : "paused" } : t))); }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-4">
      {!settings.hasOnboarded && (
        <Onboarding open onDone={(s)=> setSettings((prev)=> ({...prev, ...s}))} />
      )}
      <header className="flex items-center justify-between">
        <div className="text-2xl font-bold">Task Tracker</div>
        <div className="flex items-center gap-2">
          <input className="input w-56" placeholder="Search tasks or categories" value={query} onChange={(e)=>setQuery(e.target.value)} />
          <button className="btn btn-primary" onClick={()=>{ setEditing(null); setModalOpen(true); }}>New Task</button>
        </div>
      </header>

      <div className="tabs">
        <button className={`tab ${tab==="list"?"tab-active":""}`} onClick={()=>setTab("list")}>Checklist</button>
        <button className={`tab ${tab==="calendar"?"tab-active":""}`} onClick={()=>setTab("calendar")}>Calendar</button>
      </div>

      {tab==="list" ? (
        <div className="space-y-3">
          {filtered.length===0 ? (
            <div className="card text-sm text-muted">No tasks yet. Click “New Task”.</div>
          ) : filtered.map((t)=>(
            <div key={t.id} className={`card ${t.status==="completed"?"opacity-60":""}`}>
              <div className="grid grid-cols-12 gap-3 items-center">
                <div className="col-span-12 md:col-span-5 flex items-center gap-3">
                  <input type="checkbox" checked={t.status==="completed"} onChange={()=>toggleComplete(t.id)} />
                  <div>
                    <div className="font-medium">{t.name}</div>
                    <div className="flex flex-wrap gap-1 mt-1">{(t.categories||[]).map(c=>(<span key={c} className="badge">{c}</span>))}</div>
                    {t.description && <div className="text-sm text-muted">{t.description}</div>}
                  </div>
                </div>
                <div className="col-span-6 md:col-span-3 text-sm">
                  <div className="text-muted">Due (SG)</div>
                  <div className={`${isBefore(parseISO(t.dueDate), new Date()) && t.status!=="completed" ? "text-red-600":""}`}>
                    {format(tz(parseISO(t.dueDate)), "EEE, dd MMM yyyy HH:mm")}
                  </div>
                </div>
                <div className="col-span-6 md:col-span-2 text-sm">
                  <div className="text-muted">Priority</div>
                  <div className="capitalize">{t.priority}</div>
                </div>
                <div className="col-span-12 md:col-span-2 flex justify-end gap-2">
                  <button className="btn" onClick={()=>{ setEditing(t); setModalOpen(true); }}>Edit</button>
                  <button className="btn" onClick={()=>togglePause(t.id)}>{t.status==="paused"?"Resume":"Pause"}</button>
                  <button className="btn" onClick={()=>removeTask(t.id)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Calendar viewDate={viewDate} setViewDate={setViewDate} tasks={tasks} occs={occs} />
      )}

      {modalOpen && (
        <TaskDialog
          initial={editing}
          onClose={()=>setModalOpen(false)}
          onSave={(payload)=>{ upsertTask(payload); setModalOpen(false); }}
        />
      )}
    </div>
  );
}

function Onboarding({ open, onDone }:{ open: boolean; onDone: (s: SettingsModel)=>void }) {
  const [emailTo, setEmailTo] = useState("");
  const [serviceId, setServiceId] = useState((import.meta as any).env?.VITE_EMAILJS_SERVICE_ID || "");
  const [templateId, setTemplateId] = useState((import.meta as any).env?.VITE_EMAILJS_TEMPLATE_ID || "");
  const [publicKey, setPublicKey] = useState((import.meta as any).env?.VITE_EMAILJS_PUBLIC_KEY || "");
  const [wantEmail, setWantEmail] = useState(true);
  const [wantInApp, setWantInApp] = useState(true);

  if (!open) return null;

  function complete() {
    onDone({
      inAppNotifications: wantInApp,
      emailNotifications: wantEmail && !!emailTo,
      emailTo: wantEmail ? emailTo : undefined,
      emailServiceId: serviceId || undefined,
      emailTemplateId: templateId || undefined,
      emailPublicKey: publicKey || undefined,
      hasOnboarded: true,
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
      <div className="max-w-xl w-full bg-white rounded-2xl p-4 shadow">
        <div className="text-lg font-semibold mb-2">Welcome — quick setup</div>
        <p className="text-sm text-muted mb-3">Enable notifications now. You can change these later in Settings.</p>
        <div className="space-y-3">
          <label className="flex items-center gap-2"><input type="checkbox" checked={wantInApp} onChange={(e)=>setWantInApp(e.target.checked)}/> In‑app notifications</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={wantEmail} onChange={(e)=>setWantEmail(e.target.checked)}/> Email notifications</label>
          {wantEmail && (
            <div className="space-y-2">
              <input className="input" placeholder="you@example.com" value={emailTo} onChange={(e)=>setEmailTo(e.target.value)} />
              <details className="text-sm">
                <summary className="cursor-pointer select-none">Advanced: EmailJS keys</summary>
                <div className="mt-2 grid grid-cols-1 gap-2">
                  <input className="input" placeholder="EmailJS Service ID" value={serviceId} onChange={(e)=>setServiceId(e.target.value)} />
                  <input className="input" placeholder="EmailJS Template ID" value={templateId} onChange={(e)=>setTemplateId(e.target.value)} />
                  <input className="input" placeholder="EmailJS Public Key" value={publicKey} onChange={(e)=>setPublicKey(e.target.value)} />
                </div>
              </details>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn" onClick={()=>onDone({ inAppNotifications: True, emailNotifications: False, hasOnboarded: True })}>Skip</button>
            <button className="btn btn-primary" onClick={complete}>Finish</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Calendar({ viewDate, setViewDate, tasks, occs }:{ viewDate: Date; setViewDate: (d:Date)=>void; tasks: Task[]; occs: {task:Task; date:Date}[] }) {
  const { start, end } = monthGridRange(viewDate);
  const days: Date[] = []; { let d = new Date(start); while (+d <= +end) { days.push(new Date(d)); d.setDate(d.getDate()+1); } }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button className="btn" onClick={()=>setViewDate(subMonths(viewDate,1))}>&lt;</button>
          <div className="text-lg font-semibold">{format(viewDate, "MMMM yyyy")}</div>
          <button className="btn" onClick={()=>setViewDate(addMonths(viewDate,1))}>&gt;</button>
        </div>
        <button className="btn" onClick={()=>setViewDate(new Date())}>Today</button>
      </div>
      <div className="grid grid-cols-7 text-xs font-medium text-muted">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d)=>(<div key={d} className="p-2 text-center">{d}</div>))}
      </div>
      <div className="grid-7 bg-border rounded-lg overflow-hidden">
        {days.map((day, idx)=>{
          const inMonth = day.getMonth() === viewDate.getMonth();
          const dayOccs = occs.filter(o=>isSameDay(o.date, day)).slice(0,3);
          const moreCount = occs.filter(o=>isSameDay(o.date, day)).length - dayOccs.length;
          return (
            <div key={idx} className={`min-h-[96px] bg-background p-2 ${inMonth? "":"opacity-50"}`}>
              <div className="text-xs font-semibold mb-1">{format(day, "d")}</div>
              <div className="space-y-1">
                {dayOccs.map(({task})=>(
                  <div key={task.id} className="text-xs px-2 py-1 rounded bg-neutral-100 flex items-center justify-between">
                    <span className="truncate">{task.name}</span>
                    <span className="ml-2 text-[10px]">{task.priority}</span>
                  </div>
                ))}
                {moreCount>0 && <div className="text-[10px] text-muted">+{moreCount} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TaskDialog({ initial, onClose, onSave }:{ initial: Task|null, onClose: ()=>void, onSave:(t: Omit<Task,"id"|"createdAt"> & Partial<Pick<Task,"id"|"createdAt">>)=>void }) {
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [priority, setPriority] = useState<Priority>(initial?.priority || "medium");
  const [dueDate, setDueDate] = useState<string>(initial ? initial.dueDate.slice(0,16) : new Date().toISOString().slice(0,16));
  const [status, setStatus] = useState<Task["status"]>(initial?.status || "active");
  const [recType, setRecType] = useState<Recurrence["type"]>(initial?.recurrence.type || "none");
  const [dailyInterval, setDailyInterval] = useState<number>(initial?.recurrence.type==="daily"? initial.recurrence.interval:1);
  const [weeklyInterval, setWeeklyInterval] = useState<number>(initial?.recurrence.type==="weekly"? initial.recurrence.interval:1);
  const [weeklyDays, setWeeklyDays] = useState<number[]>(initial?.recurrence.type==="weekly"? initial.recurrence.weekdays:[]);
  const [monthlyInterval, setMonthlyInterval] = useState<number>(initial?.recurrence.type==="monthly"? initial.recurrence.interval:1);
  const [monthlyDay, setMonthlyDay] = useState<number>(initial?.recurrence.type==="monthly"? initial.recurrence.day: new Date().getDate());
  const [categoryInput, setCategoryInput] = useState("");
  const [categories, setCategories] = useState<string[]>(initial?.categories || []);

  useEffect(()=>{
    if (!initial) return;
    setName(initial.name||""); setDescription(initial.description||""); setPriority(initial.priority);
    setDueDate(initial.dueDate.slice(0,16)); setStatus(initial.status); setRecType(initial.recurrence.type);
    if (initial.recurrence.type==="daily") setDailyInterval(initial.recurrence.interval);
    if (initial.recurrence.type==="weekly"){ setWeeklyInterval(initial.recurrence.interval); setWeeklyDays(initial.recurrence.weekdays); }
    if (initial.recurrence.type==="monthly"){ setMonthlyInterval(initial.recurrence.interval); setMonthlyDay(initial.recurrence.day); }
    setCategories(initial.categories||[]);
  }, [initial]);

  function addCategoryFromInput() {
    const parts = categoryInput.split(",").map(s=>s.trim()).filter(Boolean);
    const set = new Set([...(categories||[]), ...parts]);
    setCategories(Array.from(set)); setCategoryInput("");
  }
  function WeekdayToggle({ day, label }:{ day:number, label:string }){
    const checked = weeklyDays.includes(day);
    return <button type="button" className={`btn ${checked? "btn-primary":""}`} onClick={()=> setWeeklyDays(prev=> prev.includes(day)? prev.filter(d=>d!==day): [...prev, day])}>{label}</button>;
  }
  function submit(){
    const recur: Recurrence =
      recType==="none"? { type:"none" } :
      recType==="daily"? { type:"daily", interval: Math.max(1, Number(dailyInterval)||1) } :
      recType==="weekly"? { type:"weekly", interval: Math.max(1, Number(weeklyInterval)||1), weekdays: weeklyDays.slice().sort() } :
      { type:"monthly", interval: Math.max(1, Number(monthlyInterval)||1), day: Math.min(28, Math.max(1, Number(monthlyDay)||1)) };

    onSave({
      id: initial?.id, createdAt: initial?.createdAt,
      name: name.trim() || "Untitled task",
      description: description.trim(),
      priority,
      dueDate: new Date(dueDate).toISOString(),
      status,
      recurrence: recur,
      categories
    });
  }

  return (
    <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center p-4">
      <div className="card max-w-2xl w-full">
        <div className="text-lg font-semibold mb-4">{initial? "Edit task":"New task"}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><div className="text-sm mb-1">Task name</div><input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Prepare demo deck"/></div>
          <div><div className="text-sm mb-1">Due date & time (SG)</div><input className="input" type="datetime-local" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></div>
          <div><div className="text-sm mb-1">Priority</div>
            <select className="select" value={priority} onChange={e=>setPriority(e.target.value as Priority)}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
          </div>
          <div><div className="text-sm mb-1">Status</div>
            <select className="select" value={status} onChange={e=>setStatus(e.target.value as Task["status"])}>
              <option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option>
            </select>
          </div>
          <div className="md:col-span-2"><div className="text-sm mb-1">Description</div><textarea className="input h-24" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Details, links, acceptance criteria"/></div>
          <div className="md:col-span-2">
            <div className="text-sm mb-1">Recurrence</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <select className="select" value={recType} onChange={e=>setRecType(e.target.value as Recurrence["type"])}>
                <option value="none">None</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
              </select>
              {recType==="daily" && (<div><div className="text-xs mb-1">Every N days</div><input className="input" type="number" min={1} value={dailyInterval} onChange={e=>setDailyInterval(parseInt(e.target.value||"1"))}/></div>)}
              {recType==="weekly" && (
                <div className="space-y-2 md:col-span-2">
                  <div className="flex gap-1 flex-wrap">
                    {["S","M","T","W","T","F","S"].map((lbl, idx)=>(<WeekdayToggle key={idx} day={idx} label={lbl}/>))}
                  </div>
                  <div><div className="text-xs mb-1">Every N weeks</div><input className="input" type="number" min={1} value={weeklyInterval} onChange={e=>setWeeklyInterval(parseInt(e.target.value||"1"))}/></div>
                </div>
              )}
              {recType==="monthly" && (
                <div className="grid grid-cols-2 gap-2 md:col-span-2">
                  <div><div className="text-xs mb-1">Every N months</div><input className="input" type="number" min={1} value={monthlyInterval} onChange={e=>setMonthlyInterval(parseInt(e.target.value||"1"))}/></div>
                  <div><div className="text-xs mb-1">Day of month (1-28)</div><input className="input" type="number" min={1} max={28} value={monthlyDay} onChange={e=>setMonthlyDay(parseInt(e.target.value||"1"))}/></div>
                </div>
              )}
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="text-sm mb-1">Categories</div>
            <CategoryEditor value={categories} onChange={setCategories} inputValue={categoryInput} setInputValue={setCategoryInput} add={addCategoryFromInput} />
          </div>
          <div className="md:col-span-2 flex justify-end gap-2 pt-2">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={submit}>{initial? "Save":"Create"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryEditor({ value, onChange, inputValue, setInputValue, add }:{ value: string[]; onChange:(v:string[])=>void; inputValue:string; setInputValue:(s:string)=>void; add:()=>void }){
  return (
    <div>
      <div className="flex gap-2">
        <input className="input" placeholder="Comma-separated e.g. Work, Personal" value={inputValue} onChange={(e)=>setInputValue(e.target.value)} onKeyDown={(e)=>{ if(e.key==='Enter'){ e.preventDefault(); add(); } }} />
        <button className="btn" type="button" onClick={add}>Add</button>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">{value.map((c)=>(<span key={c} className="badge cursor-pointer" onClick={()=> onChange(value.filter(x=>x!==c))}>{c}</span>))}</div>
    </div>
  );
}
