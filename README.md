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