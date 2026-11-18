"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const { installPreview, needsUpgrade } = require("../cua");
const { version, source } = require("../vendor.json");

test("the installer pins the advertised driver and does not downgrade newer versions", () => {
  assert.equal(needsUpgrade("0.28.2"), true);
  assert.equal(needsUpgrade("0.9.15"), true);
  assert.equal(needsUpgrade(`${version}-rc.1`), true);
  assert.equal(needsUpgrade(version), false);
  assert.equal(needsUpgrade(`${version}+local`), false);
  assert.equal(needsUpgrade("1.0.0"), false);
  assert.equal(needsUpgrade(null), false);
  const preview = installPreview({ powershellExe: "pwsh.exe" });
  assert.equal(preview.args.at(-1), `$env:CUA_DRIVER_RS_VERSION = '${version}'; $env:CUA_DRIVER_NO_CONNECT = '1'; $env:CUA_DRIVER_NO_TEST = '1'; irm ${source} | iex`);
});

test("upgrading stops the session and rejects installer success if PATH still selects the old driver", async () => {
  const calls = [];
  let detected = "0.28.2";
  const mocks = {
    "./runtime": { ComputerUseRuntime: class {
      stop() { calls.push("stop"); }
      snapshot() { return {}; }
    } },
    "./cua": { async runInstall() {
      calls.push("install");
      return { text: "ok", probe: { installed: true, targetVersion: version, version: detected } };
    } },
    "./tools": { OCU_TOOLS: [], STOP_TOOL: {} },
    "./policy": { parseAllowlist: () => [] },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve("../main.js"), "utf8"), {
    module, require: name => mocks[name] || require(name), pi: { plugin: { getSettings: () => ({}) } },
  });
  const install = () => module.exports.onPanelInvoke("cu.install");
  await assert.rejects(install(), /0\.28\.2/);
  detected = version;
  assert.equal((await install()).probe.version, version);
  assert.deepEqual(calls, ["stop", "install", "stop", "install"]);
});

test("panel upgrade and repair controls follow the latest probe", () => {
  const elements = new Map();
  const document = { getElementById(id) {
    if (!elements.has(id)) elements.set(id, { addEventListener() {} });
    return elements.get(id);
  } };
  const script = fs.readFileSync(require.resolve("../renderer/panel.js"), "utf8");
  const ctx = vm.createContext({ document, window: { pluginBridge: {
    on() {}, invoke() { return new Promise(() => {}); },
  } } });
  vm.runInContext(script, ctx);
  const button = elements.get("install");
  const render = (probe) => ctx.renderProbe({ probe: { targetVersion: version, ...probe } });
  render({ installed: true, version: "0.28.2", updateAvailable: true });
  assert.equal(button.hidden, false);
  assert.match(button.textContent, /升级/);
  render({ installed: true, version });
  assert.equal(button.hidden, true);
  render({ installed: true, error: "manifest error" });
  assert.equal(button.hidden, false);
  assert.match(button.textContent, /修复/);
  render({ installed: false });
  assert.equal(button.hidden, false);
  assert.match(button.textContent, /安装/);
});
