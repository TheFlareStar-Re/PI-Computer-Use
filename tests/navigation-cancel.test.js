"use strict";
// Isolated VM: all AX/RPC/native transports are mocked; no real GUI input.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const runtimePath = path.join(__dirname, "..", "runtime.js");
const source = fs.readFileSync(runtimePath, "utf8");
const normal = [{ role: "Document", name: "Sheet", element_index: 1 }];
const editor = [{ role: "Edit", name: "BITABLE_TEXT_EDITOR_1", element_index: 2 }];
const dropdown = [{ role: "Edit", name: "查找或创建选项", element_index: 3 }];
const state = (elements, extra = {}) => ({ structuredContent: { elements, snapshot_id: "live", pid: 42, window_id: 100, ...extra } });

function fixture({ platform = "win32", captures = [state(normal)], native, afterFront, afterCapture } = {}) {
  const calls = { native: [], cua: [], action: [], focus: 0 };
  let captureNo = 0;
  const sandbox = {
    module: { exports: {} }, exports: {}, Buffer, console, setTimeout, clearTimeout,
    __dirname: path.dirname(runtimePath), process: { platform, env: {} },
    require(name) {
      if (name === "node:child_process") return {
        spawn() { throw new Error("live process prohibited"); },
        spawnSync(exe, args) {
          if (args.some((arg) => String(arg).endsWith("windows-uia-focus.ps1"))) {
            calls.focus++;
            return { status: 0, stdout: "" };
          }
          calls.native.push({ exe, args });
          const response = typeof native === "function" ? native(calls.native.length, args) : native;
          if (response instanceof Error) throw response;
          if (response) return response;
          const expected = args.includes("-Shift") || args.includes("-Control") ? 4 : 2;
          return { status: 0, stdout: JSON.stringify({ ok: true, code: "transport_sent", sent: expected, expected,
            foreground_hwnd: 100, focus_hwnd: 101, target_hwnd: 100, target_pid: 42, last_error: 0 }) };
        },
      };
      if (name === "./overlay") return { ControlBanner: class {} };
      if (name === "./cua") return {};
      if (name === "./policy") return require("../policy");
      return require(name);
    },
  };
  vm.runInNewContext(source, sandbox, { filename: runtimePath });
  const runtime = new sandbox.module.exports.ComputerUseRuntime();
  runtime.targets.set("sheet", { app: "sheet", pid: 42, window_id: 100, elements: normal, tree_actionable: true });
  runtime._resolveTarget = async () => runtime.targets.get("sheet");
  runtime._cua = async (name, payload) => {
    calls.cua.push({ name, payload });
    if (name === "bring_to_front") {
      if (afterFront) afterFront(runtime);
      return {};
    }
    if (name === "get_window_state") {
      captureNo++;
      let response = captures[Math.min(captureNo - 1, captures.length - 1)];
      if (typeof response === "function") response = response(captureNo, payload, runtime);
      if (response instanceof Error) throw response;
      if (afterCapture) afterCapture(captureNo, runtime);
      return response;
    }
    calls.action.push({ name, payload });
    return { structuredContent: { effect: "unverifiable" } };
  };
  runtime.ensureRunning = async () => {};
  runtime.beginControl = () => {};
  runtime.endControl = () => {};
  return { runtime, calls,
    press: (key, observe = false) => runtime._pressKey({ app: "sheet", key }, observe),
    publicPress: (key, observe = false) => runtime.callTool("press_key", { app: "sheet", key }, { observe }),
  };
}

for (const key of ["Right", "Left", "Up", "Down", "Home", "End", "PageUp", "PageDown", "Tab", "Return", "Shift+Tab"]) {
  test(`Windows ${key} preserves native focus and never starts CUA key action`, async () => {
    const f = fixture();
    const result = await f.press(key);
    assert.equal(f.calls.native.length, 1);
    assert.equal(f.calls.focus, 0);
    assert.equal(f.calls.action.length, 0);
    assert.deepEqual(f.calls.cua.map((call) => call.name), ["bring_to_front"]);
    assert.equal(result.structuredContent.transport_sent, true);
    if (key === "Shift+Tab") assert.ok(f.calls.native[0].args.includes("-Shift"));
  });
}

test("native menu navigation does not bring its owner over the popup", async () => {
  const f = fixture();
  f.runtime._nativeMenuContext = { pid: 42, window_id: 100, expiresAt: Date.now() + 10000 };
  await f.press("Down");
  assert.equal(f.calls.native.length, 1);
  assert.equal(f.calls.cua.length, 0);
});

test("native Return reports transport only and never confirms a goal", async () => {
  const f = fixture();
  const result = await f.publicPress("Return");
  assert.equal(result.structuredContent.action_result.delivery, "sent");
  assert.equal(result.structuredContent.action_result.goal, "unconfirmed");
  assert.equal(result.structuredContent.action_result.ui_change, "unknown");
});

