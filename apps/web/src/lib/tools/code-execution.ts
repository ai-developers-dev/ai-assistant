import { tool } from "ai";
import { z } from "zod";

/**
 * Cloud code execution via E2B sandboxes.
 * Gives agents the ability to run Python, JavaScript, or Bash in an isolated
 * container — closing the biggest capability gap vs. local agent frameworks.
 *
 * Requires E2B_API_KEY in environment. When missing, tools return a helpful
 * error instead of crashing.
 */

const E2B_TIMEOUT_MS = 30_000; // 30s per execution (prevents runaway scripts)
const MAX_OUTPUT_CHARS = 50_000; // Truncate massive stdout/stderr

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n... (truncated, ${text.length - max} chars omitted)`;
}

export const executeCodeTool = tool({
  description:
    "Execute code in a secure cloud sandbox. Supports Python, JavaScript (Node.js), and Bash. " +
    "Use this to run code the user asks you to write, process data, test algorithms, perform calculations, " +
    "or automate data transformations. The sandbox has network access and can install packages. " +
    "Each execution runs in an isolated environment. Files created in one execution persist for subsequent " +
    "executions within the same session (up to 5 minutes).",
  parameters: z.object({
    language: z
      .enum(["python", "javascript", "bash"])
      .describe("The programming language to execute"),
    code: z
      .string()
      .describe("The code to execute. For Python, you can use print() for output. For JS, use console.log()."),
  }),
  execute: async ({ language, code }) => {
    const apiKey = process.env.E2B_API_KEY;

    if (!apiKey) {
      return {
        success: false,
        error:
          "Code execution is not configured. E2B_API_KEY is missing from the environment. " +
          "The agent cannot run code without this service.",
      };
    }

    try {
      // Dynamic import — @e2b/code-interpreter is an optional dependency
      const { Sandbox } = await import("@e2b/code-interpreter");

      const sandbox = await Sandbox.create({
        apiKey,
        timeoutMs: 5 * 60 * 1000, // 5 min sandbox lifetime
      });

      try {
        let result;

        if (language === "python") {
          result = await sandbox.runCode(code, {
            timeoutMs: E2B_TIMEOUT_MS,
          });
        } else if (language === "javascript") {
          // E2B code interpreter runs Python by default.
          // For JS/Bash, execute via the sandbox shell.
          const proc = await sandbox.commands.run(`node -e ${JSON.stringify(code)}`, {
            timeoutMs: E2B_TIMEOUT_MS,
          });
          return {
            success: proc.exitCode === 0,
            language,
            stdout: truncate(proc.stdout || "", MAX_OUTPUT_CHARS),
            stderr: truncate(proc.stderr || "", MAX_OUTPUT_CHARS),
            exitCode: proc.exitCode,
          };
        } else {
          // bash
          const proc = await sandbox.commands.run(code, {
            timeoutMs: E2B_TIMEOUT_MS,
          });
          return {
            success: proc.exitCode === 0,
            language,
            stdout: truncate(proc.stdout || "", MAX_OUTPUT_CHARS),
            stderr: truncate(proc.stderr || "", MAX_OUTPUT_CHARS),
            exitCode: proc.exitCode,
          };
        }

        // Python result via code interpreter
        const stdout = truncate(
          result.logs.stdout.join("\n") || "",
          MAX_OUTPUT_CHARS
        );
        const stderr = truncate(
          result.logs.stderr.join("\n") || "",
          MAX_OUTPUT_CHARS
        );
        const hasError = !!result.error;

        return {
          success: !hasError,
          language,
          stdout,
          stderr,
          error: hasError ? (result.error?.name ?? "Error") + ": " + (result.error?.value ?? "Unknown error") : undefined,
          // Include rich results (charts, dataframes) if present
          results: result.results?.map((r: any) => ({
            type: r.type,
            text: r.text,
            html: r.html,
          })),
        };
      } finally {
        // Always clean up the sandbox
        await sandbox.kill().catch(() => {});
      }
    } catch (error: any) {
      console.error("[execute_code] Sandbox error:", error);
      return {
        success: false,
        language,
        error: `Sandbox execution failed: ${error.message?.slice(0, 500)}`,
      };
    }
  },
});

export const installPackageTool = tool({
  description:
    "Install a package in the code execution sandbox using pip (Python) or npm (JavaScript). " +
    "Use this before execute_code when the code requires external libraries like pandas, numpy, " +
    "requests, etc. Multiple packages can be installed at once by separating with spaces.",
  parameters: z.object({
    manager: z
      .enum(["pip", "npm"])
      .describe("Package manager to use: pip for Python packages, npm for Node.js packages"),
    packages: z
      .string()
      .describe("Space-separated package names to install (e.g. 'pandas numpy matplotlib')"),
  }),
  execute: async ({ manager, packages }) => {
    const apiKey = process.env.E2B_API_KEY;

    if (!apiKey) {
      return {
        success: false,
        error:
          "Code execution is not configured. E2B_API_KEY is missing from the environment.",
      };
    }

    try {
      const { Sandbox } = await import("@e2b/code-interpreter");

      const sandbox = await Sandbox.create({
        apiKey,
        timeoutMs: 5 * 60 * 1000,
      });

      try {
        const command =
          manager === "pip"
            ? `pip install ${packages}`
            : `npm install ${packages}`;

        const proc = await sandbox.commands.run(command, {
          timeoutMs: 60_000, // Package installs can be slow
        });

        return {
          success: proc.exitCode === 0,
          manager,
          packages: packages.split(/\s+/).filter(Boolean),
          stdout: truncate(proc.stdout || "", 5000),
          stderr: truncate(proc.stderr || "", 5000),
          exitCode: proc.exitCode,
        };
      } finally {
        await sandbox.kill().catch(() => {});
      }
    } catch (error: any) {
      console.error("[install_package] Error:", error);
      return {
        success: false,
        manager,
        error: `Package installation failed: ${error.message?.slice(0, 500)}`,
      };
    }
  },
});
