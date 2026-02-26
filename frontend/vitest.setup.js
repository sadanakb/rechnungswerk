import '@testing-library/jest-dom'

// Polyfill ResizeObserver for jsdom (used by cmdk/radix)
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    constructor(callback) {
      this._callback = callback
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// Polyfill Element.scrollIntoView for jsdom (used by cmdk)
if (typeof Element.prototype.scrollIntoView === 'undefined') {
  Element.prototype.scrollIntoView = function () {}
}
