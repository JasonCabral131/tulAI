// Every skill-pack check pattern compiles in JavaScript (the quality check runs them with new RegExp(match, 'is')). A Python-only pattern such as
// "(?s)…" once made every try of a training round fail, whatever the brain answered.
const assert = require('assert'), { packs } = require('../training-config/skill-packs.json');
let n = 0; for (const p of packs) for (const c of p.checks || []) if (c.match) { try { new RegExp(c.match, 'is'); n++; } catch (e) { assert.fail(`${p.id}: ${e.message}`); } }
const sb = packs.find((p) => p.id === 'springboot-ai'); assert(sb && sb.checks.every((c) => new RegExp(c.match, 'is').test !== undefined));
const good = '@RestController\npublic class ProductController {\n  private final ProductService s;\n  public ProductController(ProductService s) { this.s = s; }\n  @GetMapping("/api/products")\n  public List<ProductDto> all() { return s.all(); }\n}';
assert(new RegExp(sb.checks[0].match, 'is').test(good), 'a correct answer passes the first Spring Boot check'); assert(!new RegExp(sb.checks[0].match, 'is').test('I cannot write code.'), 'a non-answer fails it');
console.log(`PASS pack check patterns: ${n} patterns compile in JavaScript; the Spring Boot checks accept a correct answer`);
