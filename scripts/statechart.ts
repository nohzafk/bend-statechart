#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { inspect, parseArgs } from "node:util";
import { checkModel, explore } from "./frontends/bend.ts";
import { checkView } from "./frontends/view.ts";
import { compile } from "./pipeline.ts";
import { loadUnit, messageOf } from "./run.ts";

const USAGE = `Usage: statechart UNIT --model FILE [--view FILE] [--out DIR] [--plant FROM --with TO]

Visits every state of a Bend state machine that the model's events reach, checks each law on
every state and step, and draws the state graph as Mermaid. Above 500 states, the chart draws
only the paths to the rules that break, and with no rule broken there is no chart.mmd.
  UNIT           The unit's directory, or its core.bend.
  --model FILE   A module that exports init(C) and events(s, C), and, if you want, invariants(C),
                 laws(C), terminal(s, C), action(e, cmd, from, to), nextOf, cmdOf, units, and
                 maxStates. C holds every definition of core.bend and LAWS.bend.
  --view FILE    pstack's view module: state(vars) and, if you want, step(action, from, to),
                 group(vars), colors, and title. state() returns a string for a flat chart, an
                 array for parent states, or an object for regions. Default: each state's values.
                 colors gives each group blue, orange, purple, yellow, teal, tan, or pink.
  --out DIR      Where to write report.md and chart.mmd. The folder must be new or empty.
                 Default: UNIT-chart in the working directory.
  --plant FROM --with TO
                 Replace the text FROM with TO in a temporary copy of core.bend first, to
                 check that the chart and the report catch a bug that you plant.
Exit code: 0 when every rule holds, 1 when a rule breaks, and 2 when the command cannot run.`;

let flags;
let unit: string;
try {
  const args = parseArgs({
    allowPositionals: true,
    options: {
      model: { type: "string" },
      view: { type: "string" },
      out: { type: "string" },
      plant: { type: "string" },
      with: { type: "string" },
    },
  });
  flags = args.values;
  const pos = args.positionals;
  if ((flags.plant === undefined) !== (flags.with === undefined))
    throw new Error("Give --plant FROM and --with TO together.");
  if (pos.length !== 1) throw new Error("Give one UNIT.");
  if (!flags.model) throw new Error("Give --model FILE.");
  [unit] = pos;
} catch (error) {
  console.error(`${messageOf(error)}\n\n${USAGE}`);
  process.exit(2);
}

const load = async (file: string) => import(pathToFileURL(path.resolve(file)).href);

try {
  const name = path.basename(path.resolve(unit)).replace(/\.bend$/, "");
  const out = path.resolve(flags.out ?? `${name}-chart`);
  if (fs.existsSync(out) && fs.readdirSync(out).length)
    throw new Error(`${out} is not empty. Pass --out with a new folder.`);
  const model = checkModel(await load(flags.model));
  const view = checkView(flags.view ? await load(flags.view) : {}, inspect);
  const plant =
    flags.plant !== undefined && flags.with !== undefined
      ? { from: flags.plant, to: flags.with }
      : undefined;
  const C = await loadUnit(unit, model.units, plant);
  const { report, files, exit } = compile(explore(name, C, model), view);
  fs.mkdirSync(out, { recursive: true });
  for (const [file, parts] of files) {
    if (file.startsWith("tlc")) continue;
    let text = "";
    for (const part of parts)
      text += typeof part === "string" ? part : new TextDecoder().decode(part);
    fs.writeFileSync(path.join(out, file), `${text}\n`);
  }
  console.log(report);
  console.log(`\nWrote ${out}`);
  process.exit(exit);
} catch (error) {
  console.error(messageOf(error));
  process.exit(2);
}
