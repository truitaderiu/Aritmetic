/**
 * math-engine.js
 * Motor matemàtic simbòlic-numèric d'Aritmètic (Zero-Error Blackboard Engine).
 *
 * ARQUITECTURA EN 5 ETAPES (guia per a futures instàncies d'agents):
 * 1. Formatador Racional i Simbòlic (`formatValueRich`, `floatToNiceFraction`):
 *    - Converteix resultats IEEE-754 en enters exactes, fraccions irreductibles (fraccions contínues),
 *      múltiples racionals de \pi i radicals simplificats k\sqrt{m}/d, respectant `formatConfig`
 *      (`decimalPlaces`, `preferFractions`, `decimalComma`).
 * 2. Pre-processador i Divisor de Clàusules (`splitRowIntoClauses`, `stripProseAnnotations`):
 *    - Desempaqueta decoracions de pissarra (\boxed, \cancel, \textcolor, \underbrace) i desenvolupa
 *      determinants 2x2 i 3x3 (\begin{vmatrix}...\end{vmatrix}) per la regla de Sarrus.
 *    - REGLA D'OR DEL TEXT AMB COMETES (" -> \text{...}):
 *      Qualsevol \text{...} fora d'un subíndex és SEMPRE text explicatiu / unitats i MAI una variable
 *      (s'elimina des del primer caràcter). Només es conserva \text{...} quan forma part del subíndex
 *      d'una variable (p. ex. v_{\text{màx}}, A_{\text{triangle}}).
 * 3. Tokenitzador LaTeX (`tokenizeLatex`, `canonicalizeVarKey`):
 *    - Suporta coma decimal catalana (3,14) sense confondre-la amb comes separadores d'equacions,
 *      multiplicació implícita (2x, 3\pi, (a)(b), \sin 2x), lletres gregues, \Delta x, graus (°) i derivades f'(x).
 * 4. Parser AST Descendent Recursiu (`Parser`):
 *    - Construeix un AST segur (amb límit de profunditat MAX_AST_DEPTH i longitud màxima contra DoS)
 *      per a operadors, fraccions, arrels, límits numèrics laterals, integrals definides (Simpson adaptatiu)
 *      i sumatoris/productoris.
 * 5. Resoledor Iteratiu de Punt Fix i Anàlisi de Funcions a Trossos (`analyzeRows`):
 *    - Propaga assignacions en qualsevol ordre (fins i tot si la fórmula s'escriu abans que les dades!),
 *      resol equacions d'1 incògnita (lineals, quadràtiques amb \pm o arrels complexes, i Brent/Secant numèric),
 *      resol sistemes lineals NxN per Gauss-Jordan amb classificació Rouché-Frobenius (SCD / SCI / SI),
 *      i analitza automàticament la continuïtat, salts i derivabilitat de funcions definides a trossos (\begin{cases}).
 */
