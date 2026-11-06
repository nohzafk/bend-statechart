import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import { checkModel, explore, type Model } from "../frontends/bend.ts";
import { checkView } from "../frontends/view.ts";
import { compile } from "../pipeline.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

// examples/player/core.bend, as bend-emit would compile it: each part's table per event.
const PLAY: { [e: string]: { [p: string]: string } } = {
  YouPressPlay: { Stopped: "Buffering", Paused: "Playing" },
  EnoughDataArrives: { Buffering: "Playing" },
  TheNetworkSlows: { Playing: "Buffering" },
  YouPressPause: { Playing: "Paused" },
  ACallComesIn: { Playing: "Paused" },
  TheTrackEnds: { Playing: "Stopped" },
  YouPressStop: { Buffering: "Stopped", Playing: "Stopped", Paused: "Stopped" },
};
const VOL: { [e: string]: { [v: string]: string } } = {
  ACallComesIn: { Normal: "Muted", Loud: "Muted" },
  TheTrackEnds: { Loud: "Normal" },
  YouPressStop: { Loud: "Normal" },
  YouTurnItUp: { Normal: "Loud" },
  YouTurnItDown: { Loud: "Normal" },
  YouPressMute: { Normal: "Muted", Loud: "Muted", Muted: "Normal" },
  TheCallEnds: { Muted: "Normal" },
};
const EVENTS = [
  "YouPressPlay",
  "EnoughDataArrives",
  "TheNetworkSlows",
  "YouPressPause",
  "ACallComesIn",
  "TheTrackEnds",
  "YouPressStop",
  "YouTurnItUp",
  "YouTurnItDown",
  "YouPressMute",
  "TheCallEnds",
];
const player = {
  start: () => ({ $: "State", play: { $: "Stopped" }, vol: { $: "Normal" } }),
  step: (s: any, e: any) => ({
    $: "State",
    play: { $: PLAY[e.$]?.[s.play.$] ?? s.play.$ },
    vol: { $: VOL[e.$]?.[s.vol.$] ?? s.vol.$ },
  }),
};
const playerModel = (more: Partial<Model> = {}) =>
  checkModel({
    init: (C: any) => [C.start()],
    events: () => EVENTS.map(($) => ({ $ })),
    invariants: () => ({
      LoudWhenStopped: (s: any) => !(s.play.$ === "Stopped" && s.vol.$ === "Loud"),
    }),
    nextOf: (o: any) => o,
    cmdOf: () => undefined,
    action: (e: any) => e.$,
    ...more,
  });
const WORDS: { [a: string]: string } = {
  YouPressPlay: "you press play",
  EnoughDataArrives: "enough data arrives",
  TheNetworkSlows: "the network slows",
  YouPressPause: "you press pause",
  ACallComesIn: "a call comes in",
  TheTrackEnds: "the track ends",
  YouPressStop: "you press stop",
  YouTurnItUp: "you turn it up",
  YouTurnItDown: "you turn it down",
  YouPressMute: "you press mute",
  TheCallEnds: "the call ends",
};
const LABEL: { [k: string]: string } = { Normal: "Normal volume" };
const regions = checkView(
  {
    state: (v: any) => ({
      Playback: LABEL[v.play.$] ?? v.play.$,
      Volume: LABEL[v.vol.$] ?? v.vol.$,
    }),
    step: (a: string) => WORDS[a],
  },
  inspect,
);
const chartOf = (files: Map<string, Iterable<string | Uint8Array>>) =>
  [...(files.get("chart.mmd") ?? [])].join("");

test("the player through the Bend frontend draws pstack's MediaPlayer chart from TLC, byte for byte", () => {
  const { files, exit } = compile(explore("player", player, playerModel()), regions);
  assert.equal(exit, 1);
  assert.equal(`${chartOf(files)}\n`, fs.readFileSync(path.join(here, "MediaPlayer.mmd"), "utf8"));
});

test("a Bend state reaches the view as JSON: the constructor in $, a Nat as a number, a list as keys from 1", () => {
  const seen: unknown[] = [];
  const C = {
    start: () => ({ $: "S", n: 2n, xs: { $: "Con", head: { $: "A" }, tail: { $: "Nil" } } }),
    step: (s: any) => s,
  };
  const model = checkModel({ init: (c: any) => [c.start()], events: () => [], terminal: () => true });
  // A state with no events and a terminal() mark is an end, not a deadlock.
  compile(explore("one", C, model), checkView({ state: (v: unknown) => (seen.push(v), "s") }, inspect));
  assert.deepEqual(seen, [{ $: "S", n: 2, xs: { 1: { $: "A" } } }]);
});

