const vscode = require('vscode');

// --- Formatter core -------------------------------------------------------
// Quote-aware tokenizer: a "<when condition="@(a > b)">" tag contains a bare
// ">" inside its C# condition. A naive "[^>]*" regex would truncate at that
// ">" and misparse the tag, so we track quote state char-by-char instead.
function tokenize(xml) {
  const tokens = [];
  let i = 0;
  const n = xml.length;
  while (i < n) {
    if (xml[i] === '<') {
      if (xml.startsWith('<!--', i)) {
        let end = xml.indexOf('-->', i);
        end = end === -1 ? n : end + 3;
        tokens.push(xml.slice(i, end));
        i = end;
        continue;
      }
      if (xml.startsWith('<![CDATA[', i)) {
        let end = xml.indexOf(']]>', i);
        end = end === -1 ? n : end + 3;
        tokens.push(xml.slice(i, end));
        i = end;
        continue;
      }
      let j = i + 1;
      let inQuote = null;
      while (j < n) {
        const c = xml[j];
        if (inQuote) {
          if (c === inQuote) inQuote = null;
        } else {
          if (c === '"' || c === "'") inQuote = c;
          else if (c === '>') { j++; break; }
        }
        j++;
      }
      tokens.push(xml.slice(i, j));
      i = j;
    } else {
      let j = xml.indexOf('<', i);
      if (j === -1) j = n;
      tokens.push(xml.slice(i, j));
      i = j;
    }
  }
  return tokens;
}

function formatXml(xml, indentSize) {
  indentSize = indentSize || 2;
  const tokens = tokenize(xml.trim());
  let indent = 0;
  const pad = (n) => ' '.repeat(Math.max(0, n) * indentSize);
  const out = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const trimmedTok = tok.trim();

    if (trimmedTok.startsWith('<?') || trimmedTok.startsWith('<!--') || trimmedTok.startsWith('<![CDATA[')) {
      out.push(pad(indent) + trimmedTok);
      continue;
    }
    if (trimmedTok.startsWith('<!')) {
      out.push(pad(indent) + trimmedTok);
      continue;
    }
    if (trimmedTok.startsWith('</') && trimmedTok.endsWith('>')) {
      indent = Math.max(0, indent - 1);
      out.push(pad(indent) + trimmedTok);
      continue;
    }
    if (trimmedTok.startsWith('<') && trimmedTok.endsWith('/>')) {
      out.push(pad(indent) + trimmedTok);
      continue;
    }
    if (trimmedTok.startsWith('<') && trimmedTok.endsWith('>')) {
      const tagNameMatch = tok.match(/^<([a-zA-Z0-9\-_:]+)/);
      const tagName = tagNameMatch ? tagNameMatch[1] : null;
      const next = tokens[i + 1];
      const after = tokens[i + 2];

      if (tagName && next !== undefined && after !== undefined) {
        const nextTrim = next.trim();
        const closeRe = new RegExp('^</' + tagName + '\\s*>$');
        if (nextTrim !== '' && !next.includes('\n') && !nextTrim.startsWith('<') && closeRe.test(after.trim())) {
          out.push(pad(indent) + trimmedTok + nextTrim + after.trim());
          i += 2;
          continue;
        }
      }
      out.push(pad(indent) + trimmedTok);
      indent++;
      continue;
    }

    if (trimmedTok === '') continue;
    if (tok.includes('\n')) {
      const lines = tok.split('\n');
      const nonEmpty = lines.filter((l) => l.trim() !== '');
      const minIndent = nonEmpty.length
        ? Math.min(...nonEmpty.map((l) => l.match(/^\s*/)[0].length))
        : 0;
      for (const line of lines) {
        if (line.trim() === '') continue;
        out.push(pad(indent) + line.slice(minIndent).replace(/\s+$/, ''));
      }
    } else {
      out.push(pad(indent) + trimmedTok);
    }
  }

  return out.join('\n') + '\n';
}

// Only treat a document as an APIM policy if its root element looks like one.
// This keeps the formatter from hijacking unrelated .xml files.
const POLICY_ROOTS = ['policies', 'inbound', 'outbound', 'backend', 'on-error', 'fragment'];
function looksLikeApimPolicy(text) {
  const match = text.match(/<\s*([a-zA-Z0-9\-_:]+)[\s>]/);
  return !!match && POLICY_ROOTS.includes(match[1]);
}

function buildEdits(document) {
  const text = document.getText();
  if (!looksLikeApimPolicy(text)) return [];
  const formatted = formatXml(text);
  const fullRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(text.length)
  );
  return [vscode.TextEdit.replace(fullRange, formatted)];
}

function activate(context) {
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(
      { language: 'xml' },
      { provideDocumentFormattingEdits: (document) => buildEdits(document) }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('apimPolicy.format', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const edits = buildEdits(editor.document);
      if (edits.length === 0) {
        vscode.window.showInformationMessage(
          'APIM Policy Tools: this file\'s root element doesn\'t look like an APIM policy (expected <policies>, <inbound>, <outbound>, <backend>, <on-error>, or <fragment>), so it was left unchanged.'
        );
        return;
      }
      editor.edit((editBuilder) => {
        for (const edit of edits) editBuilder.replace(edit.range, edit.newText);
      });
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
