// Polyfill window.matchMedia for jsdom, which does not implement it.
// Angular CDK's BreakpointObserver calls matchMedia().addListener() (deprecated API)
// which throws in the test environment without this stub.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList,
});
