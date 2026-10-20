/**
 * A sorted copy of `items`; the input is never touched. Stands in for
 * `Array#toSorted()`, which is ES2023 and missing on the older tablets HA
 * still serves its legacy frontend build to.
 */
export function sorted<T>(items: Iterable<T>, compare?: (a: T, b: T) => number): T[] {
  const out = [...items];
  out.sort(compare);
  return out;
}