(function (global) {
  'use strict';

  const GREEK_LETTERS = new Set([
    'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta',
    'theta', 'vartheta', 'iota', 'kappa', 'varkappa', 'lambda', 'mu', 'nu', 'xi',
    'varpi', 'rho', 'varrho', 'sigma', 'varsigma', 'tau', 'upsilon', 'phi', 'varphi',
    'chi', 'psi', 'omega',
    'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
    'aleph', 'ell', 'hbar'
  ]);

  const BUILTIN_FUNCS = new Set([
    'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
    'arcsin', 'arccos', 'arctan', 'asin', 'acos', 'atan',
    'sinh', 'cosh', 'tanh',
    'ln', 'log', 'lg', 'exp', 'sqrt', 'abs', 'sgn',
    'det', 'tr', 'trace', 'rang', 'rank', 'inv', 'trans',
    'angle', 'proj', 'mcd', 'gcd', 'mcm', 'lcm'
  ]);

  const IGNORED_COMMANDS = new Set([
    'displaystyle', 'textstyle', 'scriptstyle', 'scriptscriptstyle',
    'limits', 'nolimits', '!', ',', ':', ';', ' ', 'quad', 'qquad',
    'enspace', 'thinspace', 'medspace', 'thickspace', 'phantom', 'null', 'empty'
  ]);

  // ============================================================================
  // 1. Aritmètica racional aproximada per mostrar fraccions exactes netes
  // ============================================================================
  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b > 0) {
      const t = a % b;
      a = b;
      b = t;
    }
    return a || 1;
  }

  function floatToNiceFraction(val, maxDenom = 1000, tol = 1e-9) {
    if (!Number.isFinite(val)) return null;
    if (Math.abs(val - Math.round(val)) < tol) {
      return { num: Math.round(val), den: 1 };
    }
    const sign = val < 0 ? -1 : 1;
    let x = Math.abs(val);
    let h1 = 1, h2 = 0;
    let k1 = 0, k2 = 1;
    let b = x;
    for (let i = 0; i < 25; i++) {
      const a = Math.floor(b);
      const h = a * h1 + h2;
      const k = a * k1 + k2;
      if (k > maxDenom) break;
      if (Math.abs(x - h / k) < tol) {
        const g = gcd(h, k);
        return { num: sign * (h / g), den: k / g };
      }
      h2 = h1; h1 = h;
      k2 = k1; k1 = k;
      const rem = b - a;
      if (rem < 1e-12) break;
      b = 1 / rem;
    }
    return null;
  }

  const formatConfig = {
    decimalPlaces: 6,
    preferFractions: true,
    decimalComma: true
  };

  function setFormatOptions(opts = {}) {
    if (typeof opts.decimalPlaces === 'number' && opts.decimalPlaces >= 1 && opts.decimalPlaces <= 10) {
      formatConfig.decimalPlaces = Math.round(opts.decimalPlaces);
    }
    if (typeof opts.preferFractions === 'boolean') {
      formatConfig.preferFractions = opts.preferFractions;
    }
    if (typeof opts.decimalComma === 'boolean') {
      formatConfig.decimalComma = opts.decimalComma;
    }
  }

  function formatNumberCatalan(val, useComma) {
    if (!Number.isFinite(val)) {
      if (val === Infinity) return '+∞';
      if (val === -Infinity) return '-∞';
      return '';
    }
    if (Math.abs(val) < 1e-12) val = 0;
    const decPlaces = formatConfig.decimalPlaces || 6;
    const commaPref = typeof useComma === 'boolean' ? useComma : formatConfig.decimalComma;
    let str;
    const abs = Math.abs(val);
    if (abs !== 0 && (abs >= 1e7 || abs < 1e-4)) {
      str = val.toExponential(Math.min(decPlaces, 6)).replace(/\.?0+e/, 'e');
    } else {
      const factor = Math.pow(10, decPlaces);
      const rounded = Math.round(val * factor) / factor;
      str = String(rounded);
    }
    return commaPref ? str.replace('.', ',') : str;
  }

  function formatValueRich(val) {
    if (!Number.isFinite(val)) return null;
    if (Math.abs(val) < 1e-11) val = 0;

    // Enter exacte
    if (Math.abs(val - Math.round(val)) < 1e-9) {
      const n = Math.round(val);
      return {
        numeric: n,
        latex: String(n),
        approxLatex: null,
        text: String(n),
        isExact: true
      };
    }

    if (formatConfig.preferFractions) {
      // Fracció racional neta
      const frac = floatToNiceFraction(val, 500, 1e-8);
      if (frac && frac.den > 1) {
        const sign = frac.num < 0 ? '-' : '';
        const fracLatex = `${sign}\\frac{${Math.abs(frac.num)}}{${frac.den}}`;
        const dec = formatNumberCatalan(val);
        return {
          numeric: val,
          latex: fracLatex,
          approxLatex: dec,
          text: `${frac.num}/${frac.den} ≈ ${dec}`,
          isExact: true
        };
      }

      // Múltiple racional de pi (molt útil en trigonometria i àrees!)
      const piRatio = floatToNiceFraction(val / Math.PI, 24, 1e-8);
      if (piRatio && piRatio.num !== 0) {
        const sign = piRatio.num < 0 ? '-' : '';
        const absNum = Math.abs(piRatio.num);
        const numPart = absNum === 1 ? '\\pi' : `${absNum}\\pi`;
        const piLatex = piRatio.den === 1
          ? `${sign}${numPart}`
          : `${sign}\\frac{${numPart}}{${piRatio.den}}`;
        const dec = formatNumberCatalan(val);
        return {
          numeric: val,
          latex: piLatex,
          approxLatex: dec,
          text: `${dec}`,
          isExact: true
        };
      }

      // Arrel quadrada exacta d'un enter petit (ex: \sqrt{2}, 3\sqrt{5}, \frac{\sqrt{3}}{2})
      for (const den of [1, 2, 3, 4]) {
        const scaled = val * den;
        const sq = scaled * scaled;
        if (sq > 0 && sq <= 200 && Math.abs(sq - Math.round(sq)) < 1e-7) {
          const n = Math.round(sq);
          const r = Math.round(Math.sqrt(n));
          if (r * r !== n) {
            // Simplifica k * sqrt(m)
            let k = 1, m = n;
            for (let f = 2; f * f <= m; f++) {
              while (m % (f * f) === 0) {
                k *= f;
                m /= f * f;
              }
            }
            const g = gcd(k, den);
            const kSimp = k / g;
            const dSimp = den / g;
            const sign = val < 0 ? '-' : '';
            const rad = `${kSimp === 1 ? '' : kSimp}\\sqrt{${m}}`;
            const surdLatex = dSimp === 1 ? `${sign}${rad}` : `${sign}\\frac{${rad}}{${dSimp}}`;
            const dec = formatNumberCatalan(val);
            return {
              numeric: val,
              latex: surdLatex,
              approxLatex: dec,
              text: dec,
              isExact: true
            };
          }
        }
      }
    }

    const dec = formatNumberCatalan(val);
    return {
      numeric: val,
      latex: dec,
      approxLatex: null,
      text: dec,
      isExact: false
    };
  }

  // ============================================================================
  // 2. Utilitats d'extracció de claus LaTeX i pre-processament
  // ============================================================================
  function extractBraced(str, startIdx) {
    // Espera '{' a startIdx (o salta espais previs)
    let i = startIdx;
    while (i < str.length && str[i] === ' ') i++;
    if (str[i] !== '{') return null;
    let depth = 0;
    const contentStart = i + 1;
    for (; i < str.length; i++) {
      if (str[i] === '\\') {
        i++; // salta caràcter escapat
        continue;
      }
      if (str[i] === '{') depth++;
      else if (str[i] === '}') {
        depth--;
        if (depth === 0) {
          return { content: str.slice(contentStart, i), end: i + 1 };
        }
      }
    }
    return { content: str.slice(contentStart), end: str.length };
  }

  function extractBracketed(str, startIdx) {
    let i = startIdx;
    while (i < str.length && str[i] === ' ') i++;
    if (str[i] !== '[') return null;
    let depth = 0;
    const contentStart = i + 1;
    for (; i < str.length; i++) {
      if (str[i] === '\\') { i++; continue; }
      if (str[i] === '[') depth++;
      else if (str[i] === ']') {
        depth--;
        if (depth === 0) {
          return { content: str.slice(contentStart, i), end: i + 1 };
        }
      }
    }
    return null;
  }

  // Expandeix determinants \begin{vmatrix}...\end{vmatrix} (2x2 i 3x3) en expressions algebraiques!
  function expandDeterminants(latex) {
    const vmatrixRegex = /\\begin\{vmatrix\}([\s\S]*?)\\end\{vmatrix\}/g;
    return latex.replace(vmatrixRegex, (_match, body) => {
      const rows = body
        .split(/\\\\/)
        .map(r => r.trim())
        .filter(r => r.length > 0)
        .map(r => r.split('&').map(c => c.trim()));
      if (rows.length === 2 && rows[0].length === 2 && rows[1].length === 2) {
        const [[a, b], [c, d]] = rows;
        return `((${a})*(${d}) - (${b})*(${c}))`;
      }
      if (rows.length === 3 && rows.every(r => r.length === 3)) {
        const [[a, b, c], [d, e, f], [g, h, k]] = rows;
        return `((${a})*(${e})*(${k}) + (${b})*(${f})*(${g}) + (${c})*(${d})*(${h}) - (${c})*(${e})*(${g}) - (${a})*(${f})*(${h}) - (${b})*(${d})*(${k}))`;
      }
      return _match;
    });
  }

  const DEFINITION_OP_REGEX = /\\coloneqq|\\defeq|\\triangleq|\\(?:stackrel|overset)\s*\{\s*\\text(?:rm|bf|it)?\s*\{\s*def\s*\}\s*\}\s*\{\s*=\s*\}|\\equiv(?![a-zA-Z])|:=/g;
  const GREEK_CMD_PATTERN = '\\\\(?:' + [...GREEK_LETTERS].join('|') + ')';
  const SUPSUB_SWAP_REGEX = new RegExp(`(${GREEK_CMD_PATTERN}|(?<![\\\\a-zA-Z])[a-zA-Z])\\s*\\^\\s*(\\{[^{}]*\\}|[a-zA-Z0-9])\\s*_\\s*(\\{[^{}]*\\}|[a-zA-Z0-9])`, 'g');

  // Desempaqueta comandes decoratives com \boxed{...}, \cancel{...}, \textcolor{...}{...}, \underline{...}, \mathbf{...}
  function unwrapDecorations(latex) {
    let s = latex;
    // Normalitza macros específiques que MathLive pot emetre al serialitzar
    s = s
      .replace(/([^\\])\{,\}/g, '$1,')
      .replace(/^\{,\}/, ',')
      .replace(/\\placeholder(?:\[[^\]]*\])?\{([^}]*)\}/g, '$1')
      .replace(/\\mleft/g, '\\left')
      .replace(/\\mright/g, '\\right')
      .replace(/\\lparen/g, '(')
      .replace(/\\rparen/g, ')')
      .replace(/\\lbrack/g, '[')
      .replace(/\\rbrack/g, ']')
      .replace(/\\vert/g, '|')
      .replace(/\\Vert|\\\|/g, '\\Vert ')
      .replace(/\\exponentialE(?![a-zA-Z])/g, 'e')
      .replace(/\\differentialD(?![a-zA-Z])/g, 'd')
      .replace(DEFINITION_OP_REGEX, '=');

    let changed = true;
    let guard = 0;
    while (changed && guard++ < 25) {
      changed = false;
      for (const cmd of ['\\boxed', '\\cancel', '\\bcancel', '\\xcancel', '\\underline', '\\mathbf', '\\boldsymbol']) {
        const idx = s.indexOf(cmd);
        if (idx !== -1 && !/[a-zA-Z]/.test(s[idx + cmd.length] || '')) {
          const br = extractBraced(s, idx + cmd.length);
          if (br) {
            const inner = br.content.trim();
            const isStyleCmd = cmd === '\\mathbf' || cmd === '\\boldsymbol' || cmd === '\\underline';
            const needsParens = !inner.includes('=') &&
              !/^\\text/.test(inner) &&
              (!isStyleCmd || /[+\-]/.test(inner));
            const replacement = needsParens ? '(' + br.content + ')' : br.content;
            s = s.slice(0, idx) + replacement + s.slice(br.end);
            changed = true;
          }
        }
      }
      const tcIdx = s.indexOf('\\textcolor');
      if (tcIdx !== -1) {
        const colorBr = extractBraced(s, tcIdx + '\\textcolor'.length);
        if (colorBr) {
          const bodyBr = extractBraced(s, colorBr.end);
          if (bodyBr) {
            s = s.slice(0, tcIdx) + bodyBr.content + s.slice(bodyBr.end);
            changed = true;
          }
        }
      }
      const ubIdx = s.indexOf('\\underbrace');
      if (ubIdx !== -1) {
        const bodyBr = extractBraced(s, ubIdx + '\\underbrace'.length);
        if (bodyBr) {
          let after = bodyBr.end;
          while (after < s.length && s[after] === ' ') after++;
          if (s[after] === '_') {
            const subBr = extractBraced(s, after + 1);
            if (subBr) after = subBr.end;
          }
          s = s.slice(0, ubIdx) + '(' + bodyBr.content + ')' + s.slice(after);
          changed = true;
        }
      }
    }
    // Normalitza l'ordre superíndex-abans-de-subíndex en variables (ex: \lambda^i_2 -> \lambda_2^i)
    s = s.replace(SUPSUB_SWAP_REGEX, '$1_$3^$2');
    return s;
  }

  // Extreu sub-clàusules d'una fila (p. ex. \begin{cases}, fletxes \Rightarrow, comes separadores d'equacions)
  // Respecta les funcions definides a trossos del tipus f(x) = \begin{cases} ... \end{cases}!
  function splitRowIntoClauses(rawLatex) {
    if (!rawLatex || !rawLatex.trim()) return [];
    let s = rawLatex.trim();

    // Si conté \begin{cases}...\end{cases} i NO va precedit per '=' o ':=' (com f(x) = \begin{cases}...), extreu cada fila del sistema
    const casesBlocks = [];
    const casesRegex = /\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g;
    let match;
    let stripped = s;
    while ((match = casesRegex.exec(s)) !== null) {
      const prefixBefore = s.slice(0, match.index).trim();
      const isPiecewiseDef = /(?:=|:=|\\coloneqq|\\defeq|\\triangleq|\\equiv)\s*$/.test(prefixBefore);
      if (isPiecewiseDef) {
        // Conserva intacta la definició de funció a trossos dins `stripped`!
        continue;
      }
      const inner = match[1];
      const lines = inner.split(/\\\\/).map(l => {
        const parts = l.split('&');
        return parts[0].trim();
      }).filter(Boolean);
      casesBlocks.push(...lines);
      stripped = stripped.replace(match[0], ' ');
    }

    const baseList = casesBlocks.length > 0 && !stripped.trim()
      ? casesBlocks
      : [...casesBlocks, stripped];

    const clauses = [];
    for (let item of baseList) {
      item = expandDeterminants(unwrapDecorations(item));
      // Divideix per fletxes d'implicació o punt i coma o \quad amb equacions (fora d'entorns \begin...\end)
      const arrowSplit = splitTopLevelByArrowsAndSemicolons(item);
      for (const part of arrowSplit) {
        const cleanPart = part.replace(/^[,\s]+|[,\s]+$/g, '');
        if (!cleanPart) continue;
        const commaSplit = splitTopLevelEquationCommas(cleanPart);
        for (const c of commaSplit) {
          const trimmed = c.replace(/^[,\s]+|[,\s]+$/g, '');
          if (trimmed) clauses.push(trimmed);
        }
      }
    }
    return clauses;
  }

  function matchEnvDeltaAt(s, i) {
    if (s.startsWith('\\begin', i) && !/[a-zA-Z]/.test(s[i + 6] || '')) {
      const br = extractBraced(s, i + 6);
      if (br) return { delta: 1, end: br.end };
    } else if (s.startsWith('\\end', i) && !/[a-zA-Z]/.test(s[i + 4] || '')) {
      const br = extractBraced(s, i + 4);
      if (br) return { delta: -1, end: br.end };
    }
    return null;
  }

  function splitTopLevelByArrowsAndSemicolons(s) {
    const out = [];
    let cur = '';
    let brace = 0, paren = 0, bracket = 0, envDepth = 0;
    const arrowCmds = [
      '\\Longleftrightarrow', '\\Leftrightarrow', '\\Longrightarrow', '\\Rightarrow',
      '\\longrightarrow', '\\rightarrow', '\\mapsto', '\\to', '\\implies', '\\iff'
    ];
    for (let i = 0; i < s.length; i++) {
      const envHit = matchEnvDeltaAt(s, i);
      if (envHit) {
        envDepth = Math.max(0, envDepth + envHit.delta);
        cur += s.slice(i, envHit.end);
        i = envHit.end - 1;
        continue;
      }

      if (s[i] === '{') brace++;
      else if (s[i] === '}') brace = Math.max(0, brace - 1);
      else if (s[i] === '(') paren++;
      else if (s[i] === ')') paren = Math.max(0, paren - 1);
      else if (s[i] === '[') bracket++;
      else if (s[i] === ']') bracket = Math.max(0, bracket - 1);

      if (envDepth === 0 && brace === 0 && paren === 0 && bracket === 0) {
        if (s[i] === ';') {
          out.push(cur);
          cur = '';
          continue;
        }
        // \xrightarrow{...} en cadenes de límits equival a un pas '=' comentat!
        if (s.startsWith('\\xrightarrow', i)) {
          let j = i + '\\xrightarrow'.length;
          const opt = extractBracketed(s, j);
          if (opt) j = opt.end;
          const req = extractBraced(s, j);
          if (req) j = req.end;
          cur += ' = ';
          i = j - 1;
          continue;
        }
        let matchedArrow = null;
        for (const cmd of arrowCmds) {
          if (s.startsWith(cmd, i) && !/[a-zA-Z]/.test(s[i + cmd.length] || '')) {
            matchedArrow = cmd;
            break;
          }
        }
        if (matchedArrow) {
          out.push(cur);
          cur = '';
          i += matchedArrow.length - 1;
          continue;
        }
        // Tabulacions (\qquad, \quad) separen expressions o variables en una mateixa línia!
        for (const qcmd of ['\\qquad', '\\quad']) {
          if (s.startsWith(qcmd, i) && !/[a-zA-Z]/.test(s[i + qcmd.length] || '')) {
            const curTrim = cur.trim();
            if (curTrim && !/[=+\-*/]$/.test(curTrim)) {
              out.push(cur);
              cur = '';
              i += qcmd.length - 1;
              matchedArrow = qcmd;
              break;
            }
          }
        }
        if (matchedArrow) continue;

        // Espais matemàtics (\;, \:, \enspace) quan separen dues equacions en la mateixa línia (ex: "a = 3  b = 5")
        for (const scmd of ['\\enspace', '\\;', '\\:']) {
          if (s.startsWith(scmd, i) && !/[a-zA-Z]/.test(s[i + scmd.length] || '')) {
            const curTrim = cur.trim();
            const rest = s.slice(i + scmd.length).trim();
            if (
              curTrim.includes('=') &&
              !/[=+\-*/]$/.test(curTrim) &&
              !/\\(?:cdot|times|div)$/.test(curTrim) &&
              rest.includes('=') &&
              !rest.startsWith('=')
            ) {
              out.push(cur);
              cur = '';
              i += scmd.length - 1;
              matchedArrow = scmd;
              break;
            }
          }
        }
        if (matchedArrow) continue;
      }
      cur += s[i];
    }
    if (cur.trim()) out.push(cur);
    return out;
  }

  // Separa per comes de nivell 0 NOMÉS si després de la coma ve una altra declaració/equació (conté '=')
  // Així "a = 1,5, b = 2,5" es divideix en ["a = 1,5", "b = 2,5"] sense trencar la coma decimal!
  function splitTopLevelEquationCommas(s) {
    const commaPositions = [];
    let brace = 0, paren = 0, bracket = 0, envDepth = 0;
    for (let i = 0; i < s.length; i++) {
      const envHit = matchEnvDeltaAt(s, i);
      if (envHit) {
        envDepth = Math.max(0, envDepth + envHit.delta);
        i = envHit.end - 1;
        continue;
      }
      if (s[i] === '\\') { i++; continue; }
      if (s[i] === '{') brace++;
      else if (s[i] === '}') brace = Math.max(0, brace - 1);
      else if (s[i] === '(') paren++;
      else if (s[i] === ')') paren = Math.max(0, paren - 1);
      else if (s[i] === '[') bracket++;
      else if (s[i] === ']') bracket = Math.max(0, bracket - 1);
      else if (s[i] === ',' && envDepth === 0 && brace === 0 && paren === 0 && bracket === 0) {
        const prevChar = s[i - 1] || '';
        const nextChar = s[i + 1] || '';
        const isDecimalComma = /\d/.test(prevChar) && /\d/.test(nextChar);
        if (!isDecimalComma) {
          commaPositions.push(i);
        }
      }
    }
    if (commaPositions.length === 0) return [s];

    const result = [];
    let last = 0;
    for (const pos of commaPositions) {
      const left = s.slice(last, pos);
      const right = s.slice(pos + 1);
      if (left.includes('=') && right.includes('=')) {
        result.push(left);
        last = pos + 1;
      }
    }
    result.push(s.slice(last));
    return result;
  }

  // Divideix una clàusula per signes '=' de nivell superior (sense trencar \le, \ge, \neq, \approx ni \begin{cases}...)
  function splitTopLevelEquals(s) {
    const parts = [];
    let cur = '';
    let brace = 0, paren = 0, bracket = 0, envDepth = 0;
    for (let i = 0; i < s.length; i++) {
      const envHit = matchEnvDeltaAt(s, i);
      if (envHit) {
        envDepth = Math.max(0, envDepth + envHit.delta);
        cur += s.slice(i, envHit.end);
        i = envHit.end - 1;
        continue;
      }
      if (s[i] === '\\') {
        cur += s[i];
        if (i + 1 < s.length) {
          cur += s[i + 1];
          i++;
        }
        continue;
      }
      if (s[i] === '{') brace++;
      else if (s[i] === '}') brace = Math.max(0, brace - 1);
      else if (s[i] === '(') paren++;
      else if (s[i] === ')') paren = Math.max(0, paren - 1);
      else if (s[i] === '[') bracket++;
      else if (s[i] === ']') bracket = Math.max(0, bracket - 1);
      else if (s[i] === '=' && envDepth === 0 && brace === 0 && paren === 0 && bracket === 0) {
        const prev = s[i - 1] || '';
        const next = s[i + 1] || '';
        if (prev !== '<' && prev !== '>' && prev !== '!' && next !== '=') {
          parts.push(cur.trim());
          cur = '';
          continue;
        }
      }
      cur += s[i];
    }
    parts.push(cur.trim());
    return parts;
  }

  // Neteja anotacions de text lliure (\text{...}) fora de subíndexs.
  // REGLA CLAU: El text introduït amb " (\text{...}) MAI és una variable per si mateix (des del primer caràcter).
  // Només pot haver-hi \text{...} dins d'una variable quan es troba al seu propi subíndex (ex: v_{\text{màx}}).
  function stripProseAnnotations(s) {
    let out = '';
    let i = 0;
    // Pila de claus '{' obertes: true si la clau pertany a un subíndex '_{...}' (o està niada dins seu)
    const subBraceStack = [];

    while (i < s.length) {
      if (s[i] === '\\' && i + 1 < s.length && !/[a-zA-Z]/.test(s[i + 1])) {
        out += s.slice(i, i + 2);
        i += 2;
        continue;
      }

      if (s[i] === '{') {
        const prevNonSpace = out.trimEnd();
        const parentIsSub = subBraceStack.length > 0 && subBraceStack[subBraceStack.length - 1];
        const isDirectSub = prevNonSpace.endsWith('_') && !prevNonSpace.endsWith('\\_');
        subBraceStack.push(parentIsSub || isDirectSub);
        out += '{';
        i++;
        continue;
      }

      if (s[i] === '}') {
        if (subBraceStack.length > 0) subBraceStack.pop();
        out += '}';
        i++;
        continue;
      }

      let matchedTextCmd = null;
      for (const cmd of ['\\text', '\\textrm', '\\textit', '\\textbf', '\\textsf', '\\texttt', '\\textsl', '\\emph']) {
        if (s.startsWith(cmd, i) && !/[a-zA-Z]/.test(s[i + cmd.length] || '')) {
          matchedTextCmd = cmd;
          break;
        }
      }

      if (matchedTextCmd) {
        const prevNonSpace = out.trimEnd();
        const inSubscript =
          (prevNonSpace.endsWith('_') && !prevNonSpace.endsWith('\\_')) ||
          (subBraceStack.length > 0 && subBraceStack[subBraceStack.length - 1]);

        const br = extractBraced(s, i + matchedTextCmd.length);
        if (inSubscript && br) {
          // Conserva \text{...} únicament quan forma part del subíndex d'una variable!
          out += s.slice(i, br.end);
          i = br.end;
          continue;
        }

        // Conserva noms d'operadors matemàtics escrits amb \text{...}(...) com \text{rang}(A) o \text{proj}_{\vec{u}}(\vec{a})
        if (!inSubscript && br) {
          const innerTxt = br.content.trim();
          if (/^(rang|rank|tr|trace|det|inv|trans|angle|proj|mcd|gcd|mcm|lcm)$/i.test(innerTxt)) {
            let scanPos = br.end;
            while (scanPos < s.length && /\s/.test(s[scanPos])) scanPos++;
            if (s[scanPos] === '_') {
              scanPos++;
              while (scanPos < s.length && /\s/.test(s[scanPos])) scanPos++;
              const subBr = extractBraced(s, scanPos);
              if (subBr) {
                scanPos = subBr.end;
              } else {
                const mTok = s.slice(scanPos).match(/^(?:\\[a-zA-Z]+|[a-zA-Z0-9])/);
                if (mTok) scanPos += mTok[0].length;
              }
              while (scanPos < s.length && /\s/.test(s[scanPos])) scanPos++;
            }
            if (/^(?:\(|\\left\s*\()/.test(s.slice(scanPos))) {
              out += `\\operatorname{${innerTxt.toLowerCase()}}`;
              i = br.end;
              continue;
            }
          }
        }

        // Fora de subíndex: és text explicatiu o unitats -> mai es tracta com a variable
        out += ' ';
        i = br ? br.end : i + matchedTextCmd.length;
        continue;
      }

      out += s[i];
      i++;
    }
    return out.trim();
  }

  // Canonicalitza el nom d'una variable per usar-lo com a clau única
  function canonicalizeVarKey(latexName) {
    return latexName
      .replace(/\\text(?:rm|it|bf|sf|tt|sl)?\{([^}]*)\}/g, '$1')
      .replace(/\\mathrm\{([^}]*)\}/g, '$1')
      .replace(/\s+/g, '')
      .replace(/\{([^{}]+)\}/g, '$1');
  }

  // ============================================================================
  // 3. Tokenitzador i Parser AST d'expressions matemàtiques LaTeX
  // ============================================================================
  function readScriptsAt(s, startPos) {
    let k = startPos;
    let lower = null;
    let upper = null;
    const skipSpaceAndLimits = () => {
      while (k < s.length) {
        while (k < s.length && s[k] === ' ') k++;
        if (s.startsWith('\\limits', k) && !/[a-zA-Z]/.test(s[k + 7] || '')) { k += 7; continue; }
        if (s.startsWith('\\nolimits', k) && !/[a-zA-Z]/.test(s[k + 9] || '')) { k += 9; continue; }
        break;
      }
    };
    const readAtom = () => {
      while (k < s.length && s[k] === ' ') k++;
      const br = extractBraced(s, k);
      if (br) { k = br.end; return br.content; }
      if (s[k] === '\\') {
        let j = k + 1;
        while (j < s.length && /[a-zA-Z]/.test(s[j])) j++;
        if (j === k + 1 && j < s.length) j++;
        const tok = s.slice(k, j);
        k = j;
        return tok;
      }
      if (k < s.length) {
        const ch = s[k];
        k++;
        return ch;
      }
      return null;
    };
    for (let pass = 0; pass < 2; pass++) {
      skipSpaceAndLimits();
      if (s[k] === '_') {
        k++;
        lower = readAtom();
      } else if (s[k] === '^') {
        k++;
        upper = readAtom();
      } else {
        break;
      }
    }
    return { lower, upper, end: k };
  }

  function findMatchingRightPos(s, startPos) {
    let depth = 1;
    for (let i = startPos; i < s.length; i++) {
      if (s[i] === '\\') {
        if (s.startsWith('\\left', i) && !/[a-zA-Z]/.test(s[i + 5] || '')) {
          depth++;
          i += 4;
          continue;
        }
        if (s.startsWith('\\right', i) && !/[a-zA-Z]/.test(s[i + 6] || '')) {
          depth--;
          if (depth === 0) return i;
          i += 5;
          continue;
        }
        i++;
      }
    }
    return -1;
  }

  function findMatchingBracketPos(s, openBracketPos) {
    let bDepth = 0, braceDepth = 0;
    for (let i = openBracketPos; i < s.length; i++) {
      if (s[i] === '\\') { i++; continue; }
      if (s[i] === '{') braceDepth++;
      else if (s[i] === '}') braceDepth = Math.max(0, braceDepth - 1);
      else if (braceDepth === 0) {
        if (s[i] === '[') bDepth++;
        else if (s[i] === ']') {
          bDepth--;
          if (bDepth === 0) return i;
        }
      }
    }
    return -1;
  }

  function extractBalancedEnvBody(s, startAfterBeginBr, envName) {
    let depth = 1;
    const openPrefix = `\\begin{${envName}}`;
    const closePrefix = `\\end{${envName}}`;
    for (let i = startAfterBeginBr; i < s.length; i++) {
      if (s.startsWith(openPrefix, i)) {
        depth++;
        i += openPrefix.length - 1;
      } else if (s.startsWith(closePrefix, i)) {
        depth--;
        if (depth === 0) {
          return { body: s.slice(startAfterBeginBr, i), end: i + closePrefix.length };
        }
        i += closePrefix.length - 1;
      }
    }
    return null;
  }

  function splitMatrixCells(body) {
    const rows = [];
    let curRow = [];
    let curCell = '';
    let brace = 0, paren = 0, bracket = 0, envDepth = 0;
    for (let i = 0; i < body.length; i++) {
      const envHit = matchEnvDeltaAt(body, i);
      if (envHit) {
        envDepth = Math.max(0, envDepth + envHit.delta);
        curCell += body.slice(i, envHit.end);
        i = envHit.end - 1;
        continue;
      }
      if (body[i] === '\\' && body[i + 1] === '\\' && envDepth === 0 && brace === 0 && paren === 0 && bracket === 0) {
        curRow.push(curCell.trim());
        if (curRow.some(c => c.length > 0)) rows.push(curRow);
        curRow = [];
        curCell = '';
        i++;
        continue;
      }
      if (body[i] === '\\') {
        curCell += body[i];
        if (i + 1 < body.length) { curCell += body[i + 1]; i++; }
        continue;
      }
      if (body[i] === '{') brace++;
      else if (body[i] === '}') brace = Math.max(0, brace - 1);
      else if (body[i] === '(') paren++;
      else if (body[i] === ')') paren = Math.max(0, paren - 1);
      else if (body[i] === '[') bracket++;
      else if (body[i] === ']') bracket = Math.max(0, bracket - 1);
      else if (body[i] === '&' && envDepth === 0 && brace === 0 && paren === 0 && bracket === 0) {
        curRow.push(curCell.trim());
        curCell = '';
        continue;
      }
      curCell += body[i];
    }
    curRow.push(curCell.trim());
    if (curRow.some(c => c.length > 0)) rows.push(curRow);
    return rows;
  }

  function parseDerivativeFracSpec(numRaw, denRaw) {
    const numStr = (numRaw || '').replace(/\\(?:displaystyle|textstyle|scriptstyle|scriptscriptstyle)\b/g, '').trim();
    const denStr = (denRaw || '').replace(/\\(?:displaystyle|textstyle|scriptstyle|scriptscriptstyle)\b/g, '').trim();
    const isPartial = numStr.includes('\\partial') && denStr.includes('\\partial');
    const isOrdDiff = !isPartial &&
      /^\s*d(?:\s*\^\s*\{?\s*[12]\s*\}?)?(?:\s*$|(?:\s*(?:\\?[a-zA-Z(])))/.test(numStr) &&
      /^\s*d\s*(?:\\?[a-zA-Z])/.test(denStr);
    if (!isPartial && !isOrdDiff) return null;

    const opSym = isPartial ? '\\partial' : 'd';
    const escOp = isPartial ? '\\\\partial' : 'd';
    const numMatch = numStr.match(new RegExp(`^${escOp}(?:\\s*\\^\\s*(?:\\{\\s*([12])\\s*\\}|([12])))?([\\s\\S]*)$`));
    if (!numMatch) return null;
    const order = numMatch[1] || numMatch[2] ? parseInt(numMatch[1] || numMatch[2], 10) : 1;
    const restNum = (numMatch[3] || '').trim();

    // Comprova que restNum no sigui un terme multiplicat o sumat (ex: d \cdot x)
    if (restNum && /^[+\-*/=0-9.]/.test(restNum)) return null;
    if (!isPartial && restNum.startsWith('\\cdot')) return null;

    // Extreu les variables del denominador
    const denVars = [];
    if (isPartial) {
      const denParts = denStr.split(/\\partial(?![a-zA-Z])/).map(p => p.trim()).filter(Boolean);
      if (denParts.length === 0) return null;
      for (const part of denParts) {
        const m = part.match(/^([a-zA-Z](?:_(?:\{[^{}]+\}|[a-zA-Z0-9]))?|\\(?:[a-zA-Z]+)(?:_(?:\{[^{}]+\}|[a-zA-Z0-9]))?)\s*(?:\^\s*(?:\{\s*2\s*\}|2))?$/);
        if (!m) return null;
        const vKey = canonicalizeVarKey(m[1]);
        const hasSq = /\^\s*(?:\{\s*2\s*\}|2)\s*$/.test(part);
        denVars.push(vKey);
        if (hasSq) denVars.push(vKey);
      }
    } else {
      // Denominador ordinari: dx, d x, dx^2, d\theta
      const dm = denStr.match(/^d\s*([a-zA-Z](?:_(?:\{[^{}]+\}|[a-zA-Z0-9]))?|\\(?:[a-zA-Z]+)(?:_(?:\{[^{}]+\}|[a-zA-Z0-9]))?)\s*(?:\^\s*(?:\{\s*2\s*\}|2))?$/);
      if (!dm) return null;
      const vKey = canonicalizeVarKey(dm[1]);
      if (/^_[a-zA-Z0-9]/.test(denStr.slice(1).trim())) return null; // d_0 no és dx
      denVars.push(vKey);
      if (/\^\s*(?:\{\s*2\s*\}|2)\s*$/.test(denStr)) denVars.push(vKey);
    }

    if (denVars.length === 0 || denVars.length > 2) return null;

    let targetLatex = null;
    let targetKey = null;
    let inlineExprLatex = null;
    if (restNum) {
      if (restNum.startsWith('(') || restNum.startsWith('[') || restNum.startsWith('\\left')) {
        inlineExprLatex = restNum;
      } else {
        try {
          const toks = tokenizeLatex(restNum);
          if (toks.length === 1 && toks[0].type === 'IDENT') {
            targetLatex = toks[0].latex;
            targetKey = toks[0].key;
          } else {
            return null;
          }
        } catch (_e) {
          return null;
        }
      }
    }

    return {
      isPartial,
      order: Math.max(order, denVars.length),
      vars: denVars,
      targetKey,
      targetLatex,
      inlineExprLatex
    };
  }

  function tokenizeLatex(input) {
    const rawStr = String(input || '');
    if (rawStr.length > 8000) {
      throw new Error('Expression exceeds max safe length');
    }
    let s = stripProseAnnotations(unwrapDecorations(rawStr));
    // Normalitza wrappers de mida simples excepte \left i \right (que gestionem de forma balancejada per barres d'avaluació!)
    s = s
      .replace(/\\[Bb]ig{1,2}[lr]?\s*/g, '')
      .replace(/\\left\s*\\Vert|\\left\s*\\\|/g, '\\normopen ')
      .replace(/\\right\s*\\Vert|\\right\s*\\\|/g, '\\normclose ')
      .replace(/\\left\s*\\\{/g, '(')
      .replace(/\\right\s*\\\}/g, ')');

    const tokens = [];
    let i = 0;

    const readSubscriptSuffix = (pos) => {
      let j = pos;
      while (j < s.length && s[j] === ' ') j++;
      if (s[j] !== '_') return null;
      j++;
      while (j < s.length && s[j] === ' ') j++;
      if (s[j] === '{') {
        const br = extractBraced(s, j);
        if (br) {
          const subClean = br.content.trim();
          if (!subClean || /^\\text(?:rm|it|bf|sf|tt|sl)?\{\s*\}$/.test(subClean)) {
            return { latexSub: '', end: br.end };
          }
          return { latexSub: `_{${subClean}}`, end: br.end };
        }
      } else if (s[j] === '\\') {
        let k = j + 1;
        while (k < s.length && /[a-zA-Z]/.test(s[k])) k++;
        const cmd = s.slice(j + 1, k);
        if (cmd === 'text' || cmd === 'textrm' || cmd === 'textit' || cmd === 'textbf' || cmd === 'mathrm') {
          const br = extractBraced(s, k);
          if (br) {
            const innerSub = br.content.trim();
            if (!innerSub) return { latexSub: '', end: br.end };
            return { latexSub: `_{\\text{${innerSub}}}`, end: br.end };
          }
        }
        return { latexSub: `_{\\${cmd}}`, end: k };
      } else if (j < s.length && /[a-zA-Z0-9À-ÿ]/.test(s[j])) {
        return { latexSub: `_${s[j]}`, end: j + 1 };
      }
      return null;
    };

    while (i < s.length) {
      const ch = s[i];

      if (/\s/.test(ch)) {
        i++;
        continue;
      }

      // Nombres (suporta punt decimal i coma decimal catalana: 3.14 o 3,14)
      if (/\d/.test(ch) || (ch === '.' && /\d/.test(s[i + 1] || ''))) {
        let numStr = '';
        while (i < s.length && /\d/.test(s[i])) {
          numStr += s[i++];
        }
        if (i < s.length && (s[i] === '.' || (s[i] === ',' && /\d/.test(s[i + 1] || '')))) {
          numStr += '.';
          i++;
          while (i < s.length && /\d/.test(s[i])) {
            numStr += s[i++];
          }
        }
        tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
        continue;
      }

      // Operadors i delimitadors simples
      if (ch === '+') { tokens.push({ type: 'OP', value: '+' }); i++; continue; }
      if (ch === '-' || ch === '−' || ch === '–') { tokens.push({ type: 'OP', value: '-' }); i++; continue; }
      if (ch === '*') { tokens.push({ type: 'OP', value: '*', opKind: 'mul' }); i++; continue; }
      if (ch === '/') { tokens.push({ type: 'OP', value: '/' }); i++; continue; }
      if (ch === '^') { tokens.push({ type: 'OP', value: '^' }); i++; continue; }
      if (ch === '!') { tokens.push({ type: 'FACTORIAL' }); i++; continue; }
      if (ch === '%') { tokens.push({ type: 'PERCENT' }); i++; continue; }
      if (ch === '\'') {
        let count = 0;
        while (s[i] === '\'') { count++; i++; }
        tokens.push({ type: 'PRIME', count });
        continue;
      }
      if (ch === '[') {
        const closePos = findMatchingBracketPos(s, i);
        if (closePos !== -1) {
          const scripts = readScriptsAt(s, closePos + 1);
          if (scripts.lower !== null && scripts.upper !== null) {
            tokens.push({
              type: 'EVAL_BAR',
              expr: s.slice(i + 1, closePos),
              lower: scripts.lower,
              upper: scripts.upper
            });
            i = scripts.end;
            continue;
          }
        }
        tokens.push({ type: 'LPAREN', char: '[' });
        i++;
        continue;
      }
      if (ch === '(') { tokens.push({ type: 'LPAREN', char: ch }); i++; continue; }
      if (ch === ')' || ch === ']') { tokens.push({ type: 'RPAREN', char: ch }); i++; continue; }
      if (ch === '{') { tokens.push({ type: 'LBRACE' }); i++; continue; }
      if (ch === '}') { tokens.push({ type: 'RBRACE' }); i++; continue; }
      if (ch === ',' || ch === ';') { tokens.push({ type: 'COMMA' }); i++; continue; }
      if (ch === '|') {
        let after = i + 1;
        while (after < s.length && s[after] === ' ') after++;
        if (s[after] === '_') {
          const scripts = readScriptsAt(s, after);
          tokens.push({ type: 'PIPE', lower: scripts.lower, upper: scripts.upper });
          i = scripts.end;
        } else {
          tokens.push({ type: 'PIPE' });
          i++;
        }
        continue;
      }
      if (ch === '°') { tokens.push({ type: 'DEGREE' }); i++; continue; }

      // Comandes LaTeX
      if (ch === '\\') {
        if (i + 1 < s.length && !/[a-zA-Z]/.test(s[i + 1])) {
          const sym = s[i + 1];
          i += 2;
          if (!IGNORED_COMMANDS.has(sym)) {
            if (sym === '{') tokens.push({ type: 'LPAREN', char: '{' });
            else if (sym === '}') tokens.push({ type: 'RPAREN', char: '}' });
          }
          continue;
        }
        let j = i + 1;
        while (j < s.length && /[a-zA-Z]/.test(s[j])) j++;
        const cmd = s.slice(i + 1, j);
        i = j;

        if (IGNORED_COMMANDS.has(cmd)) continue;

        if (cmd === 'absopen') { tokens.push({ type: 'ABS_OPEN' }); continue; }
        if (cmd === 'absclose') { tokens.push({ type: 'ABS_CLOSE' }); continue; }
        if (cmd === 'normopen') { tokens.push({ type: 'NORM_OPEN' }); continue; }
        if (cmd === 'normclose') { tokens.push({ type: 'NORM_CLOSE' }); continue; }
        if (cmd === 'Vert') { tokens.push({ type: 'NORM_PIPE' }); continue; }

        if (cmd === 'left') {
          while (i < s.length && s[i] === ' ') i++;
          if (s[i] === '.') {
            const rightIdx = findMatchingRightPos(s, i + 1);
            if (rightIdx !== -1) {
              let k = rightIdx + '\\right'.length;
              while (k < s.length && s[k] === ' ') k++;
              if (s[k] === '|' || s.startsWith('\\rvert', k) || s.startsWith('\\vert', k)) {
                const delimLen = s[k] === '|' ? 1 : (s.startsWith('\\rvert', k) ? 6 : 5);
                const scripts = readScriptsAt(s, k + delimLen);
                if (scripts.lower !== null) {
                  tokens.push({
                    type: 'EVAL_BAR',
                    expr: s.slice(i + 1, rightIdx),
                    lower: scripts.lower,
                    upper: scripts.upper
                  });
                  i = scripts.end;
                  continue;
                }
              }
            }
            i++;
            continue;
          }
          if (s[i] === '[') {
            const rightIdx = findMatchingRightPos(s, i + 1);
            if (rightIdx !== -1) {
              let k = rightIdx + '\\right'.length;
              while (k < s.length && s[k] === ' ') k++;
              if (s[k] === ']') {
                const scripts = readScriptsAt(s, k + 1);
                if (scripts.lower !== null && scripts.upper !== null) {
                  tokens.push({
                    type: 'EVAL_BAR',
                    expr: s.slice(i + 1, rightIdx),
                    lower: scripts.lower,
                    upper: scripts.upper
                  });
                  i = scripts.end;
                  continue;
                }
              }
            }
            tokens.push({ type: 'LPAREN', char: '[' });
            i++;
            continue;
          }
          if (s[i] === '|') { tokens.push({ type: 'ABS_OPEN' }); i++; continue; }
          if (s.startsWith('\\lvert', i)) { tokens.push({ type: 'ABS_OPEN' }); i += 6; continue; }
          if (s.startsWith('\\{', i)) { tokens.push({ type: 'LPAREN', char: '{' }); i += 2; continue; }
          if (s.startsWith('\\lbrace', i)) { tokens.push({ type: 'LPAREN', char: '{' }); i += 7; continue; }
          continue;
        }

        if (cmd === 'right') {
          while (i < s.length && s[i] === ' ') i++;
          if (s[i] === '.') { i++; continue; }
          if (s[i] === '|') {
            let after = i + 1;
            while (after < s.length && s[after] === ' ') after++;
            if (s[after] === '_') {
              const scripts = readScriptsAt(s, after);
              tokens.push({ type: 'PIPE', lower: scripts.lower, upper: scripts.upper });
              i = scripts.end;
            } else {
              tokens.push({ type: 'PIPE' });
              i++;
            }
            continue;
          }
          if (s.startsWith('\\rvert', i)) { tokens.push({ type: 'ABS_CLOSE' }); i += 6; continue; }
          if (s.startsWith('\\}', i)) { tokens.push({ type: 'RPAREN', char: '}' }); i += 2; continue; }
          if (s.startsWith('\\rbrace', i)) { tokens.push({ type: 'RPAREN', char: '}' }); i += 7; continue; }
          continue;
        }

        if (cmd === 'begin') {
          const envBr = extractBraced(s, i);
          if (envBr) {
            const envName = envBr.content.trim();
            if (['pmatrix', 'bmatrix', 'Bmatrix', 'matrix', 'vmatrix', 'Vmatrix'].includes(envName)) {
              const extracted = extractBalancedEnvBody(s, envBr.end, envName);
              if (extracted) {
                i = extracted.end;
                const rows = splitMatrixCells(extracted.body);
                if (rows.length > 0) {
                  tokens.push({
                    type: (envName === 'vmatrix' || envName === 'Vmatrix') ? 'DET_MATRIX' : 'MATRIX',
                    rows
                  });
                  continue;
                }
              }
            }
          }
          throw new Error('Unsupported environment');
        }

        if (cmd === 'cdot' || cmd === 'ast') {
          tokens.push({ type: 'OP', value: '*', opKind: 'cdot' });
          continue;
        }
        if (cmd === 'times' || cmd === 'wedge') {
          tokens.push({ type: 'OP', value: '*', opKind: 'times' });
          continue;
        }
        if (cmd === 'div' || cmd === 'colon') {
          tokens.push({ type: 'OP', value: '/' });
          continue;
        }
        if (cmd === 'pm' || cmd === 'mp') {
          tokens.push({ type: 'PM', value: cmd });
          continue;
        }
        if (cmd === 'circ') {
          tokens.push({ type: 'DEGREE' });
          continue;
        }
        if (cmd === 'pi') {
          tokens.push({ type: 'CONST', name: 'pi', value: Math.PI });
          continue;
        }
        if (cmd === 'infty') {
          tokens.push({ type: 'CONST', name: 'infty', value: Infinity });
          continue;
        }
        if (cmd === 'nabla') {
          tokens.push({ type: 'NABLA' });
          continue;
        }

        // \operatornamevar{TVM} generat des de \text{TVM}
        if (cmd === 'operatornamevar') {
          const br = extractBraced(s, i);
          if (br) {
            i = br.end;
            const sub = readSubscriptSuffix(i);
            let latexName = `\\text{${br.content}}`;
            if (sub) {
              latexName += sub.latexSub;
              i = sub.end;
            }
            tokens.push({
              type: 'IDENT',
              latex: latexName,
              key: canonicalizeVarKey(latexName)
            });
            continue;
          }
        }

        if (cmd === 'operatorname' || cmd === 'mathrm') {
          const br = extractBraced(s, i);
          if (br) {
            i = br.end;
            const opName = br.content.trim();
            if (BUILTIN_FUNCS.has(opName)) {
              let base = null;
              if (opName === 'log' || opName === 'proj') {
                let k = i;
                while (k < s.length && s[k] === ' ') k++;
                if (s[k] === '_') {
                  k++;
                  while (k < s.length && s[k] === ' ') k++;
                  const subBr = extractBraced(s, k);
                  if (subBr) { base = subBr.content; i = subBr.end; }
                  else if (k < s.length && /[a-zA-Z0-9]/.test(s[k])) { base = s[k]; i = k + 1; }
                }
              }
              tokens.push({ type: 'FUNC', name: opName, base });
            } else if (opName === 'sen') {
              tokens.push({ type: 'FUNC', name: 'sin' });
            } else if (opName === 'traça') {
              tokens.push({ type: 'FUNC', name: 'tr' });
            } else {
              const sub = readSubscriptSuffix(i);
              let latexName = `\\mathrm{${opName}}`;
              if (sub) { latexName += sub.latexSub; i = sub.end; }
              tokens.push({
                type: 'IDENT',
                latex: latexName,
                key: canonicalizeVarKey(latexName)
              });
            }
            continue;
          }
        }

        // Fraccions o Operadors de Derivada Ordinària/Parcial (\frac{\partial f}{\partial x}, \frac{d}{dx})
        if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac') {
          const numBr = extractBraced(s, i);
          if (numBr) {
            const denBr = extractBraced(s, numBr.end);
            if (denBr) {
              i = denBr.end;
              const derivSpec = parseDerivativeFracSpec(numBr.content, denBr.content);
              if (derivSpec) {
                tokens.push({ type: 'DERIV_OP', ...derivSpec });
              } else {
                tokens.push({ type: 'FRAC', num: numBr.content, den: denBr.content });
              }
              continue;
            }
          }
          throw new Error('Incomplete frac');
        }

        // Coeficient binomial \binom{n}{k}
        if (cmd === 'binom' || cmd === 'dbinom' || cmd === 'tbinom') {
          const nBr = extractBraced(s, i);
          if (nBr) {
            const kBr = extractBraced(s, nBr.end);
            if (kBr) {
              i = kBr.end;
              tokens.push({ type: 'BINOM', n: nBr.content, k: kBr.content });
              continue;
            }
          }
          throw new Error('Incomplete binom');
        }

        // Arrels \sqrt{x} i \sqrt[n]{x}
        if (cmd === 'sqrt') {
          const degBr = extractBracketed(s, i);
          if (degBr) {
            const radBr = extractBraced(s, degBr.end);
            if (radBr) {
              i = radBr.end;
              tokens.push({ type: 'SQRT', degree: degBr.content, radicand: radBr.content });
              continue;
            }
          } else {
            const radBr = extractBraced(s, i);
            if (radBr) {
              i = radBr.end;
              tokens.push({ type: 'SQRT', degree: null, radicand: radBr.content });
              continue;
            }
          }
          throw new Error('Incomplete sqrt');
        }

        // Vectors \vec{v} o \overrightarrow{AB} -> tractats com a variables pròpies
        if (cmd === 'vec' || cmd === 'overrightarrow') {
          const br = extractBraced(s, i);
          if (br && br.content.trim()) {
            i = br.end;
            let latexName = `\\${cmd}{${br.content.trim()}}`;
            const sub = readSubscriptSuffix(i);
            if (sub) { latexName += sub.latexSub; i = sub.end; }
            tokens.push({
              type: 'IDENT',
              latex: latexName,
              key: canonicalizeVarKey(latexName)
            });
            continue;
          }
        }

        // Límits \lim_{x \to a} expr
        if (cmd === 'lim') {
          const scripts = readScriptsAt(s, i);
          if (scripts.lower !== null) {
            i = scripts.end;
            tokens.push({ type: 'LIM', sub: scripts.lower });
            continue;
          }
          tokens.push({ type: 'LIM', sub: '' });
          continue;
        }

        // Integrals \int_{a}^{b} ... dx (amb límits amb claus o sense claus!)
        if (cmd === 'int') {
          const scripts = readScriptsAt(s, i);
          i = scripts.end;
          tokens.push({ type: 'INT', lower: scripts.lower, upper: scripts.upper });
          continue;
        }

        // Sumatoris i productorics \sum_{i=0}^2, \sum_{i=1}^{n}, \prod_{i=1}^{n}
        if (cmd === 'sum' || cmd === 'prod') {
          const scripts = readScriptsAt(s, i);
          i = scripts.end;
          tokens.push({ type: 'SUMPROD', kind: cmd, lower: scripts.lower, upper: scripts.upper });
          continue;
        }

        // Funcions trigonomètriques / logarítmiques / matricials (incloent \log_{b}, \det, etc.)
        if (BUILTIN_FUNCS.has(cmd) || cmd === 'sen' || cmd === 'tg' || cmd === 'arcsen' || cmd === 'arctg') {
          const normMap = { sen: 'sin', tg: 'tan', arcsen: 'asin', arctg: 'atan' };
          const fnName = normMap[cmd] || cmd;
          let base = null;
          if (fnName === 'log') {
            let k = i;
            while (k < s.length && s[k] === ' ') k++;
            if (s[k] === '_') {
              k++;
              const br = extractBraced(s, k);
              if (br) { base = br.content; i = br.end; }
              else if (k < s.length && /[a-zA-Z0-9]/.test(s[k])) { base = s[k]; i = k + 1; }
            }
          }
          tokens.push({ type: 'FUNC', name: fnName, base });
          continue;
        }

        // \Delta x com a variable composta si va seguida d'una lletra (molt típic en física/càlcul!)
        if (cmd === 'Delta') {
          let k = i;
          while (k < s.length && s[k] === ' ') k++;
          if (k < s.length && /[a-zA-Z]/.test(s[k])) {
            const letter = s[k];
            i = k + 1;
            const sub = readSubscriptSuffix(i);
            let latexName = `\\Delta ${letter}`;
            if (sub) { latexName += sub.latexSub; i = sub.end; }
            tokens.push({
              type: 'IDENT',
              latex: latexName,
              key: canonicalizeVarKey(latexName)
            });
            continue;
          }
        }

        // Lletres gregues com a variables (\alpha, \beta, \theta, \lambda, \Gamma, \Phi...)
        if (GREEK_LETTERS.has(cmd)) {
          const sub = readSubscriptSuffix(i);
          let latexName = `\\${cmd}`;
          if (sub) { latexName += sub.latexSub; i = sub.end; }
          tokens.push({
            type: 'IDENT',
            latex: latexName,
            key: canonicalizeVarKey(latexName)
          });
          continue;
        }

        // Qualsevol altra comanda no reconeguda (ex: \in, \subset, \mathbb{R}) -> no avaluable numèricament
        throw new Error(`Unsupported command: \\${cmd}`);
      }

      // Lletres llatines (1 lletra + subíndex opcional, ex: x, y_{\text{màx}}, v_0, P_B)
      if (/[a-zA-Z]/.test(ch)) {
        const letter = ch;
        i++;
        const sub = readSubscriptSuffix(i);
        let latexName = letter;
        if (sub) {
          latexName += sub.latexSub;
          i = sub.end;
        }
        tokens.push({
          type: 'IDENT',
          latex: latexName,
          key: canonicalizeVarKey(latexName)
        });
        continue;
      }

      // Caràcter desconegut (ex: desigualtats pures sense equació)
      throw new Error(`Unsupported char: ${ch}`);
    }

    return resolvePipeDelimiters(tokens);
  }

  // Converteix parelles de '|' i '\Vert' en ABS_OPEN/ABS_CLOSE, NORM_OPEN/NORM_CLOSE o EVAL_SUFFIX tenint en compte la profunditat de parèntesis
  function resolvePipeDelimiters(tokens) {
    const out = [];
    const openStack = []; // { depth, kind: 'abs' | 'norm' }
    let parenDepth = 0;

    for (let idx = 0; idx < tokens.length; idx++) {
      const tok = tokens[idx];
      if (tok.type === 'LPAREN' || tok.type === 'LBRACE' || tok.type === 'ABS_OPEN' || tok.type === 'NORM_OPEN') {
        parenDepth++;
        out.push(tok);
      } else if (tok.type === 'RPAREN' || tok.type === 'RBRACE' || tok.type === 'ABS_CLOSE' || tok.type === 'NORM_CLOSE') {
        parenDepth = Math.max(0, parenDepth - 1);
        out.push(tok);
      } else if (tok.type === 'PIPE') {
        const prev = out[out.length - 1];
        const hasOpenAbsAtDepth = openStack.length > 0 && openStack[openStack.length - 1].depth === parenDepth && openStack[openStack.length - 1].kind === 'abs';
        const canClose = hasOpenAbsAtDepth &&
          prev && prev.type !== 'OP' && prev.type !== 'LPAREN' && prev.type !== 'LBRACE' && prev.type !== 'COMMA' && prev.type !== 'ABS_OPEN' && prev.type !== 'NORM_OPEN';
        if (canClose) {
          openStack.pop();
          out.push({ type: 'ABS_CLOSE' });
        } else if (tok.lower !== undefined && tok.lower !== null) {
          // Barra vertical amb subíndex (x^2 |_{x=3}) sense '|' obert previ -> sufix d'avaluació!
          out.push({ type: 'EVAL_SUFFIX', lower: tok.lower, upper: tok.upper || null });
        } else {
          openStack.push({ depth: parenDepth, kind: 'abs' });
          out.push({ type: 'ABS_OPEN' });
        }
      } else if (tok.type === 'NORM_PIPE') {
        const prev = out[out.length - 1];
        const hasOpenNormAtDepth = openStack.length > 0 && openStack[openStack.length - 1].depth === parenDepth && openStack[openStack.length - 1].kind === 'norm';
        const canClose = hasOpenNormAtDepth &&
          prev && prev.type !== 'OP' && prev.type !== 'LPAREN' && prev.type !== 'LBRACE' && prev.type !== 'COMMA' && prev.type !== 'NORM_OPEN';
        if (canClose) {
          openStack.pop();
          out.push({ type: 'NORM_CLOSE' });
        } else {
          openStack.push({ depth: parenDepth, kind: 'norm' });
          out.push({ type: 'NORM_OPEN' });
        }
      } else {
        out.push(tok);
      }
    }
    return out;
  }

  // Parser recursiu descendent amb multiplicació implícita (2x, 3\pi, (x+1)(x-1), 2\sin x, etc.)
  function parseLatexExpr(latexStr, knownFuncs = null) {
    const tokens = tokenizeLatex(latexStr);
    if (tokens.length === 0 || tokens.length > 2500) throw new Error('Invalid token length');
    let pos = 0;
    let parseDepth = 0;

    function peek() { return tokens[pos] || null; }
    function consume() { return tokens[pos++]; }

    function buildEvalBarNode(exprAst, lowerStr, upperStr) {
      const assignments = [];
      let lowerAst = null;
      let upperAst = null;
      let tupleAsts = null;
      const lowClean = (lowerStr || '').trim();
      if (lowClean) {
        if (!upperStr && lowClean.includes('=')) {
          const parts = splitTopLevelEquationCommas(lowClean);
          for (const p of parts) {
            const eq = splitTopLevelEquals(p);
            if (eq.length === 2 && eq[0].trim() && eq[1].trim()) {
              const varToks = tokenizeLatex(eq[0].trim());
              if (varToks.length === 1 && varToks[0].type === 'IDENT') {
                assignments.push({
                  key: varToks[0].key,
                  latex: varToks[0].latex,
                  valAst: parseLatexExpr(eq[1].trim(), knownFuncs)
                });
              }
            }
          }
        } else {
          if (lowClean.includes('=')) {
            const eq = splitTopLevelEquals(lowClean);
            if (eq.length === 2 && eq[0].trim() && eq[1].trim()) {
              const varToks = tokenizeLatex(eq[0].trim());
              if (varToks.length === 1 && varToks[0].type === 'IDENT') {
                assignments.push({
                  key: varToks[0].key,
                  latex: varToks[0].latex,
                  valAst: parseLatexExpr(eq[1].trim(), knownFuncs)
                });
              }
              lowerAst = parseLatexExpr(eq[1].trim(), knownFuncs);
            }
          } else {
            const parsedLow = parseLatexExpr(lowClean, knownFuncs);
            if (parsedLow.type === 'Vector' && !upperStr) {
              tupleAsts = parsedLow.items;
            } else {
              lowerAst = parsedLow;
            }
          }
        }
      }
      if (upperStr && upperStr.trim()) {
        const upClean = upperStr.trim();
        const eq = upClean.includes('=') ? splitTopLevelEquals(upClean) : null;
        upperAst = parseLatexExpr(eq && eq.length === 2 ? eq[1].trim() : upClean, knownFuncs);
      }
      return {
        type: 'EvalBar',
        exprAst,
        assignments,
        lowerAst,
        upperAst,
        tupleAsts
      };
    }

    function parseExpression() {
      parseDepth++;
      if (parseDepth > 80) throw new Error('Max expression nesting depth exceeded');
      try {
        let node = parseAddSub();
        while (peek() && peek().type === 'EVAL_SUFFIX') {
          const suf = consume();
          node = buildEvalBarNode(node, suf.lower, suf.upper);
        }
        return node;
      } finally {
        parseDepth--;
      }
    }

    function parseAddSub() {
      let left = parseMulDiv();
      while (peek() && (peek().type === 'OP' && (peek().value === '+' || peek().value === '-') || peek().type === 'PM')) {
        const opTok = consume();
        const right = parseMulDiv();
        if (opTok.type === 'PM') {
          left = { type: 'BinaryPm', op: opTok.value, left, right };
        } else {
          left = { type: 'Binary', op: opTok.value, left, right };
        }
      }
      return left;
    }

    function canStartImplicitMul(tok) {
      if (!tok) return false;
      return (
        tok.type === 'IDENT' ||
        tok.type === 'CONST' ||
        tok.type === 'NUMBER' ||
        tok.type === 'FRAC' ||
        tok.type === 'SQRT' ||
        tok.type === 'BINOM' ||
        tok.type === 'FUNC' ||
        tok.type === 'LIM' ||
        tok.type === 'INT' ||
        tok.type === 'SUMPROD' ||
        tok.type === 'DERIV_OP' ||
        tok.type === 'NABLA' ||
        tok.type === 'MATRIX' ||
        tok.type === 'DET_MATRIX' ||
        tok.type === 'EVAL_BAR' ||
        tok.type === 'LPAREN' ||
        tok.type === 'ABS_OPEN' ||
        tok.type === 'NORM_OPEN'
      );
    }

    function parseMulDiv() {
      let left = parseUnary();
      while (true) {
        const next = peek();
        if (!next) break;
        if (next.type === 'OP' && (next.value === '*' || next.value === '/')) {
          const opTok = consume();
          const right = parseUnary();
          left = { type: 'Binary', op: opTok.value, opKind: opTok.opKind || 'mul', left, right };
        } else if (canStartImplicitMul(next)) {
          // Multiplicació implícita (ex: 3x, 2(x+1), x y, A B)
          const right = parseUnary();
          left = { type: 'Binary', op: '*', opKind: 'mul', left, right };
        } else {
          break;
        }
      }
      return left;
    }

    function parseUnary() {
      const next = peek();
      if (next && next.type === 'OP' && (next.value === '+' || next.value === '-')) {
        const op = consume().value;
        const arg = parseUnary();
        return op === '-' ? { type: 'Unary', op: '-', arg } : arg;
      }
      if (next && next.type === 'PM') {
        const op = consume().value;
        const arg = parseUnary();
        return { type: 'UnaryPm', op, arg };
      }
      return parsePower();
    }

    function parsePower() {
      let base = parsePostfix();
      if (peek() && peek().type === 'OP' && peek().value === '^') {
        consume();
        if (peek() && peek().type === 'DEGREE') {
          consume();
          base = { type: 'Degree', arg: base };
        } else if (
          peek() && peek().type === 'LBRACE' &&
          tokens[pos + 1] && tokens[pos + 1].type === 'DEGREE' &&
          tokens[pos + 2] && tokens[pos + 2].type === 'RBRACE'
        ) {
          consume(); // '{'
          consume(); // DEGREE
          consume(); // '}'
          base = { type: 'Degree', arg: base };
        } else {
          const exp = parseUnary();
          base = { type: 'Binary', op: '^', left: base, right: exp };
        }
      }
      return base;
    }

    function parsePostfix() {
      let node = parsePrimary();
      while (peek()) {
        if (peek().type === 'FACTORIAL') {
          consume();
          node = { type: 'Factorial', arg: node };
        } else if (peek().type === 'PERCENT') {
          consume();
          node = { type: 'Binary', op: '/', left: node, right: { type: 'Number', value: 100 } };
        } else if (peek().type === 'DEGREE') {
          consume();
          node = { type: 'Degree', arg: node };
        } else {
          break;
        }
      }
      return node;
    }

    function parseGroupInsideBracesOrPrimary() {
      if (peek() && peek().type === 'LBRACE') {
        consume();
        const inner = parseExpression();
        if (peek() && peek().type === 'RBRACE') consume();
        return inner;
      }
      return parsePrimary();
    }

    function parsePrimary() {
      const tok = peek();
      if (!tok) throw new Error('Unexpected end of expression');

      if (tok.type === 'NUMBER') {
        consume();
        return { type: 'Number', value: tok.value };
      }

      if (tok.type === 'CONST') {
        consume();
        return { type: 'Const', name: tok.name, value: tok.value };
      }

      if (tok.type === 'LPAREN') {
        const openChar = tok.char;
        consume();
        const items = [parseExpression()];
        while (openChar === '(' && peek() && peek().type === 'COMMA') {
          consume();
          items.push(parseExpression());
        }
        if (peek() && peek().type === 'RPAREN') consume();
        if (items.length >= 2) {
          return { type: 'Vector', items };
        }
        return items[0];
      }

      if (tok.type === 'LBRACE') {
        consume();
        const inner = parseExpression();
        if (peek() && peek().type === 'RBRACE') consume();
        return inner;
      }

      if (tok.type === 'ABS_OPEN') {
        consume();
        const inner = parseExpression();
        if (peek() && peek().type === 'ABS_CLOSE') consume();
        return { type: 'FuncCall', name: 'abs', args: [inner] };
      }

      if (tok.type === 'NORM_OPEN') {
        consume();
        const inner = parseExpression();
        if (peek() && peek().type === 'NORM_CLOSE') consume();
        return { type: 'FuncCall', name: 'norm', args: [inner] };
      }

      if (tok.type === 'MATRIX' || tok.type === 'DET_MATRIX') {
        consume();
        const astRows = tok.rows.map(row =>
          row.map(cellStr => parseLatexExpr(cellStr || '0', knownFuncs))
        );
        return {
          type: tok.type === 'DET_MATRIX' ? 'DetMatrix' : 'Matrix',
          rows: astRows
        };
      }

      if (tok.type === 'EVAL_BAR') {
        consume();
        const exprAst = parseLatexExpr(tok.expr, knownFuncs);
        return buildEvalBarNode(exprAst, tok.lower, tok.upper);
      }

      if (tok.type === 'DERIV_OP') {
        consume();
        if (tok.inlineExprLatex) {
          const inlineBodyAst = parseLatexExpr(tok.inlineExprLatex, knownFuncs);
          return {
            type: 'DerivOp',
            vars: tok.vars,
            order: tok.order,
            targetKey: null,
            targetLatex: null,
            argAsts: null,
            inlineBodyAst
          };
        }
        if (tok.targetKey) {
          let argAsts = null;
          if (peek() && peek().type === 'LPAREN' && peek().char === '(') {
            const savedPos = pos;
            consume();
            const args = [];
            if (peek() && peek().type !== 'RPAREN') {
              args.push(parseExpression());
              while (peek() && peek().type === 'COMMA') {
                consume();
                args.push(parseExpression());
              }
            }
            if (peek() && peek().type === 'RPAREN') {
              consume();
              argAsts = args;
            } else {
              pos = savedPos;
            }
          }
          return {
            type: 'DerivOp',
            vars: tok.vars,
            order: tok.order,
            targetKey: tok.targetKey,
            targetLatex: tok.targetLatex,
            argAsts,
            inlineBodyAst: null
          };
        }
        const inlineBodyAst = parseMulDiv();
        return {
          type: 'DerivOp',
          vars: tok.vars,
          order: tok.order,
          targetKey: null,
          targetLatex: null,
          argAsts: null,
          inlineBodyAst
        };
      }

      if (tok.type === 'NABLA') {
        consume();
        let targetKey = null;
        let targetLatex = null;
        let argAsts = null;
        let inlineBodyAst = null;
        if (peek() && peek().type === 'IDENT' && peek().key !== 'e') {
          const idTok = consume();
          targetKey = idTok.key;
          targetLatex = idTok.latex;
          if (peek() && peek().type === 'LPAREN' && peek().char === '(') {
            const savedPos = pos;
            consume();
            const args = [];
            if (peek() && peek().type !== 'RPAREN') {
              args.push(parseExpression());
              while (peek() && peek().type === 'COMMA') {
                consume();
                args.push(parseExpression());
              }
            }
            if (peek() && peek().type === 'RPAREN') {
              consume();
              argAsts = args;
            } else {
              pos = savedPos;
            }
          }
        } else {
          inlineBodyAst = parseMulDiv();
        }
        return { type: 'Nabla', targetKey, targetLatex, argAsts, inlineBodyAst };
      }

      if (tok.type === 'FRAC') {
        consume();
        const numAst = parseLatexExpr(tok.num, knownFuncs);
        const denAst = parseLatexExpr(tok.den, knownFuncs);
        return { type: 'Binary', op: '/', left: numAst, right: denAst };
      }

      if (tok.type === 'BINOM') {
        consume();
        const nAst = parseLatexExpr(tok.n, knownFuncs);
        const kAst = parseLatexExpr(tok.k, knownFuncs);
        return { type: 'Binom', n: nAst, k: kAst };
      }

      if (tok.type === 'SQRT') {
        consume();
        const radAst = parseLatexExpr(tok.radicand, knownFuncs);
        const degAst = tok.degree ? parseLatexExpr(tok.degree, knownFuncs) : null;
        return { type: 'Sqrt', degree: degAst, radicand: radAst };
      }

      if (tok.type === 'FUNC') {
        consume();
        let funcExp = null;
        // Suporta \sin^2(x) o \sin^{-1}(x)
        if (peek() && peek().type === 'OP' && peek().value === '^') {
          consume();
          funcExp = parseGroupInsideBracesOrPrimary();
        }
        const args = [];
        if (peek() && peek().type === 'LPAREN') {
          consume();
          args.push(parseExpression());
          while (peek() && peek().type === 'COMMA') {
            consume();
            args.push(parseExpression());
          }
          if (peek() && peek().type === 'RPAREN') consume();
        } else {
          // \sin x o \ln 2x -> agafa el terme unari/potència immediat
          args.push(parseUnary());
        }
        const baseAst = tok.base ? parseLatexExpr(tok.base, knownFuncs) : null;
        // \sin^{-1}(x) equival a \arcsin(x)
        if (funcExp && funcExp.type === 'Unary' && funcExp.op === '-' &&
            funcExp.arg.type === 'Number' && funcExp.arg.value === 1 &&
            (tok.name === 'sin' || tok.name === 'cos' || tok.name === 'tan') &&
            args.length === 1) {
          return { type: 'FuncCall', name: 'a' + tok.name, args, base: null };
        }
        const callNode = { type: 'FuncCall', name: tok.name, args, base: baseAst };
        if (funcExp) {
          return { type: 'Binary', op: '^', left: callNode, right: funcExp };
        }
        return callNode;
      }

      if (tok.type === 'LIM') {
        consume();
        // Extreu variable lligada i punt límit de tok.sub (ex: "x \\to 2" o "x \\to +\\infty")
        let boundKey = 'x';
        let boundLatex = 'x';
        let targetAst = null;
        let side = 0; // -1 esquerra, +1 dreta, 0 bilateral
        if (tok.sub) {
          const arrowMatch = tok.sub.match(/^([\s\S]*?)(?:\\to|\\rightarrow)(.*)$/);
          if (arrowMatch) {
            const vRaw = arrowMatch[1].trim();
            if (vRaw) {
              boundLatex = vRaw;
              boundKey = canonicalizeVarKey(vRaw);
            }
            let tRaw = arrowMatch[2].trim();
            // Detecta límit lateral 2^+ o 2^-
            const sideMatch = tRaw.match(/^(.*)\^\{\s*([+-])\s*\}$/) || tRaw.match(/^(.*)\^\s*([+-])$/);
            if (sideMatch && sideMatch[1].trim()) {
              tRaw = sideMatch[1].trim();
              side = sideMatch[2] === '+' ? 1 : -1;
            }
            try { targetAst = parseLatexExpr(tRaw, knownFuncs); } catch (_e) { targetAst = null; }
          }
        }
        const body = parseMulDiv();
        return { type: 'Limit', boundKey, boundLatex, target: targetAst, side, body };
      }

      if (tok.type === 'INT') {
        consume();
        // Busquem el patró IDENT('d') + IDENT(var) més proper
        let dIndex = -1;
        let pDepth = 0;
        for (let k = pos; k < tokens.length - 1; k++) {
          if (tokens[k].type === 'LPAREN' || tokens[k].type === 'LBRACE') pDepth++;
          else if (tokens[k].type === 'RPAREN' || tokens[k].type === 'RBRACE') {
            if (pDepth === 0) break;
            pDepth--;
          }
          if (pDepth === 0 && tokens[k].type === 'IDENT' && tokens[k].key === 'd' && tokens[k + 1].type === 'IDENT') {
            dIndex = k;
            break;
          }
        }
        let boundKey = 'x';
        let bodyAst;
        if (dIndex !== -1) {
          boundKey = tokens[dIndex + 1].key;
          const subTokens = tokens.slice(pos, dIndex);
          pos = dIndex + 2;
          bodyAst = subTokens.length === 0 ? { type: 'Number', value: 1 } : parseSubTokenList(subTokens);
        } else {
          bodyAst = parseMulDiv();
        }
        const lowerAst = tok.lower ? parseLatexExpr(tok.lower, knownFuncs) : null;
        const upperAst = tok.upper ? parseLatexExpr(tok.upper, knownFuncs) : null;
        return { type: 'Integral', boundKey, lower: lowerAst, upper: upperAst, body: bodyAst };
      }

      if (tok.type === 'SUMPROD') {
        consume();
        let boundKey = 'i';
        let startAst = null;
        if (tok.lower && tok.lower.includes('=')) {
          const eqParts = splitTopLevelEquals(tok.lower);
          if (eqParts.length === 2) {
            boundKey = canonicalizeVarKey(eqParts[0].trim());
            try { startAst = parseLatexExpr(eqParts[1], knownFuncs); } catch (_e) { startAst = null; }
          }
        }
        const endAst = tok.upper ? parseLatexExpr(tok.upper, knownFuncs) : null;
        const bodyAst = parseMulDiv();
        return { type: 'SumProd', kind: tok.kind, boundKey, start: startAst, end: endAst, body: bodyAst };
      }

      if (tok.type === 'IDENT') {
        consume();
        let derivOrder = 0;
        if (peek() && peek().type === 'PRIME') {
          derivOrder = consume().count;
        }
        // Tracta IDENT(...) com a crida a funció si té derivada, és una funció declarada o és \Gamma(...) integrada!
        const isBuiltinGamma = tok.key === '\\Gamma' && (!knownFuncs || !knownFuncs.has('\\Gamma'));
        const canBeCall = derivOrder > 0 || !knownFuncs || knownFuncs.has(tok.key) || isBuiltinGamma;
        if (canBeCall && peek() && peek().type === 'LPAREN' && peek().char === '(') {
          const savedPos = pos;
          consume(); // '('
          const args = [];
          if (peek() && peek().type !== 'RPAREN') {
            args.push(parseExpression());
            while (peek() && peek().type === 'COMMA') {
              consume();
              args.push(parseExpression());
            }
          }
          if (peek() && peek().type === 'RPAREN') {
            consume();
            return {
              type: 'IdentOrCall',
              key: tok.key,
              latex: tok.latex,
              derivOrder,
              args
            };
          } else {
            pos = savedPos;
          }
        }
        return { type: 'Var', key: tok.key, latex: tok.latex, derivOrder };
      }

      throw new Error(`Unexpected token: ${tok.type}`);
    }

    function parseSubTokenList(subToks) {
      const savedTokens = tokens.slice();
      const savedPos = pos;
      tokens.length = 0;
      tokens.push(...subToks);
      pos = 0;
      try {
        return parseExpression();
      } finally {
        tokens.length = 0;
        tokens.push(...savedTokens);
        pos = savedPos;
      }
    }

    const ast = parseExpression();
    if (pos < tokens.length) {
      throw new Error('Remaining unparsed tokens');
    }
    return ast;
  }

  // ============================================================================
  // 4. Recol·lecció de variables lliures i Avaluador AST
  // ============================================================================
  function collectFreeVars(ast, boundSet = new Set(), knownFuncs = new Set(), outMap = new Map(), funcRegistry = null) {
    if (!ast) return outMap;
    switch (ast.type) {
      case 'Number':
      case 'Const':
        break;
      case 'Var':
        if (!boundSet.has(ast.key) && !knownFuncs.has(ast.key)) {
          if (!outMap.has(ast.key)) outMap.set(ast.key, ast.latex);
        }
        break;
      case 'Vector':
        for (const item of ast.items) collectFreeVars(item, boundSet, knownFuncs, outMap, funcRegistry);
        break;
      case 'Matrix':
      case 'DetMatrix':
        for (const row of ast.rows) {
          for (const cell of row) collectFreeVars(cell, boundSet, knownFuncs, outMap, funcRegistry);
        }
        break;
      case 'EvalBar': {
        for (const asg of ast.assignments || []) {
          collectFreeVars(asg.valAst, boundSet, knownFuncs, outMap, funcRegistry);
        }
        if (ast.lowerAst) collectFreeVars(ast.lowerAst, boundSet, knownFuncs, outMap, funcRegistry);
        if (ast.upperAst) collectFreeVars(ast.upperAst, boundSet, knownFuncs, outMap, funcRegistry);
        if (ast.tupleAsts) {
          for (const item of ast.tupleAsts) collectFreeVars(item, boundSet, knownFuncs, outMap, funcRegistry);
        }
        const nextBound = new Set(boundSet);
        for (const asg of ast.assignments || []) nextBound.add(asg.key);
        if (ast.upperAst && nextBound.size === boundSet.size) {
          // Regla de Barrow [F(x)]_a^b: lliga la variable d'avaluació dins F(x)
          const fvExpr = collectFreeVars(ast.exprAst, boundSet, knownFuncs, new Map(), funcRegistry);
          if (fvExpr.size === 1) {
            nextBound.add([...fvExpr.keys()][0]);
          } else if (fvExpr.has('x')) {
            nextBound.add('x');
          } else if (fvExpr.has('t')) {
            nextBound.add('t');
          }
        } else if (ast.tupleAsts && funcRegistry) {
          // Avaluació amb tupla |_{(1,2)} -> lliga els paràmetres si és possible
          if (ast.exprAst && ast.exprAst.targetKey && funcRegistry.has(ast.exprAst.targetKey)) {
            const fnDef = funcRegistry.get(ast.exprAst.targetKey);
            if (fnDef && fnDef.params) fnDef.params.forEach(p => nextBound.add(p));
          }
        }
        collectFreeVars(ast.exprAst, nextBound, knownFuncs, outMap, funcRegistry);
        break;
      }
      case 'DerivOp':
      case 'Nabla': {
        if (ast.inlineBodyAst) {
          collectFreeVars(ast.inlineBodyAst, boundSet, knownFuncs, outMap, funcRegistry);
        } else if (ast.targetKey) {
          if (ast.argAsts && ast.argAsts.length > 0) {
            for (const a of ast.argAsts) collectFreeVars(a, boundSet, knownFuncs, outMap, funcRegistry);
            if (funcRegistry && funcRegistry.has(ast.targetKey)) {
              const fnDef = funcRegistry.get(ast.targetKey);
              if (fnDef && fnDef.freeParams) {
                for (const [pk, pltx] of fnDef.freeParams.entries()) {
                  if (!boundSet.has(pk) && !outMap.has(pk)) outMap.set(pk, pltx);
                }
              }
            }
          } else if (funcRegistry && funcRegistry.has(ast.targetKey)) {
            const fnDef = funcRegistry.get(ast.targetKey);
            if (fnDef) {
              for (const p of fnDef.params || []) {
                if (!boundSet.has(p) && !outMap.has(p)) outMap.set(p, p);
              }
              if (fnDef.freeParams) {
                for (const [pk, pltx] of fnDef.freeParams.entries()) {
                  if (!boundSet.has(pk) && !outMap.has(pk)) outMap.set(pk, pltx);
                }
              }
            }
          } else if (!knownFuncs.has(ast.targetKey) && !boundSet.has(ast.targetKey)) {
            if (!outMap.has(ast.targetKey)) outMap.set(ast.targetKey, ast.targetLatex || ast.targetKey);
          }
        }
        break;
      }
      case 'IdentOrCall':
        if (ast.key === '\\Gamma' && !knownFuncs.has('\\Gamma') && ast.args.length === 1) {
          for (const a of ast.args) collectFreeVars(a, boundSet, knownFuncs, outMap, funcRegistry);
        } else if (knownFuncs.has(ast.key) || ast.derivOrder > 0) {
          for (const a of ast.args) collectFreeVars(a, boundSet, knownFuncs, outMap, funcRegistry);
          // Si la funció declarada depèn de paràmetres externs (ex: f(x) amb paràmetre 'a'), propaga'ls per resoldre equacions com lim f(x) = ...!
          if (funcRegistry && funcRegistry.has(ast.key)) {
            const fnDef = funcRegistry.get(ast.key);
            if (fnDef && fnDef.freeParams) {
              for (const [pk, pltx] of fnDef.freeParams.entries()) {
                if (!boundSet.has(pk) && !outMap.has(pk)) {
                  outMap.set(pk, pltx);
                }
              }
            }
          }
        } else {
          // Si NO és una funció declarada i té 1 argument, pot ser multiplicació implícita a(x+1)!
          if (ast.args.length === 1 && !boundSet.has(ast.key)) {
            if (!outMap.has(ast.key)) outMap.set(ast.key, ast.latex);
          }
          for (const a of ast.args) collectFreeVars(a, boundSet, knownFuncs, outMap, funcRegistry);
        }
        break;
      case 'Unary':
      case 'UnaryPm':
      case 'Factorial':
      case 'Degree':
        collectFreeVars(ast.arg, boundSet, knownFuncs, outMap, funcRegistry);
        break;
      case 'Binary':
      case 'BinaryPm':
        collectFreeVars(ast.left, boundSet, knownFuncs, outMap, funcRegistry);
        collectFreeVars(ast.right, boundSet, knownFuncs, outMap, funcRegistry);
        break;
      case 'Sqrt':
        if (ast.degree) collectFreeVars(ast.degree, boundSet, knownFuncs, outMap, funcRegistry);
        collectFreeVars(ast.radicand, boundSet, knownFuncs, outMap, funcRegistry);
        break;
      case 'Binom':
        collectFreeVars(ast.n, boundSet, knownFuncs, outMap, funcRegistry);
        collectFreeVars(ast.k, boundSet, knownFuncs, outMap, funcRegistry);
        break;
      case 'FuncCall':
        if (ast.base) collectFreeVars(ast.base, boundSet, knownFuncs, outMap, funcRegistry);
        for (const a of ast.args) collectFreeVars(a, boundSet, knownFuncs, outMap, funcRegistry);
        break;
      case 'Limit': {
        if (ast.target) collectFreeVars(ast.target, boundSet, knownFuncs, outMap, funcRegistry);
        const nextBound = new Set(boundSet);
        nextBound.add(ast.boundKey);
        collectFreeVars(ast.body, nextBound, knownFuncs, outMap, funcRegistry);
        break;
      }
      case 'Integral': {
        if (ast.lower) collectFreeVars(ast.lower, boundSet, knownFuncs, outMap, funcRegistry);
        if (ast.upper) collectFreeVars(ast.upper, boundSet, knownFuncs, outMap, funcRegistry);
        const nextBound = new Set(boundSet);
        nextBound.add(ast.boundKey);
        collectFreeVars(ast.body, nextBound, knownFuncs, outMap, funcRegistry);
        break;
      }
      case 'SumProd': {
        if (ast.start) collectFreeVars(ast.start, boundSet, knownFuncs, outMap, funcRegistry);
        if (ast.end) collectFreeVars(ast.end, boundSet, knownFuncs, outMap, funcRegistry);
        const nextBound = new Set(boundSet);
        nextBound.add(ast.boundKey);
        collectFreeVars(ast.body, nextBound, knownFuncs, outMap, funcRegistry);
        break;
      }
    }
    return outMap;
  }

  // Escaneig tolerant de variables en LaTeX quan la línia no és una equació pura (ex: conté desigualtats o límits incomplets)
  function scanVariablesFallback(rawLatex, knownFuncs = new Set()) {
    const found = new Map();
    try {
      const cleaned = stripProseAnnotations(unwrapDecorations(rawLatex));
      // Detecta límits/integrals/sumatoris per no marcar la variable muda
      const bound = new Set();
      const limMatches = cleaned.matchAll(/\\lim_\{([^}]*?)(?:\\to|\\rightarrow)/g);
      for (const m of limMatches) bound.add(canonicalizeVarKey(m[1].trim()));
      const intMatches = cleaned.matchAll(/d([a-zA-Z])\b/g);
      for (const m of intMatches) {
        if (cleaned.includes('\\int')) bound.add(m[1]);
      }
      const sumMatches = cleaned.matchAll(/\\(?:sum|prod)_\{([a-zA-Z]+)\s*=/g);
      for (const m of sumMatches) bound.add(m[1]);

      // Subdivideix per operadors relacionals (\le, \ge, <, >, \neq, \approx, =) sense trencar \left ni comandes llargues!
      const parts = cleaned.split(/\\(?:le|leq|ge|geq|neq|ne|approx|sim|equiv|in|notin|subset|subseteq)(?![a-zA-Z])|[<>=]/);
      for (const p of parts) {
        if (!p.trim()) continue;
        try {
          const ast = parseLatexExpr(p, knownFuncs);
          collectFreeVars(ast, bound, knownFuncs, found);
        } catch (_e) {
          // Escaneig lèxic lleuger si algun fragment té sintaxi parcial
          try {
            const toks = tokenizeLatex(p);
            for (const t of toks) {
              if (t.type === 'IDENT' && !bound.has(t.key) && !knownFuncs.has(t.key)) {
                if (!found.has(t.key)) found.set(t.key, t.latex);
              }
            }
          } catch (_e2) { /* ignora silenciosament */ }
        }
      }
    } catch (_err) { /* mai llança error */ }
    return found;
  }

  const LANCZOS_G = 7;
  const LANCZOS_P = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7
  ];

  function gammaNum(z) {
    if (!Number.isFinite(z)) return NaN;
    if (z <= 0 && Math.abs(z - Math.round(z)) < 1e-12) return NaN; // pols als enters <= 0
    if (z > 0 && Math.abs(z - Math.round(z)) < 1e-12 && z <= 171) {
      let r = 1;
      for (let i = 2; i < Math.round(z); i++) r *= i;
      return r;
    }
    if (z < 0.5) {
      return Math.PI / (Math.sin(Math.PI * z) * gammaNum(1 - z));
    }
    const z1 = z - 1;
    let x = LANCZOS_P[0];
    for (let i = 1; i < LANCZOS_P.length; i++) {
      x += LANCZOS_P[i] / (z1 + i);
    }
    const t = z1 + LANCZOS_G + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z1 + 0.5) * Math.exp(-t) * x;
  }

  function factorialNum(n) {
    if (!Number.isFinite(n)) return NaN;
    if (Math.abs(n - Math.round(n)) <= 1e-9) {
      const k = Math.round(n);
      if (k < 0) return NaN;
      if (k > 170) return Infinity;
      let r = 1;
      for (let i = 2; i <= k; i++) r *= i;
      return r;
    }
    if (n <= -1 && Math.abs(n - Math.round(n)) <= 1e-9) return NaN;
    return gammaNum(n + 1);
  }

  function gcdNum(a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
    return gcd(Math.round(Math.abs(a)), Math.round(Math.abs(b)));
  }

  function lcmNum(a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
    const ia = Math.round(Math.abs(a));
    const ib = Math.round(Math.abs(b));
    if (ia === 0 || ib === 0) return 0;
    return Math.round((ia / gcd(ia, ib)) * ib);
  }

  function binomNum(n, k) {
    if (!Number.isFinite(n) || !Number.isFinite(k)) return NaN;
    n = Math.round(n);
    k = Math.round(k);
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    k = Math.min(k, n - k);
    let res = 1;
    for (let i = 1; i <= k; i++) {
      res = (res * (n - k + i)) / i;
    }
    return Math.round(res);
  }

  // ============================================================================
  // 4A. Helpers d'Àlgebra Lineal (Vectors i Matrius NxM)
  // ============================================================================
  function isVectorVal(v) {
    return Boolean(v && typeof v === 'object' && v.__type === 'vector');
  }

  function isMatrixVal(v) {
    return Boolean(v && typeof v === 'object' && v.__type === 'matrix');
  }

  function isMathObject(v) {
    return isVectorVal(v) || isMatrixVal(v);
  }

  function makeVector(components) {
    return { __type: 'vector', components };
  }

  function makeMatrix(rows) {
    return { __type: 'matrix', rows };
  }

  function asVectorArray(v) {
    if (isVectorVal(v)) return v.components;
    if (isMatrixVal(v)) {
      if (v.rows.length === 1) return v.rows[0];
      if (v.rows[0].length === 1) return v.rows.map(r => r[0]);
    }
    return null;
  }

  function matTranspose(m) {
    const rCount = m.rows.length;
    const cCount = m.rows[0].length;
    const out = [];
    for (let j = 0; j < cCount; j++) {
      const row = [];
      for (let i = 0; i < rCount; i++) row.push(m.rows[i][j]);
      out.push(row);
    }
    return makeMatrix(out);
  }

  function matTrace(m) {
    if (m.rows.length !== m.rows[0].length) return NaN;
    let sum = 0;
    for (let i = 0; i < m.rows.length; i++) sum += m.rows[i][i];
    return sum;
  }

  function matDeterminant(m) {
    const n = m.rows.length;
    if (n === 0 || m.rows[0].length !== n) return NaN;
    if (n === 1) return m.rows[0][0];
    if (n === 2) return m.rows[0][0] * m.rows[1][1] - m.rows[0][1] * m.rows[1][0];
    if (n === 3) {
      const [[a, b, c], [d, e, f], [g, h, k]] = m.rows;
      return a * e * k + b * f * g + c * d * h - c * e * g - a * f * h - b * d * k;
    }
    const A = m.rows.map(r => r.slice());
    let det = 1;
    for (let i = 0; i < n; i++) {
      let pivot = i;
      for (let r = i + 1; r < n; r++) {
        if (Math.abs(A[r][i]) > Math.abs(A[pivot][i])) pivot = r;
      }
      if (Math.abs(A[pivot][i]) < 1e-12) return 0;
      if (pivot !== i) {
        [A[i], A[pivot]] = [A[pivot], A[i]];
        det = -det;
      }
      const pVal = A[i][i];
      det *= pVal;
      for (let r = i + 1; r < n; r++) {
        const factor = A[r][i] / pVal;
        for (let c = i; c < n; c++) A[r][c] -= factor * A[i][c];
      }
    }
    return Math.abs(det - Math.round(det)) < 1e-9 ? Math.round(det) : det;
  }

  function matRank(m) {
    const rCount = m.rows.length;
    const cCount = m.rows[0].length;
    const A = m.rows.map(r => r.slice());
    let rank = 0;
    for (let col = 0; col < cCount && rank < rCount; col++) {
      let pivot = rank;
      for (let r = rank + 1; r < rCount; r++) {
        if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
      }
      if (Math.abs(A[pivot][col]) < 1e-10) continue;
      [A[rank], A[pivot]] = [A[pivot], A[rank]];
      const pVal = A[rank][col];
      for (let j = col; j < cCount; j++) A[rank][j] /= pVal;
      for (let r = 0; r < rCount; r++) {
        if (r !== rank && Math.abs(A[r][col]) > 1e-12) {
          const factor = A[r][col];
          for (let j = col; j < cCount; j++) A[r][j] -= factor * A[rank][j];
        }
      }
      rank++;
    }
    return rank;
  }

  function matInverse(m) {
    const n = m.rows.length;
    if (n === 0 || m.rows[0].length !== n) return null;
    const aug = m.rows.map((r, i) => {
      const idRow = new Array(n).fill(0);
      idRow[i] = 1;
      return [...r, ...idRow];
    });
    for (let col = 0; col < n; col++) {
      let pivot = col;
      for (let r = col + 1; r < n; r++) {
        if (Math.abs(aug[r][col]) > Math.abs(aug[pivot][col])) pivot = r;
      }
      if (Math.abs(aug[pivot][col]) < 1e-11) return null; // Singular
      if (pivot !== col) [aug[col], aug[pivot]] = [aug[pivot], aug[col]];
      const pVal = aug[col][col];
      for (let j = 0; j < 2 * n; j++) aug[col][j] /= pVal;
      for (let r = 0; r < n; r++) {
        if (r !== col && Math.abs(aug[r][col]) > 1e-12) {
          const factor = aug[r][col];
          for (let j = 0; j < 2 * n; j++) aug[r][j] -= factor * aug[col][j];
        }
      }
    }
    const invRows = aug.map(r => r.slice(n).map(v => (Math.abs(v) < 1e-12 ? 0 : v)));
    return makeMatrix(invRows);
  }

  function matMulMatrices(A, B) {
    const m = A.rows.length, n = A.rows[0].length;
    const bn = B.rows.length, p = B.rows[0].length;
    if (n !== bn) return NaN;
    const out = [];
    for (let i = 0; i < m; i++) {
      const row = new Array(p).fill(0);
      for (let k = 0; k < n; k++) {
        const aik = A.rows[i][k];
        for (let j = 0; j < p; j++) row[j] += aik * B.rows[k][j];
      }
      out.push(row);
    }
    return makeMatrix(out);
  }

  function matMulVec(A, v) {
    const m = A.rows.length, n = A.rows[0].length;
    if (n !== v.components.length) return NaN;
    const out = [];
    for (let i = 0; i < m; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += A.rows[i][j] * v.components[j];
      out.push(s);
    }
    return makeVector(out);
  }

  function matPower(m, exp) {
    const n = m.rows.length;
    if (n !== m.rows[0].length || !Number.isFinite(exp) || Math.abs(exp - Math.round(exp)) > 1e-9) return NaN;
    const k = Math.round(exp);
    if (k === -1) return matInverse(m) || NaN;
    if (k < -1) {
      const inv = matInverse(m);
      return inv ? matPower(inv, -k) : NaN;
    }
    if (k > 30) return NaN;
    let res = makeMatrix(Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
    let base = m;
    let e = k;
    while (e > 0) {
      if (e % 2 === 1) res = matMulMatrices(res, base);
      e = Math.floor(e / 2);
      if (e > 0) base = matMulMatrices(base, base);
    }
    return res;
  }

  function formatObjectLatex(obj) {
    if (isVectorVal(obj)) {
      const parts = obj.components.map(c => {
        const r = formatValueRich(c);
        return r ? r.latex : '?';
      });
      return `\\left(${parts.join(', ')}\\right)`;
    }
    if (isMatrixVal(obj)) {
      const rowsLatex = obj.rows.map(row =>
        row.map(c => {
          const r = formatValueRich(c);
          return r ? r.latex : '?';
        }).join(' & ')
      ).join(' \\\\ ');
      return `\\begin{pmatrix} ${rowsLatex} \\end{pmatrix}`;
    }
    return '';
  }

  function isExponentExplicitFraction(node) {
    if (!node) return false;
    if (node.type === 'Unary') return isExponentExplicitFraction(node.arg);
    return node.type === 'Binary' && node.op === '/';
  }

  function unwrapVarAstFormula(targetKey, env, boundVars = new Set()) {
    if (env.varAsts && env.varAsts.has(targetKey)) {
      return env.varAsts.get(targetKey);
    }
    return null;
  }

  function evalPartialDeriv(ast, env, depth) {
    if (depth > 40) return NaN;
    const vars = ast.vars || [];
    if (vars.length === 0 || vars.length > 2) return NaN;

    let evalScalar = null;
    if (ast.inlineBodyAst) {
      evalScalar = (overridesMap) => {
        const subVars = new Map(env.vars);
        for (const [k, v] of overridesMap.entries()) subVars.set(k, v);
        return evalAst(ast.inlineBodyAst, { ...env, vars: subVars }, depth + 1);
      };
    } else if (ast.targetKey) {
      if (env.funcs && env.funcs.has(ast.targetKey)) {
        const fnDef = env.funcs.get(ast.targetKey);
        let argVals = null;
        if (ast.argAsts && ast.argAsts.length > 0) {
          if (ast.argAsts.length !== fnDef.params.length) return NaN;
          argVals = ast.argAsts.map(a => evalAst(a, env, depth + 1));
          if (argVals.some(v => !Number.isFinite(v))) return NaN;
        }
        evalScalar = (overridesMap) => {
          const subVars = new Map(env.vars);
          if (argVals) {
            fnDef.params.forEach((p, idx) => subVars.set(p, argVals[idx]));
          }
          for (const [k, v] of overridesMap.entries()) subVars.set(k, v);
          if (fnDef.isPiecewise) {
            const x0 = subVars.get(fnDef.params[0]);
            if (!Number.isFinite(x0)) return NaN;
            return evalUserFunctionCall(fnDef, [x0], 0, { ...env, vars: subVars }, depth + 1);
          }
          return evalAst(fnDef.ast, { ...env, vars: subVars }, depth + 1);
        };
      } else {
        const formulaAst = unwrapVarAstFormula(ast.targetKey, env);
        if (formulaAst) {
          evalScalar = (overridesMap) => {
            const subVars = new Map(env.vars);
            for (const [k, v] of overridesMap.entries()) subVars.set(k, v);
            return evalAst(formulaAst, { ...env, vars: subVars }, depth + 1);
          };
        }
      }
    }

    if (!evalScalar) return NaN;

    const getPointCoord = (vKey) => {
      if (ast.targetKey && env.funcs && env.funcs.has(ast.targetKey) && ast.argAsts) {
        const fnDef = env.funcs.get(ast.targetKey);
        const pIdx = fnDef.params.indexOf(vKey);
        if (pIdx !== -1 && ast.argAsts[pIdx]) {
          return evalAst(ast.argAsts[pIdx], env, depth + 1);
        }
      }
      return env.vars.has(vKey) ? env.vars.get(vKey) : NaN;
    };

    if (vars.length === 1) {
      const v0 = vars[0];
      let x0 = getPointCoord(v0);
      if (!Number.isFinite(x0)) {
        // Si la derivada és constant respecte v0 (ex: d/dx(3x + 2)), avalua-la tot i no tenir x!
        const dA = evalOrder4Derivative(val => evalScalar(new Map([[v0, val]])), 0.73, 1);
        const dB = evalOrder4Derivative(val => evalScalar(new Map([[v0, val]])), 2.19, 1);
        if (Number.isFinite(dA) && Number.isFinite(dB) && Math.abs(dA - dB) < 1e-6 * (1 + Math.abs(dA))) {
          return Math.abs(dA - Math.round(dA)) < 1e-8 ? Math.round(dA) : dA;
        }
        return NaN;
      }
      const res = evalOrder4Derivative(val => evalScalar(new Map([[v0, val]])), x0, 1);
      return Number.isFinite(res) && Math.abs(res - Math.round(res)) < 1e-8 ? Math.round(res) : res;
    }

    if (vars.length === 2 && vars[0] === vars[1]) {
      const v0 = vars[0];
      const x0 = getPointCoord(v0);
      if (!Number.isFinite(x0)) {
        const dA = evalOrder4Derivative(val => evalScalar(new Map([[v0, val]])), 0.73, 2);
        const dB = evalOrder4Derivative(val => evalScalar(new Map([[v0, val]])), 2.19, 2);
        if (Number.isFinite(dA) && Number.isFinite(dB) && Math.abs(dA - dB) < 1e-5 * (1 + Math.abs(dA))) {
          return Math.abs(dA - Math.round(dA)) < 1e-7 ? Math.round(dA) : dA;
        }
        return NaN;
      }
      const res = evalOrder4Derivative(val => evalScalar(new Map([[v0, val]])), x0, 2);
      return Number.isFinite(res) && Math.abs(res - Math.round(res)) < 1e-7 ? Math.round(res) : res;
    }

    // Derivada parcial creuada \frac{\partial^2}{\partial x \partial y}
    const [vx, vy] = vars;
    const x0 = getPointCoord(vx);
    const y0 = getPointCoord(vy);
    const computeMixedAt = (cx, cy) => {
      const hx = Math.max(1e-4, Math.abs(cx) * 1e-4);
      const hy = Math.max(1e-4, Math.abs(cy) * 1e-4);
      const fpp = evalScalar(new Map([[vx, cx + hx], [vy, cy + hy]]));
      const fpm = evalScalar(new Map([[vx, cx + hx], [vy, cy - hy]]));
      const fmp = evalScalar(new Map([[vx, cx - hx], [vy, cy + hy]]));
      const fmm = evalScalar(new Map([[vx, cx - hx], [vy, cy - hy]]));
      return (fpp - fpm - fmp + fmm) / (4 * hx * hy);
    };
    if (!Number.isFinite(x0) || !Number.isFinite(y0)) {
      const mA = computeMixedAt(0.73, 1.17);
      const mB = computeMixedAt(2.11, -0.49);
      if (Number.isFinite(mA) && Number.isFinite(mB) && Math.abs(mA - mB) < 1e-4 * (1 + Math.abs(mA))) {
        return Math.abs(mA - Math.round(mA)) < 1e-6 ? Math.round(mA) : mA;
      }
      return NaN;
    }
    const res = computeMixedAt(x0, y0);
    return Number.isFinite(res) && Math.abs(res - Math.round(res)) < 1e-6 ? Math.round(res) : res;
  }

  // Avalua un AST amb un entorn { vars: Map(key->number), objects: Map(key->vec|mat), funcs: Map(...), varAsts: Map(...), angleMode: 'RAD'|'DEG', pmBranch: 1|-1|null }
  function evalAst(ast, env, depth = 0) {
    if (!ast || depth > 40) return NaN;
    const isDeg = env.angleMode === 'DEG';
    const toRad = x => (isDeg ? (x * Math.PI) / 180 : x);
    const fromRad = x => (isDeg ? (x * 180) / Math.PI : x);

    switch (ast.type) {
      case 'Number':
        return ast.value;

      case 'Const':
        return ast.value;

      case 'Degree': {
        const v = evalAst(ast.arg, env, depth + 1);
        if (typeof v !== 'number') return NaN;
        return isDeg ? v : (v * Math.PI) / 180;
      }

      case 'Var': {
        if (ast.derivOrder > 0) return NaN;
        if (env.vars.has(ast.key)) return env.vars.get(ast.key);
        if (env.objects && env.objects.has(ast.key)) return env.objects.get(ast.key);
        if (ast.key === 'e') return Math.E;
        return NaN;
      }

      case 'Vector': {
        const comps = [];
        for (const item of ast.items) {
          const val = evalAst(item, env, depth + 1);
          if (!Number.isFinite(val)) return NaN;
          comps.push(val);
        }
        return makeVector(comps);
      }

      case 'Matrix': {
        const rows = [];
        for (const r of ast.rows) {
          const rowVals = [];
          for (const cellAst of r) {
            const val = evalAst(cellAst, env, depth + 1);
            if (!Number.isFinite(val)) return NaN;
            rowVals.push(val);
          }
          rows.push(rowVals);
        }
        if (rows.some(r => r.length !== rows[0].length)) return NaN;
        return makeMatrix(rows);
      }

      case 'DetMatrix': {
        const rows = [];
        for (const r of ast.rows) {
          const rowVals = [];
          for (const cellAst of r) {
            const val = evalAst(cellAst, env, depth + 1);
            if (!Number.isFinite(val)) return NaN;
            rowVals.push(val);
          }
          rows.push(rowVals);
        }
        if (rows.some(r => r.length !== rows[0].length)) return NaN;
        return matDeterminant(makeMatrix(rows));
      }

      case 'EvalBar': {
        const subVars = new Map(env.vars);
        const nextEnv = { ...env, vars: subVars };
        if (ast.upperAst) {
          // Regla de Barrow [F(x)]_a^b
          const a = ast.lowerAst
            ? evalAst(ast.lowerAst, env, depth + 1)
            : (ast.assignments && ast.assignments[0] ? evalAst(ast.assignments[0].valAst, env, depth + 1) : NaN);
          const b = evalAst(ast.upperAst, env, depth + 1);
          if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
          let boundVar = ast.assignments && ast.assignments[0] ? ast.assignments[0].key : null;
          if (!boundVar) {
            const fv = collectFreeVars(ast.exprAst, new Set(), new Set(env.funcs ? env.funcs.keys() : []));
            if (fv.size === 1) boundVar = [...fv.keys()][0];
            else if (fv.has('x')) boundVar = 'x';
            else if (fv.has('t')) boundVar = 't';
            else boundVar = 'x';
          }
          subVars.set(boundVar, b);
          const fb = evalAst(ast.exprAst, nextEnv, depth + 1);
          subVars.set(boundVar, a);
          const fa = evalAst(ast.exprAst, nextEnv, depth + 1);
          if (Number.isFinite(fb) && Number.isFinite(fa)) return fb - fa;
          return NaN;
        }
        // Avaluació puntual \left. f(x) \right|_{x=a}
        if (ast.assignments && ast.assignments.length > 0) {
          for (const asg of ast.assignments) {
            const val = evalAst(asg.valAst, env, depth + 1);
            if (!Number.isFinite(val)) return NaN;
            subVars.set(asg.key, val);
          }
          return evalAst(ast.exprAst, nextEnv, depth + 1);
        }
        if (ast.tupleAsts && ast.exprAst && ast.exprAst.targetKey && env.funcs && env.funcs.has(ast.exprAst.targetKey)) {
          const fnDef = env.funcs.get(ast.exprAst.targetKey);
          if (ast.tupleAsts.length === fnDef.params.length) {
            for (let k = 0; k < fnDef.params.length; k++) {
              const val = evalAst(ast.tupleAsts[k], env, depth + 1);
              if (!Number.isFinite(val)) return NaN;
              subVars.set(fnDef.params[k], val);
            }
            return evalAst(ast.exprAst, nextEnv, depth + 1);
          }
        }
        if (ast.lowerAst) {
          const a = evalAst(ast.lowerAst, env, depth + 1);
          if (!Number.isFinite(a)) return NaN;
          const fv = collectFreeVars(ast.exprAst, new Set(), new Set(env.funcs ? env.funcs.keys() : []));
          const boundVar = fv.size === 1 ? [...fv.keys()][0] : (fv.has('x') ? 'x' : 'x');
          subVars.set(boundVar, a);
          return evalAst(ast.exprAst, nextEnv, depth + 1);
        }
        return NaN;
      }

      case 'DerivOp':
        return evalPartialDeriv(ast, env, depth + 1);

      case 'Nabla': {
        let varKeys = [];
        if (ast.targetKey && env.funcs && env.funcs.has(ast.targetKey)) {
          const fnDef = env.funcs.get(ast.targetKey);
          varKeys = fnDef.params.slice();
        } else if (ast.inlineBodyAst) {
          const fv = collectFreeVars(ast.inlineBodyAst, new Set(), new Set(env.funcs ? env.funcs.keys() : []));
          if (!env.vars.has('e')) fv.delete('e');
          varKeys = [...fv.keys()];
        } else if (ast.targetKey) {
          const formulaAst = unwrapVarAstFormula(ast.targetKey, env);
          if (formulaAst) {
            const fv = collectFreeVars(formulaAst, new Set(), new Set(env.funcs ? env.funcs.keys() : []));
            if (!env.vars.has('e')) fv.delete('e');
            varKeys = [...fv.keys()];
          }
        }
        if (varKeys.length === 0) return NaN;
        const comps = varKeys.map(vk => evalPartialDeriv({
          vars: [vk],
          order: 1,
          targetKey: ast.targetKey,
          argAsts: ast.argAsts,
          inlineBodyAst: ast.inlineBodyAst
        }, env, depth + 1));
        if (comps.some(c => !Number.isFinite(c))) return NaN;
        return comps.length === 1 ? comps[0] : makeVector(comps);
      }

      case 'IdentOrCall': {
        // 1) Funció declarada per l'usuari
        if (env.funcs && env.funcs.has(ast.key)) {
          const fnDef = env.funcs.get(ast.key);
          if (ast.args.length !== fnDef.params.length) return NaN;
          const argVals = ast.args.map(a => evalAst(a, env, depth + 1));
          if (argVals.some(v => !Number.isFinite(v))) return NaN;
          return evalUserFunctionCall(fnDef, argVals, ast.derivOrder || 0, env, depth + 1);
        }

        // 2) Funció Gamma \Gamma(z) quan no s'ha redefinit com a variable/funció
        if (ast.key === '\\Gamma' && ast.derivOrder === 0 && ast.args.length === 1 && !env.vars.has('\\Gamma')) {
          const z = evalAst(ast.args[0], env, depth + 1);
          return gammaNum(z);
        }

        // 3) Si NO és funció declarada i té 1 argument i cap derivada, és multiplicació implícita: a(x + 1) o A(v)!
        if (ast.derivOrder === 0 && ast.args.length === 1) {
          let factor = NaN;
          if (env.vars.has(ast.key)) factor = env.vars.get(ast.key);
          else if (env.objects && env.objects.has(ast.key)) factor = env.objects.get(ast.key);
          else if (ast.key === 'e') factor = Math.E;
          if (factor !== undefined && !Number.isNaN(factor)) {
            const rhs = evalAst(ast.args[0], env, depth + 1);
            if (typeof factor === 'number' && typeof rhs === 'number') return factor * rhs;
            if (isMatrixVal(factor) && isVectorVal(rhs)) return matMulVec(factor, rhs);
            if (isMatrixVal(factor) && isMatrixVal(rhs)) return matMulMatrices(factor, rhs);
            if (typeof factor === 'number' && isVectorVal(rhs)) return makeVector(rhs.components.map(c => factor * c));
            if (typeof factor === 'number' && isMatrixVal(rhs)) return makeMatrix(rhs.rows.map(r => r.map(c => factor * c)));
          }
        }
        return NaN;
      }

      case 'Unary': {
        const v = evalAst(ast.arg, env, depth + 1);
        if (typeof v === 'number') return ast.op === '-' ? -v : v;
        if (isVectorVal(v)) return ast.op === '-' ? makeVector(v.components.map(c => -c)) : v;
        if (isMatrixVal(v)) return ast.op === '-' ? makeMatrix(v.rows.map(r => r.map(c => -c))) : v;
        return NaN;
      }

      case 'UnaryPm': {
        if (!env.pmBranch) return NaN;
        const v = evalAst(ast.arg, env, depth + 1);
        if (typeof v !== 'number') return NaN;
        const sign = ast.op === 'mp' ? -env.pmBranch : env.pmBranch;
        return sign * v;
      }

      case 'BinaryPm': {
        if (!env.pmBranch) return NaN;
        const l = evalAst(ast.left, env, depth + 1);
        const r = evalAst(ast.right, env, depth + 1);
        if (typeof l !== 'number' || typeof r !== 'number') return NaN;
        const sign = ast.op === 'mp' ? -env.pmBranch : env.pmBranch;
        return l + sign * r;
      }

      case 'Binary': {
        // Suport especial A^T / A^t per transposada de matriu
        if (ast.op === '^' && ast.right && ast.right.type === 'Var' && (ast.right.key === 'T' || ast.right.key === 't')) {
          const baseObj = evalAst(ast.left, env, depth + 1);
          if (isMatrixVal(baseObj)) return matTranspose(baseObj);
        }

        const l = evalAst(ast.left, env, depth + 1);
        const r = evalAst(ast.right, env, depth + 1);
        if (Number.isNaN(l) || Number.isNaN(r)) return NaN;

        // Camí ràpid escalar-escalar
        if (typeof l === 'number' && typeof r === 'number') {
          switch (ast.op) {
            case '+': return l + r;
            case '-': return l - r;
            case '*': return l * r;
            case '/': return r === 0 ? NaN : l / r;
            case '^': {
              if (l < 0 && Number.isFinite(r) && Math.abs(r - Math.round(r)) > 1e-9) {
                const frac = floatToNiceFraction(r, 99, 1e-9);
                if (frac && frac.den % 2 === 1 && (isExponentExplicitFraction(ast.right) || frac.den % 5 !== 0)) {
                  const root = Math.pow(-l, 1 / frac.den);
                  return Math.pow(-root, frac.num);
                }
              }
              return Math.pow(l, r);
            }
          }
          return NaN;
        }

        // Àlgebra lineal: Vectors i Matrius
        if (ast.op === '+' || ast.op === '-') {
          const sgn = ast.op === '+' ? 1 : -1;
          if (isVectorVal(l) && isVectorVal(r) && l.components.length === r.components.length) {
            return makeVector(l.components.map((c, idx) => c + sgn * r.components[idx]));
          }
          if (isMatrixVal(l) && isMatrixVal(r) && l.rows.length === r.rows.length && l.rows[0].length === r.rows[0].length) {
            return makeMatrix(l.rows.map((row, i) => row.map((c, j) => c + sgn * r.rows[i][j])));
          }
          return NaN;
        }

        if (ast.op === '*') {
          // Escalar * Vector / Matriu
          if (typeof l === 'number' && isVectorVal(r)) return makeVector(r.components.map(c => l * c));
          if (isVectorVal(l) && typeof r === 'number') return makeVector(l.components.map(c => c * r));
          if (typeof l === 'number' && isMatrixVal(r)) return makeMatrix(r.rows.map(row => row.map(c => l * c)));
          if (isMatrixVal(l) && typeof r === 'number') return makeMatrix(l.rows.map(row => row.map(c => c * r)));

          // Matriu * Matriu
          if (isMatrixVal(l) && isMatrixVal(r)) return matMulMatrices(l, r);
          // Matriu * Vector
          if (isMatrixVal(l) && isVectorVal(r)) return matMulVec(l, r);
          if (isVectorVal(l) && isMatrixVal(r) && r.rows.length === l.components.length) {
            const prod = matMulMatrices(makeMatrix([l.components]), r);
            return isMatrixVal(prod) ? makeVector(prod.rows[0]) : NaN;
          }

          // Vector * Vector (producte vectorial \times vs producte escalar \cdot)
          const va = asVectorArray(l);
          const vb = asVectorArray(r);
          if (va && vb && va.length === vb.length) {
            if (ast.opKind === 'times') {
              if (va.length === 3) {
                return makeVector([
                  va[1] * vb[2] - va[2] * vb[1],
                  va[2] * vb[0] - va[0] * vb[2],
                  va[0] * vb[1] - va[1] * vb[0]
                ]);
              }
              return NaN;
            }
            let dot = 0;
            for (let idx = 0; idx < va.length; idx++) dot += va[idx] * vb[idx];
            return dot;
          }
          return NaN;
        }

        if (ast.op === '/' && typeof r === 'number' && r !== 0) {
          if (isVectorVal(l)) return makeVector(l.components.map(c => c / r));
          if (isMatrixVal(l)) return makeMatrix(l.rows.map(row => row.map(c => c / r)));
          return NaN;
        }

        if (ast.op === '^' && isMatrixVal(l) && typeof r === 'number') {
          return matPower(l, r);
        }

        return NaN;
      }

      case 'Factorial':
        return factorialNum(evalAst(ast.arg, env, depth + 1));

      case 'Binom':
        return binomNum(evalAst(ast.n, env, depth + 1), evalAst(ast.k, env, depth + 1));

      case 'Sqrt': {
        const rad = evalAst(ast.radicand, env, depth + 1);
        if (!Number.isFinite(rad)) return NaN;
        if (!ast.degree) {
          return rad < 0 ? NaN : Math.sqrt(rad);
        }
        const n = evalAst(ast.degree, env, depth + 1);
        if (!Number.isFinite(n) || n === 0) return NaN;
        if (rad < 0) {
          if (Math.abs(n - Math.round(n)) < 1e-9 && Math.abs(Math.round(n)) % 2 === 1) {
            return -Math.pow(-rad, 1 / Math.round(n));
          }
          return NaN;
        }
        return Math.pow(rad, 1 / n);
      }

      case 'FuncCall': {
        const argVals = ast.args.map(a => evalAst(a, env, depth + 1));
        const first = argVals[0];
        if (argVals.length === 0 || Number.isNaN(first)) return NaN;

        // Funcions sobre vectors i matrius
        if (ast.name === 'norm' || ast.name === 'abs') {
          if (isVectorVal(first)) {
            return Math.hypot(...first.components);
          }
          if (isMatrixVal(first)) {
            if (ast.name === 'norm') {
              let sumSq = 0;
              for (const row of first.rows) for (const c of row) sumSq += c * c;
              return Math.sqrt(sumSq);
            }
            return matDeterminant(first);
          }
        }
        if (ast.name === 'det' && isMatrixVal(first)) return matDeterminant(first);
        if ((ast.name === 'tr' || ast.name === 'trace') && isMatrixVal(first)) return matTrace(first);
        if ((ast.name === 'rang' || ast.name === 'rank') && isMatrixVal(first)) return matRank(first);
        if (ast.name === 'inv' && isMatrixVal(first)) return matInverse(first) || NaN;
        if (ast.name === 'trans' && isMatrixVal(first)) return matTranspose(first);
        if (ast.name === 'angle' && argVals.length === 2) {
          const va = asVectorArray(argVals[0]);
          const vb = asVectorArray(argVals[1]);
          if (va && vb && va.length === vb.length) {
            const na = Math.hypot(...va), nb = Math.hypot(...vb);
            if (na < 1e-12 || nb < 1e-12) return NaN;
            let dot = 0;
            for (let k = 0; k < va.length; k++) dot += va[k] * vb[k];
            const cosA = Math.max(-1, Math.min(1, dot / (na * nb)));
            return fromRad(Math.acos(cosA));
          }
          return NaN;
        }
        if (ast.name === 'proj' && ((ast.base && argVals.length === 1) || argVals.length === 2)) {
          const va = asVectorArray(argVals[0]);
          const targetObj = ast.base ? evalAst(ast.base, env, depth + 1) : argVals[1];
          const vb = asVectorArray(targetObj);
          if (va && vb && va.length === vb.length) {
            let dot = 0, bSq = 0;
            for (let k = 0; k < va.length; k++) { dot += va[k] * vb[k]; bSq += vb[k] * vb[k]; }
            if (bSq < 1e-15) return NaN;
            const scale = dot / bSq;
            return makeVector(vb.map(c => c * scale));
          }
          return NaN;
        }
        if ((ast.name === 'mcd' || ast.name === 'gcd') && argVals.length >= 2) {
          return argVals.reduce((acc, v) => gcdNum(acc, v));
        }
        if ((ast.name === 'mcm' || ast.name === 'lcm') && argVals.length >= 2) {
          return argVals.reduce((acc, v) => lcmNum(acc, v));
        }

        const x = first;
        if (!Number.isFinite(x)) return NaN;
        switch (ast.name) {
          case 'abs':
          case 'norm': return Math.abs(x);
          case 'sgn': return Math.sign(x);
          case 'sqrt': return x < 0 ? NaN : Math.sqrt(x);
          case 'exp': return Math.exp(x);
          case 'ln': return x <= 0 ? NaN : Math.log(x);
          case 'lg': return x <= 0 ? NaN : Math.log10(x);
          case 'log': {
            if (x <= 0) return NaN;
            if (ast.base) {
              const b = evalAst(ast.base, env, depth + 1);
              if (!Number.isFinite(b) || b <= 0 || b === 1) return NaN;
              return Math.log(x) / Math.log(b);
            }
            return Math.log10(x);
          }
          case 'sin': return Math.sin(toRad(x));
          case 'cos': return Math.cos(toRad(x));
          case 'tan': {
            const rad = toRad(x);
            if (Math.abs(Math.cos(rad)) < 1e-12) return NaN;
            return Math.tan(rad);
          }
          case 'sec': return 1 / Math.cos(toRad(x));
          case 'csc': return 1 / Math.sin(toRad(x));
          case 'cot': return Math.cos(toRad(x)) / Math.sin(toRad(x));
          case 'arcsin':
          case 'asin': return x < -1 || x > 1 ? NaN : fromRad(Math.asin(x));
          case 'arccos':
          case 'acos': return x < -1 || x > 1 ? NaN : fromRad(Math.acos(x));
          case 'arctan':
          case 'atan': return fromRad(Math.atan(x));
          case 'sinh': return Math.sinh(x);
          case 'cosh': return Math.cosh(x);
          case 'tanh': return Math.tanh(x);
        }
        return NaN;
      }

      case 'Limit': {
        if (!ast.target) return NaN;
        const t = evalAst(ast.target, env, depth + 1);
        const evalAt = (val) => {
          const subVars = new Map(env.vars);
          subVars.set(ast.boundKey, val);
          return evalAst(ast.body, { ...env, vars: subVars }, depth + 1);
        };
        if (t === Infinity || t === -Infinity) {
          const sgn = t > 0 ? 1 : -1;
          const v1 = evalAt(sgn * 1e5);
          const v2 = evalAt(sgn * 1e6);
          if (Number.isFinite(v1) && Number.isFinite(v2) && Math.abs(v2 - v1) < 1e-3 * (1 + Math.abs(v2))) {
            return Math.abs(v2 - Math.round(v2)) < 1e-4 ? Math.round(v2) : v2;
          }
          return NaN;
        }
        if (!Number.isFinite(t)) return NaN;
        if (ast.side === 0) {
          const vl = evalLateralLimitAt(evalAt, t, -1);
          const vr = evalLateralLimitAt(evalAt, t, 1);
          if (Number.isFinite(vl) && Number.isFinite(vr) && Math.abs(vr - vl) <= 1e-4 * (1 + Math.abs(vr))) {
            const avg = (vl + vr) / 2;
            const direct = evalAt(t);
            if (Number.isFinite(direct) && Math.abs(direct - avg) <= 1e-5 * (1 + Math.abs(avg))) {
              return direct;
            }
            return Math.abs(avg - Math.round(avg)) < 1e-9 ? Math.round(avg) : avg;
          }
          return NaN;
        } else {
          return evalLateralLimitAt(evalAt, t, ast.side);
        }
      }

      case 'Integral': {
        if (!ast.lower || !ast.upper) return NaN;
        const a = evalAst(ast.lower, env, depth + 1);
        const b = evalAst(ast.upper, env, depth + 1);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
        if (a === b) return 0;

        const subVars = new Map(env.vars);
        const f = (x) => {
          subVars.set(ast.boundKey, x);
          return evalAst(ast.body, { ...env, vars: subVars }, depth + 1);
        };

        // Subdivideix pels punts de ruptura de qualsevol funció a trossos dins (min(a,b), max(a,b))
        const lo = Math.min(a, b), hi = Math.max(a, b);
        const cuts = [lo];
        if (env.funcs) {
          for (const fnDef of env.funcs.values()) {
            if (fnDef.isPiecewise) {
              const bps = getPiecewiseNumericBreakpoints(fnDef, env, depth + 1);
              for (const c of bps) {
                if (c > lo + 1e-9 && c < hi - 1e-9 && !cuts.some(z => Math.abs(z - c) < 1e-8)) {
                  cuts.push(c);
                }
              }
            }
          }
        }
        cuts.push(hi);
        cuts.sort((x, y) => x - y);

        let total = 0;
        for (let seg = 0; seg < cuts.length - 1; seg++) {
          const u = cuts[seg], v = cuts[seg + 1];
          const N = 120;
          const h = (v - u) / N;
          const yu = evalLateralLimitAt(f, u, 1);
          const yv = evalLateralLimitAt(f, v, -1);
          if (!Number.isFinite(yu) || !Number.isFinite(yv)) return NaN;
          let sum = yu + yv;
          for (let i = 1; i < N; i++) {
            const y = f(u + i * h);
            if (!Number.isFinite(y)) return NaN;
            sum += (i % 2 === 0 ? 2 : 4) * y;
          }
          total += (h / 3) * sum;
        }
        return a <= b ? total : -total;
      }

      case 'SumProd': {
        if (!ast.start || !ast.end) return NaN;
        const sVal = evalAst(ast.start, env, depth + 1);
        const eVal = evalAst(ast.end, env, depth + 1);
        if (!Number.isFinite(sVal) || !Number.isFinite(eVal)) return NaN;
        const a = Math.round(sVal);
        const b = Math.round(eVal);
        if (b - a > 5000 || b < a) return NaN;
        const subVars = new Map(env.vars);
        let acc = ast.kind === 'prod' ? 1 : 0;
        for (let k = a; k <= b; k++) {
          subVars.set(ast.boundKey, k);
          const term = evalAst(ast.body, { ...env, vars: subVars }, depth + 1);
          if (!Number.isFinite(term)) return NaN;
          if (ast.kind === 'prod') acc *= term;
          else acc += term;
        }
        return acc;
      }
    }
    return NaN;
  }

  // Extrapolació d'Aitken / Richardson per a límits laterals (alta precisió tant en funcions suaus com en arrels!)
  function evalLateralLimitAt(evalAt, t, side) {
    const scale = Math.max(1, Math.abs(t));
    const h1 = 1e-4 * scale;
    const h2 = 1e-5 * scale;
    const h3 = 1e-6 * scale;
    const v1 = evalAt(t + side * h1);
    const v2 = evalAt(t + side * h2);
    const v3 = evalAt(t + side * h3);
    if (!Number.isFinite(v2) || !Number.isFinite(v3)) return NaN;

    const d23 = v3 - v2;
    if (Math.abs(d23) < 1e-11 * Math.max(1, Math.abs(v3))) {
      return Math.abs(v3 - Math.round(v3)) < 1e-9 ? Math.round(v3) : v3;
    }

    if (Number.isFinite(v1)) {
      const d12 = v2 - v1;
      // Comprova que l'error disminueix (no divergeix cap a ±∞!)
      if (Math.abs(d23) < Math.abs(d12) * 0.65 && Math.abs(d23) < 1e-2 * (1 + Math.abs(v3))) {
        // Si la raó és ~0.1 (convergència de Taylor O(h)), extrapolació lineal de Richardson:
        if (Math.abs(d12) > 1e-14 && Math.abs(d23 / d12 - 0.1) < 0.03) {
          const rich = (10 * v3 - v2) / 9;
          return Math.abs(rich - Math.round(rich)) < 1e-9 ? Math.round(rich) : rich;
        }
        // Acceleració Δ² d'Aitken (exacta per a qualsevol potència O(h^p), p. ex. √x -> 0^+!)
        const denom = v1 - 2 * v2 + v3;
        if (Math.abs(denom) > 1e-14) {
          const aitken = v3 - (d23 * d23) / denom;
          if (Number.isFinite(aitken) && Math.abs(aitken - v3) < Math.abs(d12)) {
            return Math.abs(aitken - Math.round(aitken)) < 1e-9 ? Math.round(aitken) : aitken;
          }
        }
        return v3;
      }
    }

    if (Math.abs(d23) < 1e-4 * (1 + Math.abs(v3))) {
      return v3;
    }
    return NaN;
  }

  // ============================================================================
  // 4B. Funcions Definides a Trossos (Piecewise Functions)
  // ============================================================================
  function extractPiecewiseCasesInner(rhsRaw) {
    if (!rhsRaw) return null;
    const s = rhsRaw.trim();
    const m1 = s.match(/^\\begin\{cases\}([\s\S]*?)\\end\{cases\}(?:\s*\\text\{[^}]*\})?\s*$/);
    if (m1) return m1[1];
    const m2 = s.match(/^\\left\\\{\s*\\begin\{(?:array|matrix|cases)\}(?:\{[^}]*\})?([\s\S]*?)\\end\{(?:array|matrix|cases)\}\s*(?:\\right\.)?\s*$/);
    if (m2) return m2[1];
    return null;
  }

  function splitCasesRowsTopLevel(inner) {
    const rows = [];
    let cur = '';
    let brace = 0, envDepth = 0;
    for (let i = 0; i < inner.length; i++) {
      const envHit = matchEnvDeltaAt(inner, i);
      if (envHit) {
        envDepth = Math.max(0, envDepth + envHit.delta);
        cur += inner.slice(i, envHit.end);
        i = envHit.end - 1;
        continue;
      }
      if (inner[i] === '\\' && inner[i + 1] === '\\' && envDepth === 0 && brace === 0) {
        if (cur.trim()) rows.push(cur.trim());
        cur = '';
        i++;
        continue;
      }
      if (inner[i] === '{') brace++;
      else if (inner[i] === '}') brace = Math.max(0, brace - 1);
      cur += inner[i];
    }
    if (cur.trim()) rows.push(cur.trim());
    return rows;
  }

  function splitPiecewiseRowExprAndCond(rowStr) {
    // 1. Cerca '&' de nivell 0
    let brace = 0, paren = 0, bracket = 0, envDepth = 0;
    for (let i = 0; i < rowStr.length; i++) {
      const envHit = matchEnvDeltaAt(rowStr, i);
      if (envHit) {
        envDepth = Math.max(0, envDepth + envHit.delta);
        i = envHit.end - 1;
        continue;
      }
      if (rowStr[i] === '\\') { i++; continue; }
      if (rowStr[i] === '{') brace++;
      else if (rowStr[i] === '}') brace = Math.max(0, brace - 1);
      else if (rowStr[i] === '(') paren++;
      else if (rowStr[i] === ')') paren = Math.max(0, paren - 1);
      else if (rowStr[i] === '[') bracket++;
      else if (rowStr[i] === ']') bracket = Math.max(0, bracket - 1);
      else if (rowStr[i] === '&' && envDepth === 0 && brace === 0 && paren === 0 && bracket === 0) {
        const exprRaw = rowStr.slice(0, i).replace(/[,;\s]+$/, '').trim();
        const condRaw = rowStr.slice(i + 1).replace(/&/g, ' ').trim();
        return { exprRaw, condRaw };
      }
    }

    // 2. Si l'usuari no ha posat '&', cerca \text{si ...}, \text{altrament}, o coma seguida de condició
    const textTrigger = rowStr.match(/^(.*?)((?:,\s*)?(?:\\qquad|\\quad|\s)*\\text(?:rm|it|bf)?\{\s*(?:si\b|per\b|quan\b|altrament|resta|en cas contrari|si no)[\s\S]*)$/i);
    if (textTrigger && textTrigger[1].trim()) {
      return {
        exprRaw: textTrigger[1].replace(/[,;\s]+$/, '').trim(),
        condRaw: textTrigger[2].replace(/^,\s*/, '').trim()
      };
    }

    const commaCond = rowStr.match(/^(.*?),(?:\s|\\quad|\\qquad)+([^,]+(?:\\le|\\leq|\\ge|\\geq|\\neq|\\ne|\\in|<|>)[^,]+)$/);
    if (commaCond && commaCond[1].trim()) {
      return {
        exprRaw: commaCond[1].trim(),
        condRaw: commaCond[2].trim()
      };
    }

    return { exprRaw: rowStr.trim(), condRaw: '' };
  }

  function tokenizeTopLevelRelOps(s) {
    const exprs = [];
    const ops = [];
    let cur = '';
    let brace = 0, paren = 0, bracket = 0;
    const cmdOps = [
      ['\\leqslant', '<='], ['\\leq', '<='], ['\\le', '<='],
      ['\\geqslant', '>='], ['\\geq', '>='], ['\\ge', '>='],
      ['\\neq', '!='], ['\\ne', '!=']
    ];

    for (let i = 0; i < s.length; i++) {
      if (s.startsWith('\\left', i) && !/[a-zA-Z]/.test(s[i + 5] || '')) {
        cur += '\\left';
        i += 4;
        continue;
      }
      if (s.startsWith('\\right', i) && !/[a-zA-Z]/.test(s[i + 6] || '')) {
        cur += '\\right';
        i += 5;
        continue;
      }
      if (brace === 0 && paren === 0 && bracket === 0) {
        let matched = null;
        for (const [cmd, normOp] of cmdOps) {
          if (s.startsWith(cmd, i) && !/[a-zA-Z]/.test(s[i + cmd.length] || '')) {
            matched = { len: cmd.length, op: normOp };
            break;
          }
        }
        if (!matched) {
          if (s.startsWith('<=', i)) matched = { len: 2, op: '<=' };
          else if (s.startsWith('>=', i)) matched = { len: 2, op: '>=' };
          else if (s.startsWith('!=', i)) matched = { len: 2, op: '!=' };
          else if (s[i] === '<') matched = { len: 1, op: '<' };
          else if (s[i] === '>') matched = { len: 1, op: '>' };
          else if (s[i] === '=') matched = { len: 1, op: '=' };
        }
        if (matched) {
          exprs.push(cur.trim());
          ops.push(matched.op);
          cur = '';
          i += matched.len - 1;
          continue;
        }
      }

      if (s[i] === '\\') {
        cur += s[i];
        if (i + 1 < s.length) { cur += s[i + 1]; i++; }
        continue;
      }
      if (s[i] === '{') brace++;
      else if (s[i] === '}') brace = Math.max(0, brace - 1);
      else if (s[i] === '(') paren++;
      else if (s[i] === ')') paren = Math.max(0, paren - 1);
      else if (s[i] === '[') bracket++;
      else if (s[i] === ']') bracket = Math.max(0, bracket - 1);
      cur += s[i];
    }
    exprs.push(cur.trim());
    return { exprs, ops };
  }

  function flipRelOp(op) {
    if (op === '<') return '>';
    if (op === '<=') return '>=';
    if (op === '>') return '<';
    if (op === '>=') return '<=';
    return op;
  }

  function buildSingleComparisonCond(leftStr, op, rightStr, paramKey, knownFuncKeys) {
    const lClean = leftStr.replace(/^\(\s*([a-zA-Z])\s*\)$/, '$1').trim();
    const rClean = rightStr.replace(/^\(\s*([a-zA-Z])\s*\)$/, '$1').trim();

    if (lClean === paramKey && rClean !== paramKey) {
      const boundAst = parseLatexExpr(rightStr, knownFuncKeys);
      if (op === '<' || op === '<=') {
        return { kind: 'interval', lowerAst: null, lowerInc: false, upperAst: boundAst, upperInc: op === '<=', boundAsts: [boundAst] };
      }
      if (op === '>' || op === '>=') {
        return { kind: 'interval', lowerAst: boundAst, lowerInc: op === '>=', upperAst: null, upperInc: false, boundAsts: [boundAst] };
      }
      if (op === '=') {
        return { kind: 'point', pointAst: boundAst, boundAsts: [boundAst] };
      }
      if (op === '!=') {
        return { kind: 'not_point', pointAst: boundAst, boundAsts: [boundAst] };
      }
    }

    if (rClean === paramKey && lClean !== paramKey) {
      return buildSingleComparisonCond(rightStr, flipRelOp(op), leftStr, paramKey, knownFuncKeys);
    }

    const lhsAst = parseLatexExpr(leftStr, knownFuncKeys);
    const rhsAst = parseLatexExpr(rightStr, knownFuncKeys);
    return { kind: 'general_rel', lhsAst, op, rhsAst, boundAsts: [] };
  }

  function parsePiecewiseCondition(condRaw, paramKey, knownFuncKeys) {
    if (!condRaw || !condRaw.trim()) {
      return { kind: 'else', boundAsts: [] };
    }

    let s = unwrapDecorations(condRaw).trim();

    // Extreu comandes \text{...}: converteix conjuncions/disjuncions ('o', 'i') i detecta 'altrament'
    let hasElseWord = false;
    let unpacked = '';
    for (let i = 0; i < s.length;) {
      let matchedCmd = null;
      for (const cmd of ['\\text', '\\textrm', '\\textit', '\\textbf']) {
        if (s.startsWith(cmd, i) && !/[a-zA-Z]/.test(s[i + cmd.length] || '')) {
          matchedCmd = cmd;
          break;
        }
      }
      if (matchedCmd) {
        const br = extractBraced(s, i + matchedCmd.length);
        if (br) {
          const txt = br.content.trim().toLowerCase();
          if (/(altrament|contrari|resta|si\s*no|otherwise|else)/i.test(txt)) {
            hasElseWord = true;
          } else if (txt === 'o' || txt === 'or') {
            unpacked += ' \\cup ';
          } else if (txt === 'i' || txt === 'and') {
            unpacked += ' \\cap ';
          } else {
            // Conserva text que pugui contenir desigualtats escrites dins de mode text (ex: \text{si x < 1})!
            const strippedLead = br.content
              .replace(/^\s*(?:si|per\s+a|per|quan|amb|on)\b\s*/i, '')
              .trim();
            if (/[<>=\d]/.test(strippedLead)) {
              unpacked += ' ' + strippedLead + ' ';
            } else {
              unpacked += ' ';
            }
          }
          i = br.end;
          continue;
        }
      }
      unpacked += s[i];
      i++;
    }

    unpacked = unpacked
      .replace(/\\(?:qquad|quad|enspace|;|,|:|!)/g, ' ')
      .replace(/^\s*(?:,\s*)?(?:si|per\s+a|per|quan|amb|on)\b\s*:?\s*/i, '')
      .trim();

    if (!unpacked || (hasElseWord && !/[<>=]|\\(?:le|ge|ne|in)/.test(unpacked))) {
      return { kind: 'else', boundAsts: [] };
    }

    // Disjunció (o / \cup / \lor)
    if (/\\(?:cup|lor)(?![a-zA-Z])/.test(unpacked)) {
      const orParts = unpacked.split(/\\(?:cup|lor)(?![a-zA-Z])/).map(p => p.trim()).filter(Boolean);
      if (orParts.length > 1) {
        const parsedParts = orParts.map(p => {
          // Si la segona part és un interval nu "(1, +\infty)" hereta "x \in "
          if (/^[\[\(\]]/.test(p) && !p.includes('\\in')) {
            return parsePiecewiseCondition(`${paramKey} \\in ${p}`, paramKey, knownFuncKeys);
          }
          return parsePiecewiseCondition(p, paramKey, knownFuncKeys);
        });
        return {
          kind: 'or',
          parts: parsedParts,
          boundAsts: parsedParts.flatMap(p => p.boundAsts || [])
        };
      }
    }

    // Conjunció (i / \cap / \land)
    if (/\\(?:cap|land)(?![a-zA-Z])/.test(unpacked)) {
      const andParts = unpacked.split(/\\(?:cap|land)(?![a-zA-Z])/).map(p => p.trim()).filter(Boolean);
      if (andParts.length > 1) {
        const parsedParts = andParts.map(p => parsePiecewiseCondition(p, paramKey, knownFuncKeys));
        return {
          kind: 'and',
          parts: parsedParts,
          boundAsts: parsedParts.flatMap(p => p.boundAsts || [])
        };
      }
    }

    // Pertinença a conjunt o interval: x \in [a, b), x \in (-\infty, 1], x \in \mathbb{R} - \{2\}
    const inMatch = unpacked.match(/^([a-zA-Z])\s*\\(in|notin)\s*([\s\S]+)$/);
    if (inMatch && inMatch[1] === paramKey) {
      const isNeg = inMatch[2] === 'notin';
      const setStr = inMatch[3].replace(/\\left|\\right/g, '').trim();

      // Cas R - {a, b}
      const rMinusMatch = setStr.match(/^\\mathbb\{R\}\s*(?:-|\\\setminus)\s*\\?\{([^}]*)\\?\}$/);
      if (rMinusMatch) {
        const pts = rMinusMatch[1].split(',').map(x => x.trim()).filter(Boolean).map(x => parseLatexExpr(x, knownFuncKeys));
        const conds = pts.map(ptAst => ({ kind: isNeg ? 'point' : 'not_point', pointAst: ptAst, boundAsts: [ptAst] }));
        if (conds.length === 1) return conds[0];
        return {
          kind: isNeg ? 'or' : 'and',
          parts: conds,
          boundAsts: pts
        };
      }

      // Cas Interval [a, b], (a, b], ]a, b[, etc.
      const intvMatch = setStr.match(/^([\[\(\]])\s*([\s\S]+?)\s*([\]\)\[])$/);
      if (intvMatch) {
        const lBracket = intvMatch[1];
        const innerIntv = intvMatch[2];
        const rBracket = intvMatch[3];
        const lowerInc = lBracket === '[';
        const upperInc = rBracket === ']';

        // Separa límit inferior i superior per ';' o per ',' de nivell 0
        let sepIdx = innerIntv.indexOf(';');
        if (sepIdx === -1) {
          let pDepth = 0, bDepth = 0;
          for (let k = 0; k < innerIntv.length; k++) {
            if (innerIntv[k] === '{') bDepth++;
            else if (innerIntv[k] === '}') bDepth = Math.max(0, bDepth - 1);
            else if (innerIntv[k] === '(') pDepth++;
            else if (innerIntv[k] === ')') pDepth = Math.max(0, pDepth - 1);
            else if (innerIntv[k] === ',' && pDepth === 0 && bDepth === 0) {
              sepIdx = k;
              break;
            }
          }
        }
        if (sepIdx !== -1) {
          const lowRaw = innerIntv.slice(0, sepIdx).trim();
          const highRaw = innerIntv.slice(sepIdx + 1).trim();
          const lowerAst = /-\s*\\infty/.test(lowRaw) ? null : parseLatexExpr(lowRaw, knownFuncKeys);
          const upperAst = /\\infty/.test(highRaw) ? null : parseLatexExpr(highRaw, knownFuncKeys);
          const boundAsts = [lowerAst, upperAst].filter(Boolean);
          const base = { kind: 'interval', lowerAst, lowerInc, upperAst, upperInc, boundAsts };
          return isNeg ? { kind: 'not', inner: base, boundAsts } : base;
        }
      }
    }

    // Desigualtats simples o encadenades: x < 1, -2 <= x < 3, x != 2, x = 2
    const { exprs, ops } = tokenizeTopLevelRelOps(unpacked);
    if (ops.length === 1 && exprs.length === 2 && exprs[0] && exprs[1]) {
      return buildSingleComparisonCond(exprs[0], ops[0], exprs[1], paramKey, knownFuncKeys);
    }
    if (ops.length === 2 && exprs.length === 3 && exprs[0] && exprs[1] && exprs[2]) {
      const midClean = exprs[1].replace(/^\(\s*([a-zA-Z])\s*\)$/, '$1').trim();
      if (midClean === paramKey) {
        if ((ops[0] === '<' || ops[0] === '<=') && (ops[1] === '<' || ops[1] === '<=')) {
          const lowerAst = parseLatexExpr(exprs[0], knownFuncKeys);
          const upperAst = parseLatexExpr(exprs[2], knownFuncKeys);
          return {
            kind: 'interval',
            lowerAst,
            lowerInc: ops[0] === '<=',
            upperAst,
            upperInc: ops[1] === '<=',
            boundAsts: [lowerAst, upperAst]
          };
        }
        if ((ops[0] === '>' || ops[0] === '>=') && (ops[1] === '>' || ops[1] === '>=')) {
          const upperAst = parseLatexExpr(exprs[0], knownFuncKeys);
          const lowerAst = parseLatexExpr(exprs[2], knownFuncKeys);
          return {
            kind: 'interval',
            lowerAst,
            lowerInc: ops[1] === '>=',
            upperAst,
            upperInc: ops[0] === '>=',
            boundAsts: [lowerAst, upperAst]
          };
        }
      }
      const c1 = buildSingleComparisonCond(exprs[0], ops[0], exprs[1], paramKey, knownFuncKeys);
      const c2 = buildSingleComparisonCond(exprs[1], ops[1], exprs[2], paramKey, knownFuncKeys);
      return { kind: 'and', parts: [c1, c2], boundAsts: [...(c1.boundAsts || []), ...(c2.boundAsts || [])] };
    }

    return { kind: 'else', boundAsts: [] };
  }

  function collectCondFreeVars(cond, boundParams, knownFuncKeys, outMap) {
    if (!cond) return outMap;
    switch (cond.kind) {
      case 'interval':
        if (cond.lowerAst) collectFreeVars(cond.lowerAst, boundParams, knownFuncKeys, outMap);
        if (cond.upperAst) collectFreeVars(cond.upperAst, boundParams, knownFuncKeys, outMap);
        break;
      case 'point':
      case 'not_point':
        if (cond.pointAst) collectFreeVars(cond.pointAst, boundParams, knownFuncKeys, outMap);
        break;
      case 'general_rel':
        collectFreeVars(cond.lhsAst, boundParams, knownFuncKeys, outMap);
        collectFreeVars(cond.rhsAst, boundParams, knownFuncKeys, outMap);
        break;
      case 'and':
      case 'or':
        for (const p of cond.parts) collectCondFreeVars(p, boundParams, knownFuncKeys, outMap);
        break;
      case 'not':
        collectCondFreeVars(cond.inner, boundParams, knownFuncKeys, outMap);
        break;
    }
    return outMap;
  }

  function parsePiecewiseFunctionRhs(rhsRaw, params, knownFuncKeys) {
    if (params.length !== 1) return null;
    const inner = extractPiecewiseCasesInner(rhsRaw);
    if (inner === null) return null;

    const paramKey = params[0];
    const rowStrings = splitCasesRowsTopLevel(inner);
    if (rowStrings.length === 0) return null;

    const branches = [];
    for (const rowStr of rowStrings) {
      const { exprRaw, condRaw } = splitPiecewiseRowExprAndCond(rowStr);
      if (!exprRaw) continue;
      const exprAst = parseLatexExpr(exprRaw, knownFuncKeys);
      const cond = parsePiecewiseCondition(condRaw, paramKey, knownFuncKeys);
      branches.push({
        exprRaw,
        condRaw,
        exprAst,
        cond
      });
    }

    if (branches.length === 0) return null;
    return branches;
  }

  function evalPiecewiseCondition(cond, xVal, paramKey, env, depth) {
    if (!cond || depth > 40) return false;
    const tol = 1e-11 * Math.max(1, Math.abs(xVal));
    switch (cond.kind) {
      case 'else':
        return true;
      case 'point': {
        const c = evalAst(cond.pointAst, env, depth + 1);
        if (!Number.isFinite(c)) return false;
        return Math.abs(xVal - c) <= tol;
      }
      case 'not_point': {
        const c = evalAst(cond.pointAst, env, depth + 1);
        if (!Number.isFinite(c)) return false;
        return Math.abs(xVal - c) > tol;
      }
      case 'interval': {
        if (cond.lowerAst) {
          const lo = evalAst(cond.lowerAst, env, depth + 1);
          if (!Number.isFinite(lo)) return false;
          if (cond.lowerInc ? xVal < lo - tol : xVal <= lo + tol) return false;
        }
        if (cond.upperAst) {
          const hi = evalAst(cond.upperAst, env, depth + 1);
          if (!Number.isFinite(hi)) return false;
          if (cond.upperInc ? xVal > hi + tol : xVal >= hi - tol) return false;
        }
        return true;
      }
      case 'general_rel': {
        const subVars = new Map(env.vars);
        subVars.set(paramKey, xVal);
        const subEnv = { ...env, vars: subVars };
        const l = evalAst(cond.lhsAst, subEnv, depth + 1);
        const r = evalAst(cond.rhsAst, subEnv, depth + 1);
        if (!Number.isFinite(l) || !Number.isFinite(r)) return false;
        switch (cond.op) {
          case '<': return l < r - tol;
          case '<=': return l <= r + tol;
          case '>': return l > r + tol;
          case '>=': return l >= r - tol;
          case '=': return Math.abs(l - r) <= tol;
          case '!=': return Math.abs(l - r) > tol;
        }
        return false;
      }
      case 'and':
        return cond.parts.every(p => evalPiecewiseCondition(p, xVal, paramKey, env, depth + 1));
      case 'or':
        return cond.parts.some(p => evalPiecewiseCondition(p, xVal, paramKey, env, depth + 1));
      case 'not':
        return !evalPiecewiseCondition(cond.inner, xVal, paramKey, env, depth + 1);
    }
    return false;
  }

  function findMatchingPiecewiseBranch(fnDef, xVal, env, depth) {
    const paramKey = fnDef.params[0];
    for (let i = 0; i < fnDef.branches.length; i++) {
      const br = fnDef.branches[i];
      if (evalPiecewiseCondition(br.cond, xVal, paramKey, env, depth + 1)) {
        return { branch: br, branchIndex: i };
      }
    }
    return null;
  }

  function getPiecewiseNumericBreakpoints(fnDef, env, depth = 0) {
    if (!fnDef || !fnDef.isPiecewise) return [];
    const rawPts = [];
    for (const br of fnDef.branches) {
      for (const bAst of br.cond.boundAsts || []) {
        const val = evalAst(bAst, env, depth + 1);
        if (Number.isFinite(val)) {
          const snapped = Math.abs(val - Math.round(val)) < 1e-10 ? Math.round(val) : val;
          if (!rawPts.some(p => Math.abs(p - snapped) < 1e-7)) {
            rawPts.push(snapped);
          }
        }
      }
    }
    rawPts.sort((a, b) => a - b);
    return rawPts;
  }

  function evalOrder4Derivative(callSingleVarFn, x0, derivOrder) {
    if (derivOrder === 1) {
      const h = Math.max(1e-5, Math.abs(x0) * 1e-5);
      const fp1 = callSingleVarFn(x0 + h);
      const fm1 = callSingleVarFn(x0 - h);
      const fp2 = callSingleVarFn(x0 + 2 * h);
      const fm2 = callSingleVarFn(x0 - 2 * h);
      return (-fp2 + 8 * fp1 - 8 * fm1 + fm2) / (12 * h);
    }
    if (derivOrder === 2) {
      const h2 = Math.max(1e-3, Math.abs(x0) * 1e-3);
      const f0 = callSingleVarFn(x0);
      const fp1 = callSingleVarFn(x0 + h2);
      const fm1 = callSingleVarFn(x0 - h2);
      const fp2 = callSingleVarFn(x0 + 2 * h2);
      const fm2 = callSingleVarFn(x0 - 2 * h2);
      const d2 = (-fp2 + 16 * fp1 - 30 * f0 + 16 * fm1 - fm2) / (12 * h2 * h2);
      return Math.abs(d2 - Math.round(d2)) < 1e-6 ? Math.round(d2) : d2;
    }
    return NaN;
  }

  function evalUserFunctionCall(fnDef, argVals, derivOrder, env, depth) {
    if (depth > 40) return NaN;

    if (!fnDef.isPiecewise) {
      const callFnAt = (vals) => {
        const subVars = new Map(env.vars);
        fnDef.params.forEach((p, idx) => subVars.set(p, vals[idx]));
        return evalAst(fnDef.ast, { ...env, vars: subVars }, depth + 1);
      };
      if (derivOrder === 0) return callFnAt(argVals);
      if (fnDef.params.length === 1 && (derivOrder === 1 || derivOrder === 2)) {
        return evalOrder4Derivative(x => callFnAt([x]), argVals[0], derivOrder);
      }
      return NaN;
    }

    // Funció definida a trossos (1 variable)
    const x0 = argVals[0];
    const paramKey = fnDef.params[0];

    if (derivOrder === 0) {
      const hit = findMatchingPiecewiseBranch(fnDef, x0, env, depth + 1);
      if (!hit) return NaN;
      const subVars = new Map(env.vars);
      subVars.set(paramKey, x0);
      return evalAst(hit.branch.exprAst, { ...env, vars: subVars }, depth + 1);
    }

    if (derivOrder === 1 || derivOrder === 2) {
      const bps = getPiecewiseNumericBreakpoints(fnDef, env, depth + 1);
      const nearBp = bps.find(c => Math.abs(x0 - c) <= 1e-9);

      if (nearBp === undefined) {
        // Punt interior d'un tros: deriva directament l'expressió d'aquest tros sense creuar fronteres!
        const hit = findMatchingPiecewiseBranch(fnDef, x0, env, depth + 1);
        if (!hit || hit.branch.cond.kind === 'point') return NaN;
        const evalBranchExpr = (x) => {
          const subVars = new Map(env.vars);
          subVars.set(paramKey, x);
          return evalAst(hit.branch.exprAst, { ...env, vars: subVars }, depth + 1);
        };
        return evalOrder4Derivative(evalBranchExpr, x0, derivOrder);
      }

      // Punt frontera c: només és derivable si primer és contínua en c i les derivades laterals coincideixen!
      const c = nearBp;
      const fAtC = evalUserFunctionCall(fnDef, [c], 0, env, depth + 1);
      const limL = evalLateralLimitAt(x => evalUserFunctionCall(fnDef, [x], 0, env, depth + 1), c, -1);
      const limR = evalLateralLimitAt(x => evalUserFunctionCall(fnDef, [x], 0, env, depth + 1), c, 1);
      if (
        !Number.isFinite(fAtC) || !Number.isFinite(limL) || !Number.isFinite(limR) ||
        Math.abs(limL - limR) > 1e-4 * (1 + Math.abs(limL)) ||
        Math.abs(fAtC - limL) > 1e-4 * (1 + Math.abs(fAtC))
      ) {
        return NaN;
      }

      const dLeft = evalLateralLimitAt(x => evalUserFunctionCall(fnDef, [x], derivOrder, env, depth + 1), c, -1);
      const dRight = evalLateralLimitAt(x => evalUserFunctionCall(fnDef, [x], derivOrder, env, depth + 1), c, 1);
      if (Number.isFinite(dLeft) && Number.isFinite(dRight) && Math.abs(dLeft - dRight) <= 1e-4 * (1 + Math.abs(dLeft))) {
        const avgD = (dLeft + dRight) / 2;
        return Math.abs(avgD - Math.round(avgD)) < 1e-7 ? Math.round(avgD) : avgD;
      }
      return NaN;
    }

    return NaN;
  }

  function buildPiecewiseAnalysis(fnDef, env) {
    if (!fnDef || !fnDef.isPiecewise) return null;
    const bps = getPiecewiseNumericBreakpoints(fnDef, env, 0);
    const evalFn = (x) => evalUserFunctionCall(fnDef, [x], 0, env, 0);

    const breakpoints = bps.map(c => {
      const leftLimit = evalLateralLimitAt(evalFn, c, -1);
      const rightLimit = evalLateralLimitAt(evalFn, c, 1);
      const valueAt = evalFn(c);

      let status = 'boundary';
      let isDifferentiable = false;

      if (Number.isFinite(leftLimit) && Number.isFinite(rightLimit)) {
        if (Math.abs(leftLimit - rightLimit) <= 1e-4 * (1 + Math.abs(leftLimit))) {
          if (Number.isFinite(valueAt) && Math.abs(valueAt - leftLimit) <= 1e-4 * (1 + Math.abs(leftLimit))) {
            status = 'continuous';
            const dC = evalUserFunctionCall(fnDef, [c], 1, env, 0);
            isDifferentiable = Number.isFinite(dC);
          } else {
            status = 'removable';
          }
        } else {
          status = 'jump';
        }
      } else {
        const rawL = evalFn(c - 1e-5);
        const rawR = evalFn(c + 1e-5);
        if ((Number.isFinite(rawL) && Math.abs(rawL) > 500) || (Number.isFinite(rawR) && Math.abs(rawR) > 500)) {
          status = 'asymptotic';
        } else {
          status = 'boundary';
        }
      }

      // Punts visuals (● ple si pertany a la imatge, ○ buit si és extrem obert / forat)
      const dots = [];
      if (Number.isFinite(valueAt)) {
        dots.push({ x: c, y: valueAt, filled: true });
      }
      if (Number.isFinite(leftLimit) && (!Number.isFinite(valueAt) || Math.abs(leftLimit - valueAt) > 1e-4)) {
        dots.push({ x: c, y: leftLimit, filled: false });
      }
      if (
        Number.isFinite(rightLimit) &&
        (!Number.isFinite(valueAt) || Math.abs(rightLimit - valueAt) > 1e-4) &&
        (!Number.isFinite(leftLimit) || Math.abs(rightLimit - leftLimit) > 1e-4)
      ) {
        dots.push({ x: c, y: rightLimit, filled: false });
      }

      return {
        x: c,
        xFormatted: formatValueRich(c),
        leftLimit,
        leftFormatted: formatValueRich(leftLimit),
        rightLimit,
        rightFormatted: formatValueRich(rightLimit),
        valueAt,
        valueFormatted: formatValueRich(valueAt),
        status, // 'continuous' | 'jump' | 'removable' | 'asymptotic' | 'boundary'
        isDifferentiable,
        dots
      };
    });

    return {
      branchCount: fnDef.branches.length,
      breakpoints
    };
  }

  function astContainsPm(ast) {
    if (!ast) return false;
    if (ast.type === 'UnaryPm' || ast.type === 'BinaryPm') return true;
    for (const k of Object.keys(ast)) {
      const v = ast[k];
      if (Array.isArray(v)) {
        if (v.some(astContainsPm)) return true;
      } else if (v && typeof v === 'object' && v.type) {
        if (astContainsPm(v)) return true;
      }
    }
    return false;
  }

  // ============================================================================
  // 5. Solucionador d'equacions d'1 incògnita i sistemes d'equacions NxN
  // ============================================================================

  // Comprova si f(x) = lhs(x) - rhs(x) és polinòmica de grau <= 2 i n'extreu coeficients exactes a*x^2 + b*x + c = 0
  function countVarInAst(ast, varKey) {
    if (!ast || typeof ast !== 'object') return 0;
    switch (ast.type) {
      case 'Number':
      case 'Const':
        return 0;
      case 'Var':
        return ast.key === varKey ? 1 : 0;
      case 'Unary':
      case 'UnaryPm':
      case 'Factorial':
      case 'Degree':
        return countVarInAst(ast.arg, varKey);
      case 'Binary':
      case 'BinaryPm':
        return countVarInAst(ast.left, varKey) + countVarInAst(ast.right, varKey);
      case 'Binom':
        return countVarInAst(ast.n, varKey) + countVarInAst(ast.k, varKey);
      case 'Sqrt':
        return (ast.degree ? countVarInAst(ast.degree, varKey) : 0) + countVarInAst(ast.radicand, varKey);
      case 'FuncCall':
      case 'IdentOrCall': {
        let total = ast.type === 'IdentOrCall' && ast.key === varKey ? 1 : 0;
        if (ast.base) total += countVarInAst(ast.base, varKey);
        if (Array.isArray(ast.args)) {
          for (const a of ast.args) total += countVarInAst(a, varKey);
        }
        return total;
      }
      case 'Vector':
        return (ast.items || []).reduce((acc, it) => acc + countVarInAst(it, varKey), 0);
      case 'Matrix':
      case 'DetMatrix': {
        let total = 0;
        for (const r of ast.rows || []) {
          for (const c of r) total += countVarInAst(c, varKey);
        }
        return total;
      }
      case 'SumProd':
        return countVarInAst(ast.start, varKey)
          + countVarInAst(ast.end, varKey)
          + (ast.boundKey === varKey ? 0 : countVarInAst(ast.body, varKey));
      case 'Integral':
        return (ast.lower ? countVarInAst(ast.lower, varKey) : 0)
          + (ast.upper ? countVarInAst(ast.upper, varKey) : 0)
          + (ast.boundKey === varKey ? 0 : countVarInAst(ast.body, varKey));
      case 'Limit':
        return countVarInAst(ast.target, varKey)
          + (ast.boundKey === varKey ? 0 : countVarInAst(ast.body, varKey));
      case 'EvalBar': {
        let total = ast.expr ? countVarInAst(ast.expr, varKey) : 0;
        if (ast.lower) total += countVarInAst(ast.lower, varKey);
        if (ast.upper) total += countVarInAst(ast.upper, varKey);
        if (Array.isArray(ast.assigns)) {
          for (const asg of ast.assigns) total += countVarInAst(asg.expr, varKey);
        }
        return total;
      }
      default:
        // Conservador: si apareix en altres nodes complexos (DerivOp, Nabla, etc.), evita inversió directa
        return 2;
    }
  }

  function solveBySingleOccurrenceInversion(lhsAst, rhsAst, unknownKey, baseEnv) {
    if (!lhsAst || !rhsAst || !unknownKey || !baseEnv) return null;
    const cL = countVarInAst(lhsAst, unknownKey);
    const cR = countVarInAst(rhsAst, unknownKey);

    let exprAst = null;
    let constAst = null;
    if (cL === 1 && cR === 0) {
      exprAst = lhsAst;
      constAst = rhsAst;
    } else if (cR === 1 && cL === 0) {
      exprAst = rhsAst;
      constAst = lhsAst;
    } else {
      return null;
    }

    const initTarget = evalAst(constAst, baseEnv);
    if (typeof initTarget !== 'number' || !Number.isFinite(initTarget)) return null;

    const invert = (node, targetVal) => {
      if (!node || !Number.isFinite(targetVal)) return null;

      if (node.type === 'Var' && node.key === unknownKey) {
        return { status: 'solved', roots: [targetVal] };
      }

      if (node.type === 'Unary' && node.op === '-') {
        return invert(node.arg, -targetVal);
      }

      if (node.type === 'Sqrt') {
        const deg = node.degree ? evalAst(node.degree, baseEnv) : 2;
        if (typeof deg !== 'number' || !Number.isFinite(deg) || Math.abs(deg) < 1e-12) return null;
        const intDeg = Math.round(deg);
        const isIntDeg = Math.abs(deg - intDeg) < 1e-12;
        if (isIntDeg && intDeg % 2 === 0 && targetVal < -1e-12) {
          return { status: 'no_real', roots: [], reason: 'Arrel parella igualada a un nombre negatiu' };
        }
        if (targetVal < 0 && (!isIntDeg || intDeg % 2 === 0)) {
          return { status: 'no_real', roots: [], reason: 'Arrel real igualada a un nombre negatiu' };
        }
        const rhsVal = Math.abs(targetVal) < 1e-14 ? 0 : Math.pow(targetVal, deg);
        if (!Number.isFinite(rhsVal)) return null;
        return invert(node.radicand, rhsVal);
      }

      if (node.type === 'FuncCall' && Array.isArray(node.args) && node.args.length === 1) {
        const arg = node.args[0];
        if (countVarInAst(arg, unknownKey) !== 1) return null;
        if (node.name === 'exp') {
          if (targetVal <= 0) {
            return { status: 'no_real', roots: [], reason: 'Exponencial real mai pot ser ≤ 0' };
          }
          return invert(arg, Math.log(targetVal));
        }
        if (node.name === 'ln') {
          return invert(arg, Math.exp(targetVal));
        }
        if (node.name === 'log') {
          let baseVal = 10;
          if (node.base) {
            if (countVarInAst(node.base, unknownKey) > 0) return null;
            baseVal = evalAst(node.base, baseEnv);
          }
          if (typeof baseVal !== 'number' || !Number.isFinite(baseVal) || baseVal <= 0 || Math.abs(baseVal - 1) < 1e-12) {
            return null;
          }
          return invert(arg, Math.pow(baseVal, targetVal));
        }
        if (node.name === 'sqrt') {
          if (targetVal < -1e-12) {
            return { status: 'no_real', roots: [], reason: 'Arrel quadrada igualada a un nombre negatiu' };
          }
          return invert(arg, targetVal * targetVal);
        }
        if (node.name === 'abs') {
          if (targetVal < -1e-12) {
            return { status: 'no_real', roots: [], reason: 'Valor absolut igualat a un nombre negatiu' };
          }
          if (Math.abs(targetVal) <= 1e-12) {
            return invert(arg, 0);
          }
          const rPos = invert(arg, targetVal);
          const rNeg = invert(arg, -targetVal);
          if (!rPos && !rNeg) return null;
          const combined = [];
          if (rPos && rPos.status === 'solved') combined.push(...rPos.roots);
          if (rNeg && rNeg.status === 'solved') combined.push(...rNeg.roots);
          if (combined.length > 0) return { status: 'solved', roots: combined };
          if ((rPos && rPos.status === 'no_real') && (rNeg && rNeg.status === 'no_real')) {
            return { status: 'no_real', roots: [], reason: rPos.reason || rNeg.reason };
          }
          return null;
        }
        return null;
      }

      if (node.type === 'Binary') {
        const cLeft = countVarInAst(node.left, unknownKey);
        const cRight = countVarInAst(node.right, unknownKey);
        const leftIsVarSide = cLeft === 1 && cRight === 0;
        const rightIsVarSide = cRight === 1 && cLeft === 0;
        if (!leftIsVarSide && !rightIsVarSide) return null;

        const varChild = leftIsVarSide ? node.left : node.right;
        const otherVal = evalAst(leftIsVarSide ? node.right : node.left, baseEnv);
        if (typeof otherVal !== 'number' || !Number.isFinite(otherVal)) return null;

        if (node.op === '+') {
          return invert(varChild, targetVal - otherVal);
        }
        if (node.op === '-') {
          return invert(varChild, leftIsVarSide ? (targetVal + otherVal) : (otherVal - targetVal));
        }
        if (node.op === '*') {
          if (Math.abs(otherVal) < 1e-14) {
            return Math.abs(targetVal) < 1e-12
              ? { status: 'identity', roots: [] }
              : { status: 'contradiction', roots: [] };
          }
          return invert(varChild, targetVal / otherVal);
        }
        if (node.op === '/') {
          if (leftIsVarSide) {
            if (Math.abs(otherVal) < 1e-14) return null;
            return invert(varChild, targetVal * otherVal);
          }
          if (Math.abs(otherVal) < 1e-14) {
            return Math.abs(targetVal) < 1e-12 ? null : { status: 'no_real', roots: [], reason: 'Numerador nul igualat a un valor no nul' };
          }
          if (Math.abs(targetVal) < 1e-14) {
            return { status: 'no_real', roots: [], reason: 'Fracció de numerador no nul igualada a 0' };
          }
          return invert(varChild, otherVal / targetVal);
        }
        if (node.op === '^') {
          if (leftIsVarSide) {
            // u ^ exp = targetVal
            const expVal = otherVal;
            if (Math.abs(expVal) < 1e-12) {
              return Math.abs(targetVal - 1) < 1e-12
                ? { status: 'identity', roots: [] }
                : { status: 'contradiction', roots: [] };
            }
            if (Math.abs(targetVal) < 1e-14) {
              return expVal > 0 ? invert(varChild, 0) : { status: 'no_real', roots: [], reason: 'Potència igualada a 0 amb exponent ≤ 0' };
            }
            const intExp = Math.round(expVal);
            const isIntExp = Math.abs(expVal - intExp) < 1e-11;
            if (isIntExp) {
              if (intExp % 2 === 0) {
                if (targetVal < 0) {
                  return { status: 'no_real', roots: [], reason: `Potència parella (^${intExp}) igualada a un valor negatiu` };
                }
                const rootMag = Math.pow(targetVal, 1 / intExp);
                const rPos = invert(varChild, rootMag);
                const rNeg = invert(varChild, -rootMag);
                const roots = [];
                if (rPos && rPos.status === 'solved') roots.push(...rPos.roots);
                if (rNeg && rNeg.status === 'solved') roots.push(...rNeg.roots);
                if (roots.length > 0) return { status: 'solved', roots };
                if (rPos && rPos.status === 'no_real' && rNeg && rNeg.status === 'no_real') {
                  return { status: 'no_real', roots: [], reason: rPos.reason || rNeg.reason };
                }
                return null;
              }
              const signedRoot = Math.sign(targetVal) * Math.pow(Math.abs(targetVal), 1 / intExp);
              return invert(varChild, signedRoot);
            }

            // Exponent no enter (ex: 2.8 o fracció explícita 2/3)
            if (targetVal < 0) {
              const explicitFrac = isExponentExplicitFraction(node.right);
              const frac = explicitFrac ? floatToNiceFraction(expVal, 99, 1e-9) : null;
              if (explicitFrac && frac && frac.den % 2 === 1 && Math.abs(frac.num) % 2 === 1) {
                const signedRoot = -Math.pow(Math.abs(targetVal), 1 / expVal);
                return invert(varChild, signedRoot);
              }
              return { status: 'no_real', roots: [], reason: 'Potència d\'exponent real igualada a un nombre negatiu' };
            }
            return invert(varChild, Math.pow(targetVal, 1 / expVal));
          } else {
            // base ^ u = targetVal
            const baseVal = otherVal;
            if (baseVal <= 0) return null;
            if (Math.abs(baseVal - 1) < 1e-12) {
              return Math.abs(targetVal - 1) < 1e-12
                ? { status: 'identity', roots: [] }
                : { status: 'contradiction', roots: [] };
            }
            if (targetVal <= 0) {
              return { status: 'no_real', roots: [], reason: 'Exponencial de base positiva mai pot ser ≤ 0' };
            }
            return invert(varChild, Math.log(targetVal) / Math.log(baseVal));
          }
        }
      }

      return null;
    };

    const res = invert(exprAst, initTarget);
    if (!res) return null;
    if (res.status === 'solved' && res.roots.length > 0) {
      const scale = Math.max(1, Math.abs(initTarget));
      const verified = [];
      for (let r of res.roots) {
        if (!Number.isFinite(r)) continue;
        const subVars = new Map(baseEnv.vars);
        subVars.set(unknownKey, r);
        const testEnv = { ...baseEnv, vars: subVars };
        const lv = evalAst(lhsAst, testEnv);
        const rv = evalAst(rhsAst, testEnv);
        if (typeof lv === 'number' && typeof rv === 'number' && Number.isFinite(lv) && Number.isFinite(rv)) {
          if (Math.abs(lv - rv) <= 1e-6 * Math.max(scale, Math.abs(lv), Math.abs(rv))) {
            if (Math.abs(r) < 1e-11) r = 0;
            if (!verified.some(v => Math.abs(v - r) < 1e-7 * Math.max(1, Math.abs(r)))) {
              verified.push(r);
            }
          }
        }
      }
      if (verified.length > 0) {
        verified.sort((u, v) => u - v);
        return { status: 'solved', roots: verified };
      }
      return { status: 'no_real', roots: [], reason: 'La solució candidata queda fora del domini real' };
    }
    return res;
  }

  function solveSingleVariableEquation(diffFn, eqCtx = null) {
    // 0) Detecta identitats algebraiques (ex: (x^2-9)/(x^2-3x) = (x+3)/x o (x+1)^2 = x^2+2x+1)
    const idProbePts = [-3.73, -1.41, -0.37, 0.61, 1.83, 4.19];
    const idProbeVals = idProbePts.map(x => diffFn(x)).filter(Number.isFinite);
    if (idProbeVals.length >= 4 && idProbeVals.every(v => Math.abs(v) < 1e-8)) {
      return { status: 'identity', roots: [] };
    }

    // 0.5) Inversió analítica exacta quan la incògnita apareix una sola vegada
    let inversionNoReal = null;
    if (eqCtx && eqCtx.lhs && eqCtx.rhs && eqCtx.unknownKey && eqCtx.baseEnv) {
      const inv = solveBySingleOccurrenceInversion(eqCtx.lhs, eqCtx.rhs, eqCtx.unknownKey, eqCtx.baseEnv);
      if (inv) {
        if (inv.status === 'solved' || inv.status === 'identity' || inv.status === 'contradiction') {
          return inv;
        }
        if (inv.status === 'no_real') {
          inversionNoReal = inv;
          return inv;
        }
      }
    }

    // 1) Mostreig en 5 punts per detectar si és lineal o quadràtica exacta!
    const pts = [-2, -1, 0, 1, 2];
    const vals = pts.map(x => diffFn(x));
    if (vals.every(Number.isFinite)) {
      // Polinomi interpolador a 0, 1, -1: f(0) = c, f(1) = a+b+c, f(-1) = a-b+c
      const c = vals[2];
      const a = (vals[3] + vals[1] - 2 * c) / 2;
      const b = (vals[3] - vals[1]) / 2;
      // Verifica als altres punts (-2, 2, i un punt no enter 0.37 per descartar falsos positius periòdics!)
      const check2 = a * 4 + b * 2 + c;
      const checkM2 = a * 4 - b * 2 + c;
      const fTest = diffFn(0.37);
      const polyTest = a * (0.37 * 0.37) + b * 0.37 + c;

      if (
        Number.isFinite(fTest) &&
        Math.abs(vals[4] - check2) < 1e-8 &&
        Math.abs(vals[0] - checkM2) < 1e-8 &&
        Math.abs(fTest - polyTest) < 1e-8
      ) {
        // Equació lineal: b*x + c = 0
        if (Math.abs(a) < 1e-10) {
          if (Math.abs(b) < 1e-10) {
            return Math.abs(c) < 1e-9 ? { status: 'identity', roots: [] } : { status: 'contradiction', roots: [] };
          }
          const root = -c / b;
          return { status: 'solved', roots: [root] };
        }
        // Equació de 2n grau: a*x^2 + b*x + c = 0
        const disc = b * b - 4 * a * c;
        if (Math.abs(disc) < 1e-10) {
          return { status: 'solved', roots: [-b / (2 * a)] };
        } else if (disc > 0) {
          const sq = Math.sqrt(disc);
          const r1 = (-b - sq) / (2 * a);
          const r2 = (-b + sq) / (2 * a);
          const sorted = [r1, r2].sort((u, v) => u - v);
          return { status: 'solved', roots: sorted };
        } else {
          const realPart = -b / (2 * a);
          const imagPart = Math.sqrt(-disc) / Math.abs(2 * a);
          return { status: 'no_real', roots: [], complex: { re: realPart, im: imagPart } };
        }
      }
    }

    // 2) Cerca numèrica general d'arrels reals amb malla densa + escales grans/petites
    const roots = [];
    const gridSet = new Set();
    for (let x = -50; x <= 50; x += 0.25) gridSet.add(Number(x.toFixed(6)));
    for (const s of [1e-6, 1e-5, 1e-4, 1e-3, 0.01, 0.05, 0.1, 0.25]) {
      gridSet.add(s);
      gridSet.add(-s);
    }
    for (const L of [60, 80, 100, 150, 250, 500, 1e3, 2500, 1e4, 1e5, 1e6]) {
      gridSet.add(L);
      gridSet.add(-L);
    }
    const grid = [...gridSet].sort((u, v) => u - v);

    const addUniqueRoot = (r) => {
      if (!Number.isFinite(r)) return;
      const fr = diffFn(r);
      if (!Number.isFinite(fr) || Math.abs(fr) > 1e-6) return;
      if (Math.abs(r) < 1e-10) r = 0;
      if (!roots.some(existing => Math.abs(existing - r) < 1e-5 * Math.max(1, Math.abs(r)))) {
        roots.push(r);
      }
    };

    let prevX = null, prevY = NaN;
    let finiteCount = 0;
    let allPos = true;
    let allNeg = true;

    for (const x of grid) {
      const y = diffFn(x);
      if (Number.isFinite(y)) {
        finiteCount++;
        if (Math.abs(y) >= 1e-10) {
          if (y > 0) allNeg = false;
          if (y < 0) allPos = false;
        }
        if (Math.abs(y) < 1e-10) {
          addUniqueRoot(x);
        } else if (Number.isFinite(prevY) && prevY * y < 0) {
          // Bisecció refinada
          let lo = prevX, hi = x, flo = prevY, fhi = y;
          let mid = (lo + hi) / 2;
          let continuous = true;
          for (let it = 0; it < 64; it++) {
            mid = (lo + hi) / 2;
            const fm = diffFn(mid);
            if (!Number.isFinite(fm)) { continuous = false; break; }
            if (Math.abs(fm) < 1e-12 || (hi - lo) < 1e-12 * Math.max(1, Math.abs(mid))) break;
            if (flo * fm <= 0) { hi = mid; fhi = fm; }
            else { lo = mid; flo = fm; }
          }
          // Evita pols verticals (asímptotes com 1/x = 0)
          if (continuous && Math.abs(diffFn(mid)) < 1e-6) {
            addUniqueRoot(mid);
          }
        }
      }
      prevX = x;
      prevY = y;
    }

    if (roots.length > 0) {
      roots.sort((u, v) => u - v);
      return { status: 'solved', roots };
    }

    if (inversionNoReal) return inversionNoReal;
    if (finiteCount >= 4 && (allPos || allNeg)) {
      return { status: 'no_real', roots: [], reason: 'L\'expressió manté el signe en tot el domini explorat' };
    }

    return { status: 'unknown', roots: [] };
  }

  // Comprova si un conjunt d'equacions és lineal en les incògnites [v_0, ..., v_{k-1}] i el resol per Gauss!
  function solveLinearSystem(equations, unknownKeys, baseEnv) {
    const nVars = unknownKeys.length;
    const mEqs = equations.length;
    if (nVars === 0 || mEqs === 0) return null;

    const matrix = [];
    for (const eq of equations) {
      const evalWithVec = (vec) => {
        const subVars = new Map(baseEnv.vars);
        for (let j = 0; j < nVars; j++) subVars.set(unknownKeys[j], vec[j]);
        const env = { ...baseEnv, vars: subVars };
        return evalAst(eq.lhs, env) - evalAst(eq.rhs, env);
      };

      const zeroVec = new Array(nVars).fill(0);
      const c = evalWithVec(zeroVec);
      if (!Number.isFinite(c)) return null;

      const coeffs = [];
      for (let j = 0; j < nVars; j++) {
        const unitVec = new Array(nVars).fill(0);
        unitVec[j] = 1;
        const f1 = evalWithVec(unitVec);
        if (!Number.isFinite(f1)) return null;
        coeffs.push(f1 - c);
      }

      // Verifica que realment sigui lineal provant un vector de control no trivial!
      const testVec = unknownKeys.map((_, idx) => 1.37 + idx * 0.71);
      const fTest = evalWithVec(testVec);
      let linPred = c;
      for (let j = 0; j < nVars; j++) linPred += coeffs[j] * testVec[j];
      if (!Number.isFinite(fTest) || Math.abs(fTest - linPred) > 1e-7) {
        return null; // No és lineal (p. ex. x*y = 6 o x^2 + y^2 = 25)
      }

      // coeffs · x + c = 0  ==>  coeffs · x = -c
      matrix.push([...coeffs, -c]);
    }

    // Eliminació de Gauss-Jordan amb pivotatge parcial
    const R = matrix.map(row => row.slice());
    let pivotRow = 0;
    const pivotColForRow = [];

    for (let col = 0; col < nVars && pivotRow < mEqs; col++) {
      let bestRow = pivotRow;
      let maxAbs = Math.abs(R[pivotRow][col]);
      for (let r = pivotRow + 1; r < mEqs; r++) {
        if (Math.abs(R[r][col]) > maxAbs) {
          maxAbs = Math.abs(R[r][col]);
          bestRow = r;
        }
      }
      if (maxAbs < 1e-10) continue;

      [R[pivotRow], R[bestRow]] = [R[bestRow], R[pivotRow]];
      const piv = R[pivotRow][col];
      for (let j = col; j <= nVars; j++) R[pivotRow][j] /= piv;

      for (let r = 0; r < mEqs; r++) {
        if (r !== pivotRow && Math.abs(R[r][col]) > 1e-12) {
          const factor = R[r][col];
          for (let j = col; j <= nVars; j++) {
            R[r][j] -= factor * R[pivotRow][j];
          }
        }
      }
      pivotColForRow.push({ row: pivotRow, col });
      pivotRow++;
    }

    // Comprova files incompatibles (0 = b amb b != 0 -> Sistema Incompatible!)
    for (let r = pivotRow; r < mEqs; r++) {
      if (Math.abs(R[r][nVars]) > 1e-7) {
        return { status: 'incompatible', values: new Map() };
      }
    }

    // Extreu qualsevol variable que hagi quedat unívocament determinada (encara que el sistema global sigui SCI!)
    const determined = new Map();
    for (const { row, col } of pivotColForRow) {
      let hasOtherFreeVar = false;
      for (let j = 0; j < nVars; j++) {
        if (j !== col && Math.abs(R[row][j]) > 1e-9) {
          hasOtherFreeVar = true;
          break;
        }
      }
      if (!hasOtherFreeVar) {
        determined.set(unknownKeys[col], R[row][nVars]);
      }
    }

    const rank = pivotRow;
    if (rank === nVars) {
      return { status: 'determined', values: determined };
    }
    return { status: 'indeterminate', values: determined, degreesOfFreedom: nVars - rank };
  }

  // Resolució numèrica de sistemes no lineals 2x2 i 3x3 (Newton-Raphson / Gauss-Newton esmorteït multi-llavor)
  function solveNonlinearSystem2D3D(equations, unknownKeys, baseEnv) {
    const n = unknownKeys.length;
    if (n < 2 || n > 3 || equations.length < n) return null;

    const eqSubset = equations.slice(0, Math.min(equations.length, 6));
    const m = eqSubset.length;

    const evalRes = (x) => {
      const subVars = new Map(baseEnv.vars);
      for (let j = 0; j < n; j++) subVars.set(unknownKeys[j], x[j]);
      const env = { ...baseEnv, vars: subVars };
      const f = new Array(m);
      let norm2 = 0;
      for (let i = 0; i < m; i++) {
        const lv = evalAst(eqSubset[i].lhs, env);
        const rv = evalAst(eqSubset[i].rhs, env);
        if (typeof lv !== 'number' || typeof rv !== 'number' || !Number.isFinite(lv) || !Number.isFinite(rv)) {
          return null;
        }
        const d = lv - rv;
        f[i] = d;
        norm2 += d * d;
      }
      return { f, norm2 };
    };

    const solveLinearSmall = (A, b) => {
      const sz = b.length;
      const M = A.map((row, idx) => [...row, b[idx]]);
      for (let col = 0; col < sz; col++) {
        let best = col;
        for (let r = col + 1; r < sz; r++) {
          if (Math.abs(M[r][col]) > Math.abs(M[best][col])) best = r;
        }
        if (Math.abs(M[best][col]) < 1e-13) return null;
        [M[col], M[best]] = [M[best], M[col]];
        const piv = M[col][col];
        for (let j = col; j <= sz; j++) M[col][j] /= piv;
        for (let r = 0; r < sz; r++) {
          if (r !== col && Math.abs(M[r][col]) > 1e-14) {
            const fac = M[r][col];
            for (let j = col; j <= sz; j++) M[r][j] -= fac * M[col][j];
          }
        }
      }
      return M.map(row => row[sz]);
    };

    const starts = n === 2
      ? [
          [1, 1], [2, 3], [-1, 1], [1, -1], [-2, -3],
          [0.5, 2], [5, 1], [10, 10], [-5, 2], [0.1, 0.5]
        ]
      : [
          [1, 1, 1], [2, 3, 4], [0.5, 1, 2], [-1, 1, 2],
          [-2, -1, 3], [5, 5, 5], [1, -2, 0.5]
        ];

    const foundRoots = [];
    for (const start of starts) {
      let x = start.slice();
      let cur = evalRes(x);
      if (!cur) continue;

      for (let iter = 0; iter < 40; iter++) {
        if (Math.sqrt(cur.norm2) < 1e-9) break;
        // Jacobiana per diferències centrades
        const J = Array.from({ length: m }, () => new Array(n).fill(0));
        let jacOk = true;
        for (let j = 0; j < n; j++) {
          const h = 1e-6 * Math.max(1, Math.abs(x[j]));
          const xp = x.slice(); xp[j] += h;
          const xm = x.slice(); xm[j] -= h;
          const rp = evalRes(xp);
          const rm = evalRes(xm);
          if (!rp || !rm) {
            // Intenta diferència cap endavant si un costat queda fora de domini (ex: sqrt, ln)
            const xf = x.slice(); xf[j] += h;
            const rf = evalRes(xf);
            if (!rf) { jacOk = false; break; }
            for (let i = 0; i < m; i++) J[i][j] = (rf.f[i] - cur.f[i]) / h;
          } else {
            for (let i = 0; i < m; i++) J[i][j] = (rp.f[i] - rm.f[i]) / (2 * h);
          }
        }
        if (!jacOk) break;

        // Equacions normals (J^T J + reg * I) dx = -J^T f
        const JTJ = Array.from({ length: n }, () => new Array(n).fill(0));
        const JTf = new Array(n).fill(0);
        for (let i = 0; i < m; i++) {
          for (let r = 0; r < n; r++) {
            JTf[r] -= J[i][r] * cur.f[i];
            for (let c = 0; c < n; c++) {
              JTJ[r][c] += J[i][r] * J[i][c];
            }
          }
        }
        for (let r = 0; r < n; r++) JTJ[r][r] += 1e-11;

        const dx = solveLinearSmall(JTJ, JTf);
        if (!dx || dx.some(v => !Number.isFinite(v))) break;

        let accepted = false;
        let alpha = 1.0;
        for (let ls = 0; ls < 8; ls++) {
          const cand = x.map((v, j) => v + alpha * dx[j]);
          if (cand.some(v => !Number.isFinite(v) || Math.abs(v) > 1e9)) {
            alpha *= 0.5;
            continue;
          }
          const next = evalRes(cand);
          if (next && next.norm2 < cur.norm2) {
            x = cand;
            cur = next;
            accepted = true;
            break;
          }
          alpha *= 0.5;
        }
        if (!accepted) break;
      }

      if (cur && cur.f.every(v => Math.abs(v) < 1e-6)) {
        const cleaned = x.map(v => (Math.abs(v) < 1e-10 ? 0 : v));
        const isDup = foundRoots.some(r =>
          r.every((rv, j) => Math.abs(rv - cleaned[j]) < 1e-4 * Math.max(1, Math.abs(rv)))
        );
        if (!isDup) foundRoots.push(cleaned);
      }
    }

    if (foundRoots.length === 0) return null;

    if (foundRoots.length === 1) {
      const values = new Map();
      unknownKeys.forEach((k, j) => values.set(k, foundRoots[0][j]));
      return { status: 'solved', values };
    }

    const uniqueMap = new Map();
    const multiMap = new Map();
    for (let j = 0; j < n; j++) {
      const valsJ = [];
      for (const root of foundRoots) {
        const val = root[j];
        if (!valsJ.some(v => Math.abs(v - val) < 1e-4 * Math.max(1, Math.abs(v)))) {
          valsJ.push(val);
        }
      }
      valsJ.sort((a, b) => a - b);
      if (valsJ.length === 1) {
        uniqueMap.set(unknownKeys[j], valsJ[0]);
      } else {
        multiMap.set(unknownKeys[j], valsJ);
      }
    }
    return { status: 'multi', uniqueMap, multiMap };
  }

  // Reconeix qualsevol identificador de funció (amb subíndexs, majúscules, lletres gregues, \vec{r}) seguit de (param1, ...)
  function matchFunctionDeclarationLhs(lhsLatex) {
    if (!lhsLatex || typeof lhsLatex !== 'string') return null;
    try {
      const toks = tokenizeLatex(lhsLatex);
      if (toks.length < 4) return null;
      const fnTok = toks[0];
      if (!fnTok || fnTok.type !== 'IDENT') return null;
      const fnKey = canonicalizeVarKey(fnTok.key);
      if (!fnKey || BUILTIN_FUNCS.has(fnKey.replace(/^\\/, '')) || fnKey === 'e') return null;
      if (toks[1].type !== 'LPAREN' || toks[1].char !== '(') return null;
      const lastTok = toks[toks.length - 1];
      if (lastTok.type !== 'RPAREN' || lastTok.char !== ')') return null;

      const inner = toks.slice(2, -1);
      if (inner.length === 0) return null;

      const params = [];
      const paramLatexList = [];
      const seenParams = new Set();
      for (let idx = 0; idx < inner.length; idx++) {
        if (idx % 2 === 0) {
          const pTok = inner[idx];
          if (!pTok || pTok.type !== 'IDENT') return null;
          const pKey = canonicalizeVarKey(pTok.key);
          if (!pKey || seenParams.has(pKey)) return null;
          seenParams.add(pKey);
          params.push(pKey);
          paramLatexList.push(pTok.latex || pKey);
        } else {
          if (!inner[idx] || inner[idx].type !== 'COMMA') return null;
        }
      }
      if (inner.length % 2 === 0 || params.length === 0) return null;

      const rawFnName = fnTok.latex || fnKey;
      return {
        fnKey,
        rawFnName,
        params,
        paramLatexList,
        signatureLatex: `${rawFnName}(${paramLatexList.join(', ')})`
      };
    } catch (_e) {
      return null;
    }
  }

  // ============================================================================
  // 6. Analitzador Global de la Pissarra (Scoreboard de Variables + Funcions)
  // ============================================================================
  function analyzeRows(rows, options = {}) {
    const angleMode = options.angleMode || 'RAD';
    const overrides = options.overrides || {}; // { varKey: numericValue } per si el docent prova un valor al tauler

    const varRegistry = new Map(); // key -> { key, latex, lines: Set<number>, status, value, valueType, multiValues, formatted, objectValue, vectorMeta, matrixMeta, reason, source, formulaLatex, dependsOn }
    const funcRegistry = new Map(); // key -> { key, nameLatex, signatureLatex, bodyLatex, params, ast, lineNumber }

    const registerVar = (key, latex, lineNumber) => {
      if (!key) return;
      if (!varRegistry.has(key)) {
        varRegistry.set(key, {
          key,
          latex,
          lines: new Set([lineNumber]),
          status: 'unknown', // 'computed' | 'solved' | 'multi' | 'override' | 'incompatible' | 'indeterminate' | 'no_real' | 'pending' | 'unknown'
          value: NaN,
          valueType: 'scalar',
          multiValues: null,
          formatted: null,
          objectValue: null,
          vectorMeta: null,
          matrixMeta: null,
          reason: null,
          source: null,
          formulaLatex: null,
          dependsOn: []
        });
      } else {
        varRegistry.get(key).lines.add(lineNumber);
      }
    };

    // Pre-escaneig universal de noms de funcions declarades perquè es puguin cridar entre si en qualsevol ordre
    const preScannedFuncKeys = new Set();
    rows.forEach((row) => {
      if (row.type === 'section' || !row.latex || !row.latex.trim()) return;
      const clauses = splitRowIntoClauses(row.latex);
      for (const clause of clauses) {
        const eqParts = splitTopLevelEquals(clause);
        if (eqParts.length >= 2) {
          const lhs = stripProseAnnotations(eqParts[0]).trim();
          const fnMatch = matchFunctionDeclarationLhs(lhs);
          if (fnMatch) {
            preScannedFuncKeys.add(fnMatch.fnKey);
          }
        }
      }
    });

    // PAS 1: Identifica totes les declaracions de FUNCIONS (normals i definides a trossos!)
    rows.forEach((row, idx) => {
      if (row.type === 'section' || !row.latex || !row.latex.trim()) return;
      const lineNum = idx + 1;
      const clauses = splitRowIntoClauses(row.latex);
      for (const clause of clauses) {
        const eqParts = splitTopLevelEquals(clause);
        if (eqParts.length >= 2) {
          const lhs = stripProseAnnotations(eqParts[0]).trim();
          const fnMatch = matchFunctionDeclarationLhs(lhs);
          if (fnMatch) {
            const { fnKey, rawFnName, params, signatureLatex } = fnMatch;
            const boundParams = new Set(params);

            // 1A. Mira primer si alguna part de la cadena és una funció definida a trossos (\begin{cases}...\end{cases})
            let registered = false;
            for (let pIdx = 1; pIdx < eqParts.length; pIdx++) {
              const rhsRaw = eqParts[pIdx];
              try {
                const pwBranches = parsePiecewiseFunctionRhs(rhsRaw, params, preScannedFuncKeys);
                if (pwBranches) {
                  const freeParams = new Map();
                  for (const br of pwBranches) {
                    collectFreeVars(br.exprAst, boundParams, preScannedFuncKeys, freeParams);
                    collectCondFreeVars(br.cond, boundParams, preScannedFuncKeys, freeParams);
                  }
                  funcRegistry.set(fnKey, {
                    key: fnKey,
                    nameLatex: rawFnName,
                    signatureLatex,
                    bodyLatex: rhsRaw.trim(),
                    params,
                    isPiecewise: true,
                    branches: pwBranches,
                    ast: null,
                    freeParams,
                    lineNumber: lineNum
                  });
                  registered = true;
                  break;
                }
              } catch (_pwErr) { /* si s'està editant un tros incomplet, no falla */ }
            }
            if (registered) continue;

            // 1B. Funció algebraica / analítica: en cadenes com F(x) = 0,9 = 1 - e^{-(x/\beta)^\alpha},
            //     tria la branca que depèn realment dels paràmetres formals!
            const algCandidates = [];
            for (let pIdx = 1; pIdx < eqParts.length; pIdx++) {
              const rhsRaw = eqParts[pIdx];
              try {
                const rhsAst = parseLatexExpr(rhsRaw, preScannedFuncKeys);
                const allFree = collectFreeVars(rhsAst, new Set(), preScannedFuncKeys);
                const usesParam = params.some(p => allFree.has(p));
                algCandidates.push({ rhsRaw, rhsAst, usesParam });
              } catch (_e) { /* branca incompleta */ }
            }

            const chosenAlg = algCandidates.find(c => c.usesParam) || algCandidates[0];
            if (chosenAlg) {
              const freeParams = collectFreeVars(chosenAlg.rhsAst, boundParams, preScannedFuncKeys);
              funcRegistry.set(fnKey, {
                key: fnKey,
                nameLatex: rawFnName,
                signatureLatex,
                bodyLatex: chosenAlg.rhsRaw.trim(),
                params,
                isPiecewise: false,
                branches: null,
                ast: chosenAlg.rhsAst,
                freeParams,
                lineNumber: lineNum
              });
            }
          }
        }
      }
    });

    const knownFuncKeys = new Set(funcRegistry.keys());
    const explicitEulerAssigned = new Set();

    // Detecta si 'e' s'ha assignat explícitament com a variable (ex: excentricitat e = 3/5)
    rows.forEach((row) => {
      if (row.type === 'section' || !row.latex) return;
      const clauses = splitRowIntoClauses(row.latex);
      for (const clause of clauses) {
        const eqParts = splitTopLevelEquals(clause);
        if (eqParts.length >= 2 && stripProseAnnotations(eqParts[0]).trim() === 'e') {
          explicitEulerAssigned.add('e');
        }
      }
    });

    // Neteja 'e' dels freeParams de funcions si no s'ha redefinit explícitament
    if (!explicitEulerAssigned.has('e')) {
      for (const fnDef of funcRegistry.values()) {
        if (fnDef.freeParams) fnDef.freeParams.delete('e');
      }
    }

    // PAS 2: Analitza totes les files i clàusules per recollir variables, assignacions i equacions
    const assignments = []; // { varKey, varLatex, rhsAst, rhsLatex, hasPm, lineNumber }
    const generalEquations = []; // { lhs, rhs, freeVars: Map, lineNumber }
    const rowEvaluations = new Map(); // row.id -> { ast, endsWithEquals }

    rows.forEach((row, idx) => {
      if (row.type === 'section' || !row.latex || !row.latex.trim()) return;
      const lineNum = idx + 1;
      const clauses = splitRowIntoClauses(row.latex);

      for (const clause of clauses) {
        const eqParts = splitTopLevelEquals(clause).filter(p => p.length > 0);

        if (eqParts.length === 0) continue;

        // Cas 1: Expressió sense '=' (o 'expr =' pendent de resultat al final)
        const rawEndsWithEquals = /=\s*$/.test(stripProseAnnotations(clause));
        if (eqParts.length === 1) {
          try {
            const ast = parseLatexExpr(eqParts[0], knownFuncKeys);
            const fv = collectFreeVars(ast, new Set(), knownFuncKeys);
            for (const [k, ltx] of fv.entries()) {
              if (k === 'e' && !explicitEulerAssigned.has('e')) continue;
              registerVar(k, ltx, lineNum);
            }
            if (clauses.length === 1) {
              rowEvaluations.set(row.id, { ast, endsWithEquals: rawEndsWithEquals });
            }
          } catch (_e) {
            const fb = scanVariablesFallback(eqParts[0], knownFuncKeys);
            for (const [k, ltx] of fb.entries()) {
              if (k === 'e' && !explicitEulerAssigned.has('e')) continue;
              registerVar(k, ltx, lineNum);
            }
          }
          continue;
        }

        // Cas 2: És una declaració de funció g(x) = ... ja processada?
        // Registra paràmetres lliures externs, i si és una cadena F(x) = 0,9 = expr,
        // continua amb les igualtats restants (0,9 = expr) al Cas 3!
        let chainSourceParts = eqParts;
        const lhsTrim = stripProseAnnotations(eqParts[0]).trim();
        const fnMatch = matchFunctionDeclarationLhs(lhsTrim);
        if (fnMatch && knownFuncKeys.has(fnMatch.fnKey)) {
          const fnDef = funcRegistry.get(fnMatch.fnKey);
          if (fnDef && fnDef.freeParams) {
            for (const [k, ltx] of fnDef.freeParams.entries()) {
              if (k === 'e' && !explicitEulerAssigned.has('e')) continue;
              registerVar(k, ltx, lineNum);
            }
          }
          if (eqParts.length < 3) {
            continue;
          }
          chainSourceParts = eqParts.slice(1);
        }

        // Cas 3: Cadena d'igualtats E_0 = E_1 (= E_2 ...)
        const parsedChain = [];
        for (const part of chainSourceParts) {
          try {
            const ast = parseLatexExpr(part, knownFuncKeys);
            const directFv = collectFreeVars(ast, new Set(), knownFuncKeys);
            if (!explicitEulerAssigned.has('e')) directFv.delete('e');
            for (const [k, ltx] of directFv.entries()) {
              registerVar(k, ltx, lineNum);
            }
            const effectiveFv = collectFreeVars(ast, new Set(), knownFuncKeys, new Map(), funcRegistry);
            if (!explicitEulerAssigned.has('e')) effectiveFv.delete('e');
            parsedChain.push({ raw: part, ast, freeVars: effectiveFv });
          } catch (_e) {
            const fb = scanVariablesFallback(part, knownFuncKeys);
            for (const [k, ltx] of fb.entries()) {
              if (k === 'e' && !explicitEulerAssigned.has('e')) continue;
              registerVar(k, ltx, lineNum);
            }
          }
        }

        if (parsedChain.length < 2) continue;

        // Mira si algun extrem (típicament el primer o l'últim, ex: "x = 2*3 = 6" o "2*3 = x") és una variable aïllada!
        const first = parsedChain[0];
        const last = parsedChain[parsedChain.length - 1];

        if (first.ast.type === 'Var' && first.ast.derivOrder === 0 && !knownFuncKeys.has(first.ast.key)) {
          const varKey = first.ast.key;
          const varLatex = first.ast.latex;
          // Guarda tots els candidats de la cadena (de dreta a esquerra) per si algun pas intermedi és una indeterminació com [0/0]!
          const rhsCandidates = [];
          for (let i = parsedChain.length - 1; i >= 1; i--) {
            if (!parsedChain[i].freeVars.has(varKey)) {
              rhsCandidates.push(parsedChain[i]);
            }
          }
          if (rhsCandidates.length > 0) {
            const chosenRhs = rhsCandidates[0];
            assignments.push({
              varKey,
              varLatex,
              rhsAst: chosenRhs.ast,
              rhsCandidates,
              rhsLatex: chosenRhs.raw,
              freeVars: chosenRhs.freeVars,
              hasPm: rhsCandidates.some(c => astContainsPm(c.ast)),
              lineNumber: lineNum
            });
          } else {
            // La variable apareix a tots dos costats (ex: x = 2x - 3) -> és una equació algebraica!
            generalEquations.push({
              lhs: first.ast,
              rhs: last.ast,
              freeVars: new Map([...first.freeVars, ...last.freeVars]),
              lineNumber: lineNum
            });
          }
        } else if (last.ast.type === 'Var' && last.ast.derivOrder === 0 && !knownFuncKeys.has(last.ast.key) && !first.freeVars.has(last.ast.key)) {
          assignments.push({
            varKey: last.ast.key,
            varLatex: last.ast.latex,
            rhsAst: first.ast,
            rhsLatex: first.raw,
            freeVars: first.freeVars,
            hasPm: astContainsPm(first.ast),
            lineNumber: lineNum
          });
        } else {
          // Equació implícita general (ex: 2x + y = 7, o x^2 - 5x + 6 = 0)
          for (let i = 0; i < parsedChain.length - 1; i++) {
            const pA = parsedChain[i];
            const pB = parsedChain[i + 1];
            const combinedVars = new Map([...pA.freeVars, ...pB.freeVars]);
            if (combinedVars.size > 0) {
              generalEquations.push({
                lhs: pA.ast,
                rhs: pB.ast,
                freeVars: combinedVars,
                lineNumber: lineNum
              });
            }
          }
        }
      }
    });

    // PAS 3: Resolució iterativa de punt fix combinant assignacions, objectes vector/matriu, overrides i sistemes!
    const solvedVars = new Map();
    const solvedObjects = new Map();
    const varAsts = new Map();
    const isResolved = (k) => solvedVars.has(k) || solvedObjects.has(k);

    // Aplica valors de prova temporals introduïts pel docent al Scoreboard (si n'hi ha)
    for (const [k, v] of Object.entries(overrides)) {
      if (v !== null && v !== '' && Number.isFinite(Number(v))) {
        const num = Number(v);
        solvedVars.set(k, num);
        if (varRegistry.has(k)) {
          const entry = varRegistry.get(k);
          entry.status = 'override';
          entry.value = num;
          entry.valueType = 'scalar';
          entry.formatted = formatValueRich(num);
          entry.source = 'Valor de prova';
        }
      }
    }

    // Si hi ha múltiples assignacions a la mateixa variable en el mateix bloc, l'última preval
    const latestAssignmentByVar = new Map();
    for (const asg of assignments) {
      if (overrides[asg.varKey] !== undefined && overrides[asg.varKey] !== null && overrides[asg.varKey] !== '') continue;
      latestAssignmentByVar.set(asg.varKey, asg);
    }

    // Guarda els ASTs de fórmula per poder derivar parcialment variables (ex: z = x^2 + y^2 -> \partial z / \partial x)
    for (const [varKey, asg] of latestAssignmentByVar.entries()) {
      if (asg.rhsAst) varAsts.set(varKey, asg.rhsAst);
    }

    const makeEnv = (pmBranch = null) => ({
      vars: solvedVars,
      objects: solvedObjects,
      funcs: funcRegistry,
      varAsts,
      angleMode,
      pmBranch
    });

    const recordSolvedObject = (entry, varKey, objVal, lineNumber) => {
      solvedObjects.set(varKey, objVal);
      entry.status = 'computed';
      entry.valueType = objVal.__type;
      entry.objectValue = objVal;
      entry.formatted = formatObjectLatex(objVal);
      entry.source = `Línia ${lineNumber}`;
      if (objVal.__type === 'vector') {
        const nrm = Math.hypot(...objVal.components);
        entry.vectorMeta = {
          dim: objVal.components.length,
          norm: nrm,
          normFormatted: formatValueRich(nrm)
        };
      } else if (objVal.__type === 'matrix') {
        const rows = objVal.rows.length;
        const cols = objVal.rows[0] ? objVal.rows[0].length : 0;
        const rank = matRank(objVal);
        const isSquare = rows === cols && rows > 0;
        const det = isSquare ? matDeterminant(objVal) : NaN;
        const trace = isSquare ? matTrace(objVal) : NaN;
        const inv = (isSquare && Number.isFinite(det) && Math.abs(det) > 1e-10 && rows <= 4)
          ? matInverse(objVal)
          : null;
        entry.matrixMeta = {
          rows,
          cols,
          rank,
          detFormatted: Number.isFinite(det) ? formatValueRich(det) : null,
          traceFormatted: Number.isFinite(trace) ? formatValueRich(trace) : null,
          inverseLatex: inv ? formatObjectLatex(inv) : null
        };
      }
    };

    // Bucle de propagació (resol fórmules escrites abans o després de les dades, i combina amb equacions!)
    let progress = true;
    let iter = 0;
    while (progress && iter++ < 15) {
      progress = false;

      // 3A. Avalua assignacions directes x = expr (escalars, vectors o matrius)
      for (const [varKey, asg] of latestAssignmentByVar.entries()) {
        if (isResolved(varKey)) continue;
        const entry = varRegistry.get(varKey);
        if (asg.hasPm) {
          const vPlus = evalAst(asg.rhsAst, makeEnv(1));
          const vMinus = evalAst(asg.rhsAst, makeEnv(-1));
          if (typeof vPlus === 'number' && typeof vMinus === 'number' && Number.isFinite(vPlus) && Number.isFinite(vMinus)) {
            if (Math.abs(vPlus - vMinus) < 1e-10) {
              solvedVars.set(varKey, vPlus);
              entry.status = 'computed';
              entry.value = vPlus;
              entry.valueType = 'scalar';
              entry.formatted = formatValueRich(vPlus);
              entry.source = `Línia ${asg.lineNumber}`;
              progress = true;
            } else {
              const sorted = [vMinus, vPlus].sort((a, b) => a - b);
              entry.status = 'multi';
              entry.valueType = 'scalar';
              entry.multiValues = sorted.map(formatValueRich);
              entry.source = `Línia ${asg.lineNumber}`;
            }
          } else {
            entry.formulaLatex = asg.rhsLatex;
            entry.dependsOn = [...asg.freeVars.keys()].filter(k => !isResolved(k));
            entry.status = 'pending';
          }
        } else {
          const candidates = asg.rhsCandidates || [{ ast: asg.rhsAst, raw: asg.rhsLatex, freeVars: asg.freeVars }];
          let val = NaN;
          for (const cand of candidates) {
            const candVal = evalAst(cand.ast, makeEnv(null));
            if (typeof candVal === 'number' && Number.isFinite(candVal)) {
              val = candVal;
              break;
            }
            if (isMathObject(candVal)) {
              val = candVal;
              break;
            }
          }
          if (typeof val === 'number' && Number.isFinite(val)) {
            solvedVars.set(varKey, val);
            entry.status = 'computed';
            entry.value = val;
            entry.valueType = 'scalar';
            entry.formatted = formatValueRich(val);
            entry.source = `Línia ${asg.lineNumber}`;
            progress = true;
          } else if (isMathObject(val)) {
            recordSolvedObject(entry, varKey, val, asg.lineNumber);
            progress = true;
          } else {
            entry.formulaLatex = asg.rhsLatex;
            entry.dependsOn = [...asg.freeVars.keys()].filter(k => !isResolved(k));
            entry.status = 'pending';
          }
        }
      }

      // 3B. Resol equacions implícites d'1 sola incògnita pendent (ex: 2x + 4 = 10, o 0,9 = 1 - e^{-(16/\beta)^{2.8}})
      for (const eq of generalEquations) {
        const unresolved = [...eq.freeVars.keys()].filter(k => !isResolved(k));
        if (unresolved.length === 1) {
          const targetKey = unresolved[0];
          const entry = varRegistry.get(targetKey);
          if (!entry || isResolved(targetKey) || entry.status === 'multi') continue;

          const baseEnvNow = makeEnv(null);
          const diffFn = (xVal) => {
            const subVars = new Map(solvedVars);
            subVars.set(targetKey, xVal);
            const env = { ...baseEnvNow, vars: subVars };
            const lv = evalAst(eq.lhs, env);
            const rv = evalAst(eq.rhs, env);
            return (typeof lv === 'number' && typeof rv === 'number') ? (lv - rv) : NaN;
          };

          const sol = solveSingleVariableEquation(diffFn, {
            lhs: eq.lhs,
            rhs: eq.rhs,
            unknownKey: targetKey,
            baseEnv: baseEnvNow
          });

          if (sol.status === 'solved' && sol.roots.length === 1) {
            const val = sol.roots[0];
            solvedVars.set(targetKey, val);
            entry.status = 'solved';
            entry.value = val;
            entry.valueType = 'scalar';
            entry.reason = null;
            entry.formatted = formatValueRich(val);
            entry.source = `Deduït (línia ${eq.lineNumber})`;
            progress = true;
          } else if (sol.status === 'solved' && sol.roots.length > 1) {
            entry.status = 'multi';
            entry.valueType = 'scalar';
            entry.reason = null;
            entry.multiValues = sol.roots.map(formatValueRich);
            entry.source = `${sol.roots.length} solucions (línia ${eq.lineNumber})`;
          } else if (sol.status === 'no_real') {
            entry.status = 'no_real';
            entry.complex = sol.complex || null;
            entry.reason = sol.reason || null;
            entry.source = `Sense sol. real (línia ${eq.lineNumber})`;
          } else if (sol.status === 'contradiction') {
            entry.status = 'incompatible';
            entry.source = `Equació incompatible (línia ${eq.lineNumber})`;
          }
        }
      }

      // 3C. Resol sistemes lineals d'equacions NxN i sistemes no lineals 2x2/3x3!
      const multiVarEqs = generalEquations.filter(eq => {
        const u = [...eq.freeVars.keys()].filter(k => !isResolved(k));
        return u.length >= 1;
      });

      if (multiVarEqs.length >= 2) {
        // Agrupa components connexes de variables que comparteixen equacions!
        const adj = new Map();
        for (const eq of multiVarEqs) {
          const u = [...eq.freeVars.keys()].filter(k => !isResolved(k));
          for (const v of u) {
            if (!adj.has(v)) adj.set(v, new Set());
            for (const w of u) if (v !== w) adj.get(v).add(w);
          }
        }

        const visited = new Set();
        for (const startVar of adj.keys()) {
          if (visited.has(startVar)) continue;
          const compVars = [];
          const queue = [startVar];
          visited.add(startVar);
          while (queue.length > 0) {
            const cur = queue.shift();
            compVars.push(cur);
            for (const nb of adj.get(cur) || []) {
              if (!visited.has(nb)) {
                visited.add(nb);
                queue.push(nb);
              }
            }
          }

          if (compVars.length < 2) continue;
          const compSet = new Set(compVars);
          const compEqs = multiVarEqs.filter(eq =>
            [...eq.freeVars.keys()].some(k => compSet.has(k))
          );

          const baseEnvNow = makeEnv(null);
          const sysRes = solveLinearSystem(compEqs, compVars, baseEnvNow);
          if (sysRes) {
            if (sysRes.values && sysRes.values.size > 0) {
              for (const [k, val] of sysRes.values.entries()) {
                if (!isResolved(k)) {
                  solvedVars.set(k, val);
                  const entry = varRegistry.get(k);
                  if (entry) {
                    entry.status = 'solved';
                    entry.value = val;
                    entry.valueType = 'scalar';
                    entry.formatted = formatValueRich(val);
                    entry.source = 'Sistema d\'equacions';
                  }
                  progress = true;
                }
              }
            }
            if (sysRes.status === 'incompatible') {
              for (const k of compVars) {
                const entry = varRegistry.get(k);
                if (entry && !isResolved(k)) {
                  entry.status = 'incompatible';
                  entry.source = 'Sistema incompatible (SI)';
                }
              }
            } else if (sysRes.status === 'indeterminate') {
              for (const k of compVars) {
                const entry = varRegistry.get(k);
                if (entry && !isResolved(k)) {
                  entry.status = 'indeterminate';
                  entry.source = 'Sistema indeterminat (SCI)';
                }
              }
            }
          } else if (compVars.length >= 2 && compVars.length <= 3 && compEqs.length >= compVars.length) {
            const nlRes = solveNonlinearSystem2D3D(compEqs, compVars, baseEnvNow);
            if (nlRes) {
              if (nlRes.status === 'solved' && nlRes.values) {
                for (const [k, val] of nlRes.values.entries()) {
                  if (!isResolved(k)) {
                    solvedVars.set(k, val);
                    const entry = varRegistry.get(k);
                    if (entry) {
                      entry.status = 'solved';
                      entry.value = val;
                      entry.valueType = 'scalar';
                      entry.formatted = formatValueRich(val);
                      entry.source = 'Sistema no lineal';
                    }
                    progress = true;
                  }
                }
              } else if (nlRes.status === 'multi') {
                for (const [k, val] of nlRes.uniqueMap.entries()) {
                  if (!isResolved(k)) {
                    solvedVars.set(k, val);
                    const entry = varRegistry.get(k);
                    if (entry) {
                      entry.status = 'solved';
                      entry.value = val;
                      entry.valueType = 'scalar';
                      entry.formatted = formatValueRich(val);
                      entry.source = 'Sistema no lineal';
                    }
                    progress = true;
                  }
                }
                for (const [k, vals] of nlRes.multiMap.entries()) {
                  const entry = varRegistry.get(k);
                  if (entry && !isResolved(k)) {
                    entry.status = 'multi';
                    entry.valueType = 'scalar';
                    entry.multiValues = vals.map(formatValueRich);
                    entry.source = 'Sistema no lineal';
                  }
                }
              }
            }
          }
        }
      }
    }

    // Neteja la 'T' / 't' de transposició matricial (ex: A^T) del Tauler si només s'ha usat com a exponent d'una matriu
    if (varRegistry.has('T') || varRegistry.has('t')) {
      const regularVarsUsed = new Set();
      const transposeExpVarsUsed = new Set();
      const envNow = makeEnv(null);

      const scanTransposeAst = (node, depth = 0) => {
        if (!node || typeof node !== 'object' || depth > 64) return;
        if (
          node.type === 'Binary' &&
          node.op === '^' &&
          node.right &&
          node.right.type === 'Var' &&
          (node.right.key === 'T' || node.right.key === 't')
        ) {
          const baseVal = evalAst(node.left, envNow);
          if (isMatrixVal(baseVal)) {
            transposeExpVarsUsed.add(node.right.key);
            scanTransposeAst(node.left, depth + 1);
            return;
          }
        }
        if (node.type === 'Var') {
          regularVarsUsed.add(node.key);
          return;
        }
        if (node.left) scanTransposeAst(node.left, depth + 1);
        if (node.right) scanTransposeAst(node.right, depth + 1);
        if (node.arg) scanTransposeAst(node.arg, depth + 1);
        if (node.n) scanTransposeAst(node.n, depth + 1);
        if (node.k) scanTransposeAst(node.k, depth + 1);
        if (node.degree) scanTransposeAst(node.degree, depth + 1);
        if (node.radicand) scanTransposeAst(node.radicand, depth + 1);
        if (node.base) scanTransposeAst(node.base, depth + 1);
        if (Array.isArray(node.args)) node.args.forEach(a => scanTransposeAst(a, depth + 1));
        if (Array.isArray(node.items)) node.items.forEach(a => scanTransposeAst(a, depth + 1));
        if (Array.isArray(node.rows)) node.rows.forEach(r => r.forEach(c => scanTransposeAst(c, depth + 1)));
        if (node.expr) scanTransposeAst(node.expr, depth + 1);
        if (node.body) scanTransposeAst(node.body, depth + 1);
        if (node.start) scanTransposeAst(node.start, depth + 1);
        if (node.end) scanTransposeAst(node.end, depth + 1);
        if (node.lower) scanTransposeAst(node.lower, depth + 1);
        if (node.upper) scanTransposeAst(node.upper, depth + 1);
        if (node.target) scanTransposeAst(node.target, depth + 1);
        if (Array.isArray(node.assigns)) node.assigns.forEach(a => scanTransposeAst(a.expr, depth + 1));
      };

      for (const asg of assignments) scanTransposeAst(asg.rhsAst);
      for (const eq of generalEquations) {
        scanTransposeAst(eq.lhs);
        scanTransposeAst(eq.rhs);
      }
      for (const info of rowEvaluations.values()) scanTransposeAst(info.ast);

      for (const tKey of ['T', 't']) {
        const entry = varRegistry.get(tKey);
        if (entry && entry.status === 'unknown' && transposeExpVarsUsed.has(tKey) && !regularVarsUsed.has(tKey)) {
          varRegistry.delete(tKey);
        }
      }
    }

    // PAS 4: Avalua expressions numèriques o matricials pures de fila (per oferir '= resultat' al hover!)
    const lineQuickResults = {};
    for (const [rowId, info] of rowEvaluations.entries()) {
      const val = evalAst(info.ast, makeEnv(null));
      if (typeof val === 'number' && Number.isFinite(val)) {
        // Només si no és ja un sol nombre literal trivial (ex: escriure només "5")
        if (info.ast.type !== 'Number') {
          lineQuickResults[rowId] = {
            formatted: formatValueRich(val),
            isLatex: false,
            endsWithEquals: info.endsWithEquals
          };
        }
      } else if (isMathObject(val)) {
        if (info.ast.type !== 'Matrix' && info.ast.type !== 'Vector') {
          lineQuickResults[rowId] = {
            formatted: formatObjectLatex(val),
            isLatex: true,
            endsWithEquals: info.endsWithEquals
          };
        }
      }
    }

    // Formata llista final de variables i funcions
    const variables = [...varRegistry.values()].map(v => ({
      ...v,
      lines: [...v.lines].sort((a, b) => a - b)
    }));

    const baseEnv = makeEnv(null);
    const functions = [...funcRegistry.values()].map(fn => {
      const evalAt = (...argValues) => {
        if (argValues.length !== fn.params.length) return NaN;
        if (argValues.some(v => !Number.isFinite(v))) return NaN;
        return evalUserFunctionCall(fn, argValues, 0, baseEnv, 0);
      };

      const evalWithBranch = (xVal) => {
        if (fn.params.length !== 1 || !Number.isFinite(xVal)) {
          return { y: NaN, branchIndex: -1, isIsolatedPoint: false };
        }
        if (!fn.isPiecewise) {
          const yRaw = evalAt(xVal);
          return { y: typeof yRaw === 'number' ? yRaw : NaN, branchIndex: 0, isIsolatedPoint: false };
        }
        const hit = findMatchingPiecewiseBranch(fn, xVal, baseEnv, 0);
        if (!hit) {
          return { y: NaN, branchIndex: -1, isIsolatedPoint: false };
        }
        const subVars = new Map(solvedVars);
        subVars.set(fn.params[0], xVal);
        const y = evalAst(hit.branch.exprAst, { ...baseEnv, vars: subVars }, 0);
        return {
          y: typeof y === 'number' ? y : NaN,
          branchIndex: hit.branchIndex,
          isIsolatedPoint: hit.branch.cond.kind === 'point'
        };
      };

      return {
        ...fn,
        piecewiseInfo: fn.isPiecewise ? buildPiecewiseAnalysis(fn, baseEnv) : null,
        evalAt,
        evalWithBranch
      };
    });

    return {
      variables,
      functions,
      lineQuickResults
    };
  }

  global.MathEngine = {
    analyzeRows,
    formatValueRich,
    formatNumberCatalan,
    setFormatOptions
  };
})(typeof window !== 'undefined' ? window : globalThis);
