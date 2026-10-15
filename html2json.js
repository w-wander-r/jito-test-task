// Strategy: HTML string -> tokenize() -> buildTree() -> plain JS objects.
function convertHtml2JsonAndSet() {
  const htmlTextAreaValue = document.getElementById("html").value;
  const jsonObj = html2json(htmlTextAreaValue);
  const jsonArea = document.getElementById("json");
  jsonArea.textContent = JSON.stringify(jsonObj, null, 2);
}


// Accepts htmlText and returns json obj
function html2json(htmlText) {
  if (typeof htmlText !== "string" || htmlText.length === 0) {
    return [];
  }
  const tokens = tokenize(htmlText);
  return buildTree(tokens);
}

// self closing tags
const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

// content of these must not be parsed as tags
const RAW_TEXT_ELEMENTS = new Set(["script", "style", "textarea"]);

function tokenize(html) {
  const tokens = [];
  let i = 0;
  const len = html.length;

  while (i < len) {
    // 1. Comment: <!-- ... -->
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      if (end === -1) {
        tokens.push({ type: "comment", content: html.slice(i + 4) });
        i = len;
      } else {
        tokens.push({ type: "comment", content: html.slice(i + 4, end) });
        i = end + 3;
      }
      continue;
    }

    // 2. DOCTYPE / directives: <!DOCTYPE ...>, <!...>
    if (html[i] === "<" && html[i + 1] === "!") {
      const gt = html.indexOf(">", i + 2);
      if (gt === -1) {
        tokens.push({ type: "text", content: html.slice(i) });
        i = len;
      } else {
        const raw = html.slice(i, gt + 1);
        const inner = raw.slice(2, -1).trim();
        if (/^doctype\s+/i.test(inner) || /^doctype$/i.test(inner)) {
          tokens.push({ type: "doctype", content: inner.replace(/^doctype\s+/i, "") });
        } else {
          tokens.push({ type: "directive", content: raw });
        }
        i = gt + 1;
      }
      continue;
    }

    // 3. Closing tag: </name>
    if (html[i] === "<" && html[i + 1] === "/") {
      const gt = html.indexOf(">", i + 2);
      if (gt === -1) {
        tokens.push({ type: "text", content: html.slice(i) });
        i = len;
      } else {
        const raw = html.slice(i + 2, gt).trim();
        const name = (raw.split(/\s+/)[0] || "").toLowerCase();
        tokens.push({ type: "close", tag: name });
        i = gt + 1;
      }
      continue;
    }

    // 4. Opening tag: <name ...> — respect quoted ">" inside attributes
    if (html[i] === "<" && /[A-Za-z]/.test(html[i + 1] || "")) {
      const gt = findTagEnd(html, i + 1);
      if (gt === -1) {
        tokens.push({ type: "text", content: html.slice(i) });
        i = len;
      } else {
        tokens.push(parseOpenTag(html.slice(i + 1, gt)));
        i = gt + 1;
      }
      continue;
    }

    // 5. Text node: everything up to next "<"
    const nextLt = html.indexOf("<", i);
    if (nextLt === -1) {
      tokens.push({ type: "text", content: html.slice(i) });
      i = len;
    } else {
      const second = html[nextLt + 1];
      const isTokenStart =
        second === "!" || second === "/" ||
        (second !== undefined && /[A-Za-z]/.test(second));
      if (nextLt === i && !isTokenStart) {
        tokens.push({ type: "text", content: "<" });
        i = i + 1;
      } else if (!isTokenStart) {
        const afterBogus = html.indexOf("<", nextLt + 1);
        if (afterBogus === -1) {
          tokens.push({ type: "text", content: html.slice(i) });
          i = len;
        } else {
          tokens.push({ type: "text", content: html.slice(i, afterBogus) });
          i = afterBogus;
        }
      } else {
        tokens.push({ type: "text", content: html.slice(i, nextLt) });
        i = nextLt;
      }
    }
  }

  console.log(tokens);
  return tokens;
}

