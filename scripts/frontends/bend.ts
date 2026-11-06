// The Bend frontend: it takes the compiled core of a Bend state machine and a model module,
// visits every state the model's events reach, checks each law, and returns the CheckResult
// that the vendored pipeline draws. It is the one part of this skill that is not pstack's
// code; it replaces pstack's TLC frontend (run.ts and the TLC output parsers).
import {
  type Bug,
  CHART_STATES,
  type CheckResult,
  type Graph,
  list,
  pastState,
  type Rule,
  type Spec,
  type State,
  type Step,
  stateRules,
  type Value,
  type Vars,
} from "../ir.ts";
import { bugs, walk } from "../passes/reach.ts";

type Core = { [name: string]: any };
type Check = (s: any, e: any, out: any) => boolean;

export type Model = {
  units?: string[];
  init: (C: Core) => any[];
  events: (s: any, C: Core) => any[];
  invariants?: (C: Core) => { [name: string]: (s: any) => boolean };
  laws?: (C: Core) => { [name: string]: Check };
  terminal?: (s: any, C: Core) => boolean;
  action?: (e: any, cmd: any, from: any, to: any) => string;
  nextOf?: (out: any, C: Core) => any;
  cmdOf?: (out: any, C: Core) => any;
  maxStates?: number;
};

export const MAX_STATES = 100_000;

const MODEL_EXPORTS = [
  "units",
  "init",
  "events",
  "invariants",
  "laws",
  "terminal",
  "action",
  "nextOf",
  "cmdOf",
  "maxStates",
];

export function checkModel(mod: { readonly [name: string]: unknown }): Model {
  const extra = Object.keys(mod).filter((k) => !MODEL_EXPORTS.includes(k));
  if (extra.length)
    throw new Error(
      `The model exports ${list(extra)}, which the command does not read. Export only ${list(MODEL_EXPORTS)}.`,
    );
  const wrong: string[] = [];
  for (const k of ["init", "events"])
    if (typeof mod[k] !== "function") wrong.push(`${k} must be a function`);
  for (const k of ["invariants", "laws", "terminal", "action", "nextOf", "cmdOf"])
    if (mod[k] !== undefined && typeof mod[k] !== "function") wrong.push(`${k} must be a function`);
  if (mod.units !== undefined && !(Array.isArray(mod.units) && mod.units.every((u) => typeof u === "string")))
    wrong.push("units must be an array of strings");
  if (mod.maxStates !== undefined && !(Number.isInteger(mod.maxStates) && (mod.maxStates as number) > 0))
    wrong.push("maxStates must be a positive integer");
  if (wrong.length) throw new Error(`The model's ${list(wrong)}.`);
  return mod as Model;
}

const bigints = (_: string, v: unknown) => (typeof v === "bigint" ? `${v}n` : v);
export const keyOf = (v: unknown): string => JSON.stringify(v, bigints);
export const same = (a: unknown, b: unknown) => keyOf(a) === keyOf(b);

// Bend lists as bend-emit compiles them: Con{head, tail} and Nil{}.
export const L = (xs: unknown[]): any =>
  xs.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" });
export const A = (l: any): any[] => {
  const r: any[] = [];
  for (; l && l.$ === "Con"; l = l.tail) r.push(l.head);
  return r;
};

export const construct = (v: any): string => {
  if (v === null || v === undefined) return String(v);
  if (typeof v === "bigint") return String(v);
  if (typeof v !== "object") return String(v);
  if (v.$ === "Con" || v.$ === "Nil") return `[${A(v).map(construct).join(", ")}]`;
  if (Array.isArray(v)) return `[${v.map(construct).join(", ")}]`;
  const fields: string[] = [];
  for (const [k, x] of Object.entries(v)) if (k !== "$") fields.push(`${k}: ${construct(x)}`);
  return `${typeof v.$ === "string" ? v.$ : ""}{${fields.join(", ")}}`;
};

// A Bend value as the pipeline's Value: a constructor is a record whose "$" field names it,
// a list is a tuple, and a Nat is a number.
export const toValue = (v: any): Value => {
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
  const tuple = (xs: any[]): Value => ({
    kind: "function",
    printedAs: "tuple",
    keys: xs.map((_, i) => i + 1),
    values: xs.map(toValue),
  });
  if (Array.isArray(v)) return tuple(v);
  if (v && typeof v === "object") {
    if (v.$ === "Con" || v.$ === "Nil") return tuple(A(v));
    const keys = Object.keys(v);
    return { kind: "function", printedAs: "record", keys, values: keys.map((k) => toValue(v[k])) };
  }
  throw new Error(`The core returned ${String(v)}, which is not a Bend value.`);
};

const varsOf = (s: any): Vars => {
  const v = toValue(s);
  if (typeof v !== "object" || v.kind !== "function" || v.printedAs !== "record")
    throw new Error(`A state must be a Bend constructor, but the core returned ${construct(s)}.`);
  const vars: Vars = {};
  for (let i = 0; i < v.keys.length; i++) vars[String(v.keys[i])] = v.values[i];
  return vars;
};

