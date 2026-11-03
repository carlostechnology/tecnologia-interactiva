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
  const { id, code } = event.data || {};
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
    await pyodide.runPythonAsync(code, { globals });
    let board = null;
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
    self.postMessage({ type: "result", id, output: stdout.join("\n"), stderr: stderr.join("\n"), board });
  } catch (error) {
    self.postMessage({ type: "error", id, output: stdout.join("\n"), stderr: stderr.join("\n"), error: String(error) });
  } finally {
    globals.destroy();
    dictType.destroy();
  }
};