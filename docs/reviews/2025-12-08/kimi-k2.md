# Critical Code Review: flappa-doormal

Overall, this is well-architected with excellent type safety, clear separation of concerns, and thoughtful design patterns. However, for **tens of thousands of pages**, there are fundamental architectural issues that will cause severe performance degradation and memory exhaustion. Here's what needs immediate attention:

---

## 🔴 **Critical Performance Issues**

### 1. **Memory Monolith: Concatenation Strategy**
```typescript
const buildPageMap = (pages: Page[]): { content: string; pageMap: PageMap } => {
    // ...joins ALL pages into a massive string with \n separators
    const { content: matchContent, pageMap } = buildPageMap(pages);
```
**Problem**: For 10,000 pages × 5KB/page = **50MB string** in memory. Regex operations on this monolith cause:
- **V8 heap pressure** and GC thrashing
- **Catastrophic backtracking** risk on massive strings
- **No streaming** possible; everything must fit in RAM

**Fix**: Process pages as a **virtual concatenated stream** with position tracking. Use a **rope data structure** or process page-by-page with boundary-aware matching.

---

### 2. **O(n×m) Page Break Conversion**
```typescript
const convertPageBreaks = (content: string, startOffset: number, pageBreaks: Set<number>): string => {
    for (const pb of pageBreaks) {  // Iterates ALL page breaks for EVERY segment
        if (pb >= startOffset && pb < endOffset) {
            // ...creates new string each time
        }
    }
}
```
**Problem**: With 10,000 segments and 10,000 page breaks, this is **100 million iterations**. String slicing creates massive garbage.

**Fix**: Pre-compute **page break intervals** using a sorted array + binary search. Build strings via **array joins** instead of repeated slicing.

---

### 3. **Redundant Binary Searches**
```typescript
const createSegment = (/*...*/) => {
    const from = pageMap.getId(start);  // O(log n) binary search
    const to = capturedContent ? pageMap.getId(end - 1) : pageMap.getId(start + text.length - 1); // Another!
}
```
**Problem**: Called **twice per segment**. For 50,000 segments = **100,000 binary searches**.

**Fix**: **Cache results** in a Map<offset, pageId> or pre-build a **direct lookup array** if page sizes are predictable.

---

### 4. **No Rule Compilation Cache**
```typescript
for (const rule of rules) {
    const { regex, usesCapture, captureNames } = buildRuleRegex(rule); // Re-compiles every call!
}
```
**Problem**: Rules recompiled on **every `segmentPages()` invocation**.

**Fix**: Expose a **`compileRules()`** function that returns pre-compiled `CompiledRule[]` objects.

---

## 🟡 **Architectural Assumptions That Won't Scale**

### 5. **Page ID Semantics Are Brittle**
```typescript
const groupKey = Math.floor(id / maxSpan);  // Assumes sequential, 0-indexed IDs
```
**Assumption**: Page IDs are **dense integers starting near 0**. Real-world IDs might be sparse (`[1, 5, 1000]`) or non-numeric.

**Fix**: Use **`Map<pageId, index>`** for grouping. Document that IDs are treated as **ordinal positions**, not pure identifiers.

---

### 6. **Zero Validation of Rules**
```typescript
export type SplitRule = PatternType & SplitBehavior & RuleConstraints;
// No runtime validation that exactly ONE pattern type is present
```
**Problem**: Could pass `{ lineStartsWith: [...], lineEndsWith: [...] }` and get **undefined behavior** (lineStartsWith wins due to order).

**Fix**: Add a **`validateRule()`** function that throws if rules are malformed. Use **type guards** to enforce mutual exclusivity.

---

### 7. **Global Regex State Risk**
```typescript
const SIMPLE_TOKEN_REGEX = /\{\{(\w+)\}\}/g;  // Global flag!

export function containsTokens(query: string): boolean {
    SIMPLE_TOKEN_REGEX.lastIndex = 0;  // Manual reset required
}
```
**Problem**: In **async contexts** (rare but possible), concurrent calls could corrupt state.

**Fix**: Use **local regex instances** inside functions or remove the `g` flag.

---

## 🟠 **Performance Subtleties**

### 8. **Inefficient Capture Extraction**
```typescript
const matches: MatchResult[] = [];
regex.lastIndex = 0;
let m = regex.exec(content);
while (m !== null) {
    // ...extracts namedCaptures even if not needed
}
```
**Problem**: `extractNamedCaptures()` is called **unconditionally**, creating objects for every match even if `meta` is never used.

**Fix**: **Lazy extraction**: only extract captures if `rule.meta` or capture names exist.

---

