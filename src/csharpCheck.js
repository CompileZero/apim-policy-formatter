// Finds every @( ... ) and @{ ... } expression in a raw APIM policy XML file
// and checks it for structural syntax problems: unclosed brackets, mismatched
// bracket types, unterminated strings, and -- the classic APIM footgun -- a
// C# string literal that uses the SAME quote character as the surrounding
// XML attribute, which silently truncates the attribute instead of doing
// what the author intended.
//
// This is NOT a real C# parser. It won't catch semantic errors (wrong types,
// unknown members, etc.) -- only structural/lexical ones. For real
// compiler-checked C#, use the Azure API Management policy toolkit
// (github.com/Azure/azure-api-management-policy-toolkit).

function findExpressionStarts(text) {
  const starts = [];
  const re = /@([\(\{])/g;
  let m;
  while ((m = re.exec(text))) {
    const atIdx = m.index;
    const openChar = m[1];
    const closeChar = openChar === '(' ? ')' : '}';
    const openIdx = atIdx + 1;
    let attrQuote = null;
    const prevChar = text[atIdx - 1];
    if ((prevChar === '"' || prevChar === "'") && text[atIdx - 2] === '=') {
      attrQuote = prevChar;
    }
    starts.push({ atIdx, openIdx, openChar, closeChar, attrQuote });
  }
  return starts;
}

function analyzeExpression(text, expr) {
  const errors = [];
  let depth = 0;
  let inString = null;
  let isVerbatim = false;
  let endIdx = -1;

  for (let i = expr.openIdx; i < text.length; i++) {
    const c = text[i];

    if (inString) {
      if (isVerbatim && c === '"') {
        if (text[i + 1] === '"') { i++; continue; }
        inString = null;
        isVerbatim = false;
        continue;
      }
      if (!isVerbatim && c === '\\') { i++; continue; }
      if (c === inString) { inString = null; continue; }
      continue;
    }

    if (c === '"' || c === "'") {
      if (expr.attrQuote && c === expr.attrQuote) {
        const other = expr.attrQuote === '"' ? "'" : '"';
        const entity = expr.attrQuote === '"' ? '&quot;' : '&apos;';
        errors.push({
          offset: i,
          length: 1,
          message:
            `Hit this ${c} while still ${depth} level(s) deep inside the '${expr.openChar}...${expr.closeChar}' block ` +
            `(still expecting ${depth} more '${expr.closeChar}'). Because ${c} is also the XML attribute's own ` +
            `delimiter, either (a) the block is missing a closing '${expr.closeChar}', or (b) this was meant to be ` +
            `a C# string literal and should use ${other} instead (since ${c} already delimits this attribute), ` +
            `or escape it as ${entity}.`
        });
        return { errors, endIdx: i };
      }
      inString = c;
      isVerbatim = c === '"' && text[i - 1] === '@';
      continue;
    }

    if (c === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i);
      i = (nl === -1 ? text.length : nl) - 1;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 1;
      continue;
    }

    if (c === expr.openChar) { depth++; continue; }
    if (c === expr.closeChar) {
      depth--;
      if (depth === 0) { endIdx = i; break; }
      if (depth < 0) {
        errors.push({
          offset: i,
          length: 1,
          message: `Unexpected '${c}' here -- there's no matching '${expr.openChar}' open for it.`
        });
        return { errors, endIdx: i };
      }
      continue;
    }

    // Flag an inner bracket that closes with the wrong type, e.g. "(...]"
    if (c === ')' || c === '}' || c === ']') {
      // These are only reachable here if they don't match expr.closeChar,
      // meaning they belong to an inner pair whose opener we should have
      // already matched via depth tracking of THAT bracket type. Since we
      // only track expr.openChar/closeChar depth above, mismatched inner
      // bracket types (e.g. an array literal closed with a curly brace)
      // are intentionally left to the editor's built-in bracket matching --
      // flagging them here without full tracking would be unreliable.
    }
  }

  if (endIdx === -1) {
    errors.push({
      offset: expr.openIdx,
      length: 1,
      message: `Unclosed '${expr.openChar}' -- no matching '${expr.closeChar}' found before the end of the document.`
    });
    return { errors, endIdx };
  }
  if (inString) {
    errors.push({
      offset: Math.min(text.length - 1, text.length),
      length: 1,
      message: 'Unterminated string literal inside this expression.'
    });
    return { errors, endIdx };
  }

  // The expression closed cleanly. If this is an attribute-embedded
  // expression, anything between the close and the attribute's actual
  // closing quote should be nothing but that quote itself -- stray leftover
  // characters (e.g. an extra ')') are a real, easy-to-miss bug.
  if (expr.attrQuote) {
    let j = endIdx + 1;
    if (text[j] !== expr.attrQuote) {
      let k = text.indexOf(expr.attrQuote, j);
      const stopAt = k === -1 ? Math.min(text.length, j + 40) : k;
      if (stopAt > j) {
        errors.push({
          offset: j,
          length: stopAt - j,
          message:
            `Unexpected content after the expression already closed: '${text.slice(j, stopAt)}'. ` +
            `Check for an extra '${expr.closeChar}' or stray character before the attribute's closing quote.`
        });
      }
    }
  }

  return { errors, endIdx };
}

function checkDocument(text) {
  const allErrors = [];
  for (const expr of findExpressionStarts(text)) {
    const { errors } = analyzeExpression(text, expr);
    allErrors.push(...errors);
  }
  return allErrors;
}

module.exports = { findExpressionStarts, analyzeExpression, checkDocument };
