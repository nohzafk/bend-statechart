// Model module for a session-lifecycle core: a daemon session that runs one turn at a time
// and can be cancelled, stopped or unloaded mid-turn. The unit is `server/lifecycle` in a
// multi-unit `packages/<pkg>/bend/` tree. The model says what the search tries; the view
// beside it (lifecycle.view.ts) says what the chart shows.
//
// Run from the repository root:
//   <skill-dir>/scripts/statechart packages/<pkg>/bend/server/lifecycle \
//     --model <skill-dir>/examples/lifecycle.model.ts \
//     --view <skill-dir>/examples/lifecycle.view.ts --out /tmp/lifecycle-chart
import { same } from "../scripts/frontends/bend.ts";

export const units = ["server/lifecycle"];

export const init = (C: any) => [C.start(false)];

// Each counter is bounded, so the search ends: a third turn is never submitted.
export const events = (s: any) => {
  const last = Number(s.last);
  const evs: any[] = [
    { $: "EvCancel" },
    { $: "EvStop" },
    { $: "EvUnload" },
    { $: "EvWithdraw", no: last },
    { $: "EvWithdraw", no: last + 1 },
    { $: "EvEnded", no: last, how: { $: "Finished" } },
    { $: "EvEnded", no: last, how: { $: "Failed" } },
    { $: "EvEnded", no: last, how: { $: "Interrupted" } },
    { $: "EvEnded", no: last + 1, how: { $: "Finished" } },
  ];
  if (last < 2) evs.push({ $: "EvSubmit" }, { $: "EvWake" });
  return evs;
};

// The laws of LAWS.bend that speak of one state.
export const invariants = (C: any) => ({
  lc_snapshot: (s: any) => C.iff(C.is_live(C.snapshot(s)), C.ref_running(s)) === true,
  lc_steer_running: (s: any) => C.iff(C.steerable(s), C.ref_running(s)) === true,
});

// The laws of LAWS.bend that speak of one step, over LAWS.bend's own predicates.
export const laws = (C: any) => ({
  lc_admit_sound: (s: any, _e: any, st: any) =>
    st.cmd.$ !== "Admit" ||
    (C.ref_idle(s) && st.cmd.no === s.last + 1 && st.next.last === st.cmd.no && C.ref_running(st.next)),
  lc_submit_busy: (s: any, e: any, st: any) =>
    e.$ !== "EvSubmit" ||
    !(C.ref_turn(s) && !C.ref_down(s) && !C.ref_leaving(s)) ||
    same(st, { $: "Step", next: s, cmd: { $: "Busy" } }),
  lc_cancel_live: (s: any, e: any, st: any) =>
    e.$ !== "EvCancel" || !(C.ref_turn(s) && !C.ref_leaving(s)) || C.cancel_ok(s, st) === true,
  lc_cancel_quiet: (s: any, e: any, st: any) =>
    e.$ !== "EvCancel" || !C.ref_turn(s) || C.is_live(C.snapshot(C.next_of(st))) === false,
  lc_stop: (s: any, e: any, st: any) => e.$ !== "EvStop" || C.ref_leaving(s) || C.stop_ok(s, st) === true,
  lc_down_final: (s: any, _e: any, st: any) => !C.ref_down(s) || C.ref_down(C.next_of(st)) === true,
  lc_registration: (s: any, _e: any, st: any) =>
    C.iff(C.ref_turn(st.next), C.turn_after(st.cmd, C.ref_turn(s))) === true,
  lc_numbering: (s: any, _e: any, st: any) => st.next.last === C.last_after(st.cmd, s.last),
  lc_gone_final: (s: any, _e: any, st: any) => s.phase.$ !== "Gone" || same(st.next, s),
});

// Down and Gone are end states: no event leaves them, and that is not a deadlock.
export const terminal = (s: any) => s.phase.$ === "Down" || s.phase.$ === "Gone";

// The step's name, as a TLA+ action name would be: the event and the command it answers.
export const action = (e: any, cmd: any) => `${e.$} ${cmd.$}`;