### 9. **Magic Number in Zero-Length Match Handling**
```typescript
if (m[0].length === 0) {
    regex.lastIndex++;  // Why ++? Undocumented
}
```
**Problem**: Could skip characters incorrectly. Should use `advanceStringIndex()` per ECMA spec.

**Fix**: Document or use **`m.index + 1`**.

---

### 10. **Missing Sticky Flag Optimization**
Regex uses `gmu` but not **`y` (sticky)**. Sticky regex can be **2-3x faster** for line-start patterns since it doesn't search from position 0 each time.

---

## 🔵 **API Design Issues**

### 11. **`maxSpan` Semantics Are Counter-Intuitive**
```typescript
maxSpan: 1  // Groups pages 0-0, 1-1, 2-2 (not pages 1, 2, 3)
```
**Problem**: `Math.floor(id / maxSpan)` creates groups starting at 0. Users expect `maxSpan: 2` to mean "pages 1-2, 3-4, 5-6".

**Fix**: Use **`Math.floor((id - 1) / maxSpan)`** to make it 1-indexed, or document clearly.

---

### 12. **`to?: number` Mismatch**
```typescript
type Segment = {
    from: number;
    to?: number;  // Only present if spans multiple pages
}
```
**Problem**: Inconsistent. Single-page segments should be **`to: from`**, not undefined. Forces null-checks everywhere.

**Fix**: **Always include `to`** for API consistency.

---

### 13. **No Custom Token Registry**
```typescript
export const TOKEN_PATTERNS: Record<string, string> = { ... };  // Hardcoded
```
**Problem**: Users **cannot extend** tokens without forking the library.

**Fix**: Allow:
```typescript
const segmenter = new FlappaDoormal({
    customTokens: { myToken: '...' }
});
```

---

## 🐛 **Subtle Bugs**

### 14. **`findBoundary` Out-of-Range Bug**
```typescript
// Fallback to last boundary if not found
return boundaries[boundaries.length - 1];
```
**Bug**: If `offset` is **negative** or **before first page**, it returns the **last page**.

**Fix**: Return `undefined` or throw; let caller handle bounds checking.

---

### 15. **`getId` Implies Synchronous Pages**
```typescript
getId: (off: number) => number  // No async support
```
**Problem**: Cannot **stream pages** from disk/network. All pages must be in memory first.

**Fix**: Support **AsyncIterator<Page>** for true streaming.

---

### 16. **No Protection Against ReDoS**
```typescript
// User-provided regex is used unvalidated
{ regex: userInput, split: 'before' }
```
**Problem**: Malicious regex can cause **catastrophic backtracking**, freezing the process.

**Fix**: Add **regex validation** with a complexity checker (e.g., `safe-regex`).

---

## 📊 **What We'd Change (Priority Order)**

### Immediate (Before Production at Scale)
1. **Replace concatenation with virtual stream** - Use generator-based processing
2. **Add rule compilation cache** - Expose `compileRules()` API
3. **Fix page break conversion** - Binary search + array join
4. **Add runtime rule validation** - Prevent silent failures
5. **Remove global regex state** - Use local instances

### Short-term (Next Release)
6. **Optimize `getId` lookups** - Pre-compute offset→pageId map
7. **Add custom token support** - Allow user extensions
8. **Make `to` field required** - API consistency
9. **Add progress callbacks** - For large jobs
10. **Implement sticky regex** - For line-start patterns

### Long-term (Architecture)
11. **Async streaming API** - Support `segmentPagesAsync()`
12. **Web Worker support** - Browser offload
13. **Regex safety checker** - Prevent ReDoS
14. **Rule priority system** - Explicit conflict resolution
15. **Capture transformers** - Parse numbers, dates, etc.

---

## ✅ **What's Actually Great**

- **TypeScript strict mode** - No `any` types
- **Biome linting** - Complexity limits enforced
- **Comprehensive JSDoc** - Excellent documentation
- **Token abstraction** - Hides Unicode complexity
- **Fuzzy matching** - Solves real Arabic text problems
- **Page-aware design** - Correctly handles multi-page spans

---

## **Final Verdict**

This is a **well-crafted library** for its intended scale (hundreds to low-thousands of pages). The code is clean, well-tested, and thoughtfully designed. However, the **concatenation-based architecture** is a **fundamental blocker** for tens of thousands of pages. It needs a **streaming rewrite** to be viable at that scale.

**Recommendation**: For large-scale use, **do not use as-is**. Either:
- Fork and implement virtual content streaming, OR
- Process documents in **batches of 1,000 pages** and merge results

The token system and fuzzy matching are excellent; the core engine just needs to stop treating content as a monolith.