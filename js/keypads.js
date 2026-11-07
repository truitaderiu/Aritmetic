/**
 * keypads.js
 * Configuració dels teclats matemàtics inferiors d'Aritmètic,
 * dreceres ràpides de teclat i la Guia Completa amb TOTES les funcionalitats en ordre.
 */
(function (global) {
  'use strict';

  const KEYPAD_TABS = [
    {
      id: 'principal',
      label: 'Principal',
      layout: 'desmos-split',
      leftGrid: [
        { labelLatex: 'a^2', insert: '#0^{2}', title: 'Al quadrat (^2)' },
        { labelLatex: 'a^b', insert: '#0^{#?}', title: 'Potència / exponent (^)' },
        { labelLatex: 'a_b', insert: '#0_{#?}', title: 'Subíndex (_)' },
        { labelLatex: '\\frac{a}{b}', insert: '\\frac{#0}{#?}', title: 'Fracció (/)' },

        { labelLatex: '\\sqrt{\\placeholder{}}', insert: '\\sqrt{#0}', title: 'Arrel quadrada (sqrt)' },
        { labelLatex: '\\sqrt[n]{\\placeholder{}}', insert: '\\sqrt[#?]{#0}', title: 'Arrel n-èsima (root)' },
        { labelLatex: '|a|', insert: '\\left|#0\\right|', title: 'Valor absolut / mòdul (|)' },
        { labelText: '«text»', action: 'insertInlineText', className: 'btn-text-mode', title: 'Text curt dins de l\'equació (drecera: ")' },

        { labelLatex: '\\lim_{x\\to a}', insert: '\\lim_{x\\to #0}', title: 'Límit quan x tendeix a... (lim)' },
        { labelLatex: '\\infty', insert: '\\infty', title: 'Infinit (inf)' },
        { labelLatex: '\\pm', insert: '\\pm', title: 'Més / menys (+-)' },
        { labelLatex: '\\Rightarrow', insert: '\\Rightarrow ', title: 'Implica (=>)' },

        { labelLatex: '(', insert: '\\left(#0\\right)', title: 'Parèntesis' },
        { labelLatex: '[\\,]', insert: '\\left[#0\\right]', title: 'Claudàtors' },
        { labelLatex: '\\pi', insert: '\\pi', title: 'Nombre pi (pi)' },
        { labelLatex: '\\rightarrow', insert: '\\rightarrow ', title: 'Fletxa (->)' }
      ],
      numpadGrid: [
        { labelLatex: '7', insert: '7', className: 'btn-num' },
        { labelLatex: '8', insert: '8', className: 'btn-num' },
        { labelLatex: '9', insert: '9', className: 'btn-num' },
        { labelLatex: '\\div', insert: '\\frac{#0}{#?}', className: 'btn-op', title: 'Divisió / Fracció' },

        { labelLatex: '4', insert: '4', className: 'btn-num' },
        { labelLatex: '5', insert: '5', className: 'btn-num' },
        { labelLatex: '6', insert: '6', className: 'btn-num' },
        { labelLatex: '\\cdot', insert: '\\cdot ', className: 'btn-op', title: 'Producte (*)' },

        { labelLatex: '1', insert: '1', className: 'btn-num' },
        { labelLatex: '2', insert: '2', className: 'btn-num' },
        { labelLatex: '3', insert: '3', className: 'btn-num' },
        { labelLatex: '-', insert: '-', className: 'btn-op', title: 'Resta (-)' },

        { labelLatex: '0', insert: '0', className: 'btn-num' },
        { labelLatex: ',', insert: ',', className: 'btn-num', title: 'Coma decimal o separadora' },
        { labelLatex: '=', insert: '=', className: 'btn-eq', title: 'Igual (=)' },
        { labelLatex: '+', insert: '+', className: 'btn-op', title: 'Suma (+)' }
      ],
      rightGrid: [
        { labelLatex: '\\le', insert: '\\le ', title: 'Menor o igual (<=)', span: 1 },
        { labelLatex: '\\ge', insert: '\\ge ', title: 'Major o igual (>=)', span: 1 },
        { labelLatex: '\\neq', insert: '\\neq ', title: 'Diferent (!=)', span: 1 },
        { labelLatex: '\\approx', insert: '\\approx ', title: 'Aproximadament (~=)', span: 1 },

        { labelText: '←', cmd: 'moveToPreviousChar', className: 'btn-nav', title: 'Mou el cursor a l\'esquerra', span: 1 },
        { labelText: '→', cmd: 'moveToNextChar', className: 'btn-nav', title: 'Mou el cursor a la dreta', span: 1 },
        { labelLatex: '\\cancel{x}', insert: '\\cancel{#0}', title: 'Simplificar / ratllar factor seleccionat', span: 1 },
        { labelLatex: '\\boxed{x}', insert: '\\boxed{#0}', title: 'Emmarcar resultat final', span: 1 },

        { labelText: '⇥ Tab', insert: '\\qquad ', className: 'btn-text-mode', title: 'Inserir tabulació / separació en la mateixa línia (Tecla Tab)', span: 1 },
        { labelText: '¶ Text', action: 'addTextBlockInApartat', className: 'btn-text-mode', title: 'Afegeix un paràgraf de text amb salt de línia automàtic dins l\'apartat actual (Alt+T)', span: 1 },
        { labelText: '⌫', cmd: 'deleteBackward', className: 'btn-backspace', title: 'Esborrar caràcter', span: 2 },

        { labelText: '↵ Nova línia', action: 'newMathLineInApartat', className: 'btn-enter', title: 'Nova línia d\'equació dins del mateix apartat (Enter)', span: 2 },
        { labelText: '⊞ Nou apartat', action: 'newApartatBelow', className: 'btn-enter-secondary', title: 'Crea un nou apartat a sota (Cmd/Ctrl + Enter o doble Enter)', span: 2 }
      ]
    },
    {
      id: 'calcul',
      label: 'Càlcul i Anàlisi',
      layout: 'Categorized',
      groups: [
        {
          title: 'Límits i Indeterminacions',
          cols: 4,
          items: [
            { labelLatex: '\\lim_{x\\to a}', insert: '\\lim_{x\\to #0}', title: 'Límit en un punt' },
            { labelLatex: '\\lim_{x\\to +\\infty}', insert: '\\lim_{x\\to +\\infty} #0', title: 'Límit a +infinit' },
            { labelLatex: '\\lim_{x\\to -\\infty}', insert: '\\lim_{x\\to -\\infty} #0', title: 'Límit a -infinit' },
            { labelLatex: '\\lim_{x\\to a^+}', insert: '\\lim_{x\\to #0^{+}} #?', title: 'Límit lateral per la dreta' },
            { labelLatex: '\\lim_{x\\to a^-}', insert: '\\lim_{x\\to #0^{-}} #?', title: 'Límit lateral per l\'esquerra' },
            { labelLatex: '\\left[\\frac{0}{0}\\right]', insert: '\\left[\\frac{0}{0}\\right]', title: 'Indeterminació 0/0' },
            { labelLatex: '\\left[\\frac{\\infty}{\\infty}\\right]', insert: '\\left[\\frac{\\infty}{\\infty}\\right]', title: 'Indeterminació inf/inf' },
            { labelLatex: '\\xrightarrow{\\text{L\'H}}', insert: '\\xrightarrow{\\text{#0}} ', title: 'Fletxa amb anotació a sobre (ex: L\'Hôpital)' }
          ]
        },
        {
          title: 'Derivades i Integrals',
          cols: 4,
          items: [
            { labelLatex: 'f\'(x)', insert: 'f\'(#0)', title: 'Derivada primera' },
            { labelLatex: 'f\'\'(x)', insert: 'f\'\'(#0)', title: 'Derivada segona' },
            { labelLatex: '\\frac{d}{dx}', insert: '\\frac{d}{dx}\\left(#0\\right)', title: 'Operador derivada respecte x' },
            { labelLatex: '\\frac{dy}{dx}', insert: '\\frac{d#0}{d#?}', title: 'Notació de Leibniz' },
            { labelLatex: '\\int f\\,dx', insert: '\\int #0 \\,dx', title: 'Integral indefinida (int)' },
            { labelLatex: '\\int_a^b f\\,dx', insert: '\\int_{#?}^{#?} #0 \\,dx', title: 'Integral definida' },
            { labelLatex: '\\Big[F(x)\\Big]_a^b', insert: '\\left[#0\\right]_{#?}^{#?}', title: 'Regla de Barrow' },
            { labelLatex: '\\underbrace{a}_{b}', insert: '\\underbrace{#0}_{\\text{#?}}', title: 'Clau inferior explicativa' }
          ]
        },
        {
          title: 'Funcions a Trossos',
          cols: 4,
          items: [
            {
              labelLatex: 'f(x)=\\begin{cases} f_1 \\\\ f_2 \\end{cases}',
              insert: 'f(x) = \\begin{cases} #0 & \\text{si } x < #? \\\\ #? & \\text{si } x \\ge #? \\end{cases}',
              title: 'Plantilla de funció definida a 2 trossos (drecera: trossos)',
              span: 2
            },
            {
              labelLatex: 'f(x)=\\begin{cases} f_1 \\\\ f_2 \\\\ f_3 \\end{cases}',
              insert: 'f(x) = \\begin{cases} #0 & \\text{si } x < #? \\\\ #? & \\text{si } #? \\le x < #? \\\\ #? & \\text{si } x \\ge #? \\end{cases}',
              title: 'Plantilla de funció definida a 3 trossos',
              span: 2
            },
            {
              labelLatex: '\\begin{cases} x\\neq a \\\\ x=a \\end{cases}',
              insert: 'f(x) = \\begin{cases} #0 & \\text{si } x \\neq #? \\\\ #? & \\text{si } x = #? \\end{cases}',
              title: 'Funció amb punt singular o discontinuïtat evitable',
              span: 2
            },
            {
              labelText: '+ Tros',
              cmd: 'addRowAfter',
              className: 'btn-text-mode',
              title: 'Afegeix un nou tros / fila dins de la clau actual (Shift + Enter)',
              span: 1
            },
            {
              labelText: '& si …',
              insert: ' & \\text{si } #0',
              className: 'btn-text-mode',
              title: 'Insereix columna de condició «si ...» dins d\'una funció a trossos',
              span: 1
            }
          ]
        },
        {
          title: 'Sistemes i Sumatoris',
          cols: 4,
          items: [
            {
              labelLatex: '\\begin{cases} a \\\\ b \\end{cases}',
              insert: '\\begin{cases} #0 \\\\ #? \\end{cases}',
              title: 'Sistema de 2 equacions'
            },
            {
              labelLatex: '\\begin{cases} a \\\\ b \\\\ c \\end{cases}',
              insert: '\\begin{cases} #0 \\\\ #? \\\\ #? \\end{cases}',
              title: 'Sistema de 3 equacions'
            },
            { labelLatex: '\\textstyle\\sum_{i=1}^n', insert: '\\sum_{#?=1}^{#?} #0', title: 'Sumatori' },
            { labelLatex: '\\binom{n}{k}', insert: '\\binom{#0}{#?}', title: 'Nombre combinatori' },
            { labelLatex: 'n!', insert: '#0!', title: 'Factorial' },
            { labelLatex: '\\cancel{x}', insert: '\\cancel{#0}', title: 'Ratllar factor per simplificar' },
            { labelLatex: '\\boxed{x=1}', insert: '\\boxed{#0}', title: 'Emmarcar solució' },
            { labelText: '¶ Bloc text', action: 'addTextBlockInApartat', className: 'btn-text-mode', title: 'Inserir bloc de paràgraf dins l\'apartat' }
          ]
        }
      ]
    },
    {
      id: 'algebra',
      label: 'Àlgebra i Geometria',
      layout: 'Categorized',
      groups: [
        {
          title: 'Matrius i Determinants',
          cols: 4,
          items: [
            {
              labelLatex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}',
              insert: '\\begin{pmatrix} #0 & #? \\\\ #? & #? \\end{pmatrix}',
              title: 'Matriu 2×2'
            },
            {
              labelLatex: '\\begin{pmatrix} \\cdot & \\cdot & \\cdot \\\\ \\cdot & \\cdot & \\cdot \\\\ \\cdot & \\cdot & \\cdot \\end{pmatrix}',
              insert: '\\begin{pmatrix} #0 & #? & #? \\\\ #? & #? & #? \\\\ #? & #? & #? \\end{pmatrix}',
              title: 'Matriu 3×3'
            },
            {
              labelLatex: '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}',
              insert: '\\begin{vmatrix} #0 & #? \\\\ #? & #? \\end{vmatrix}',
              title: 'Determinant 2×2 (es calcula al tauler!)'
            },
            {
              labelLatex: '\\begin{vmatrix} \\cdot & \\cdot & \\cdot \\\\ \\cdot & \\cdot & \\cdot \\\\ \\cdot & \\cdot & \\cdot \\end{vmatrix}',
              insert: '\\begin{vmatrix} #0 & #? & #? \\\\ #? & #? & #? \\\\ #? & #? & #? \\end{vmatrix}',
              title: 'Determinant 3×3 (Sarrus automàtic al tauler!)'
            },
            { labelText: '+ Fila mat.', cmd: 'addRowAfter', title: 'Afegeix fila a la matriu o sistema actual' },
            { labelText: '+ Columna', cmd: 'addColumnAfter', title: 'Afegeix columna a la matriu actual' },
            { labelLatex: 'A^{-1}', insert: '#0^{-1}', title: 'Matriu inversa' },
            { labelLatex: 'A^t', insert: '#0^{t}', title: 'Matriu transposada' }
          ]
        },
        {
          title: 'Vectors i Espai Afí / Euclidià',
          cols: 4,
          items: [
            { labelLatex: '\\vec{v}', insert: '\\vec{#0}', title: 'Vector amb fletxa' },
            { labelLatex: '\\overrightarrow{AB}', insert: '\\overrightarrow{#0}', title: 'Vector entre dos punts' },
            { labelLatex: '\\|\\vec{v}\\|', insert: '\\left\\|#0\\right\\|', title: 'Mòdul / norma d\'un vector' },
            { labelLatex: '\\vec{u}\\times\\vec{v}', insert: '\\times ', title: 'Producte vectorial' },
            { labelLatex: '\\vec{u}\\cdot\\vec{v}', insert: '\\cdot ', title: 'Producte escalar' },
            { labelLatex: '\\perp', insert: '\\perp ', title: 'Perpendicular' },
            { labelLatex: '\\parallel', insert: '\\parallel ', title: 'Paral·lel' },
            { labelLatex: '\\widehat{ABC}', insert: '\\widehat{#0}', title: 'Angle' }
          ]
        },
        {
          title: 'Polinomis, Rangs i Equació Quadràtica',
          cols: 3,
          items: [
            { labelLatex: '\\text{rang}(A)', insert: '\\text{rang}\\left(#0\\right)', title: 'Rang d\'una matriu' },
            { labelLatex: '\\Delta = b^2-4ac', insert: '\\Delta = b^2 - 4ac', title: 'Discriminant' },
            { labelLatex: '\\frac{-b\\pm\\sqrt{\\dots}}{2a}', insert: '\\frac{-#0 \\pm \\sqrt{#?}}{2#?}', title: 'Plantilla fórmula equació 2n grau' }
          ]
        }
      ]
    },
    {
      id: 'func',
      label: 'Func i Trig',
      layout: 'Categorized',
      groups: [
        {
          title: 'Trigonometria',
          cols: 4,
          items: [
            { labelLatex: '\\sin', insert: '\\sin\\left(#0\\right)' },
            { labelLatex: '\\cos', insert: '\\cos\\left(#0\\right)' },
            { labelLatex: '\\tan', insert: '\\tan\\left(#0\\right)' },
            { labelLatex: '^{\\circ}', insert: '^{\\circ}', title: 'Graus sexagesimals' },
            { labelLatex: '\\arcsin', insert: '\\arcsin\\left(#0\\right)' },
            { labelLatex: '\\arccos', insert: '\\arccos\\left(#0\\right)' },
            { labelLatex: '\\arctan', insert: '\\arctan\\left(#0\\right)' },
            { labelLatex: '\\sin^2 x', insert: '\\sin^{2}\\left(#0\\right)' }
          ]
        },
        {
          title: 'Logaritmes i Exponencials',
          cols: 4,
          items: [
            { labelLatex: '\\ln', insert: '\\ln\\left(#0\\right)', title: 'Logaritme neperià' },
            { labelLatex: '\\log', insert: '\\log\\left(#0\\right)', title: 'Logaritme decimal (base 10)' },
            { labelLatex: '\\log_b', insert: '\\log_{#?}\\left(#0\\right)', title: 'Logaritme en base b' },
            { labelLatex: 'e^x', insert: 'e^{#0}', title: 'Exponencial base e' },
            { labelLatex: '10^x', insert: '10^{#0}', title: 'Potència de 10' },
            { labelLatex: 'e', insert: 'e', title: 'Constant d\'Euler e ≈ 2,71828' },
            { labelLatex: '\\pi', insert: '\\pi', title: 'Constant pi ≈ 3,14159' },
            { labelLatex: 'i', insert: 'i', title: 'Unitat imaginària' }
          ]
        },
        {
          title: 'Domini i Estudi de Funcions',
          cols: 3,
          items: [
            { labelLatex: '\\text{Dom}(f)', insert: '\\text{Dom}(#0) = ', title: 'Domini de la funció' },
            { labelLatex: '\\text{Im}(f)', insert: '\\text{Im}(#0) = ', title: 'Imatge / recorregut' },
            { labelLatex: 'f\\circ g', insert: '\\circ ', title: 'Composició de funcions' }
          ]
        }
      ]
    },
    {
      id: 'simbols',
      label: 'Símbols i Gregues',
      layout: 'Categorized',
      groups: [
        {
          title: 'Lògica i Conjunts Numèrics',
          cols: 6,
          items: [
            { labelLatex: '\\Rightarrow', insert: '\\Rightarrow ' },
            { labelLatex: '\\Leftrightarrow', insert: '\\Leftrightarrow ' },
            { labelLatex: '\\forall', insert: '\\forall ' },
            { labelLatex: '\\exists', insert: '\\exists ' },
            { labelLatex: '\\nexists', insert: '\\nexists ' },
            { labelLatex: '\\therefore', insert: '\\therefore ', title: 'Per tant' },
            { labelLatex: '\\in', insert: '\\in ' },
            { labelLatex: '\\notin', insert: '\\notin ' },
            { labelLatex: '\\cup', insert: '\\cup ' },
            { labelLatex: '\\cap', insert: '\\cap ' },
            { labelLatex: '\\subset', insert: '\\subset ' },
            { labelLatex: '\\emptyset', insert: '\\emptyset ' },
            { labelLatex: '\\mathbb{R}', insert: '\\mathbb{R}' },
            { labelLatex: '\\mathbb{R}-\\{\\}', insert: '\\mathbb{R} - \\left\\{#0\\right\\}', title: 'Tots els reals excepte...' },
            { labelLatex: '\\mathbb{N}', insert: '\\mathbb{N}' },
            { labelLatex: '\\mathbb{Z}', insert: '\\mathbb{Z}' },
            { labelLatex: '\\mathbb{Q}', insert: '\\mathbb{Q}' },
            { labelLatex: '\\mathbb{C}', insert: '\\mathbb{C}' }
          ]
        },
        {
          title: 'Alfabet Grec',
          cols: 6,
          items: [
            { labelLatex: '\\alpha', insert: '\\alpha' },
            { labelLatex: '\\beta', insert: '\\beta' },
            { labelLatex: '\\gamma', insert: '\\gamma' },
            { labelLatex: '\\delta', insert: '\\delta' },
            { labelLatex: '\\Delta', insert: '\\Delta' },
            { labelLatex: '\\varepsilon', insert: '\\varepsilon' },
            { labelLatex: '\\theta', insert: '\\theta' },
            { labelLatex: '\\lambda', insert: '\\lambda' },
            { labelLatex: '\\mu', insert: '\\mu' },
            { labelLatex: '\\rho', insert: '\\rho' },
            { labelLatex: '\\sigma', insert: '\\sigma' },
            { labelLatex: '\\tau', insert: '\\tau' },
            { labelLatex: '\\varphi', insert: '\\varphi' },
            { labelLatex: '\\omega', insert: '\\omega' },
            { labelLatex: '\\Omega', insert: '\\Omega' },
            { labelLatex: '\\Delta x', insert: '\\Delta x' },
            { labelLatex: '\\Delta y', insert: '\\Delta y' },
            { labelLatex: '\\Delta t', insert: '\\Delta t' }
          ]
        }
      ]
    }
  ];

  const CUSTOM_INLINE_SHORTCUTS = {
    'trossos': 'f(x) = \\begin{cases} #? & \\text{si } x < #? \\\\ #? & \\text{si } x \\ge #? \\end{cases}',
    'cases': '\\begin{cases} #? \\\\ #? \\end{cases}',
    'lim': '\\lim_{x\\to #?}',
    'int': '\\int #? \\,dx',
    'dint': '\\int_{#?}^{#?} #? \\,dx',
    'sum': '\\sum_{i=1}^{#?}',
    'sqrt': '\\sqrt{#?}',
    'cbrt': '\\sqrt[3]{#?}',
    'root': '\\sqrt[#?]{#?}',
    '->': '\\rightarrow',
    '=>': '\\Rightarrow',
    '<=>': '\\Leftrightarrow',
    '+-': '\\pm',
    '-+': '\\mp',
    '!=': '\\neq',
    '<=': '\\le',
    '>=': '\\ge',
    '~=': '\\approx',
    'inf': '\\infty',
    'oo': '\\infty',
    'RR': '\\mathbb{R}',
    'NN': '\\mathbb{N}',
    'ZZ': '\\mathbb{Z}',
    'QQ': '\\mathbb{Q}',
    'CC': '\\mathbb{C}',
    'alpha': '\\alpha',
    'beta': '\\beta',
    'gamma': '\\gamma',
    'delta': '\\delta',
    'Delta': '\\Delta',
    'theta': '\\theta',
    'lambda': '\\lambda',
    'mu': '\\mu',
    'sigma': '\\sigma',
    'omega': '\\omega',
    'pi': '\\pi'
  };

  // ==========================================================================
  // GUIA MESTRA EXHAUSTIVA: Totes i cadascuna de les funcionalitats en ordre!
  // ==========================================================================
  const FULL_SHOWCASE_BLOCKS = [
    {
      type: 'section',
      title: '1. Estructura en Apartats, Blocs de Text amb Salt Automàtic i Equacions Multilínia'
    },
    {
      type: 'apartat',
      label: 'Apartat 1a — Combinar paràgrafs d\'enunciat i passos matemàtics dins d\'un sol apartat',
      accent: 'blue',
      items: [
        {
          kind: 'text',
          text: 'Ara cada divisió horitzontal de la pissarra és un APARTAT complet! Dins d\'un mateix apartat hi pots escriure blocs de text llargs com aquest (enunciats de problemes, justificacions teòriques o conclusions) i fan salt de línia automàtic sense sobrepassar mai pel costat.\nA sota del text, dins del mateix apartat, pots encadenar tantes línies d\'equacions com vulguis (prem Enter per afegir una altra línia d\'equació al mateix apartat, o Cmd/Ctrl+Enter —o doble Enter en buit— per crear un apartat nou):'
        },
        {
          kind: 'math',
          latex: '\\frac{x^2 - 9}{x^2 - 3x} = \\frac{\\cancel{(x - 3)}(x + 3)}{x\\cdot\\cancel{(x - 3)}} = \\boxed{\\frac{x + 3}{x}} \\quad \\text{(identitat per a tot valor diferent de 3)}'
        },
        {
          kind: 'math',
          latex: '6 = 2 \\cdot 3 = \\frac{12}{2} \\rightarrow 6 \\text{ és un enter (escrit prement " per a text curt dins la fórmula!)}'
        }
      ]
    },
    {
      type: 'apartat',
      label: 'Apartat 1b — Pissarra neta sense triangles d\'error + Càlcul ràpid opcional',
      accent: 'none',
      items: [
        {
          kind: 'text',
          text: 'A diferència de Desmos Scientific, aquí pots escriure expressions simbòliques obertes, arrels enèsimes o subíndexs amb accents (com y_màx i λ_0) sense cap triangle d\'error; al Tauler de la dreta hi pots provar valors temporals! I si escrius una operació numèrica pura (segona línia), en passar-hi el ratolí veuràs un xip blau discret per inserir «= 29/12» només si vols.'
        },
        {
          kind: 'math',
          latex: '\\sqrt[5]{4y_{\\text{màx}}} + \\lambda_0'
        },
        {
          kind: 'math',
          latex: '\\frac{3}{4} + \\frac{5}{6} \\cdot 2'
        }
      ]
    },

    {
      type: 'section',
      title: '2. Scoreboard de Variables: Ordre Lliure, Subíndexs, Comes Catalanes i Fraccions Exactes'
    },
    {
      type: 'apartat',
      label: 'Apartat 2a — Escriure la fórmula abans que les dades i fraccions irreductibles',
      accent: 'green',
      items: [
        {
          kind: 'text',
          text: 'Quan expliques un problema a classe, sovint escrius primer la fórmula general i després les dades de l\'enunciat. El motor propaga els valors automàticament en qualsevol ordre, entén la coma decimal catalana (6,5) i et mostra al Scoreboard tant la fracció exacta com l\'aproximació decimal!'
        },
        {
          kind: 'math',
          latex: 'A_{\\text{triangle}} = \\frac{b \\cdot h}{2}'
        },
        {
          kind: 'math',
          latex: 'b = 6,5, \\quad h = 3 \\Rightarrow \\boxed{A_{\\text{triangle}} = \\frac{39}{4} = 9,75}'
        }
      ]
    },
    {
      type: 'apartat',
      label: 'Apartat 2b — Física i cinemàtica amb subíndexs, increments (Δ) i radicals exactes',
      accent: 'none',
      items: [
        {
          kind: 'math',
          latex: 'v_0 = 15, \\quad a_c = -2, \\quad \\Delta t = 4'
        },
        {
          kind: 'math',
          latex: '\\Delta x = v_0 \\cdot \\Delta t + \\frac{1}{2} a_c (\\Delta t)^2'
        },
        {
          kind: 'math',
          latex: 'v_{\\text{final}} = \\sqrt{v_0^2 + 2 a_c \\Delta x}, \\qquad d_{\\text{diagonal}} = \\sqrt{12} \\quad \\text{(simplifica radicals com 2√3 automàticament!)}'
        }
      ]
    },

    {
      type: 'section',
      title: '3. Funcions Declarades, Taula de Valors, Derivades f\'(a) i Gràfica Interactiva 📈'
    },
    {
      type: 'apartat',
      label: 'Apartat 3a — Estudi d\'una funció, Taxa de Variació Mitjana (TVM) i Recta Tangent',
      accent: 'blue',
      items: [
        {
          kind: 'text',
          text: 'Clica a qualsevol equació d\'aquest exercici i mira el Scoreboard de la dreta: a la targeta de f(x) hi tens una casella per avaluar f(x) al vol i un botó «📈 Gràfica» que t\'obre la representació cartesiana interactiva amb f(x) i la seva recta tangent t(x) dibuixades juntes!'
        },
        {
          kind: 'math',
          latex: 'f(x) = x^3 - 3x + 1'
        },
        {
          kind: 'math',
          latex: '\\text{TVM} = \\frac{f(2) - f(0)}{2 - 0}'
        },
        {
          kind: 'math',
          latex: 'x_0 = 2, \\quad y_0 = f(x_0), \\quad m = f\'(x_0), \\quad c_2 = f\'\'(x_0)'
        },
        {
          kind: 'math',
          latex: 't(x) = y_0 + m(x - x_0) \\Rightarrow \\boxed{t(x) = 9x - 15}'
        }
      ]
    },

    {
      type: 'section',
      title: '4. Funcions Definides a Trossos, Continuïtat, Salts i Paràmetres'
    },
    {
      type: 'apartat',
      label: 'Apartat 4a — Funció a 3 trossos: límits laterals, discontinuïtats i punts ○ / ● a la gràfica',
      accent: 'blue',
      items: [
        {
          kind: 'text',
          text: 'A la pestanya «Càlcul i Anàlisi» tens plantilles directes de funcions a 2 i 3 trossos (o escriu la drecera «trossos»). Clica a g(x) i mira el Scoreboard: analitza automàticament els punts de ruptura (x = 1 i x = 3), calcula límits laterals i, si obres «📈 Gràfica», dibuixa cada tros sense línies verticals falses i amb els punts plens (●) i buits (○) exactes!'
        },
        {
          kind: 'math',
          latex: 'g(x) = \\begin{cases} x^2 + 1 & \\text{si } x < 1 \\\\ 5 - x & \\text{si } 1 \\le x < 3 \\\\ 4 & \\text{si } x > 3 \\end{cases}'
        },
        {
          kind: 'math',
          latex: 'L_{1^-} = \\lim_{x \\to 1^{-}} g(x), \\qquad L_{1^+} = \\lim_{x \\to 1^{+}} g(x), \\qquad g_1 = g(1)'
        }
      ]
    },
    {
      type: 'apartat',
      label: 'Apartat 4b — Estudi de paràmetres perquè una funció sigui contínua i derivable',
      accent: 'green',
      items: [
        {
          kind: 'text',
          text: 'En imposar la igualtat dels límits laterals de p(x) i de p\'(x) en x = 1, el motor resol automàticament els paràmetres a = -2 i b = 7 i verifica al Scoreboard que p(x) passa a ser contínua i derivable!'
        },
        {
          kind: 'math',
          latex: 'p(x) = \\begin{cases} a x^2 + b x & \\text{si } x \\le 1 \\\\ 3x + 2 & \\text{si } x > 1 \\end{cases}'
        },
        {
          kind: 'math',
          latex: '\\lim_{x \\to 1^{-}} p(x) = \\lim_{x \\to 1^{+}} p(x), \\qquad \\lim_{x \\to 1^{-}} p\'(x) = \\lim_{x \\to 1^{+}} p\'(x)'
        }
      ]
    },

    {
      type: 'section',
      title: '5. Resolució Automàtica d\'Equacions (1r Grau, 2n Grau, ± i Arrels Complexes)'
    },
    {
      type: 'apartat',
      label: 'Apartat 5a — Deducció automàtica d\'incògnites sense necessitat d\'aïllar-les',
      accent: 'none',
      items: [
        {
          kind: 'text',
          text: 'Encara que no aïllis la incògnita a l\'esquerra, el Scoreboard resol equacions lineals (p = 11/3), equacions de segon grau amb múltiples solucions (q ∈ {2, 3}), expressions amb ± (nombre d\'or φ) i fins i tot t\'indica les solucions imaginàries (±3i) quan no hi ha arrels reals!'
        },
        {
          kind: 'math',
          latex: '5p - 7 = 2p + 4'
        },
        {
          kind: 'math',
          latex: 'q^2 - 5q + 6 = 0'
        },
        {
          kind: 'math',
          latex: '\\varphi = \\frac{1 \\pm \\sqrt{5}}{2}'
        },
        {
          kind: 'math',
          latex: 'z^2 + 9 = 0'
        }
      ]
    },

    {
      type: 'section',
      title: '6. Àlgebra Lineal: Sistemes de Gauss (SCD, SCI, SI), Matrius i Determinants'
    },
    {
      type: 'apartat',
      label: 'Apartat 6a — Sistema lineal 3×3 resolt per Gauss i Determinants 2×2 / 3×3 (Sarrus)',
      accent: 'green',
      items: [
        {
          kind: 'text',
          text: 'Pots escriure sistemes amb la clau de sistemes (pestanya «Càlcul i Anàlisi») o en línies separades. El motor aplica Gauss-Jordan (resolent x = 2, y = 1, z = 2) i desenvolupa determinants 2×2 i 3×3 (D_3 = 33), fins i tot aïllant el paràmetre k = 2 dins d\'un determinant!'
        },
        {
          kind: 'math',
          latex: '\\begin{cases} 2x + y - z = 3 \\\\ x - y + 2z = 5 \\\\ 3x + 2y + z = 10 \\end{cases}'
        },
        {
          kind: 'math',
          latex: 'D_3 = \\begin{vmatrix} 1 & 2 & -1 \\\\ 0 & 3 & 4 \\\\ 2 & 1 & 5 \\end{vmatrix}, \\qquad \\begin{vmatrix} k & 2 \\\\ 3 & 5 \\end{vmatrix} = 4'
        },
        {
          kind: 'math',
          latex: 'M = \\begin{pmatrix} 1 & 2 & -1 \\\\ 0 & 3 & 4 \\\\ 2 & 1 & 5 \\end{pmatrix} \\quad \\text{(notació matricial per explicar rang i inversa)}'
        }
      ]
    },
    {
      type: 'apartat',
      label: 'Apartat 6b — Detecció de Sistemes Incompatibles (SI) en discussió de Rouché-Frobenius',
      accent: 'amber',
      items: [
        {
          kind: 'math',
          latex: '\\begin{cases} u + v = 4 \\\\ 2u + 2v = 15 \\end{cases} \\quad \\text{(el Scoreboard detecta Sistema Incompatible sense embrutar la pissarra!)}'
        }
      ]
    },

    {
      type: 'section',
      title: '7. Anàlisi Matemàtica: Límits, Indeterminacions, L\'Hôpital, Integrals i Barrow'
    },
    {
      type: 'apartat',
      label: 'Apartat 7a — Límits laterals, a l\'infinit i resolució d\'indeterminacions',
      accent: 'none',
      items: [
        {
          kind: 'math',
          latex: 'L_{\\infty} = \\lim_{x \\to +\\infty} \\frac{3x^2 - 5x + 1}{x^2 + 4} = \\left[\\frac{\\infty}{\\infty}\\right] = 3'
        },
        {
          kind: 'math',
          latex: 'L_0 = \\lim_{x \\to 0} \\frac{\\sin(x)}{x} = \\left[\\frac{0}{0}\\right] \\xrightarrow{\\text{L\'Hôpital}} \\lim_{x \\to 0} \\frac{\\cos(x)}{1} = 1'
        },
        {
          kind: 'math',
          latex: '\\lim_{x \\to 2^{+}} \\frac{1}{x - 2} = +\\infty, \\qquad \\lim_{x \\to 2^{-}} \\frac{1}{x - 2} = -\\infty \\Rightarrow x = 2 \\text{ és asímptota vertical}'
        }
      ]
    },
    {
      type: 'apartat',
      label: 'Apartat 7b — Integració indefinida, càlcul d\'àrees i Regla de Barrow',
      accent: 'green',
      items: [
        {
          kind: 'math',
          latex: '\\int \\left(3x^2 - 2x + e^x\\right)\\,dx = x^3 - x^2 + e^x + C'
        },
        {
          kind: 'math',
          latex: 'I_{\\text{àrea}} = \\int_0^{\\pi} \\sin(x)\\,dx = \\Big[-\\cos(x)\\Big]_0^{\\pi} = (-\\cos\\pi) - (-\\cos 0) = \\boxed{2}'
        }
      ]
    },

    {
      type: 'section',
      title: '8. Trigonometria (RAD / DEG), Sumatoris, Combinatòria, Vectors i Eines de Classe'
    },
    {
      type: 'apartat',
      label: 'Apartat 8a — Angles, múltiples exactes de π, sumatoris i nombres combinatoris',
      accent: 'none',
      items: [
        {
          kind: 'math',
          latex: 's_{\\text{trig}} = \\sin\\left(30^{\\circ}\\right) + \\cos\\left(\\frac{\\pi}{3}\\right), \\qquad \\omega_{\\text{gir}} = \\frac{3\\pi}{4}'
        },
        {
          kind: 'math',
          latex: 'S_{10} = \\sum_{i=1}^{10} i, \\qquad C_{6,2} = \\binom{6}{2}, \\qquad P_5 = 5!, \\qquad r_{\\text{log}} = \\log_2(32)'
        }
      ]
    },
    {
      type: 'apartat',
      label: 'Apartat 8b — Geometria a l\'espai, conjunts numèrics i recordatori d\'eines de classe',
      accent: 'amber',
      items: [
        {
          kind: 'math',
          latex: '\\vec{u} = (2, -1, 3), \\quad \\vec{v} = (1, 2, 0) \\Rightarrow \\vec{u}\\cdot\\vec{v} = 0 \\Leftrightarrow \\vec{u} \\perp \\vec{v}'
        },
        {
          kind: 'math',
          latex: '\\forall x \\in \\mathbb{R} - \\{-1, 1\\}, \\qquad \\text{Dom}(h) = (-\\infty, -1) \\cup (1, +\\infty)'
        },
        {
          kind: 'text',
          text: '💡 Resum d\'eines a la barra superior per a les teves classes online:\n• 📚 Llibretes: organitza cursos i alumnes en llibretes i pàgines.\n• 💾 Desar / Obrir: guarda i recupera tot l\'espai sencer, una llibreta concreta o una sola pàgina en un fitxer al teu ordinador.\n• 🔴 Làser i ✏️ Anotar: assenyala amb punter làser efímer o dibuixa fletxes a mà alçada sobre les equacions.\n• ⏱️ Temps: cronòmetre o compte enrere integrat per quan deixes uns minuts a l\'alumne.\n• 📊 Variables: filtra per «Apartat», «Exercici» o «Pàgina» i obre la «📈 Gràfica» de qualsevol funció!\n• 🖨️ PDF: genera un full d\'apunts net per enviar a l\'alumne en acabar la classe.'
        }
      ]
    }
  ];

  global.KeypadConfig = {
    KEYPAD_TABS,
    CUSTOM_INLINE_SHORTCUTS,
    FULL_SHOWCASE_BLOCKS
  };
})(typeof window !== 'undefined' ? window : globalThis);
