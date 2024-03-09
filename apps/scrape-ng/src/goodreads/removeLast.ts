export function removeLast(str: string, pattern: string): string {
  if (!pattern) {
    return str; // Return original string if pattern is falsy
  }
  const lastIndex = str.lastIndexOf(pattern);
  if (lastIndex !== -1) {
    return str.slice(0, lastIndex) + str.slice(lastIndex + pattern.length);
  }
  return str; // Return original string if pattern is not found
}
