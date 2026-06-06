import { tokenize } from "@/lib/ast";

// Pewarnaan sintaks DSL via teknik backdrop. Murni string→HTML (Fase 6 B6).

export function highlightDsl(src: string): string {
  if (!src) return "";
  const { tokens } = tokenize(src);

  // Bangun map start → token untuk lookup cepat
  const byStart = new Map(tokens.map((t) => [t.start, t]));

  let html = "";
  let i = 0;

  while (i < src.length) {
    const tok = byStart.get(i);
    if (!tok || tok.kind === "eof") {
      // Whitespace atau karakter tidak dikenali — keluarkan apa adanya (di-escape)
      html += escHtml(src[i]);
      i += 1;
      continue;
    }

    const raw = src.slice(tok.start, tok.end);

    switch (tok.kind) {
      case "lbracket": {
        // Consume [ident] as one coloured unit if possible
        const next = tokens[tokens.indexOf(tok) + 1];
        const close = tokens[tokens.indexOf(tok) + 2];
        if (
          next &&
          next.kind === "ident" &&
          close &&
          close.kind === "rbracket"
        ) {
          const inner = src.slice(tok.start, close.end);
          html += `<span class="text-emerald-600 dark:text-emerald-300 font-semibold">${escHtml(inner)}</span>`;
          i = close.end;
        } else {
          html += escHtml(raw);
          i = tok.end;
        }
        break;
      }
      case "rbracket":
        // Sudah dikonsumsi di atas; keluarkan mentah kalau sampai sini
        html += escHtml(raw);
        i = tok.end;
        break;
      case "ident": {
        // Cek kalau diikuti "(" → panggilan fungsi
        const nextTok = tokens[tokens.indexOf(tok) + 1];
        if (nextTok && nextTok.kind === "lparen") {
          html += `<span class="text-violet-600 font-semibold">${escHtml(raw)}</span>`;
        } else {
          html += escHtml(raw);
        }
        i = tok.end;
        break;
      }
      case "string":
        html += `<span class="text-amber-600 dark:text-amber-300">${escHtml(raw)}</span>`;
        i = tok.end;
        break;
      case "number":
        html += `<span class="text-blue-600 dark:text-blue-300">${escHtml(raw)}</span>`;
        i = tok.end;
        break;
      case "boolean":
        html += `<span class="text-blue-500 italic">${escHtml(raw)}</span>`;
        i = tok.end;
        break;
      case "plus":
      case "minus":
      case "star":
      case "slash":
      case "eq":
      case "neq":
      case "gt":
      case "lt":
      case "gte":
      case "lte":
      case "andand":
      case "oror":
      case "bang":
      case "qmark":
      case "colon":
        html += `<span class="text-slate-400">${escHtml(raw)}</span>`;
        i = tok.end;
        break;
      default:
        html += escHtml(raw);
        i = tok.end;
        break;
    }
  }

  // Pertahankan trailing newline supaya tinggi backdrop cocok dengan textarea
  if (src.endsWith("\n")) html += " ";
  return html;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
  // Note: regular spaces are intentionally kept as-is so the backdrop
  // wraps long formulas at word boundaries. `whiteSpace: pre-wrap` on
  // the container preserves consecutive spaces without needing &nbsp;.
}