export function explore(module: string, C: Core, model: Model): CheckResult {
  if (typeof C.step !== "function") throw new Error("The core defines no step(State, Ev).");
  const nextOf = model.nextOf ?? ((o: any) => (C.next_of ? C.next_of(o) : o.next));
  const cmdOf = model.cmdOf ?? ((o: any) => (C.cmd_of ? C.cmd_of(o) : o.cmd));
  const action = model.action ?? ((e: any, cmd: any) => `${construct(e)} → ${construct(cmd)}`);
  const invariants = model.invariants?.(C) ?? {};
  const laws = model.laws?.(C) ?? {};
  const terminal = model.terminal ?? (() => false);
  const max = model.maxStates ?? MAX_STATES;
  const clash = Object.keys(laws).filter((n) => Object.hasOwn(invariants, n));
  if (clash.length) throw new Error(`The model names ${list(clash)} both an invariant and a law.`);

  const spec: Spec = {
    module,
    variables: [],
    invariants: [...Object.keys(invariants), ...Object.keys(laws)],
    properties: [],
    deadlock: true,
    written: [],
  };
  const rules = stateRules(spec);
  const rule = new Map<string, Rule>();
  for (const r of rules) rule.set(r.name, r);
  const deadlock = rules.find((r) => r.kind === "deadlock") as Rule;

  const states = new Map<string, State>();
  const raw: any[] = [];
  const ids = new Map<string, string>();
  const queue: string[] = [];
  const add = (s: any, start: boolean) => {
    const k = keyOf(s);
    let id = ids.get(k);
    if (id === undefined) {
      if (states.size >= max)
        throw new Error(
          `The search passed ${max.toLocaleString("en-US")} states. Bound the counters in the model's events(), or raise maxStates.`,
        );
      id = String(states.size + 1);
      ids.set(k, id);
      raw.push(s);
      const breaks: Rule[] = [];
      for (const [name, holds] of Object.entries(invariants))
        if (!holds(s)) breaks.push(rule.get(name) as Rule);
      states.set(id, { vars: varsOf(s), start, breaks });
      queue.push(id);
    } else if (start) (states.get(id) as State).start = true;
    return id;
  };
  for (const s of model.init(C)) add(s, true);

  const steps: Step[] = [];
  const firstBreak = new Map<string, Step>();
  for (let q = 0; q < queue.length; q++) {
    const from = queue[q];
    const s = raw[Number(from) - 1];
    const seen = new Set<string>();
    let leaves = false;
    for (const e of model.events(s, C)) {
      const out = C.step(s, e);
      const next = nextOf(out, C);
      const to = add(next, false);
      const step: Step = { from, to, action: action(e, cmdOf(out, C), s, next) };
      if (to !== from) leaves = true;
      const k = keyOf([to, step.action]);
      if (!seen.has(k)) {
        seen.add(k);
        steps.push(step);
      }
      for (const [name, holds] of Object.entries(laws))
        if (!firstBreak.has(name) && !holds(s, e, out)) firstBreak.set(name, step);
    }
    if (!leaves && !terminal(s, C)) (states.get(from) as State).breaks.push(deadlock);
  }

  // A law speaks of a step, so the state that breaks it is the state that step reaches, and
  // only by that step: as pstack does for a step that TLC checks but does not take, the step
  // gets an end state of its own, with the values of the state it reaches.
  // Laws that the same step breaks first share that step's end state.
  const byStep = new Map<Step, Rule[]>();
  for (const [name, step] of firstBreak)
    byStep.set(step, [...(byStep.get(step) ?? []), rule.get(name) as Rule]);
  for (const [step, rs] of byStep) {
    const id = `past ${step.to} ${step.action} ${step.from}`;
    const end = pastState((states.get(step.to) as State).vars, false, rs, true);
    end.ends.push(...rs);
    states.set(id, end);
    steps.push({ from: step.from, to: id, action: step.action });
  }

  const broken = new Set<string>();
  for (const s of states.values()) for (const r of s.breaks) broken.add(r.name);
  const distinct = raw.length;
  let graph: Graph = { states, steps };
  let paths: Bug[] | undefined;
  if (distinct > CHART_STATES) {
    paths = bugs(graph, walk(graph));
    const keep = new Set<string>();
    const kept: Step[] = [];
    for (const b of paths) {
      keep.add(b.start);
      for (const p of b.path) {
        keep.add(p.state);
        kept.push(p.step);
      }
    }
    const few = new Map<string, State>();
    for (const [id, s] of states) if (keep.has(id)) few.set(id, s);
    graph = { states: few, steps: [...new Set(kept)] };
  }
  return {
    spec: { ...spec, folder: "" },
    graph,
    paths,
    rules: rules.map((r) => ({
      rule: r,
      outcome: broken.has(r.name) ? "broken" : "holds",
      messages: undefined,
    })),
    properties: [],
    exit: broken.size ? 1 : 0,
    stop: undefined,
    drawing: undefined,
    states: {
      distinct,
      initial: [...states.values()].filter((s) => s.start && !s.past).length,
      complete: true,
      cut: false,
    },
    messages: [],
  };
}