for (const change of ["stop", "epoch"]) {
  test(`native navigation checks ${change} after foreground preparation`, async () => {
    const f = fixture({ afterFront(runtime) {
      if (change === "stop") runtime.stoppedByUser = true;
      else runtime._sessionEpoch = (runtime._sessionEpoch || 0) + 1;
    } });
    const result = await f.press("Right");
    assert.equal(f.calls.native.length, 0);
    assert.equal(f.calls.action.length, 0);
    assert.equal(result.structuredContent.delivery, "not_sent");
  });
}

for (const [label, nativeResult, delivery] of [
  ["accepted", null, true],
  ["partial", { status: 1, stdout: JSON.stringify({ ok: false, code: "send_input_partial", sent: 1, expected: 2,
    foreground_hwnd: 100, focus_hwnd: 101, target_hwnd: 100, target_pid: 42, last_error: 5 }) }, false],
  ["error", new Error("helper timeout"), false],
]) {
  test(`native navigation ${label} is attempted once without replay`, async () => {
    const f = fixture({ native: nativeResult });
    const result = await f.press("Left");
    assert.equal(f.calls.native.length, 1);
    assert.equal(f.calls.action.length, 0);
    assert.equal(result.isError !== true, delivery);
  });
}

test("partial real-driver dropdown Edit is positive cancellation evidence", async () => {
  const f = fixture({ captures: [state(dropdown, { elements_complete: false }), state(normal)] });
  const result = await f.press("Escape");
  assert.equal(f.calls.native.length, 1);
  assert.equal(f.calls.native[0].args[f.calls.native[0].args.indexOf("-Key") + 1], "escape");
  assert.equal(result.structuredContent.cancellation.before.kind, "option_popup");
  assert.equal(result.structuredContent.cancellation.status, "closed");
  assert.equal(f.calls.cua.filter((call) => call.name === "get_window_state").length, 2);
});

test("visible marker after Escape is still_present even on a partial tree", async () => {
  const f = fixture({ captures: [state(editor), state(editor, { elements_complete: false })] });
  const result = await f.press("Escape");
  assert.equal(result.structuredContent.cancellation.status, "still_present");
  assert.equal(result.structuredContent.cancellation.after.kind, "cell_editor");
  assert.doesNotMatch(result.content[0].text, /was in edit/i);
});

test("partial post-capture absence is unverified and never called closed", async () => {
  const f = fixture({ captures: [state(dropdown), state(normal, { elements_complete: false })] });
  const result = await f.press("Escape");
  assert.equal(result.structuredContent.cancellation.status, "unverified");
  assert.equal(result.structuredContent.cancellation.reason, "partial_tree_marker_absence_unverified");
});

test("post-capture failure remains unverified without replacing transport metadata", async () => {
  const f = fixture({ captures: [state(dropdown), { isError: true, structuredContent: { code: "capture_timeout" } }] });
  const result = await f.press("Escape");
  assert.equal(result.structuredContent.cancellation.status, "unverified");
  assert.equal(result.structuredContent.cancellation.reason, "capture_failed");
  assert.equal(result.structuredContent.code, "transport_sent");
  assert.equal(f.calls.native.length, 1);
});

test("generic copy/cut/paste context menu makes Menu cancel instead of opening another menu", async () => {
  const menu = ["复制", "剪切", "粘贴"].map((name, i) => ({ role: "MenuItem", name, element_index: i + 10 }));
  const f = fixture({ captures: [state(menu, { elements_complete: false }), state(normal)] });
  const result = await f.press("Menu");
  assert.equal(f.calls.native.length, 1);
  assert.equal(f.calls.native[0].args[f.calls.native[0].args.indexOf("-Key") + 1], "escape");
  assert.equal(result.structuredContent.cancellation.before.kind, "context_menu");
  assert.equal(f.runtime._nativeMenuContext, null);
});

test("complete normal app Escape is native once but does not claim a closure", async () => {
  const f = fixture({ captures: [state(normal), state(normal)] });
  const result = await f.press("Escape");
  assert.equal(f.calls.native.length, 1);
  assert.equal(result.structuredContent.cancellation.before.kind, "none");
  assert.equal(result.structuredContent.cancellation.status, "unverified");
  assert.equal(result.structuredContent.cancellation.reason, "no_positive_before_evidence");
});

for (const [label, bad] of [
  ["nested error", state(editor, { metadata: { capture_error: "timeout" } })],
  ["nested stale", state(editor, { metadata: { stale: true } })],
  ["nested foreign", state(editor, { metadata: { target: { pid: 77, window_id: 700 } } })],
  ["cached", state(editor, { metadata: { cache_hit: true } })],
  ["hidden", state([{ ...editor[0], hidden: true }])],
]) {
  test(`${label} evidence cannot authorize cancellation input`, async () => {
    const f = fixture({ captures: [bad] });
    const result = await f.press("Escape");
    assert.equal(f.calls.native.length, 0);
    assert.equal(result.structuredContent.delivery, "not_sent");
  });
}

