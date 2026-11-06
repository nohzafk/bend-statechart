// Model module for an agent session's background tasks: a shell command or a subagent the
// model started and left running while it works on. The core keeps one table per session;
// this model follows one task through it, from its start until its result reaches the model.
// The unit is `turn/tasks` in a multi-unit `packages/<pkg>/bend/` tree.
//
// Run from the repository root:
//   <skill-dir>/scripts/statechart packages/<pkg>/bend/turn/tasks \
//     --model <skill-dir>/examples/tasks.model.ts \
//     --view <skill-dir>/examples/tasks.view.ts --out /tmp/tasks-chart
import { A, L, same } from "../scripts/frontends/bend.ts";

const T = ($: string, f: object = {}) => ({ $, ...f });
const ID = 1; // the first id a session gives
const CAP = 8; // subagents running or awaiting, daemon-wide
const MAX_UNREAD = 2;

const entry = (s: any) => A(s.tab).find((e: any) => e.id === ID);
const live = (e: any) => e && (e.st.$ === "Running" || e.st.$ === "Awaiting");
const spec = (C: any, name: string) => C[`Spec.${name}`] ?? C[`Spec_${name}`] ?? C.Spec?.[name];
const silent = (s: any) => T("Out", { st: s, ans: T("Silent"), taken: L([]) });

export const units = ["turn/tasks"];

// A new session, and a session restarted after the daemon died with a subagent running:
// its log shows the task started and never ended.
export const init = (C: any) => [C.load(L([])), C.load(L([T("RStart", { id: ID, kind: T("KSub") })]))];

export const events = (s: any) => {
  if (Number(s.next) === ID)
    return [
      T("EvStart", { kind: T("KBash"), count: 0 }),
      T("EvStart", { kind: T("KSub"), count: 0 }),
      T("EvStart", { kind: T("KSub"), count: CAP }),
    ];
  const e = entry(s);
  if (!e) return [T("EvTake"), T("EvAsk", { id: ID, act: T("AStatus") })];
  const evs: any[] = [
    T("EvEnd", { id: ID, ok: true }),
    T("EvEnd", { id: ID, ok: false }),
    T("EvCancel", { id: ID }),
    T("EvStop"),
    T("EvTake"),
    T("EvRead", { id: ID }),
    T("EvQuestion", { id: ID, open: true }),
    T("EvQuestion", { id: ID, open: false }),
    ...["AStatus", "AWait", "ACancel"].map((a) => T("EvAsk", { id: ID, act: T(a) })),
  ];
  if (Number(e.unread) < MAX_UNREAD) evs.push(T("EvSend", { id: ID }));
  return evs;
};

// The laws of LAWS.bend that speak of one step, restated over these events; Spec.wf is
// LAWS.bend's own definition of a reachable state.
export const laws = (C: any) => ({
  tk_step_wf: (_s: any, _e: any, o: any) => spec(C, "wf")(o.st) === true,
  tk_wakes: (_s: any, _e: any, o: any) => C.wakes(o.st) === spec(C, "any_nat")(o.st.tab),
  tk_cap_refuses: (s: any, e: any, o: any) =>
    !(e.$ === "EvStart" && e.kind.$ === "KSub" && e.count >= CAP) ||
    same(o, T("Out", { st: s, ans: T("Refused"), taken: L([]) })),
  tk_end_note: (s: any, e: any, o: any) => {
    const x = entry(s);
    if (e.$ !== "EvEnd" || !live(x)) return true;
    const how = spec(C, "natural")(x.kind, e.ok);
    return same(entry(o.st), T("Entry", { id: ID, kind: x.kind, st: T("Ended", { how }), note: T("NoteWakes"), unread: x.unread }));
  },
  tk_end_late: (s: any, e: any, o: any) => e.$ !== "EvEnd" || live(entry(s)) || same(o, silent(s)),
  tk_user_cancel_note: (s: any, e: any, o: any) => {
    const x = entry(s);
    if (e.$ !== "EvCancel" || !live(x)) return true;
    return same(entry(o.st), T("Entry", { id: ID, kind: x.kind, st: T("Ended", { how: T("HCancelled") }), note: T("NoteWakes"), unread: x.unread }));
  },
  tk_stop: (s: any, e: any, o: any) => {
    const x = entry(s);
    if (e.$ !== "EvStop" || !live(x)) return true;
    return same(entry(o.st), T("Entry", { id: ID, kind: x.kind, st: T("Ended", { how: T("HLost") }), note: T("NoNote"), unread: x.unread }));
  },
  tk_note_delivers: (s: any, e: any, o: any) => {
    const x = entry(s);
    if (e.$ !== "EvTake" || !x || x.note.$ === "NoNote") return true;
    return entry(o.st) === undefined && A(o.taken).some((t: any) => t.id === ID);
  },
  tk_collect_answers: (s: any, e: any, o: any) => {
    const x = entry(s);
    if (e.$ !== "EvAsk" || !x || x.st.$ !== "Ended") return true;
    return entry(o.st) === undefined && same(o.ans, T("Delivered", { how: x.st.how, unread: x.unread }));
  },
  tk_question_open: (s: any, e: any, o: any) => {
    const x = entry(s);
    if (e.$ !== "EvQuestion" || !e.open || !x || x.kind.$ !== "KSub" || x.st.$ !== "Running") return true;
    return entry(o.st).st.$ === "Awaiting";
  },
  tk_send_bash: (s: any, e: any, o: any) => {
    const x = entry(s);
    if (e.$ !== "EvSend" || !x || x.kind.$ !== "KBash") return true;
    return same(o, T("Out", { st: s, ans: T("SendBash"), taken: L([]) }));
  },
});

export const nextOf = (o: any) => o.st;
export const cmdOf = (o: any) => o.ans;

// Delivered is the end: the task has left the table.
export const terminal = (s: any) => Number(s.next) !== ID && !entry(s);

// The step's name: the event, the parts of it that change the outcome, whether the task was
// still live, and the answer.
export const action = (e: any, ans: any, from: any) =>
  [e.$, e.kind?.$, e.ok, e.open, e.act?.$, live(entry(from)) ? "live" : undefined, ans.$]
    .filter((x) => x !== undefined)
    .join(" ");
