// Compiles a Bend unit's core.bend (and LAWS.bend, FACTS.bend when they define anything) to
// JavaScript with bend-emit, in a temporary copy, and loads every definition into one object.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

function ancestorWith(start: string, rel: string): string | undefined {
  for (let d = path.resolve(start); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, rel))) return d;
    if (path.dirname(d) === d) return undefined;
  }
}

function bendEnv(dir: string) {
  const env: { [k: string]: string | undefined } = { ...process.env, BEND_NO_TELEMETRY: "1" };
  const home = path.join(os.homedir(), ".bend", "bin");
  const pin = ancestorWith(dir, "BEND_VERSION");
  if (pin) {
    const v = fs.readFileSync(path.join(pin, "BEND_VERSION"), "utf8").trim();
    const toolchains = env.BEND_TOOLCHAINS ?? path.join(os.homedir(), "projects", ".toolchains");
    env.PATH = `${path.join(toolchains, `bend-${v}`, "bin")}:${home}:${env.PATH ?? ""}`;
  } else env.PATH = `${home}:${env.PATH ?? ""}`;
  return env;
}

function bendEmit(dir: string): { cmd: string[]; cwd: string } {
  const nm = ancestorWith(dir, "node_modules/.bin/bend-emit");
  if (nm) return { cmd: [path.join(nm, "node_modules", ".bin", "bend-emit")], cwd: nm };
  return { cmd: ["bunx", "bend-emit"], cwd: ancestorWith(dir, "package.json") ?? dir };
}

export type Plant = { from: string; to: string };

export async function loadUnit(target: string, units: string[] | undefined, plant?: Plant) {
  const abs = path.resolve(target);
  const isFile = fs.statSync(abs).isFile();
  const unitDir = isFile ? path.dirname(abs) : abs;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bend-statechart-"));
  const env = bendEnv(unitDir);
  const emit = bendEmit(unitDir);
  const C: { [name: string]: any } = {};

  const emitOne = async (bendFile: string, outDir: string) => {
    const [cmd, ...args] = emit.cmd;
    const r = spawnSync(cmd, [...args, bendFile, outDir], { cwd: emit.cwd, env, encoding: "utf8" });
    if (r.status !== 0)
      throw new Error(`bend-emit failed on ${bendFile}:\n${r.error?.message ?? r.stderr}`);
    const mod = await import(
      pathToFileURL(path.join(outDir, `${path.basename(bendFile, ".bend")}.mjs`)).href
    );
    const { default: all, ...named } = mod;
    Object.assign(C, all, named);
  };
  const defines = (file: string) =>
    fs.existsSync(file) && /^(def|type) /m.test(fs.readFileSync(file, "utf8"));
  const mutate = (core: string) => {
    if (process.env.CORE) fs.copyFileSync(path.resolve(process.env.CORE), core);
    if (!plant) return;
    const src = fs.readFileSync(core, "utf8");
    if (!src.includes(plant.from))
      throw new Error(`--plant cannot find its target in ${core}:\n  ${plant.from}`);
    fs.writeFileSync(core, src.replace(plant.from, plant.to));
  };

  // A unit inside packages/<pkg>/bend/<unit> may import sibling units, so copy every
  // package's bend/ tree.
  let bendRoot: string | undefined;
  for (let d = unitDir; path.dirname(d) !== d; d = path.dirname(d))
    if (path.basename(d) === "bend") {
      bendRoot = d;
      break;
    }
  try {
    if (bendRoot) {
      const packages = path.dirname(path.dirname(bendRoot));
      const root = path.join(tmp, "packages", path.basename(path.dirname(bendRoot)), "bend");
      for (const pkg of fs.readdirSync(packages)) {
        const from = path.join(packages, pkg, "bend");
        if (fs.existsSync(from))
          fs.cpSync(from, path.join(tmp, "packages", pkg, "bend"), { recursive: true });
      }
      const rel = path.relative(bendRoot, unitDir);
      mutate(path.join(root, rel, isFile ? path.basename(abs) : "core.bend"));
      for (const u of units?.length ? units : [rel]) {
        await emitOne(path.join(root, u, "core.bend"), path.join(tmp, "gen", u, "core"));
        for (const f of ["LAWS", "FACTS"])
          if (defines(path.join(root, u, `${f}.bend`)))
            await emitOne(path.join(root, u, `${f}.bend`), path.join(tmp, "gen", u, f));
      }
    } else {
      const work = path.join(tmp, "unit");
      fs.cpSync(unitDir, work, { recursive: true });
      const core = path.join(work, isFile ? path.basename(abs) : "core.bend");
      mutate(core);
      await emitOne(core, path.join(tmp, "gen", "core"));
      for (const f of ["LAWS", "FACTS"])
        if (defines(path.join(work, `${f}.bend`)))
          await emitOne(path.join(work, `${f}.bend`), path.join(tmp, "gen", f));
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return C;
}
