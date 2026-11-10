/** Vite's `?raw` import: a file's text, for tests that guard source shape. */
declare module "*?raw" {
  const text: string;
  export default text;
}

/** Vite's eager `import.meta.glob`, for tests that walk a folder. */
interface ImportMeta {
  glob<T>(pattern: string, options: { eager: true; import: "default" }): Record<string, T>;
}
