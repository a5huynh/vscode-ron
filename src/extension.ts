import * as vscode from "vscode";
import { execFile } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { writeFile, readFile, unlink } from "fs/promises";
import { randomBytes } from "crypto";

class RonFormattingProvider
  implements vscode.DocumentFormattingEditProvider
{
  provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    options: vscode.FormattingOptions,
    token: vscode.CancellationToken
  ): Promise<vscode.TextEdit[]> {
    return formatDocument(document, options, token);
  }
}

async function formatDocument(
  document: vscode.TextDocument,
  options: vscode.FormattingOptions,
  token: vscode.CancellationToken
): Promise<vscode.TextEdit[]> {
  const config = vscode.workspace.getConfiguration("ron");
  const formatterPath = config.get<string>("formatter.path", "fmtron");
  const extraArgs = config.get<string[]>("formatter.extraArgs", []);
  const tabSize = options.tabSize ?? 4;
  const maxWidth = config.get<number>("formatter.maxWidth", 80);
  const useStdin = config.get<boolean>("formatter.useStdin", false);

  const text = document.getText();

  if (useStdin) {
    // Pipe mode: send content via stdin, read formatted output from stdout
    return new Promise((resolve, reject) => {
      const args = [...extraArgs];
      const proc = execFile(
        formatterPath,
        args,
        { timeout: 10000, maxBuffer: 10 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            vscode.window.showErrorMessage(
              `RON formatter error: ${stderr || error.message}`
            );
            resolve([]);
            return;
          }
          const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(text.length)
          );
          resolve([vscode.TextEdit.replace(fullRange, stdout)]);
        }
      );
      if (proc.stdin) {
        proc.stdin.write(text);
        proc.stdin.end();
      }
      token.onCancellationRequested(() => proc.kill());
    });
  }

  // File mode (default for fmtron): write to temp file, run formatter, read result
  const tmpFile = join(
    tmpdir(),
    `vscode-ron-${randomBytes(8).toString("hex")}.ron`
  );

  try {
    await writeFile(tmpFile, text, "utf-8");

    const formatted = await new Promise<string>((resolve, reject) => {
      // fmtron: use -d to print to stdout, -t for tab size, -w for max width
      const args = [
        tmpFile,
        "-d",
        "-t",
        String(tabSize),
        "-w",
        String(maxWidth),
        ...extraArgs,
      ];

      const proc = execFile(
        formatterPath,
        args,
        { timeout: 10000, maxBuffer: 10 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr || error.message));
            return;
          }
          resolve(stdout);
        }
      );
      token.onCancellationRequested(() => proc.kill());
    });

    if (formatted === text) {
      return [];
    }

    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(text.length)
    );
    return [vscode.TextEdit.replace(fullRange, formatted)];
  } catch (err: any) {
    vscode.window.showErrorMessage(`RON formatter error: ${err.message}`);
    return [];
  } finally {
    unlink(tmpFile).catch(() => {});
    unlink(tmpFile + ".bak").catch(() => {}); // fmtron creates .bak files
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new RonFormattingProvider();

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider("ron", provider)
  );

  // Register a manual format command
  context.subscriptions.push(
    vscode.commands.registerCommand("ron.formatDocument", async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === "ron") {
        await vscode.commands.executeCommand(
          "editor.action.formatDocument"
        );
      }
    })
  );
}

export function deactivate(): void {}
