# APIM Policy Tools (local VS Code extension)

Syntax highlighting + a formatter for Azure API Management policy XML,
built because the official `vscode-apimanagement` extension doesn't provide
either.

## What it does

- **Syntax highlighting** (injected into VS Code's built-in XML grammar, so it
  works on any `.xml` file, no need to rename files):
  - Policy element names (`inbound`, `choose`, `set-header`, `rate-limit-by-key`, etc.)
    are colored as tags.
  - C# inside `@(...)` and `@{ ... }` expressions gets real highlighting:
    keywords, strings, comments, `context.*` references, method calls.
  - `{{named-values}}` are highlighted distinctly.
- **Formatter**: `Ctrl+Alt+F` / `Cmd+Alt+F`, the `Format Document` command, or
  format-on-save. It only reformats files whose root element is `<policies>`,
  `<inbound>`, `<outbound>`, `<backend>`, `<on-error>`, or `<fragment>` — so it
  won't touch unrelated XML files. It's whitespace-based (indents by nesting),
  preserves `CDATA` blocks and multi-line C# script blocks as-is, and is
  quote-aware so it won't get confused by a `>` inside a condition like
  `context.Response.StatusCode > 400`.
- **Live C# expression diagnostics** (red squiggles, updates as you type):
  every `@(...)` and `@{...}` in the file is checked for structural problems:
  - Unclosed or mismatched brackets.
  - Unterminated string literals.
  - Stray leftover characters after an expression closes (e.g. an extra `)`).
  - The classic APIM footgun: a C# string using the **same quote character**
    as the surrounding XML attribute (e.g. `value="@(x.GetValueOrDefault("a",""))"`),
    which silently truncates the attribute instead of doing what you meant.
    Fix: use the other quote character for C# strings inside a double-quoted
    attribute, or escape as `&quot;`/`&apos;`.

  This is a structural/lexical checker, not a real C# compiler — it won't
  catch type errors or unknown members. For that, see the note on the policy
  toolkit below.
- **Snippets**: `apim-choose`, `apim-set-header`, `apim-set-variable`,
  `apim-set-body`, `apim-rate-limit`, `apim-cache`, `apim-validate-jwt`,
  `apim-send-request`, `apim-retry`, `apim-cors`.

## Install (no marketplace, no build step needed)

**Option A — quickest, for personal use:**

1. Copy this whole folder into your VS Code extensions directory:
   - Windows: `%USERPROFILE%\.vscode\extensions\apim-policy-tools-0.1.0`
   - macOS/Linux: `~/.vscode/extensions/apim-policy-tools-0.1.0`
2. Reload VS Code (`Developer: Reload Window`).

**Option B — via the Command Palette (VS Code 1.80+):**

1. Unzip this folder somewhere.
2. `Ctrl+Shift+P` → `Extensions: Install from Location...` → select the
   unzipped `apim-policy-tools` folder.

**Option C — package as a real `.vsix` (optional, if you want it portable):**

```bash
npm install -g @vscode/vsce
cd apim-policy-tools
vsce package --allow-missing-repository --no-yarn
```

This produces `apim-policy-tools-0.1.0.vsix`, installable via
`Extensions: Install from VSIX...`.

## Known limitations

- The formatter is whitespace/indentation only — it doesn't reformat the C#
  inside `@{ }` blocks beyond preserving relative indentation, and it
  intentionally leaves `CDATA` blocks untouched.
- It's a heuristic tokenizer, not a full XML parser — extremely unusual
  constructs (e.g. unescaped `<`/`>` from C# generics like `As<string>`
  outside a `CDATA` block, which is invalid XML anyway) aren't guaranteed to
  round-trip cleanly. Wrap multi-line C# blocks in `<![CDATA[ ... ]]>`, which
  is standard practice for APIM policies with generics or comparisons.
- Highlighting is pattern-based, not a real C# parser — it won't catch
  compile errors. Pair with the **Azure API Management policy toolkit**
  (github.com/Azure/azure-api-management-policy-toolkit) if you want real
  compiler-checked C# for expressions.
