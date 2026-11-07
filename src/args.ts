export interface FormatterSettings {
  maxWidth: number | null;
  tabSize: number | null;
  extraArgs: string[];
}

/**
 * Arguments for a stdin/stdout formatter run (fmtron by default).
 *
 * `-w` / `-t` are only passed when set, because command-line flags override
 * the project's `fmt.ron`. `--stdin-filepath` lets the formatter find that
 * `fmt.ron` and name the file in error messages.
 */
export function buildArgs(
  settings: FormatterSettings,
  filePath: string | undefined
): string[] {
  const args: string[] = [];
  if (filePath) {
    args.push("--stdin-filepath", filePath);
  }
  if (isPositiveInt(settings.maxWidth)) {
    args.push("-w", String(settings.maxWidth));
  }
  if (isPositiveInt(settings.tabSize)) {
    args.push("-t", String(settings.tabSize));
  }
  args.push(...settings.extraArgs.filter((a) => typeof a === "string"));
  return args;
}

/**
 * The replacement text for the document, or `undefined` if it should be left
 * alone: output unchanged, or empty output for non-empty input (a formatter
 * that exits 0 without printing must never wipe the document).
 */
export function acceptOutput(input: string, output: string): string | undefined {
  if (output === input) {
    return undefined;
  }
  if (output.trim() === "" && input.trim() !== "") {
    return undefined;
  }
  return output;
}

function isPositiveInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n > 0;
}
