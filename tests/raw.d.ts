/** Vite's `?raw` import: a file's text, for tests that guard source shape. */
declare module "*?raw" {
  const text: string;
  export default text;
}
