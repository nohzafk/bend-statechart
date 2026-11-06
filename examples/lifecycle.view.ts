// View module for lifecycle.model.ts. It is pstack's view contract, unchanged: state(vars),
// step(action, from, to), group(vars), colors and title. vars are the state's fields as JSON,
// with "$" naming the constructor; a Nat is a number.
const LABELS: Record<string, string> = {
  Idle: "Idle, no turn",
  Running: "Running a turn",
  Cancelling: "Cancelling, waiting for the turn to end",
  Draining: "Draining, waiting for the turn to end",
  Down: "Down",
  Unloading: "Unloading, waiting for the turn to end",
  Gone: "Gone",
};
const UP = ["Idle", "Running", "Cancelling"];

export const title = "Session lifecycle";

// An array gives parent states: each state sits inside "Up" or "Leaving".
export const state = (v: any) => [UP.includes(v.phase.$) ? "Up" : "Leaving", LABELS[v.phase.$]];

export const group = (v: any) => (UP.includes(v.phase.$) ? "Up" : "Leaving");
export const colors = { Up: "blue", Leaving: "orange" };

export const step = (action: string) => {
  const [ev] = action.split(" ");
  switch (ev) {
    case "EvSubmit":
    case "EvWake":
      return "a turn starts";
    case "EvWithdraw":
      return "the turn is withdrawn";
    case "EvCancel":
      return "you cancel";
    case "EvStop":
      return "the daemon stops";
    case "EvUnload":
      return "the session unloads";
    case "EvEnded":
      return "the turn ends";
    default:
      return action;
  }
};
