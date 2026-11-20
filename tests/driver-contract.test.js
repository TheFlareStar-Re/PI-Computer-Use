"use strict";
// Regression tests for the cua-driver 0.44 tool contract.
//
// cua-driver 0.44 declares every action tool with `additionalProperties: false`
// and accepts only `element_token` as the element address. Passing
// `element_index` or `snapshot_id` is refused as an unknown argument before the
// action is dispatched. `get_window_state` defaults to
// `tree_format: "markdown"`, which returns only `tree_markdown` and no
// `structuredContent.elements` array.
//
// Real runtime.js in a VM; every driver, capture and native transport is mocked.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const runtimePath = path.join(__dirname, "..", "runtime.js");
const source = fs.readFileSync(runtimePath, "utf8");
const button = { role: "Button", label: "Save", element_index: 3, element_token: "s0000002a:3",
  enabled: true, visible: true, frame: { x: 10, y: 10, w: 80, h: 30 } };
const image = { type: "image", mimeType: "image/png", data: "YWJj" };

function fixture({ capture, actionResult } = {}) {
  const calls = { cua: [] };
  const sandbox = {
    module: { exports: {} }, exports: {}, Buffer, console, setTimeout, clearTimeout,
    __dirname: path.dirname(runtimePath), process: { platform: "win32", env: {} },
    require(name) {
      if (name === "./powershell") return { resolvePowerShell: () => "powershell.exe" };
      if (name === "node:child_process") return {
        spawn() { throw new Error("live process prohibited"); },
        spawnSync() { throw new Error("unexpected native input"); },
      };
      if (name === "./overlay") return { ControlBanner: class {} };
      if (name === "./cua") return {};
      if (name === "./policy") return require("../policy");
      return require(name);
    },
  };
  vm.runInNewContext(source, sandbox, { filename: runtimePath });
  const runtime = new sandbox.module.exports.ComputerUseRuntime();
  runtime.targets.set("notepad", { app: "notepad", app_name: "notepad", pid: 42, window_id: 100 });
  runtime.ensureRunning = async () => {};
  runtime.beginControl = runtime.endControl = runtime._rememberFrame = () => {};
  runtime._cua = async (name, payload, timeout) => {
    calls.cua.push({ name, payload, timeout });
    if (name === "get_window_state") {
      return capture
        ? capture(payload)
        : { content: [image], structuredContent: { pid: 42, window_id: 100, snapshot_id: "s0000002a",
          elements_complete: true, elements: [button] } };
    }
    return actionResult || { structuredContent: { transport_sent: true, sent: 1, expected: 1 } };
  };
  return { runtime, calls,
    snapshot: (args = {}) => runtime.callTool("get_app_state", { app: "notepad", include_screenshot: false, ...args }),
    call: (name, args = {}, options = {}) => runtime.callTool(name, { app: "notepad", ...args }, options) };
}

test("get_window_state asks for the structured elements tree", async () => {
  const f = fixture();
  await f.snapshot();
  const capture = f.calls.cua.find((call) => call.name === "get_window_state");
  assert.ok(capture, "the runtime must capture a window state");
  assert.equal(capture.payload.tree_format, "elements");
});

test("a markdown-only capture stays untrusted, an elements capture becomes actionable", async () => {
  const markdown = fixture({ capture: () => ({ content: [image], structuredContent: {
    pid: 42, window_id: 100, snapshot_id: "s0000002a", tree_markdown: "[3] Button Save" } }) });
  const markdownState = await markdown.snapshot();
  assert.equal(markdownState.structuredContent.tree_actionable, false);
  assert.equal(markdownState.structuredContent.tree_version, 0);

  const structured = fixture();
  const structuredState = await structured.snapshot();
  assert.equal(structuredState.structuredContent.tree_actionable, true);
  assert.equal(structuredState.structuredContent.tree_version, 1);
});

for (const [name, args] of [
  ["click", { element_index: 3 }],
  ["set_value", { element_index: 3, value: "Report.docx" }],
  ["scroll", { element_index: 3, direction: "down" }],
  ["type_text", { element_index: 3, text: "hello" }],
  ["press_key", { element_index: 3, key: "Delete" }],
]) {
  test(`${name} dispatches only driver-accepted element addressing`, async () => {
    const f = fixture();
    await f.snapshot();
    const action = await f.call(name, args);
    assert.equal(action.structuredContent.action_result.delivery, "sent");
    const call = f.calls.cua.find((entry) => entry.name === name);
    assert.ok(call, `${name} must reach the driver`);
    assert.equal(call.payload.element_token, "s0000002a:3");
    assert.equal(call.payload.element_index, undefined, "cua-driver rejects element_index");
    assert.equal(call.payload.snapshot_id, undefined, "cua-driver rejects snapshot_id");
  });
}

test("a pixel click that hits no element keeps coordinates and sends no element addressing", async () => {
  const f = fixture();
  await f.snapshot();
  await f.call("click", { x: 500, y: 500 });
  const call = f.calls.cua.find((entry) => entry.name === "click");
  assert.ok(call);
  assert.equal(call.payload.x, 500);
  assert.equal(call.payload.y, 500);
  assert.equal(call.payload.element_index, undefined);
  assert.equal(call.payload.element_token, undefined);
  assert.equal(call.payload.snapshot_id, undefined);
});
