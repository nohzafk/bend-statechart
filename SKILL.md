---
name: bend-statechart
description: Check a Bend state machine (core.bend with start and step, plus LAWS.bend) by visiting every state its events reach, and draw it as a Mermaid statechart with pstack's statechart pipeline, including parent states, parallel regions, group colors and bug marks. The report gives the shortest path to each state that breaks a law. Use when designing or reviewing a stateful Bend core with the human, checking it for broken laws or deadlocks, or showing a bug as a path through states, alongside bend-ldd.
---

# Statechart for Bend

The chart shows how a system moves between states, in the words of the person who reads it.
That person, the reader, decides whether the behavior is right.

This skill is pstack's `statechart` skill with its TLC frontend replaced. Everything from the
state graph to the chart and the report is pstack's code, vendored unchanged except for a few
report sentences (see README.md). The model is not a TLA+ spec: it is `core.bend` itself, the
definitions that `bend-emit` compiles for the host and that `PROOF.bend` proves.

Before you write any `.bend` file or law, load the **bend-ldd** skill and run `bend guide`.

## Run

Work in a scratch folder outside the repo for the output. Run:

```sh
<skill dir>/scripts/statechart UNIT --model FILE [--view FILE] [--out DIR] [--plant FROM --with TO]
```

`UNIT` is the unit's directory or its `core.bend`. The command compiles `core.bend`, and
`LAWS.bend` and `FACTS.bend` when they define anything, with `bend-emit` in a temporary copy.
It needs `bend` (the version in the nearest `BEND_VERSION`, from
`$BEND_TOOLCHAINS/bend-<version>/bin`, default `~/projects/.toolchains`; else `~/.bend/bin`),
`bend-emit` (the nearest `node_modules/.bin/bend-emit`, else `bunx bend-emit`), and Node 22.18
or later, Bun or Deno to run the TypeScript.

It writes `report.md` and `chart.mmd` to a new or empty `--out` folder (default
`UNIT-chart` in the working directory) and exits 0 when every rule holds, 1 when a rule
breaks, and 2 when it cannot run.

## Write the model

The model module says what the search tries. `C` holds every definition of `core.bend` and
`LAWS.bend`, as `bend-emit` compiles them. It exports:

