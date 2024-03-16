/**
 * Reads a file from a given path and returns its content as a string.
 * This function is universal and works in Deno, Bun, and Node.js environments.
 *
 * @param {string} path - The path to the XML file.
 * @returns {Promise<string>} The content of the XML file as a string.
 */
export async function readFile(path) {
  /**
   * The text variable.
   * @type {string}
   */
  let text;

  // Check for Deno
  if (typeof Deno !== "undefined") {
    text = await Deno.readTextFile(path);
  }
  // Check for Bun
  else if (typeof Bun !== "undefined") {
    text = await Bun.file(path).text();
  }
  // Fallback for Node.js
  else {
    // Dynamically import 'fs' only if in a Node.js environment
    const fs = await import("fs/promises");
    text = await fs.readFile(path, "utf8");
  }
  return text;
}

/**
 * Writes text to a file at the specified path.
 * This function is universal and works in Deno, Bun, and Node.js environments.
 *
 * @param {string} path - The path of the file to write.
 * @param {string} text - The text to write to the file.
 * @returns {Promise<void>} A promise that resolves when the file has been written.
 */
export async function writeFile(path, text) {
  // Check for Deno
  if (typeof Deno !== "undefined") {
    await Deno.writeTextFile(path, text);
  }
  // Check for Bun
  else if (typeof Bun !== "undefined") {
    await Bun.write(path, text);
  }
  // Fallback for Node.js
  else {
    // Dynamically import 'fs' only if in a Node.js environment
    const fs = await import("fs/promises");
    await fs.writeFile(path, text);
  }
}