function buildTree(tokens) {
  const root = [];
  const stack = [{ children: root, tag: null }];

  for (let idx = 0; idx < tokens.length; idx++) {
    const tok = tokens[idx];
    const top = stack[stack.length - 1];

    if (tok.type === "text") {
      if (tok.content.length > 0 && !/^\s*$/.test(tok.content)) {
        top.children.push({ text: tok.content });
      }
    } else if (tok.type === "comment") {
      top.children.push({ comment: tok.content });
    } else if (tok.type === "doctype") {
      top.children.push({ doctype: tok.content });
    } else if (tok.type === "directive") {
      top.children.push({ directive: tok.content });
    } else if (tok.type === "open") {
      const el = { tag: tok.tag, attributes: tok.attributes, children: [] };
      top.children.push(el);
      if (tok.selfClosing) continue;
      if (RAW_TEXT_ELEMENTS.has(tok.tag)) {
        let raw = "";
        let j = idx + 1;
        let found = false;
        while (j < tokens.length) {
          const t = tokens[j];
          if (t.type === "close" && t.tag === tok.tag) { found = true; break; }
          raw += tokenToRaw(t);
          j++;
        }
        if (raw.length > 0 && (tok.tag === "pre" || !/^\s*$/.test(raw))) {
          el.children.push({ text: raw });
        }
        idx = found ? j : tokens.length;
        continue;
      }
      stack.push(el);
    } else if (tok.type === "close") {
      if (!tok.tag) continue;
      let depth = -1;
      for (let k = stack.length - 1; k >= 1; k--) {
        if (stack[k].tag === tok.tag) { depth = k; break; }
      }
      if (depth === -1) continue;
      stack.length = depth;
    }
  }

  return root;
}

// ---- helpers ----

// Find ">" closing the tag starting at index `from` (after "<")
// skipping ">" inside single/double quotes. Returns index or -1
function findTagEnd(html, from) {
  let quote = null;
  for (let k = from; k < html.length; k++) {
    const ch = html[k];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ">") {
      return k;
    }
  }
  return -1;
}

function parseOpenTag(raw) {
  let s = raw.trim();
  let selfClosing = false;
  if (s.endsWith("/")) {
    selfClosing = true;
    s = s.slice(0, -1).trim();
  }
  const firstSpace = s.search(/\s/);
  let tag;
  let rest;
  if (firstSpace === -1) {
    tag = s.toLowerCase();
    rest = "";
  } else {
    tag = s.slice(0, firstSpace).toLowerCase();
    rest = s.slice(firstSpace + 1);
  }
  if (VOID_ELEMENTS.has(tag)) selfClosing = true;
  return { type: "open", tag, attributes: parseAttributes(rest), selfClosing };
}


// Re-serialize a single token to raw string
function tokenToRaw(t) {
  if (t.type === "text") return t.content;
  if (t.type === "comment") return "<!--" + t.content + "-->";
  if (t.type === "doctype") return "<!DOCTYPE " + t.content + ">";
  if (t.type === "directive") return t.content;
  if (t.type === "open") {
    let s = "<" + t.tag;
    for (const key of Object.keys(t.attributes)) {
      const v = t.attributes[key];
      if (v === "") s += " " + key;
      else s += " " + key + '="' + v + '"';
    }
    if (t.selfClosing && !VOID_ELEMENTS.has(t.tag)) s += " /";
    return s + ">";
  }
  if (t.type === "close") return "</" + t.tag + ">";
  return "";
}

function parseAttributes(rest) {
  const attrs = {};
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;
  let m;
  while ((m = re.exec(rest)) !== null) {
    const name = m[1].toLowerCase();
    const value = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : "";
    attrs[name] = value;
  }
  return attrs;
}

// ------------

function showExample1() {
  const htmlExample = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport">
    <title>Sample HTML</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <header>
        <h1>Welcome to My Website</h1>
    </header>
    <nav>
        <ul>
            <li><a href="#home">Home</a></li>
            <li><a href="#about">About</a></li>
            <li><a href="#contact">Contact</a></li>
        </ul>
    </nav>
    <main>
        <section id="home">
            <h2>Home Section</h2>
            <p>This is the home section of the webpage.</p>
        </section>
        <section id="about">
            <h2>About Section</h2>
            <p>This is the about section of the webpage.</p>
        </section>
    </main>
    <footer>
        <p>&copy; 2024 My Website</p>
    </footer>
    <script src="script.js"></script>
</body>
</html>
`;

  document.getElementById("html").value = htmlExample;
}

function showExample2() {
  const htmlExample = `<div>
<p>Hello world!</p>
  <button>Click me!</button>
  <textarea>Some very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very very long string.</textarea>
</div>
`;

  document.getElementById("html").value = htmlExample;
}