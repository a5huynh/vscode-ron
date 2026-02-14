const vsctm = require('vscode-textmate');
const oniguruma = require('vscode-oniguruma');
const fs = require('fs');
const path = require('path');

async function main() {
  const wasmBin = fs.readFileSync(path.join(__dirname, 'node_modules/vscode-oniguruma/release/onig.wasm')).buffer;
  await oniguruma.loadWASM(wasmBin);

  const registry = new vsctm.Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (patterns) => new oniguruma.OnigScanner(patterns),
      createOnigString: (s) => new oniguruma.OnigString(s),
    }),
    loadGrammar: async () => {
      const grammar = JSON.parse(fs.readFileSync(path.join(__dirname, 'syntaxes/ron.tmGrammar.json'), 'utf8'));
      return grammar;
    }
  });

  const grammar = await registry.loadGrammar('source.ron');

  const testCases = [
    // Issue #22 - escaped chars in character literals
    { input: "'\\''", desc: "Escaped single quote in char literal", expect: "constant.character.escape" },
    { input: "'\\n'", desc: "Escaped newline in char literal", expect: "constant.character.escape" },
    { input: "'a'", desc: "Normal char literal", expect: "constant.character.ron" },
    // Issue #23 - raw strings
    { input: 'r"hello world"', desc: "Raw string r\"...\"", expect: "string.quoted.other.raw.ron" },
    { input: 'r#"hello "world""#', desc: "Raw string r#\"...\"#", expect: "string.quoted.other.raw.ron" },
    { input: 'r##"hello #"world"# "##', desc: "Raw string r##\"...\"##", expect: "string.quoted.other.raw.ron" },
    // Sanity - regular strings still work
    { input: '"hello"', desc: "Regular string", expect: "string.quoted.double" },
    { input: '"escape \\n"', desc: "String with escape", expect: "constant.character.escape" },
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    let ruleStack = vsctm.INITIAL;
    const result = grammar.tokenizeLine(tc.input, ruleStack);
    const allScopes = result.tokens.flatMap(t => t.scopes);
    const found = allScopes.some(s => s.includes(tc.expect));
    const status = found ? '✅' : '❌';
    if (found) passed++; else failed++;
    console.log(`${status} ${tc.desc}`);
    if (!found) {
      console.log(`   Input: ${tc.input}`);
      console.log(`   Expected scope containing: ${tc.expect}`);
      console.log(`   Got tokens:`);
      for (const t of result.tokens) {
        console.log(`     [${tc.input.substring(t.startIndex, t.endIndex)}] → ${t.scopes.join(', ')}`);
      }
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
