import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/** Everything a shopper can read comes out of these three. */
const ROOTS = ["app", "components", "lib"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** The literal text of a node that holds text: a string, a template chunk, or JSX prose. */
const TEXT_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.JsxText,
]);

/**
 * Every piece of text a file can put on screen.
 *
 * Parsed rather than grepped, because the distinction that matters is exactly the one a
 * regular expression cannot draw: an em dash in a comment is prose *about* the code and is
 * none of this rule's business, while the same character one line down inside a string is
 * copy. A `//` inside a URL, an apostrophe inside a comment, a dash inside a template
 * expression -- each of them breaks a hand-rolled comment stripper, and none of them can
 * confuse the compiler's own scanner.
 */
function copyIn(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const text: string[] = [];
  const visit = (node: ts.Node) => {
    if (TEXT_KINDS.has(node.kind)) text.push((node as ts.LiteralLikeNode).text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return text;
}

describe("user-facing copy", () => {
  /**
   * The em dash is banned outright rather than rationed.
   *
   * It is the punctuation mark a machine reaches for and a shopper does not: it reads as
   * generated text, it has no key on any keyboard StoreSplit is used from, and at 13px it is
   * indistinguishable from the hyphen that would have been clearer anyway. Every sentence it
   * was in read better as two sentences or a comma. This check is here because the next one
   * will arrive in a copy tweak nobody reviews for punctuation.
   */
  it("contains no em dash", () => {
    const offenders = ROOTS.flatMap(sourceFiles).flatMap((file) =>
      copyIn(file)
        .filter((text) => text.includes("—"))
        .map((text) => `${file}: ${text.trim()}`),
    );
    expect(offenders).toEqual([]);
  });

  /**
   * The same character, spelled so the parser cannot see it.
   *
   * `JsxText.text` is the source as written, not the entity-decoded string, so `&mdash;`
   * would sail past the check above and render as an em dash anyway. There is no legitimate
   * use of these three spellings anywhere in this app, so the raw file is searched for them.
   */
  it("contains no em dash written as an HTML entity", () => {
    const entities = /&(mdash|#8212|#x2014);/i;
    const offenders = ROOTS.flatMap(sourceFiles).filter((file) =>
      entities.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  /**
   * A shopper is told what to do, never where the pixels are.
   *
   * "Change it in the header" asks somebody to translate a layout word into a place to
   * click, and stops being true the day the control moves. The fix is always the same: put
   * the action in the sentence as a button.
   */
  it("never points at the page's own furniture", () => {
    const words = /\b(header|navbar|nav bar|sidebar|side bar|component|toolbar)\b/i;
    const offenders = ROOTS.flatMap(sourceFiles).flatMap((file) =>
      copyIn(file)
        // Class names, imports and element ids are code that happens to be a string; only a
        // sentence can point somebody at the wrong part of the screen.
        .filter((text) => /\s/.test(text.trim()) && words.test(text))
        .map((text) => `${file}: ${text.trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});
