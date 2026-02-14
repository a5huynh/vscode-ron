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

  // Helper: tokenize and find if any token contains the expected scope
  function hasScope(input, expect, ruleStack) {
    ruleStack = ruleStack || vsctm.INITIAL;
    const result = grammar.tokenizeLine(input, ruleStack);
    const allScopes = result.tokens.flatMap(t => t.scopes);
    return { found: allScopes.some(s => s.includes(expect)), tokens: result.tokens, ruleStack: result.ruleStack };
  }

  // Helper: check that a specific substring has the expected scope
  function substringHasScope(input, substring, expect) {
    const result = grammar.tokenizeLine(input, vsctm.INITIAL);
    for (const t of result.tokens) {
      const text = input.substring(t.startIndex, t.endIndex);
      if (text === substring || text.includes(substring)) {
        if (t.scopes.some(s => s.includes(expect))) return { found: true, tokens: result.tokens };
      }
    }
    return { found: false, tokens: result.tokens };
  }

  const testCases = [
    // === Issue #22 - escaped chars in character literals ===
    { input: "'\\''", desc: "Escaped single quote in char literal", expect: "constant.character.escape" },
    { input: "'\\n'", desc: "Escaped newline in char literal", expect: "constant.character.escape" },
    { input: "'a'", desc: "Normal char literal", expect: "constant.character.ron" },

    // === Issue #23 - raw strings ===
    { input: 'r"hello world"', desc: "Raw string r\"...\"", expect: "string.quoted.other.raw.ron" },
    { input: 'r#"hello "world""#', desc: "Raw string r#\"...\"#", expect: "string.quoted.other.raw.ron" },
    { input: 'r##"hello #"world"# "##', desc: "Raw string r##\"...\"##", expect: "string.quoted.other.raw.ron" },

    // === Regular strings ===
    { input: '"hello"', desc: "Regular string", expect: "string.quoted.double" },
    { input: '"escape \\n"', desc: "String with escape", expect: "constant.character.escape" },

    // === NEW: Hex/binary/octal numbers ===
    { input: '0xFF', desc: "Hex number", expect: "constant.numeric.hex" },
    { input: '0xDEAD_BEEF', desc: "Hex number with underscores", expect: "constant.numeric.hex" },
    { input: '0b1010', desc: "Binary number", expect: "constant.numeric.binary" },
    { input: '0b1111_0000', desc: "Binary number with underscores", expect: "constant.numeric.binary" },
    { input: '0o777', desc: "Octal number", expect: "constant.numeric.octal" },
    { input: '0o77_77', desc: "Octal number with underscores", expect: "constant.numeric.octal" },
    { input: '42', desc: "Decimal integer", expect: "constant.numeric.ron" },
    { input: '3.14', desc: "Float", expect: "constant.numeric.ron" },
    { input: '1e10', desc: "Scientific notation", expect: "constant.numeric.ron" },
    { input: '-42', desc: "Negative integer", expect: "constant.numeric.ron" },

    // === NEW: Nested block comments ===
    { input: '/* outer /* inner */ still comment */', desc: "Nested block comment", expect: "comment.block.ron" },

    // === NEW: Struct field keys ===
    { input: 'name: "hello"', desc: "Struct field key", expect: "variable.other.member", mode: "substring", substring: "name" },

    // === NEW: Struct/type names (capitalized) ===
    { input: 'MyStruct(', desc: "Struct name (capitalized)", expect: "entity.name.type.ron" },
    { input: 'Some("value")', desc: "Enum variant as type name", expect: "entity.name.type.ron" },

    // === Booleans ===
    { input: 'true', desc: "Boolean true", expect: "constant.language.ron" },
    { input: 'false', desc: "Boolean false", expect: "constant.language.ron" },

    // === Line comments ===
    { input: '// this is a comment', desc: "Line comment", expect: "comment.line" },
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    let result;
    if (tc.mode === "substring") {
      result = substringHasScope(tc.input, tc.substring, tc.expect);
    } else {
      result = hasScope(tc.input, tc.expect);
    }
    const status = result.found ? '✅' : '❌';
    if (result.found) passed++; else failed++;
    console.log(`${status} ${tc.desc}`);
    if (!result.found) {
      console.log(`   Input: ${tc.input}`);
      console.log(`   Expected scope containing: ${tc.expect}`);
      console.log(`   Got tokens:`);
      for (const t of result.tokens) {
        console.log(`     [${tc.input.substring(t.startIndex, t.endIndex)}] → ${t.scopes.join(', ')}`);
      }
    }
  }

  // Special test: nested block comment - verify the inner */ doesn't end the outer comment
  console.log('\n--- Nested comment verification ---');
  let rs = vsctm.INITIAL;
  let r1 = grammar.tokenizeLine('/* outer /* inner */', rs);
  let r2 = grammar.tokenizeLine('still in comment */', r1.ruleStack);
  const innerCommentWorks = r2.tokens.every(t => t.scopes.some(s => s.includes('comment.block')));
  if (innerCommentWorks) {
    passed++;
    console.log('✅ Multi-line nested block comment continues correctly');
  } else {
    failed++;
    console.log('❌ Multi-line nested block comment broke');
    for (const t of r2.tokens) {
      console.log(`   [${'still in comment */'.substring(t.startIndex, t.endIndex)}] → ${t.scopes.join(', ')}`);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
