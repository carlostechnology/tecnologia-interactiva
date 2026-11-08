// SmartChess Explorer · Python runtime (Pyodide in a module Web Worker)
// The interpreter is loaded on demand, keeping the main UI responsive.
const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs";
const INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";
let ready = null;
function loadRuntime() {
  if (!ready) {
    ready = (async () => {
      self.postMessage({ type: "loading" });
      const { loadPyodide } = await import(PYODIDE_URL);
      const pyodide = await loadPyodide({ indexURL: INDEX_URL });
      self.postMessage({ type: "ready" });
      return pyodide;
    })();
  }
  return ready;
}
self.onmessage = async event => {
  const { id, code, debug = false } = event.data || {};
  if (!Number.isInteger(id) || typeof code !== "string") return;
  let pyodide;
  try { pyodide = await loadRuntime(); }
  catch (error) {
    self.postMessage({ type: "error", id, error: "No se pudo cargar Python. Comprueba tu conexión a Internet.\n" + String(error) });
    ready = null;
    return;
  }
  const stdout = [], stderr = [];
  pyodide.setStdout({ batched: line => stdout.push(line) });
  pyodide.setStderr({ batched: line => stderr.push(line) });
  const dictType = pyodide.globals.get("dict");
  const globals = dictType();
  globals.set("__name__", "__main__");
  try {
    let trace = null;
    if (debug) {
      globals.set("__student_src__", code);
      await pyodide.runPythonAsync("\nimport sys, json\n__smart_events = []\n__smart_error = None\n__smart_truncated = False\n__smart_scope = globals()\ndef __smart_safe(value):\n    if isinstance(value, (str, int, float, bool, type(None))):\n        return repr(value)[:120]\n    if isinstance(value, (list, tuple, dict)):\n        return repr(value)[:160]\n    return None\ndef __smart_board():\n    data = __smart_scope.get(\"tablero\")\n    if isinstance(data, list) and len(data) == 3 and all(\n        isinstance(row, list) and len(row) == 3 and all(cell in (\"B\", \"N\", \".\") for cell in row)\n        for row in data\n    ):\n        return [row.copy() for row in data]\n    return None\ndef __smart_trace(frame, kind, arg):\n    global __smart_truncated\n    if frame.f_code.co_filename != \"<smartchess-student>\":\n        return __smart_trace\n    if kind not in (\"line\", \"return\", \"exception\"):\n        return __smart_trace\n    if len(__smart_events) >= 800:\n        __smart_truncated = True\n        return __smart_trace\n    if kind == \"return\" and frame.f_code.co_name != \"<module>\":\n        return __smart_trace\n    names = dict(__smart_scope)\n    names.update(frame.f_locals)\n    variables = {}\n    for name, value in names.items():\n        if name.startswith(\"_\") or name in (\"__builtins__\",):\n            continue\n        safe = __smart_safe(value)\n        if safe is not None:\n            variables[name] = safe\n        if len(variables) >= 24:\n            break\n    __smart_events.append({\n        \"line\": frame.f_lineno, \"kind\": kind,\n        \"function\": frame.f_code.co_name,\n        \"variables\": variables, \"board\": __smart_board()\n    })\n    return __smart_trace\ntry:\n    __smart_compiled = compile(__student_src__, \"<smartchess-student>\", \"exec\")\n    sys.settrace(__smart_trace)\n    exec(__smart_compiled, __smart_scope)\nexcept BaseException as exc:\n    __smart_error = type(exc).__name__ + \": \" + str(exc)\nfinally:\n    sys.settrace(None)\n__smart_trace_json = json.dumps({\n    \"events\": __smart_events,\n    \"truncated\": __smart_truncated,\n    \"error\": __smart_error,\n}, ensure_ascii=False)\n", { globals });
      const value = globals.get("__smart_trace_json");
      trace = JSON.parse(value);
      if (trace.error) {
        self.postMessage({ type: "error", id, output: stdout.join("\n"), stderr: stderr.join("\n"), error: trace.error, trace });
        return;
      }
    } else {
      await pyodide.runPythonAsync(code, { globals });
    }
    let board = null, row = null, pawnCount = null;
    try {
      if (globals.has("tablero")) {
        const proxy = globals.get("tablero");
        const value = proxy?.toJs ? proxy.toJs() : proxy;
        if (Array.isArray(value) && value.length === 3 &&
            value.every(row => Array.isArray(row) && row.length === 3 &&
              row.every(cell => ["B", "N", "."].includes(cell)))) board = value;
        if (proxy?.destroy) proxy.destroy();
      }
    } catch { /* Optional board preview should never fail execution. */ }
    try {
      if (globals.has("fila")) {
        const proxy = globals.get("fila");
        const value = proxy?.toJs ? proxy.toJs() : proxy;
        if (Array.isArray(value) && value.length === 3 &&
            value.every(cell => ["B", "N", "."].includes(cell))) row = value;
        if (proxy?.destroy) proxy.destroy();
      }
    } catch { /* Some lessons do not define a row. */ }
    try {
      if (globals.has("peones")) {
        const proxy = globals.get("peones");
        const value = proxy?.toJs ? proxy.toJs() : proxy;
        if (typeof value === "number" && Number.isInteger(value)) pawnCount = value;
        if (proxy?.destroy) proxy.destroy();
      }
    } catch { /* Variable peones is optional in most lessons. */ }
    self.postMessage({ type: "result", id, output: stdout.join("\n"), stderr: stderr.join("\n"), board, row, pawnCount, trace });
  } catch (error) {
    self.postMessage({ type: "error", id, output: stdout.join("\n"), stderr: stderr.join("\n"), error: String(error) });
  } finally {
    globals.destroy();
    dictType.destroy();
  }
};