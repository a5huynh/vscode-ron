set dotenv-filename := ".env.local"

version := `node -p "require('./package.json').version"`
vsix := "vscode-ron-" + version + ".vsix"

default:
    @just --list

vsce-login:
    vsce login a5huynh

package:
    vsce package

publish: publish-vsce publish-ovsx

publish-vsce:
    vsce publish

publish-ovsx: package
    @test -n "${OVSX_PAT:-}" || (echo "OVSX_PAT is not set" && exit 1)
    npx ovsx publish {{vsix}} -p "$OVSX_PAT"
