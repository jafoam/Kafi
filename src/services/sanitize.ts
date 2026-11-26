const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "b",
  "strong",
  "i",
  "em",
  "span",
  "sup",
  "sub",
  "h1",
  "h2",
  "h3",
  "h4",
  "ul",
  "ol",
  "li",
  "blockquote",
]);

const DROPPED_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "img",
  "svg",
  "math",
  "noscript",
  "template",
]);

const ALLOWED_DIR = new Set(["ltr", "rtl", "auto"]);
const SAFE_LANG_RE = /^[A-Za-z0-9-]+$/;

function sanitizeNode(node: Node, doc: Document, target: Node): void {
  if (node.nodeType === 3) {
    target.appendChild(doc.createTextNode(node.textContent ?? ""));
    return;
  }

  if (node.nodeType !== 1) return;

  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  if (DROPPED_TAGS.has(tag)) return;

  if (!ALLOWED_TAGS.has(tag)) {
    for (const child of Array.from(el.childNodes)) {
      sanitizeNode(child, doc, target);
    }
    return;
  }

  const clean = doc.createElement(tag);

  const classAttr = el.getAttribute("class");
  if (classAttr !== null && classAttr.trim() !== "") {
    clean.setAttribute("class", classAttr);
  }

  const dirAttr = el.getAttribute("dir")?.toLowerCase();
  if (dirAttr && ALLOWED_DIR.has(dirAttr)) {
    clean.setAttribute("dir", dirAttr);
  }

  const langAttr = el.getAttribute("lang")?.trim();
  if (langAttr && SAFE_LANG_RE.test(langAttr)) {
    clean.setAttribute("lang", langAttr);
  }

  for (const child of Array.from(el.childNodes)) {
    sanitizeNode(child, doc, clean);
  }

  target.appendChild(clean);
}

export function sanitizeHtml(input: string): string {
  if (!input) return "";

  const parser = new DOMParser();
  const doc = parser.parseFromString(input, "text/html");
  const container = doc.createElement("div");

  for (const child of Array.from(doc.body.childNodes)) {
    sanitizeNode(child, doc, container);
  }

  return container.innerHTML;
}
