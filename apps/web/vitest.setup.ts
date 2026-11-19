// Node 25+ defines a global `localStorage` that is undefined unless Node is started
// with --localstorage-file. It shadows jsdom's storage, so tests that touch storage
// fail on Node 26. Point the globals back at jsdom's Web Storage implementation.
const dom = (globalThis as { jsdom?: { window: Window } }).jsdom;
if (dom) {
  for (const key of ["localStorage", "sessionStorage"] as const) {
    Object.defineProperty(globalThis, key, { configurable: true, enumerable: true, value: dom.window[key] });
  }
}
