import * as vscode from "vscode";
import { execFile } from "child_process";
import { acceptOutput, buildArgs } from "./args";

const TIMEOUT_MS = 10_000;
const MAX_BUFFER = 64 * 1024 * 1024;

let output: vscode.OutputChannel;

class FormatterError extends Error {
  constructor(message: string, readonly notFound = false) {
    super(message);
  }
}

class Cancelled extends Error {}

function runFormatter(
  command: string,
  args: string[],
  input: string,
  cwd: string | undefined,
  token: vscode.CancellationToken
): Promise<string> {
  return new Promise((resolve, reject) => {
    let cancelled = false;
    const proc = execFile(
      command,
      args,
      { cwd, timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER, encoding: "utf8" },
      (error, stdout, stderr) => {
        listener.dispose();
        if (cancelled) {
          reject(new Cancelled());
        } else if (!error) {
          resolve(stdout);
        } else if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          reject(new FormatterError(`"${command}" was not found`, true));
        } else if (error.killed) {
          reject(new FormatterError(`timed out after ${TIMEOUT_MS / 1000}s`));
        } else {
          reject(new FormatterError(stderr.trim() || error.message));
        }
      }
    );
    const listener = token.onCancellationRequested(() => {
      cancelled = true;
      proc.kill();
    });
    // The process may exit before reading all of stdin (e.g. bad arguments);
    // its exit status is reported through the callback above.
    proc.stdin?.on("error", () => {});
    proc.stdin?.end(input);
  });
}

async function formatDocument(
  document: vscode.TextDocument,
  token: vscode.CancellationToken
): Promise<vscode.TextEdit[]> {
  const config = vscode.workspace.getConfiguration("ron.formatter", document);
  const command = config.get<string>("path") || "fmtron";
  const isFile = document.uri.scheme === "file";
  const args = buildArgs(
    {
      maxWidth: config.get<number | null>("maxWidth", null),
      tabSize: config.get<number | null>("tabSize", null),
      extraArgs: config.get<string[]>("extraArgs", []),
    },
    isFile ? document.uri.fsPath : undefined
  );
  // fmt.ron discovery uses --stdin-filepath, not the cwd; the workspace folder
  // is only a base for relative paths in extraArgs (e.g. --config).
  // Virtual workspace folders (e.g. vscode-vfs) have no local path to run in.
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  const cwd = folder?.uri.scheme === "file" ? folder.uri.fsPath : undefined;

  const text = document.getText();
  try {
    const formatted = acceptOutput(
      text,
      await runFormatter(command, args, text, cwd, token)
    );
    if (formatted === undefined || token.isCancellationRequested) {
      return [];
    }
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(text.length)
    );
    return [vscode.TextEdit.replace(fullRange, formatted)];
  } catch (err) {
    if (!(err instanceof Cancelled)) {
      reportError(command, err);
    }
    return [];
  }
}

function reportError(command: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  output.appendLine(`[${new Date().toISOString()}] ${command}: ${message}`);

  if (err instanceof FormatterError && err.notFound) {
    void vscode.window
      .showErrorMessage(
        `RON formatter "${command}" not found. Install it with \`cargo install fmtron\` or set ron.formatter.path.`,
        "Open Settings"
      )
      .then((choice) => {
        if (choice) {
          void vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "ron.formatter.path"
          );
        }
      });
    return;
  }

  void vscode.window
    .showErrorMessage("RON formatting failed.", "Show Output")
    .then((choice) => {
      if (choice) {
        output.show(true);
      }
    });
}

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel("RON Formatter");
  context.subscriptions.push(
    output,
    vscode.languages.registerDocumentFormattingEditProvider("ron", {
      provideDocumentFormattingEdits: (document, _options, token) =>
        formatDocument(document, token),
    })
  );
}

export function deactivate(): void {}
