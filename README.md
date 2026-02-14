# vscode-ron

vscode-ron is a RON syntax package for VS Code.  Loosely based on
https://github.com/ron-rs/sublime-ron


## Where can I get this?

- [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=a5huynh.vscode-ron)
- [OpenVSX Marketplace](https://open-vsx.org/extension/a5huynh/vscode-ron)


## What is RON?

[Rusty Object Notation](https://github.com/ron-rs/ron) (RON) is a simple
readable data serialization format that looks similar to Rust syntax,
designed to support all of Serde's data model. Check out the RON repository
for more information!


## RON Formatting

This extension supports document formatting for RON files via an external formatter binary.

### Setup

1. **Install a RON formatter.** The default is [`fmtron`](https://crates.io/crates/fmtron):
   ```bash
   cargo install fmtron
   ```

2. **Format your file** using `Shift+Alt+F` (or `Shift+Option+F` on macOS), or right-click → "Format Document".

3. **Format on save** (optional): Add to your `settings.json`:
   ```json
   {
     "[ron]": {
       "editor.formatOnSave": true,
       "editor.defaultFormatter": "a5huynh.vscode-ron"
     }
   }
   ```

### Configuration

| Setting | Default | Description |
|---|---|---|
| `ron.formatter.path` | `"fmtron"` | Path to the formatter binary |
| `ron.formatter.maxWidth` | `80` | Max line width (soft limit) |
| `ron.formatter.useStdin` | `false` | Pipe via stdin/stdout instead of temp file |
| `ron.formatter.extraArgs` | `[]` | Additional CLI arguments |

> **Note:** `fmtron` does not preserve comments. See the [fmtron README](https://github.com/barafael/fmtron) for details and limitations.

You can use any RON formatter that accepts a file path argument. If your formatter reads from stdin and writes to stdout, enable `ron.formatter.useStdin`.

## Highlighting Example

Here's a lovely example of what a basic `.ron` file will now look like:

![Syntax highlighting example](docs/example.png)


# Development

Check out VS Code's excellent guide on syntax highlighting extensions [here][extension-guide].
That will help you get setup with the right tooling to start making/testing changes to the grammar.

[extension-guide]: https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide

## Debugging extension

While in VSCode, press `F5` (or `Run` -> `Start Debugging`) to launch a
version of VSCode with the extension loaded.

Load `./docs/example.ron` if you need an example RON file to work on.