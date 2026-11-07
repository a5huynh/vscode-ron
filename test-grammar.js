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

  // Helper: check that the token whose text is exactly `token` has the
  // expected scope (and, optionally, none of the `not` scopes). Use `nth`
  // to pick a later occurrence of the same text.
  function tokenHasScope(input, token, expect, not, nth) {
    const result = grammar.tokenizeLine(input, vsctm.INITIAL);
    const matches = result.tokens.filter(t => input.substring(t.startIndex, t.endIndex) === token);
    const t = matches[nth || 0];
    const found = !!t
      && t.scopes.some(s => s.includes(expect))
      && !(not || []).some(n => t.scopes.some(s => s.includes(n)));
    return { found, tokens: result.tokens };
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
    { input: 'Some("value")', desc: "Some is an option type name", expect: "entity.name.type.option.ron" },

    // === Booleans ===
    { input: 'true', desc: "Boolean true", expect: "constant.language.ron" },
    { input: 'false', desc: "Boolean false", expect: "constant.language.ron" },

    // === Line comments ===
    { input: '// this is a comment', desc: "Line comment", expect: "comment.line" },

    // === Extensions attribute ===
    { input: '#![enable(implicit_some)]', token: '#', desc: "Attribute #", expect: "punctuation.definition.attribute" },
    { input: '#![enable(implicit_some)]', token: 'enable', desc: "Attribute enable keyword", expect: "keyword.other.attribute.ron" },
    { input: '#![enable(implicit_some)]', token: 'implicit_some', desc: "Attribute extension name", expect: "support.constant.extension.ron", not: ["entity.name.tag"] },
    { input: '#![enable(implicit_some, unwrap_newtypes)]', token: 'unwrap_newtypes', desc: "Attribute second extension name", expect: "support.constant.extension.ron" },
    { input: '#![enable(implicit_some)]', token: ']', desc: "Attribute ] is not an array", expect: "punctuation.definition.attribute.end", not: ["array"] },

    // === Raw strings with any number of # ===
    { input: 'r######"a "# "##### b"######', token: 'a "# "##### b', desc: "Raw string with 6 #", expect: "string.quoted.other.raw.ron" },
    { input: 'r#"x"#', token: 'r', desc: "Raw string r prefix", expect: "storage.type.string.ron", not: ["entity.name.tag"] },
    { input: 'r#"a"# b', token: 'b', desc: "Raw string ends at matching #", expect: "entity.name.tag.ron", not: ["string"] },
    { input: 'r##"a"# b"##', token: 'a"# b', desc: "Raw string ignores shorter \"# terminator", expect: "string.quoted.other.raw.ron" },

    // === Byte strings / byte chars ===
    { input: 'br"bytes"', token: 'br', desc: "Byte raw string prefix", expect: "storage.type.string.ron", not: ["entity.name.tag"] },
    { input: 'br#"by"tes"#', token: 'by"tes', desc: "Byte raw string body", expect: "string.quoted.other.raw.ron" },
    { input: 'b"bytes"', token: 'b', desc: "Byte string prefix", expect: "storage.type.string.ron" },
    { input: "b'a'", token: 'b', desc: "Byte char prefix", expect: "storage.type.string.ron", not: ["entity.name.tag"] },
    { input: "b'a'", token: 'a', desc: "Byte char body", expect: "constant.character.ron" },
    { input: "b'\\x7F'", token: 'x7F', desc: "Byte char escape", expect: "constant.character.escape.bit" },

    // === Escapes ===
    { input: '"\\xFF"', token: 'xFF', desc: "Byte escape above 0x7F", expect: "constant.character.escape.bit" },
    { input: '"\\x7f"', token: 'x7f', desc: "Lowercase byte escape", expect: "constant.character.escape.bit" },
    { input: '"\\u{1F600}"', token: '1F600', desc: "Unicode escape (5 digits)", expect: "constant.character.escape.unicode" },
    { input: '"\\u{A}"', token: 'A', desc: "Unicode escape (1 digit)", expect: "constant.character.escape.unicode" },

    // === Special floats ===
    { input: 'x: inf', token: 'inf', desc: "inf", expect: "constant.language.float.ron", not: ["entity.name.tag"] },
    { input: 'x: -inf', token: '-inf', desc: "-inf includes sign", expect: "constant.language.float.ron" },
    { input: 'x: NaN', token: 'NaN', desc: "NaN", expect: "constant.language.float.ron", not: ["entity.name.type"] },
    { input: 'x: +NaN', token: '+NaN', desc: "+NaN includes sign", expect: "constant.language.float.ron" },
    { input: 'x: inff64', token: 'f64', desc: "inf with suffix", expect: "storage.type.numeric.ron" },
    { input: '(inf: 1)', token: 'inf', desc: "inf as a field name stays a field", expect: "variable.other.member.ron", not: ["constant"] },
    { input: 'x: info', token: 'info', desc: "Identifier starting with inf is not a float", expect: "entity.name.tag.ron", not: ["constant"] },

    // === Number signs ===
    { input: 'a: +1', token: '+1', desc: "Leading + on integer", expect: "constant.numeric.ron" },
    { input: 'a: -1.5', token: '-1.5', desc: "Leading - on float", expect: "constant.numeric.ron" },
    { input: 'a: -0xFF', token: '-0xFF', desc: "Leading - on hex", expect: "constant.numeric.hex.ron" },
    { input: 'a: .5', token: '.5', desc: "Float with no integer part", expect: "constant.numeric.ron" },
    { input: 'a: 1.,', token: '1.', desc: "Float with no fractional part", expect: "constant.numeric.ron" },

    // === Number suffixes ===
    { input: 'a: 1u8', token: 'u8', desc: "Integer suffix u8", expect: "storage.type.numeric.ron", not: ["entity.name.tag"] },
    { input: 'a: 1u8', token: '1', desc: "Integer with suffix is numeric", expect: "constant.numeric.ron" },
    { input: 'a: -5i128', token: 'i128', desc: "Integer suffix i128", expect: "storage.type.numeric.ron" },
    { input: 'a: 1.0f32', token: 'f32', desc: "Float suffix f32", expect: "storage.type.numeric.ron" },
    { input: 'a: 0xFFu8', token: 'u8', desc: "Hex with suffix", expect: "storage.type.numeric.ron" },
    { input: 'a: 0b1010_u16', token: 'u16', desc: "Binary with _suffix", expect: "storage.type.numeric.ron" },
    { input: 'a: 1x', token: 'x', desc: "Invalid suffix is not numeric", expect: "source.ron", not: ["constant.numeric", "storage.type.numeric"] },

    // === Ranges don't swallow digits ===
    { input: 'a: 1..5', token: '..', desc: "Range operator", expect: "keyword.operator.range.ron" },
    { input: 'a: 1..5', token: '5', desc: "Range end is an integer, not .5", expect: "constant.numeric.ron" },
    { input: 'a: ..5', token: '5', desc: "RangeTo end is an integer, not .5", expect: "constant.numeric.ron" },
    { input: 'a: ..5', token: '..', desc: "RangeTo operator", expect: "keyword.operator.range.ron" },
    { input: 'a: 1..=5', token: '..=', desc: "Inclusive range operator", expect: "keyword.operator.range.ron" },

    // === Some / None ===
    { input: 'Foo(a: None)', token: 'None', desc: "None", expect: "entity.name.type.option.ron" },
    { input: '[Some(1), None]', token: 'None', desc: "None in array", expect: "entity.name.type.option.ron" },
    { input: 'Somebody', token: 'Somebody', desc: "Identifier starting with Some", expect: "entity.name.type.ron", not: ["option"] },

    // === Separators / meta scopes ===
    { input: '[1, 2]', token: ',', desc: "Array separator", expect: "punctuation.separator.array.ron" },
    { input: '[1, 2]', token: '1', desc: "Array content has meta scope", expect: "meta.structure.array.ron" },
    { input: '(1, 2)', token: ',', desc: "Tuple separator", expect: "punctuation.separator.parens.ron" },
    { input: '[A, b]', token: 'b', desc: "Enum variant in array", expect: "entity.name.tag.ron" },

    // === Scope naming ===
    { input: '"hello"', token: 'hello', desc: "String scope has .ron suffix", expect: "string.quoted.double.ron" },
    { input: "'a'", token: 'a', desc: "Char scope has .ron suffix", expect: "string.quoted.single.ron" },
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    let result;
    if (tc.token !== undefined) {
      result = tokenHasScope(tc.input, tc.token, tc.expect, tc.not, tc.nth);
    } else if (tc.mode === "substring") {
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

  // Multi-line raw string: the closing "## must be matched via the captured # count
  console.log('\n--- Multi-line raw string verification ---');
  {
    const lines = ['x: r##"line one', 'still "# raw', 'end"##, y: 1'];
    let stack = vsctm.INITIAL;
    const results = lines.map(l => { const r = grammar.tokenizeLine(l, stack); stack = r.ruleStack; return r; });
    const tok = (i, text) => results[i].tokens.find(t => lines[i].substring(t.startIndex, t.endIndex) === text);
    const midRaw = results[1].tokens.every(t => t.scopes.some(s => s.includes('string.quoted.other.raw')));
    const yField = tok(2, 'y') && tok(2, 'y').scopes.some(s => s.includes('variable.other.member'));
    if (midRaw && yField) {
      passed++;
      console.log('✅ Multi-line raw string ends only at matching "##');
    } else {
      failed++;
      console.log('❌ Multi-line raw string broke');
      results.forEach((r, i) => r.tokens.forEach(t => console.log(`   [${lines[i].substring(t.startIndex, t.endIndex)}] → ${t.scopes.join(', ')}`)));
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