- `init(C)`: the start states, such as `[C.start()]`.
- `events(s, C)`: the events to try from the state `s`. Bound every counter here, such as
  "submit only while `s.last < 2`", so the search ends. Keep stale and duplicate events
  (an old turn's end, a second cancel): the laws are checked on them too.
- `invariants(C)`: optional. Each rule that the reader agrees to and that speaks of one state,
  as a predicate `(s) => boolean`.
- `laws(C)`: optional. Each rule that speaks of one step, as `(s, e, out) => boolean`, where
  `out` is what `step(s, e)` returned. For a law with a premise, return `!premise || claim`.
  Call the reference predicates of `LAWS.bend` through `C` rather than restating them.
- `terminal(s, C)`: optional. True for an end state. A state that no event leaves breaks
  `NoDeadlock`, unless `terminal()` is true for it.
- `action(e, cmd, from, to)`: optional. The step's name, as a TLA+ action name is. The view's
  `step()` gets this string. Default: the event and the command, such as
  `EvEnded{no: 1, how: Finished{}} → Finish{}`. Put in it what the view needs to word the step.
- `nextOf(out, C)`, `cmdOf(out, C)`: optional. Where the next state and the command are in
  `out`. Default: `C.next_of` and `C.cmd_of` when the core defines them, else `out.next` and
  `out.cmd`. When `step` returns the next state itself, export `nextOf = (o) => o`.
- `units`: optional. In a multi-unit `packages/<pkg>/bend/` tree, the units to compile, such as
  `["server/lifecycle"]`. Default: the unit given.
- `maxStates`: optional. The search stops with exit 2 past this many states. Default 100,000.

Write each rule that the reader agrees to as an invariant or a law. If the state has no field
for a rule, add the field to `State` in `core.bend`. Never weaken a rule to make it hold.

Nats arrive as numbers in these functions, as `bend-emit` compiles them.

## Pick the chart

You do the work that needs judgment: the words on each state and arrow, the phases and their
colors, the title, and the report to the reader. Put your work in a view module, and give it
with `--view`. The view module is pstack's, unchanged.

To show the reader's words, the view exports `state(vars)`. `vars` are the state's fields as
JSON: the constructor's name is in `$`, a constructor field is an object with its own `$`, a
Nat is a number, and a Bend list is an object with keys from 1, as a TLA+ sequence is in
pstack. For `State{phase: Idle{}, last: 0}`, `vars` is `{ $: "State", phase: { $: "Idle" }, last: 0 }`.
The value that `state()` returns picks the form:

- A string gives a flat chart: `export const state = (v) => (v.paid ? "Paid" : "Paying");`
- An array gives parent states: `export const state = (v) => [v.phase.$ === "Idle" ? "Up" : "Leaving", v.phase.$];`
- An object gives one parallel region for each key: `export const state = (v) => ({ Playback: v.play.$, Volume: v.vol.$ });`

Label each state with what the reader can see or cares about, such as "Paying" or "Lease held,
write pending". Keep field and constructor names out of labels.

The view can also export `step(action, from, to)`. It gets the model's action name and the
values before and after the step, and it returns the label of the arrow. Write each step label
as the user sees it happen, such as "you press play" or "the connect fails". Do not name the
code or the event constructor. Two actions that end the same in the chart get the same label,
so that they share one arrow.

When a step can occur only in some conditions, end its label with the condition in brackets,
in the reader's words, such as `you press play [while the file loads]`. In a regions chart, the
command writes the condition on the other regions on the arrow, in the words of their labels,
such as `[when Offline]`. Your brackets replace it, and two arrows from one state can then look
the same. So in a regions chart, do not write brackets for a condition on another region. When
a value that no label shows decides where a step goes, name the result in the label, such as
"the roster read fails".

Use regions only for parts that change on their own. When a region's states do not combine
freely with the other regions', the command draws parent states instead and the report says
why.

The view can also export these:

- `group(vars)` returns the name of a phase. Each chart state gets the color of its group. When
  the model states behind one chart state are in different groups, that state gets no color.
  The Legend shows the group names, so use the reader's words.
- `colors` gives each group name a color class: blue, orange, purple, yellow, teal, tan, or pink.
- `title` is a string that the chart shows at the top.

The command calls `state()` and `group()` at most once for each model state, and `step()` at
most once for each step. The chart and the report both use those answers. So make each function
depend only on its arguments.

The chart does not draw a step that stays in one label, such as a refusal that changes nothing.
Split a label when the reader must see such a step.

Aim for about 20 arrows or fewer, because a busier chart is hard to read. First return coarser
labels from `state()`. Give one label to values that act the same, and leave out a detail that
the reader does not need, such as a counter. Keep each state of a bug path, and keep each mark.
When a merge changes a `breaks` state to `mayBreak`, it hides where a rule breaks. Do not merge
two states that break different rules, because the reader then cannot see which rule breaks
where. If the chart is still too busy, return `null` from `step()` for the steps that the reader
does not need, such as a reset that every state has, or a step whose arrow repeats what other
arrows show. Obey these rules when you hide steps:

- Keep each chart state reachable by arrows from a start state.
- Keep at least one arrow out of each chart state that has a step out in the model.
- Hide all the steps of an arrow, or none of them. When you hide only some, its condition gets
  narrower.
- In the hand-off, say which steps the chart hides.

## Read the report

- In the chart, a state that breaks a rule has the class `breaks`. When only some model states
  behind it break the rule, it has the class `mayBreak`. Each state on the shortest path to a
  bug has the class `bugPath`. The Legend names the rules of each mark. When two rules break, it
  names both on one mark, so say in the hand-off which state breaks which rule. In a regions
  chart, a state gets a mark when each combination of region states that includes it can break
  a rule. When a combination can break a rule and none of its states has a mark, each state in
  that combination gets a mark.
- An invariant marks every model state that breaks it. A law speaks of a step, so it marks the
  state that its first failing step reaches, and only for that step: the chart state shows as
  `mayBreak`, and the report gives the path that ends with that step.
- The search goes past a state that breaks a rule, so the chart shows the states after a bug.
- The search checks only the events that `events()` gives, within its bounds. A pass says
  nothing about other inputs. The proofs in `PROOF.bend`, written with bend-ldd, do.

## Plant a bug before you trust a pass

Run the command once with `--plant FROM --with TO`, where `FROM` is a text in `core.bend`, such
as one arm of `step`, and `TO` is that arm made wrong. The command changes a temporary copy
only. Check that the report names the broken rule and that the chart marks the state. If no rule
breaks, the laws do not pin that arm. `CORE=/path/core.bend` replaces the whole core instead.

## Show the chart

Show `chart.mmd` to the user as a `mermaid` code block. The chart has a budget of 500 model
states. Above that, the chart draws only the paths to the rules that break, and when no rule
breaks, the command writes no `chart.mmd`. It still checks each rule, and the report gives the
state count and each bug path. To see the whole graph, bound the events more tightly.

Render charts with Pele. When the user asks for an image, or a chart is too large to read as
text, follow `references/render.md`. Do not use a different renderer unless the user asks for
it.

## Hand off

Give each chart and its Mermaid text to the person who must decide. Add one line for each bug:
the rule, the reader's sentence for that rule, and the path as the report numbers it. Say what
the model leaves out: the events it does not try and the bounds on its counters. Give the
command that makes the files again, with a new `--out` folder.

Once the reader approves the chart, go on with bend-ldd: the blind back-translation of each law
with a premise, the proofs in `PROOF.bend` for every input, and the recorded mutants.

## Examples

- `examples/player/` with `examples/player.{model,view}.ts`: pstack's media player as a Bend
  core, drawn as two parallel regions. Its chart is pstack's MediaPlayer chart from TLC, and
  `scripts/test/bend.test.ts` checks that byte for byte.
- `examples/lifecycle.{model,view}.ts`: a session lifecycle with parent states, group colors,
  two invariants and nine laws.
- `examples/tasks.{model,view}.ts`: one background task of an agent session, with parent states
  by kind.
