.PHONY: vsce-login package publish publish-vsce publish-ovsx

VERSION := $(shell node -p "require('./package.json').version")
VSIX := vscode-ron-$(VERSION).vsix

vsce-login:
	vsce login a5huynh

package:
	vsce package

publish: publish-vsce publish-ovsx

publish-vsce:
	vsce publish

publish-ovsx: package
	@test -n "$$OVSX_PAT" || (echo "OVSX_PAT is not set" && exit 1)
	npx ovsx publish $(VSIX) -p "$$OVSX_PAT"