test("observe=true reuses the single cancellation re-observation and invalidates tokens", async () => {
  const withImage = { content: [{ type: "image", mimeType: "image/png", data: "YWJj" }],
    structuredContent: state(normal).structuredContent };
  const f = fixture({ captures: [state(dropdown), withImage] });
  const result = await f.publicPress("Escape", true);
  assert.equal(f.calls.cua.filter((call) => call.name === "get_window_state").length, 2);
  assert.deepEqual(f.calls.cua.filter((call) => call.name === "get_window_state").map((call) => call.payload.include_screenshot), [false, true]);
  assert.equal(result.structuredContent.cancellation.post_observed, true);
  assert.equal(result.structuredContent.observation.tree_actionable, false);
  assert.equal(f.runtime.targets.get("sheet").tree_actionable, false);
});

test("session change during read-only post-observation causes no native retry", async () => {
  const f = fixture({ captures: [state(dropdown), state(normal)], afterCapture(n, runtime) {
    if (n === 2) runtime._sessionEpoch = (runtime._sessionEpoch || 0) + 1;
  } });
  const result = await f.press("Escape");
  assert.equal(f.calls.native.length, 1);
  assert.equal(result.structuredContent.cancellation.status, "unverified");
  assert.equal(result.structuredContent.cancellation.reason, "session_changed");
});

for (const elements of [
  ["复制", "剪切", "粘贴"].map(name => ({ role: "Text", name })),
  [{ role: "ListBox", name: "Ordinary page list" }],
  [{ role: "ComboBox", expanded: true, name: "Unfocused page selector" }],
  [{ role: "Dialog", name: "Inactive panel" }],
  [{ role: "MenuItem", name: "Page menu", in_web_content: true }],
]) {
  test(`unfocused page content does not authorize Escape: ${elements[0].role}`, async () => {
    const f = fixture({ captures: [state(elements, { elements_complete: false })] });
    const result = await f.press("Menu");
    assert.equal(f.calls.native.length, 0);
    assert.equal(result.structuredContent.delivery, "not_sent");
  });
}

test("unavailable after-tree cannot prove cancellation closure", async () => {
  const f = fixture({ captures: [state(dropdown), state(normal, { tree_unavailable: true })] });
  const result = await f.press("Escape");
  assert.equal(result.structuredContent.cancellation.status, "unverified");
  assert.equal(f.calls.native.length, 1);
});

for (const key of ["Right", "Escape", "Menu"]) {
  test(`${key} rejects a session replacement at target resolution boundary`, async () => {
    const f = fixture({ captures: [state(dropdown)] });
    f.runtime._resolveTarget = async () => {
      const target = f.runtime.targets.get("sheet");
      f.runtime._sessionEpoch = (f.runtime._sessionEpoch || 0) + 1;
      return target;
    };
    const result = await f.press(key);
    assert.equal(result.structuredContent.code, "session_changed");
    assert.equal(f.calls.native.length, 0);
    assert.equal(f.calls.cua.length, 0);
  });
}

test("post-observation await boundary rejects a replacement session", async () => {
  const f = fixture({ captures: [state(dropdown), state(normal)] });
  const step = f.runtime._waitStep.bind(f.runtime);
  f.runtime._waitStep = async (...args) => {
    const result = await step(...args);
    f.runtime._sessionEpoch = (f.runtime._sessionEpoch || 0) + 1;
    return result;
  };
  const result = await f.press("Escape");
  assert.equal(result.structuredContent.cancellation.status, "unverified");
  assert.equal(result.structuredContent.cancellation.reason, "session_changed");
  assert.equal(f.calls.native.length, 1);
});

test("editor container seen in two idle observations downgrades post-Escape to unverified", async () => {
  const f = fixture({ captures: [state(editor)] });
  await f.runtime.callTool("get_app_state", { app: "sheet", include_screenshot: false }, {});
  await f.runtime.callTool("get_app_state", { app: "sheet", include_screenshot: false }, {});
  const result = await f.press("Escape", false);
  assert.equal(result.structuredContent.cancellation.status, "unverified");
  assert.equal(result.structuredContent.cancellation.reason, "resident_marker_persistent");
  assert.equal(result.structuredContent.cancellation.after.markers[0].resident, true);
  assert.equal(result.structuredContent.cell_editing, undefined);
});

test("editor marker first seen during the action stays still_present", async () => {
  const f = fixture({ captures: [state(editor)] });
  const result = await f.press("Escape", false);
  assert.equal(result.structuredContent.cancellation.status, "still_present");
  assert.equal(result.structuredContent.cell_editing, true);
});

test("observed action reports tree_diff ui_change when both trees are complete", async () => {
  const changedFixture = fixture({ captures: [state(editor)] });
  const changed = await changedFixture.publicPress("Return", true);
  assert.equal(changed.structuredContent.action_result.ui_change, "changed");
  assert.equal(changed.structuredContent.action_result.evidence.at(-1).kind, "tree_diff");

  const sameFixture = fixture({ captures: [state(normal)] });
  const same = await sameFixture.publicPress("Return", true);
  assert.equal(same.structuredContent.action_result.ui_change, "unchanged");
});

test("ui_change stays unknown when the post-action tree is incomplete or missing", async () => {
  const f = fixture({ captures: [state(normal, { elements_complete: false })] });
  const result = await f.publicPress("Return", true);
  assert.equal(result.structuredContent.action_result.ui_change, "unknown");
});
