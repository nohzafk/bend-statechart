// View module for tasks.model.ts, in pstack's view contract. vars are the state's fields as
// JSON; a Bend list is an object with keys from 1, as a TLA+ sequence is in pstack.
const entry = (v: any) => Object.values(v.tab ?? {}).find((e: any) => e.id === 1) as any;

const KIND: Record<string, string> = { KBash: "Shell command", KSub: "Subagent" };
const ST: Record<string, string> = { Running: "running", Awaiting: "awaiting the parent's answer" };
const HOW: Record<string, string> = {
  HFinished: "finished",
  HFailed: "failed",
  HDone: "done",
  HIncomplete: "incomplete",
  HCancelled: "cancelled",
  HLost: "lost",
};
const NOTE: Record<string, string> = {
  NoteWakes: "note wakes the session",
  NoteQuiet: "quiet note",
  NoNote: "no note",
};

export const title = "One background task";

// An array gives parent states: each task state sits inside its kind. The note is not a
// region of its own: it is set when the task ends, so it does not change on its own.
export const state = (v: any) => {
  const e = entry(v);
  if (v.next === 1) return "No task yet";
  if (!e) return "Delivered: the model has the result";
  if (e.st.$ !== "Ended") return [KIND[e.kind.$], ST[e.st.$]];
  const how = e.st.how.$ === "HLost" && e.note.$ !== "NoNote" ? "found lost after a restart" : HOW[e.st.how.$];
  return [KIND[e.kind.$], `${how}, ${NOTE[e.note.$]}`];
};

export const group = (v: any) => KIND[entry(v)?.kind.$];
export const colors = { "Shell command": "teal", Subagent: "purple" };

export const step = (action: string) => {
  const [ev, ...rest] = action.split(" ");
  const has = (w: string) => rest.includes(w);
  switch (ev) {
    case "EvStart":
      if (has("Refused")) return "start refused: 8 subagents already run";
      return has("KBash") ? "a shell command starts" : "a subagent starts";
    case "EvEnd":
      return has("true") ? "it ends well" : "it ends badly";
    case "EvCancel":
      return "you cancel it";
    case "EvStop":
      return "the daemon stops";
    case "EvTake":
      return "result delivered";
    case "EvAsk":
      return has("ACancel") && has("live") ? "the model cancels it" : "result delivered";
    case "EvQuestion":
      return has("true") ? "it asks the parent" : "the question is answered";
    default:
      return null;
  }
};