test("a law marks the state its first failing step reaches, only for that step", () => {
  const model = playerModel({
    invariants: undefined,
    laws: () => ({
      MuteNeverLouder: (s: any, e: any, to: any) => !(e.$ === "YouPressMute" && to.vol.$ === "Loud" && s.vol.$ !== "Loud"),
      UpOnlyFromNormal: (s: any, e: any, to: any) => !(e.$ === "YouTurnItUp" && to.vol.$ === "Loud" && s.play.$ === "Stopped"),
    }),
  });
  const result = explore("player", player, model);
  const { report, exit } = compile(result, regions);
  assert.equal(exit, 1);
  assert.match(report, /^## UpOnlyFromNormal breaks\nThe shortest path has 1 step:\n0\. Playback Stopped, Volume Normal volume\n1\. you turn it up: Playback Stopped, Volume Loud$/m);
  assert.match(report, /^## Rules that hold\nMuteNeverLouder, NoDeadlock$/m);
  assert.match(report, /^1 step that breaks a law ends a rule's path, and the chart includes it\./m);
  const ends = [...result.graph.states.values()].filter((s) => s.past);
  assert.equal(ends.length, 1);
  assert.deepEqual(ends[0].ends, [{ kind: "invariant", name: "UpOnlyFromNormal" }]);
});

test("two laws that the same step breaks both break, at one end state", () => {
  const upWhileStopped = (s: any, e: any, to: any) =>
    !(e.$ === "YouTurnItUp" && to.vol.$ === "Loud" && s.play.$ === "Stopped");
  const model = playerModel({
    invariants: undefined,
    laws: () => ({ QuietWhenStopped: upWhileStopped, NoUpWhileStopped: upWhileStopped }),
  });
  const result = explore("player", player, model);
  const { report } = compile(result, regions);
  assert.match(report, /^## QuietWhenStopped breaks$/m);
  assert.match(report, /^## NoUpWhileStopped breaks$/m);
  assert.match(report, /^## Rules that hold\nNoDeadlock$/m);
  const ends = [...result.graph.states.values()].filter((s) => s.past);
  assert.equal(ends.length, 1);
  assert.deepEqual(ends[0].ends.map((r) => r.name), ["QuietWhenStopped", "NoUpWhileStopped"]);
});

test("a state that no event leaves breaks NoDeadlock unless the model calls it terminal", () => {
  const C = { start: () => ({ $: "S", n: 0 }), step: (s: any) => ({ $: "S", n: Math.min(s.n + 1, 2) }) };
  const base = {
    init: (c: any) => [c.start()],
    events: () => [{ $: "Tick" }],
    nextOf: (o: any) => o,
    action: () => "Tick",
  };
  const stuck = compile(explore("c", C, checkModel(base)), checkView({}, inspect));
  assert.equal(stuck.exit, 1);
  assert.match(stuck.report, /^## NoDeadlock breaks\nThe shortest path has 2 steps:/m);
  const ends = compile(
    explore("c", C, checkModel({ ...base, terminal: (s: any) => s.n === 2 })),
    checkView({}, inspect),
  );
  assert.equal(ends.exit, 0);
  assert.match(ends.report, /^## Rules that hold\nNoDeadlock$/m);
});

test("above 500 states the chart draws only the bug paths, and the search stops at maxStates", () => {
  const C = { start: () => ({ $: "S", n: 0 }), step: (s: any) => ({ $: "S", n: (s.n + 1) % 600 }) };
  const base = {
    init: (c: any) => [c.start()],
    events: () => [{ $: "Tick" }],
    invariants: () => ({ NotThree: (s: any) => s.n !== 3 }),
    nextOf: (o: any) => o,
    action: () => "Tick",
  };
  const { report, files } = compile(explore("c", C, checkModel(base)), checkView({}, inspect));
  assert.match(report, /^The search reached 600 states, more than the chart budget of 500, so the chart draws only the bug paths: 4 states and 3 arrows\.$/m);
  assert.ok(files.has("chart.mmd"));
  assert.throws(() => explore("c", C, checkModel({ ...base, maxStates: 100 })), /passed 100 states/);
});

test("the model may export only what the command reads", () => {
  assert.throws(() => checkModel({ init: () => [], events: () => [], state: () => "x" }), /exports state, which/);
  assert.throws(() => checkModel({ init: () => [] }), /events must be a function/);
});

