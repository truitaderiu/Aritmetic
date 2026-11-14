/**
 * keypads.js
 * Configuració declarativa dels teclats matemàtics inferiors d'Aritmètic,
 * dreceres ràpides d'escriptura en línia (MathLive `inlineShortcuts`) i el Tour Complet d'exemples.
 *
 * ESTRUCTURA D'UN BOTÓ DE TECLAT:
 * - `labelLatex` | `labelText`: contingut visual renderitzat al botó (s'auto-escala via `fitKeypadButtonLabels()`).
 * - `insert`: plantilla LaTeX per a MathLive (`#0` = selecció actual o primer camp, `#?` = següent placeholder).
 * - `cmd`: comanda nativa de MathLive (`moveToPreviousChar`, `deleteBackward`, `addRowAfter`, etc.).
 * - `action`: acció d'alt nivell gestionada per `handleKeyButtonPress` a `js/app.js`
 *   (`insertInlineText`, `addTextBlockInApartat`, `addImageInApartat`, `newMathLineInApartat`, `newApartatBelow`).
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
        { labelText: '«text»', action: 'insertInlineText', className: 'btn-text-mode', title: 'Text curt dins de l\'equació amb salt de línia (drecera: ")' },

        { labelLatex: '\\lim_{x\\to a}', insert: '\\lim_{x\\to #0}', title: 'Límit quan x tendeix a... (lim)' },
        { labelLatex: '\\infty', insert: '\\infty', title: 'Infinit (inf)' },
        { labelLatex: '\\pm', insert: '\\pm', title: 'Més / menys (+-)' },
        { labelLatex: '\\Rightarrow', insert: '\\Rightarrow ', title: 'Implica (=>)' },

        { labelLatex: '(', insert: '\\left(#0\\right)', title: 'Parèntesis' },
        { labelLatex: '[\\,]', insert: '\\left[#0\\right]', title: 'Claudàtors' },
        { labelLatex: '\\{\\,\\}', insert: '\\left\\{#0\\right\\}', title: 'Claus { } (Mac: Option+ç)' },
        { labelLatex: '\\rightarrow', insert: '\\rightarrow ', title: 'Fletxa (->)' },

        { labelLatex: ':=', insert: ':= ', title: 'Definició (:=)' },
        { labelLatex: '\\partial', insert: '\\partial ', title: 'Derivada parcial (drecera: partial)' },
        { labelLatex: '\\left. f \\right|_{x=a}', insert: '\\left.#0\\right|_{#?}', title: 'Avaluar expressió en... (drecera: eval)' },
        { labelLatex: '\\pi', insert: '\\pi', title: 'Nombre pi (pi)' }
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
        { labelText: '¶ Text', action: 'addTextBlockInApartat', className: 'btn-text-mode', title: 'Afegeix un paràgraf de text amb format i salt de línia automàtic (Alt+T)', span: 1 },
        { labelText: '⌫', cmd: 'deleteBackward', className: 'btn-backspace', title: 'Esborrar caràcter', span: 2 },

        { labelLatex: '\\mathbf{N}', cmd: 'mathBold', className: 'btn-text-mode', title: 'Negreta dins de l\'equació o selecció (Cmd/Ctrl+B)', span: 1 },
        { labelLatex: '\\underline{S}', cmd: 'mathUnderline', className: 'btn-text-mode', title: 'Subratllar selecció o bloc (Cmd/Ctrl+U)', span: 1 },
        { labelText: '↵ Nova línia', action: 'newMathLineInApartat', className: 'btn-enter', title: 'Nova línia d\'equació dins del mateix apartat (Enter)', span: 2 },

        { labelText: '⊞ Nou apartat', action: 'newApartatBelow', className: 'btn-enter-secondary', title: 'Crea un nou apartat a sota (Cmd/Ctrl + Enter o doble Enter)', span: 4 }
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
          title: 'Derivades, Parcials i Integrals',
          cols: 4,
          items: [
            { labelLatex: 'f\'(x)', insert: 'f\'(#0)', title: 'Derivada primera' },
            { labelLatex: 'f\'\'(x)', insert: 'f\'\'(#0)', title: 'Derivada segona' },
            { labelLatex: '\\frac{d}{dx}', insert: '\\frac{d}{dx}\\left(#0\\right)', title: 'Operador derivada respecte x (drecera: ddx)' },
            { labelLatex: '\\frac{dy}{dx}', insert: '\\frac{d#0}{d#?}', title: 'Notació de Leibniz' },
            { labelLatex: '\\partial', insert: '\\partial ', title: 'Símbol de derivada parcial (partial)' },
            { labelLatex: '\\frac{\\partial}{\\partial x}', insert: '\\frac{\\partial}{\\partial #?}\\left(#0\\right)', title: 'Operador derivada parcial (drecera: pd)' },
            { labelLatex: '\\frac{\\partial f}{\\partial x}', insert: '\\frac{\\partial #0}{\\partial #?}', title: 'Derivada parcial de funció' },
            { labelLatex: '\\frac{\\partial^2 f}{\\partial x^2}', insert: '\\frac{\\partial^{2} #0}{\\partial #?^{2}}', title: 'Derivada parcial segona' },
            { labelLatex: '\\frac{\\partial^2 f}{\\partial x\\partial y}', insert: '\\frac{\\partial^{2} #0}{\\partial #? \\partial #?}', title: 'Derivada parcial mixta' },
            { labelLatex: '\\nabla', insert: '\\nabla #0', title: 'Gradient / nabla (nabla)' },
            { labelLatex: '\\left. f(x) \\right|_{x=a}', insert: '\\left.#0\\right|_{#?=#?}', title: 'Barra vertical d\'avaluació (eval)' },
            { labelLatex: '\\Big[F(x)\\Big]_a^b', insert: '\\left[#0\\right]_{#?}^{#?}', title: 'Regla de Barrow (barrow)' },
            { labelLatex: '\\int f\\,dx', insert: '\\int #0 \\,dx', title: 'Integral indefinida (int)' },
            { labelLatex: '\\int_a^b f\\,dx', insert: '\\int_{#?}^{#?} #0 \\,dx', title: 'Integral definida (dint)' },
            { labelLatex: '\\iint f', insert: '\\iint #0 \\,dx\\,dy', title: 'Integral doble (notació)' },
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
          title: 'Sistemes, Sèries i Funció Gamma',
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
            { labelLatex: '\\textstyle\\sum_{i=1}^n', insert: '\\sum_{#?=0}^{#?} #0', title: 'Sumatori (sum)' },
            { labelLatex: '\\textstyle\\prod_{i=1}^n', insert: '\\prod_{#?=1}^{#?} #0', title: 'Productori' },
            { labelLatex: '\\binom{n}{k}', insert: '\\binom{#0}{#?}', title: 'Nombre combinatori' },
            { labelLatex: 'n!', insert: '#0!', title: 'Factorial (enters i reals)' },
            { labelLatex: '\\Gamma(z)', insert: '\\Gamma\\left(#0\\right)', title: 'Funció Gamma Γ(z)' },
            { labelLatex: '\\text{mcd}(a,b)', insert: '\\operatorname{mcd}\\left(#0, #?\\right)', title: 'Màxim comú divisor / mcm' }
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
              title: 'Matriu 2×2 amb parèntesis'
            },
            {
              labelLatex: '\\begin{pmatrix} \\cdot & \\cdot & \\cdot \\\\ \\cdot & \\cdot & \\cdot \\\\ \\cdot & \\cdot & \\cdot \\end{pmatrix}',
              insert: '\\begin{pmatrix} #0 & #? & #? \\\\ #? & #? & #? \\\\ #? & #? & #? \\end{pmatrix}',
              title: 'Matriu 3×3'
            },
            {
              labelLatex: '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}',
              insert: '\\begin{bmatrix} #0 & #? \\\\ #? & #? \\end{bmatrix}',
              title: 'Matriu 2×2 amb claudàtors'
            },
            {
              labelLatex: '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}',
              insert: '\\begin{vmatrix} #0 & #? \\\\ #? & #? \\end{vmatrix}',
              title: 'Determinant 2×2 (es calcula automàticament!)'
            },
            {
              labelLatex: '\\begin{vmatrix} \\cdot & \\cdot & \\cdot \\\\ \\cdot & \\cdot & \\cdot \\\\ \\cdot & \\cdot & \\cdot \\end{vmatrix}',
              insert: '\\begin{vmatrix} #0 & #? & #? \\\\ #? & #? & #? \\\\ #? & #? & #? \\end{vmatrix}',
              title: 'Determinant 3×3 (o superior NxN)'
            },
            { labelText: '+ Fila mat.', cmd: 'addRowAfter', title: 'Afegeix fila a la matriu o sistema actual' },
            { labelText: '+ Columna', cmd: 'addColumnAfter', title: 'Afegeix columna a la matriu actual' },
            { labelLatex: 'A^{-1}', insert: '#0^{-1}', title: 'Matriu inversa' },
            { labelLatex: 'A^T', insert: '#0^{T}', title: 'Matriu transposada' },
            { labelLatex: '\\det(A)', insert: '\\det\\left(#0\\right)', title: 'Determinant de matriu' },
            { labelLatex: '\\operatorname{tr}(A)', insert: '\\operatorname{tr}\\left(#0\\right)', title: 'Traça d\'una matriu' },
            { labelLatex: '\\operatorname{rang}(A)', insert: '\\operatorname{rang}\\left(#0\\right)', title: 'Rang d\'una matriu' }
          ]
        },
        {
          title: 'Vectors i Espai Afí / Euclidià',
          cols: 4,
          items: [
            { labelLatex: '(x,y)', insert: '(#0, #?)', title: 'Vector 2D per components' },
            { labelLatex: '(x,y,z)', insert: '(#0, #?, #?)', title: 'Vector 3D per components' },
            { labelLatex: '\\vec{v}', insert: '\\vec{#0}', title: 'Vector amb fletxa' },
            { labelLatex: '\\overrightarrow{AB}', insert: '\\overrightarrow{#0}', title: 'Vector entre dos punts' },
            { labelLatex: '\\|\\vec{v}\\|', insert: '\\left\\|#0\\right\\|', title: 'Mòdul / norma d\'un vector' },
            { labelLatex: '\\vec{u}\\cdot\\vec{v}', insert: '\\cdot ', title: 'Producte escalar (u · v)' },
            { labelLatex: '\\vec{u}\\times\\vec{v}', insert: '\\times ', title: 'Producte vectorial 3D (u × v)' },
            { labelLatex: '\\operatorname{angle}', insert: '\\operatorname{angle}\\left(#0, #?\\right)', title: 'Angle entre dos vectors' },
            { labelLatex: '\\operatorname{proj}_{\\vec{v}}', insert: '\\operatorname{proj}_{#?}\\left(#0\\right)', title: 'Projecció ortogonal de vector' },
            { labelLatex: '\\perp', insert: '\\perp ', title: 'Perpendicular' },
            { labelLatex: '\\parallel', insert: '\\parallel ', title: 'Paral·lel' },
            { labelLatex: '\\widehat{ABC}', insert: '\\widehat{#0}', title: 'Angle entre rectes/plans' }
          ]
        },
        {
          title: 'Aritmètica, Polinomis i Fórmules',
          cols: 4,
          items: [
            { labelLatex: '\\operatorname{mcd}', insert: '\\operatorname{mcd}\\left(#0, #?\\right)', title: 'Màxim comú divisor' },
            { labelLatex: '\\operatorname{mcm}', insert: '\\operatorname{mcm}\\left(#0, #?\\right)', title: 'Mínim comú múltiple' },
            { labelLatex: '\\Delta = b^2-4ac', insert: '\\Delta = b^2 - 4ac', title: 'Discriminant' },
            { labelLatex: '\\frac{-b\\pm\\sqrt{\\dots}}{2a}', insert: '\\frac{-#0 \\pm \\sqrt{#?}}{2#?}', title: 'Equació de 2n grau' }
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
          title: 'Logaritmes, Exponencials i Especials',
          cols: 4,
          items: [
            { labelLatex: '\\ln', insert: '\\ln\\left(#0\\right)', title: 'Logaritme neperià' },
            { labelLatex: '\\log', insert: '\\log\\left(#0\\right)', title: 'Logaritme decimal (base 10)' },
            { labelLatex: '\\log_b', insert: '\\log_{#?}\\left(#0\\right)', title: 'Logaritme en base b' },
            { labelLatex: 'e^x', insert: 'e^{#0}', title: 'Exponencial base e' },
            { labelLatex: '\\Gamma(x)', insert: '\\Gamma\\left(#0\\right)', title: 'Funció Gamma' },
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
          title: 'Definició, Equivalències i Relacions',
          cols: 6,
          items: [
            { labelLatex: ':=', insert: ':= ', title: 'Definició (:=)' },
            { labelLatex: '\\equiv', insert: '\\equiv ', title: 'Idèntic / equivalent / congruent (equiv)' },
            { labelLatex: '\\triangleq', insert: '\\triangleq ', title: 'Igual per definició (triangle)' },
            { labelLatex: '\\stackrel{\\text{def}}{=}', insert: '\\stackrel{\\text{def}}{=} ', title: 'Igual per definició (def=)' },
            { labelLatex: '\\approx', insert: '\\approx ', title: 'Aproximadament (~=)' },
            { labelLatex: '\\sim', insert: '\\sim ', title: 'Asimptòtic / distribució estadística (~)' },
            { labelLatex: '\\simeq', insert: '\\simeq ', title: 'Aproximat / isomorf' },
            { labelLatex: '\\cong', insert: '\\cong ', title: 'Congruent' },
            { labelLatex: '\\propto', insert: '\\propto ', title: 'Proporcional a' },
            { labelLatex: '\\Rightarrow', insert: '\\Rightarrow ', title: 'Implica (=>)' },
            { labelLatex: '\\Leftrightarrow', insert: '\\Leftrightarrow ', title: 'Si i només si (<=>)' },
            { labelLatex: '\\mapsto', insert: '\\mapsto ', title: 'Assigna / aplica (x |-> f(x))' }
          ]
        },
        {
          title: 'Lògica i Conjunts Numèrics',
          cols: 6,
          items: [
            { labelLatex: '\\forall', insert: '\\forall ' },
            { labelLatex: '\\exists', insert: '\\exists ' },
            { labelLatex: '\\nexists', insert: '\\nexists ' },
            { labelLatex: '\\therefore', insert: '\\therefore ', title: 'Per tant' },
            { labelLatex: '\\because', insert: '\\because ', title: 'Perquè' },
            { labelLatex: '\\emptyset', insert: '\\emptyset ' },
            { labelLatex: '\\in', insert: '\\in ' },
            { labelLatex: '\\notin', insert: '\\notin ' },
            { labelLatex: '\\subset', insert: '\\subset ' },
            { labelLatex: '\\subseteq', insert: '\\subseteq ' },
            { labelLatex: '\\cup', insert: '\\cup ' },
            { labelLatex: '\\cap', insert: '\\cap ' },
            { labelLatex: '\\setminus', insert: '\\setminus ', title: 'Diferència de conjunts' },
            { labelLatex: '\\mathbb{R}', insert: '\\mathbb{R}' },
            { labelLatex: '\\mathbb{R}-\\{\\}', insert: '\\mathbb{R} - \\left\\{#0\\right\\}', title: 'Tots els reals excepte...' },
            { labelLatex: '\\mathbb{N}', insert: '\\mathbb{N}' },
            { labelLatex: '\\mathbb{Z}', insert: '\\mathbb{Z}' },
            { labelLatex: '\\mathbb{Q}', insert: '\\mathbb{Q}' },
            { labelLatex: '\\mathbb{C}', insert: '\\mathbb{C}' },
            { labelLatex: '\\pm', insert: '\\pm' },
            { labelLatex: '\\mp', insert: '\\mp' },
            { labelLatex: '\\mathbf{N}', cmd: 'mathBold', className: 'btn-text-mode', title: 'Negreta (Cmd/Ctrl+B)' },
            { labelLatex: '\\underline{S}', cmd: 'mathUnderline', className: 'btn-text-mode', title: 'Subratllat (Cmd/Ctrl+U)' }
          ]
        },
        {
          title: 'Alfabet Grec — Minúscules i Variants',
          cols: 8,
          items: [
            { labelLatex: '\\alpha', insert: '\\alpha', title: 'alfa (alpha)' },
            { labelLatex: '\\beta', insert: '\\beta', title: 'beta' },
            { labelLatex: '\\gamma', insert: '\\gamma', title: 'gamma' },
            { labelLatex: '\\delta', insert: '\\delta', title: 'delta' },
            { labelLatex: '\\epsilon', insert: '\\epsilon', title: 'èpsilon' },
            { labelLatex: '\\varepsilon', insert: '\\varepsilon', title: 'èpsilon variant (epsilon)' },
            { labelLatex: '\\zeta', insert: '\\zeta', title: 'zeta' },
            { labelLatex: '\\eta', insert: '\\eta', title: 'eta' },
            { labelLatex: '\\theta', insert: '\\theta', title: 'theta' },
            { labelLatex: '\\vartheta', insert: '\\vartheta', title: 'theta variant (vartheta)' },
            { labelLatex: '\\iota', insert: '\\iota', title: 'iota' },
            { labelLatex: '\\kappa', insert: '\\kappa', title: 'kappa' },
            { labelLatex: '\\varkappa', insert: '\\varkappa', title: 'kappa variant' },
            { labelLatex: '\\lambda', insert: '\\lambda', title: 'lambda' },
            { labelLatex: '\\mu', insert: '\\mu', title: 'mu' },
            { labelLatex: '\\nu', insert: '\\nu', title: 'nu' },
            { labelLatex: '\\xi', insert: '\\xi', title: 'xi' },
            { labelLatex: '\\pi', insert: '\\pi', title: 'pi' },
            { labelLatex: '\\varpi', insert: '\\varpi', title: 'pi variant' },
            { labelLatex: '\\rho', insert: '\\rho', title: 'rho' },
            { labelLatex: '\\varrho', insert: '\\varrho', title: 'rho variant' },
            { labelLatex: '\\sigma', insert: '\\sigma', title: 'sigma' },
            { labelLatex: '\\varsigma', insert: '\\varsigma', title: 'sigma final' },
            { labelLatex: '\\tau', insert: '\\tau', title: 'tau' },
            { labelLatex: '\\upsilon', insert: '\\upsilon', title: 'ípsilon' },
            { labelLatex: '\\phi', insert: '\\phi', title: 'phi' },
            { labelLatex: '\\varphi', insert: '\\varphi', title: 'phi variant (phi)' },
            { labelLatex: '\\chi', insert: '\\chi', title: 'khi' },
            { labelLatex: '\\psi', insert: '\\psi', title: 'psi' },
            { labelLatex: '\\omega', insert: '\\omega', title: 'omega' },
            { labelLatex: '\\ell', insert: '\\ell', title: 'l cal·ligràfica' },
            { labelLatex: '\\hbar', insert: '\\hbar', title: 'constant de Planck reduïda' }
          ]
        },
        {
          title: 'Alfabet Grec — Majúscules i Operadors Especials',
          cols: 8,
          items: [
            { labelLatex: '\\Gamma', insert: '\\Gamma', title: 'Gamma majúscula / funció Gamma' },
            { labelLatex: '\\Delta', insert: '\\Delta', title: 'Delta majúscula' },
            { labelLatex: '\\Theta', insert: '\\Theta', title: 'Theta majúscula' },
            { labelLatex: '\\Lambda', insert: '\\Lambda', title: 'Lambda majúscula' },
            { labelLatex: '\\Xi', insert: '\\Xi', title: 'Xi majúscula' },
            { labelLatex: '\\Pi', insert: '\\Pi', title: 'Pi majúscula' },
            { labelLatex: '\\Sigma', insert: '\\Sigma', title: 'Sigma majúscula' },
            { labelLatex: '\\Upsilon', insert: '\\Upsilon', title: 'Ípsilon majúscula' },
            { labelLatex: '\\Phi', insert: '\\Phi', title: 'Phi majúscula' },
            { labelLatex: '\\Psi', insert: '\\Psi', title: 'Psi majúscula' },
            { labelLatex: '\\Omega', insert: '\\Omega', title: 'Omega majúscula' },
            { labelLatex: '\\aleph', insert: '\\aleph', title: 'Àlef (cardinalitat)' },
            { labelLatex: '\\partial', insert: '\\partial ', title: 'Derivada parcial' },
            { labelLatex: '\\nabla', insert: '\\nabla ', title: 'Nabla / gradient' },
            { labelLatex: '\\Delta x', insert: '\\Delta x', title: 'Increment de x' },
            { labelLatex: '\\Delta y', insert: '\\Delta y', title: 'Increment de y' }
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
    'sum': '\\sum_{i=0}^{#?}',
    'sqrt': '\\sqrt{#?}',
    'cbrt': '\\sqrt[3]{#?}',
    'root': '\\sqrt[#?]{#?}',
    'partial': '\\partial',
    'pd': '\\frac{\\partial #?}{\\partial #?}',
    'ddx': '\\frac{d}{dx}\\left(#?\\right)',
    'nabla': '\\nabla',
    'grad': '\\nabla',
    'def=': '\\stackrel{\\text{def}}{=}',
    ':=': ':=',
    'equiv': '\\equiv',
    'eval': '\\left.#?\\right|_{#?}',
    'barrow': '\\left[#?\\right]_{#?}^{#?}',
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
    'Gamma': '\\Gamma',
    'delta': '\\delta',
    'Delta': '\\Delta',
    'epsilon': '\\varepsilon',
    'varepsilon': '\\varepsilon',
    'zeta': '\\zeta',
    'eta': '\\eta',
    'theta': '\\theta',
    'vartheta': '\\vartheta',
    'Theta': '\\Theta',
    'kappa': '\\kappa',
    'lambda': '\\lambda',
    'Lambda': '\\Lambda',
    'mu': '\\mu',
    'nu': '\\nu',
    'xi': '\\xi',
    'Xi': '\\Xi',
    'pi': '\\pi',
    'Pi': '\\Pi',
    'rho': '\\rho',
    'sigma': '\\sigma',
    'Sigma': '\\Sigma',
    'tau': '\\tau',
    'upsilon': '\\upsilon',
    'Upsilon': '\\Upsilon',
    'phi': '\\varphi',
    'varphi': '\\varphi',
    'Phi': '\\Phi',
    'chi': '\\chi',
    'psi': '\\psi',
    'Psi': '\\Psi',
    'omega': '\\omega',
    'Omega': '\\Omega'
  };

  // ==========================================================================
  // GUIA PAS A PAS COMPLETA D'ARITMÈTIC: Totes les funcions explicades en ordre!
  // ==========================================================================
  const TOUR_EXAMPLE_IMAGE_SRC = "data:image/jpeg;base64,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";

  const FULL_SHOWCASE_BLOCKS = [
    {
      type: 'section',
      title: 'Pas 1 — Com S\'organitza Aritmètic: Llibretes, Apartats, Text, Equacions i Imatges'
    },
    {
      type: 'apartat',
      label: 'Apartat 1a — Escriure explicacions, fórmules encadenades i text amb cometes (")',
      accent: 'blue',
      items: [
        {
          kind: 'text',
          text: 'Benvingut/da a Aritmètic! A l\'esquerra (📚 Llibretes) pots crear tantes llibretes i pàgines com vulguis. Cada pàgina es divideix en Seccions (§) i Apartats numerats com aquest.\n• Per escriure paràgrafs d\'enunciat o conclusions amb salt de línia automàtic, prem «¶» a dalt (o Alt+T); amb Shift+Enter passes de seguida a una equació.\n• Dins d\'una equació, prem Enter per afegir el pas següent al mateix apartat, o Cmd/Ctrl+Enter (o doble Enter en buit) per obrir un apartat nou.\n• Prem les cometes (") dins d\'una fórmula per escriure comentaris o unitats amb la teva tipografia (pots ajustar-ne la font i la mida exacta a ⚙️ Configuració!), o escriu un subíndex amb «_» seguit de «"»:'
        },
        {
          kind: 'math',
          latex: '\\frac{x^2 - 9}{x^2 - 3x} = \\frac{\\cancel{(x - 3)}(x + 3)}{x\\cdot\\cancel{(x - 3)}} = \\boxed{\\frac{x + 3}{x}} \\quad \\text{(per a tot } x \\neq 3\\text{)}'
        },
        {
          kind: 'math',
          latex: 'v_{\\text{màx}} = 12 \\text{ m/s}, \\qquad E_{\\text{cin}} = \\frac{1}{2} \\cdot 2 \\cdot v_{\\text{màx}}^2 = 144 \\text{ J}'
        }
      ]
    },
    {
      type: 'apartat',
      label: 'Apartat 1b — Inserir captures d\'exercicis i imatges redimensionables dins d\'un apartat',
      accent: 'green',
      items: [
        {
          kind: 'text',
          text: 'Pots col·locar captures d\'enunciats o esquemes directament dins de qualsevol apartat de 4 maneres: amb el botó superior «🖼️», amb «+ Imatge» a la capçalera de l\'apartat, enganxant del porta-retalls (Cmd/Ctrl + V) o arrossegant el fitxer a sobre. Clica la figura d\'exemple següent i prova els botons S / M / L / 100% o estira la nansa dreta per canviar-ne la mida:'
        },
        {
          kind: 'image',
          src: TOUR_EXAMPLE_IMAGE_SRC,
          widthPct: 60,
          naturalW: 760,
          naturalH: 340,
          caption: 'Figura d\'exemple inserida a l\'apartat — resolució pas a pas just a sota:'
        },
        {
          kind: 'math',
          latex: 'A(x) = 2x \\cdot (9 - x^2)'
        },
        {
          kind: 'math',
          latex: 'A\'(x) = 18 - 6x^2 = 0 \\Rightarrow x_{\\text{òpt}} = \\sqrt{3}, \\qquad A_{\\text{màx}} = A(x_{\\text{òpt}}) = \\boxed{12\\sqrt{3}}'
        }
      ]
    },

    {
      type: 'section',
      title: 'Pas 2 — Pissarra Sense Errors i Tauler de Variables Intel·ligent (📊)'
    },
    {
      type: 'apartat',
      label: 'Apartat 2a — Expressions obertes sense avisos molestos i xip de càlcul ràpid',
      accent: 'none',
      items: [
        {
          kind: 'text',
          text: '1) Pots deixar passos simbòlics oberts o expressions amb incògnites (primera línia) sense que aparegui cap triangle d\'error. Al panell dret (📊 Variables) fins i tot pots clicar «Provar valor» per testejar números temporalment!\n2) Quan escrius una operació numèrica (segona línia), passa el cursor per sobre de la fila: veuràs un botó discret «= 29/12» a la dreta per enganxar el resultat amb un sol clic només si ho desitges.'
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
      type: 'apartat',
      label: 'Apartat 2b — Ordre lliure, àmbits de variables, comes catalanes i resultats exactes',
      accent: 'green',
      items: [
        {
          kind: 'text',
          text: 'Pots escriure primer la fórmula teòrica i a sota les dades de l\'enunciat: Aritmètic propaga els valors automàticament en qualsevol ordre! A dalt del panell 📊 pots triar si les variables s\'avaluen per «Apartat», per «Exercici» (entre títols §) o en tota la «Pàgina». A més, entén la coma decimal catalana (6,5) i simplifica fraccions irreductibles i radicals (com √12 = 2√3):'
        },
        {
          kind: 'math',
          latex: 'A_{\\text{triangle}} = \\frac{b \\cdot h}{2}'
        },
        {
          kind: 'math',
          latex: 'b = 6,5, \\quad h = 3 \\Rightarrow \\boxed{A_{\\text{triangle}} = \\frac{39}{4} = 9,75}'
        },
        {
          kind: 'math',
          latex: 'v_0 = 15, \\quad a_c = -2, \\quad \\Delta t = 4 \\Rightarrow \\Delta x = v_0 \\cdot \\Delta t + \\frac{1}{2} a_c (\\Delta t)^2, \\quad d_{\\text{diag}} = \\sqrt{12}'
        }
      ]
    },

    {
      type: 'section',
      title: 'Pas 3 — Funcions, Derivades i Gràfica Cartesiana Interactiva (📈)'
    },
    {
      type: 'apartat',
      label: 'Apartat 3a — Avaluar f(x), calcular derivades f\'(a) i obrir la gràfica interactiva',
      accent: 'blue',
      items: [
        {
          kind: 'text',
          text: 'Prova-ho pas a pas: 1) Clica qualsevol fòrmula d\'aquí sota per situar-te en aquest exercici. 2) Al panell dret (📊), dins la targeta de f(x), escriu qualsevol valor de x per avaluar-la a l\'instant. 3) Observa com Aritmètic calcula f\'(x_0) i f\'\'(x_0) per construir la recta tangent t(x). 4) Prem el botó «📈 Gràfica» del panell dret per explorar f(x) i t(x) amb zoom i desplaçament!'
        },
        {
          kind: 'math',
          latex: 'f(x) = x^3 - 3x + 1'
        },
        {
          kind: 'math',
          latex: 'T_{\\text{VM}} = \\frac{f(2) - f(0)}{2 - 0}'
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
      title: 'Pas 4 — Funcions Definides a Trossos, Continuïtat i Càlcul de Paràmetres'
    },
    {
      type: 'apartat',
      label: 'Apartat 4a — Estudi automàtic de punts frontera, salts i punts oberts (○) / tancats (●)',
      accent: 'blue',
      items: [
        {
          kind: 'text',
          text: 'Per definir una funció a trossos, usa els botons de 2 o 3 branques de la pestanya inferior «Càlcul i Anàlisi» (o escriu la drecera «trossos»). Clica g(x) i mira el panell 📊: classifica cada punt frontera (x = 1 i x = 3) segons els límits laterals i, en obrir «📈 Gràfica», dibuixa cada branca amb els punts plens (●) i buits (○) exactes!'
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
      label: 'Apartat 4b — Deducció automàtica de paràmetres de continuïtat i derivabilitat',
      accent: 'green',
      items: [
        {
          kind: 'text',
          text: 'Si deixes paràmetres desconeguts dins d\'una funció a trossos i escrius a sota les condicions d\'igualtat dels límits laterals de p(x) i de p\'(x), Aritmètic resol el sistema i troba a = -2 i b = 7 automàticament:'
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
      title: 'Pas 5 — Resolució Automàtica d\'Equacions (1r Grau, 2n Grau, ± i Complexes)'
    },
    {
      type: 'apartat',
      label: 'Apartat 5a — Resol equacions sense necessitat d\'aïllar prèviament la incògnita',
      accent: 'none',
      items: [
        {
          kind: 'text',
          text: 'Escriu qualsevol equació d\'una incògnita i consulta\'n les solucions al panell 📊: resol equacions lineals (p = 11/3), de segon grau amb múltiples arrels (q ∈ {2, 3}), expressions amb ± (nombre d\'or φ) i equacions sense solució real indicant-ne les arrels complexes (±3i):'
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
          latex: '\\varphi = \\frac{1 \\pm \\sqrt{5}}{2}, \\qquad z^2 + 9 = 0'
        }
      ]
    },

    {
      type: 'section',
      title: 'Pas 6 — Àlgebra Lineal: Sistemes Gauss-Jordan, Matrius i Determinants'
    },
    {
      type: 'apartat',
      label: 'Apartat 6a — Sistemes lineals 3×3, determinants per Sarrus i incògnites dins determinants',
      accent: 'green',
      items: [
        {
          kind: 'text',
          text: 'A les pestanyes «Càlcul i Anàlisi» i «Matrius, Vectors i Símbols» tens plantilles per a sistemes i matrius (prem Shift+Enter dins d\'una matriu o clau de sistema per afegir-hi més files). El motor resol sistemes N×N per Gauss-Jordan (x = 2, y = 1, z = 2), calcula determinants 2×2 i 3×3 (D_3 = 33) i aïlla paràmetres com k = 2:'
        },
        {
          kind: 'math',
          latex: '\\begin{cases} 2x + y - z = 3 \\\\ x - y + 2z = 5 \\\\ 3x + 2y + z = 10 \\end{cases}'
        },
        {
          kind: 'math',
          latex: 'D_3 = \\begin{vmatrix} 1 & 2 & -1 \\\\ 0 & 3 & 4 \\\\ 2 & 1 & 5 \\end{vmatrix}, \\qquad \\begin{vmatrix} k & 2 \\\\ 3 & 5 \\end{vmatrix} = 4, \\qquad M = \\begin{pmatrix} 1 & 2 \\\\ 0 & 3 \\end{pmatrix}'
        }
      ]
    },
    {
      type: 'apartat',
      label: 'Apartat 6b — Classificació automàtica de sistemes (SCD, SCI i SI)',
      accent: 'amber',
      items: [
        {
          kind: 'text',
          text: 'Quan un sistema no té solució o té infinites solucions, el panell 📊 ho classifica segons Rouché-Frobenius (Sistema Incompatible o Compatible Indeterminat):'
        },
        {
          kind: 'math',
          latex: '\\begin{cases} u + v = 4 \\\\ 2u + 2v = 15 \\end{cases}'
        }
      ]
    },

    {
      type: 'section',
      title: 'Pas 7 — Límits, Integrals, Trigonometria (RAD / DEG), Combinatòria i Vectors'
    },
    {
      type: 'apartat',
      label: 'Apartat 7a — Límits laterals, indeterminacions, L\'Hôpital i integrals definides (Barrow)',
      accent: 'none',
      items: [
        {
          kind: 'text',
          text: 'Pots combinar el càlcul numèric real de límits i integrals definides amb la notació completa dels passos intermedis (fletxes amb text com L\'Hôpital, claudàtors d\'indeterminació o primitives amb + C):'
        },
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
          latex: 'I_{\\text{àrea}} = \\int_0^{\\pi} \\sin(x)\\,dx = \\Big[-\\cos(x)\\Big]_0^{\\pi} = (-\\cos\\pi) - (-\\cos 0) = \\boxed{2}'
        }
      ]
    },
    {
      type: 'apartat',
      label: 'Apartat 7b — Angles en RAD/DEG, múltiples de π, sumatoris, combinatòria i vectors',
      accent: 'none',
      items: [
        {
          kind: 'text',
          text: 'A la barra del teclat inferior pots alternar entre radians (RAD) i graus (DEG), o escriure el símbol ° per forçar graus en qualsevol angle. També disposes de sumatoris, productoris, nombres combinatoris, logaritmes en qualsevol base i notació vectorial i de conjunts:'
        },
        {
          kind: 'math',
          latex: 's_{\\text{trig}} = \\sin\\left(30^{\\circ}\\right) + \\cos\\left(\\frac{\\pi}{3}\\right), \\qquad \\omega_{\\text{gir}} = \\frac{3\\pi}{4}'
        },
        {
          kind: 'math',
          latex: 'S_{10} = \\sum_{i=1}^{10} i, \\qquad C_{6,2} = \\binom{6}{2}, \\qquad P_5 = 5!, \\qquad r_{\\text{log}} = \\log_2(32)'
        },
        {
          kind: 'math',
          latex: '\\vec{u} = (2, -1, 3), \\quad \\vec{v} = (1, 2, 0) \\Rightarrow \\vec{u}\\cdot\\vec{v} = 0 \\Leftrightarrow \\vec{u} \\perp \\vec{v}, \\qquad \\text{Dom}(h) = \\mathbb{R} - \\{-1, 1\\}'
        }
      ]
    },

    {
      type: 'section',
      title: 'Pas 8 — Eines en Viu, Temes i Colors a Mida (⚙️), Exportació PDF i Google Drive (☁️)'
    },
    {
      type: 'apartat',
      label: 'Apartat 8a — Guia ràpida de totes les eines de la barra superior',
      accent: 'amber',
      items: [
        {
          kind: 'text',
          text: 'Ja domines el motor matemàtic! Completa l\'experiència amb les eines superiors:\n1. **🔴 Làser, ✏️ Anotar i ⏱️ Temps:** assenyala passos amb un rastre làser efímer, dibuixa amb __9 colors + color a mida + goma d\'esborrar per traços__, o activa un cronòmetre.\n2. **⚙️ Configuració i Temes:** escull entre 6 tipografies, regula la mida del text introduït amb «"», i tria entre els 6 temes visuals o un Tema Personalitzat.\n3. **🖨️ PDF i 💾 Desar / Obrir:** genera un document A4 nítid (amb negreta i subratllat preservats) o exporta en .json / LaTeX.\n4. **☁️ Drive:** vincula el teu Google Drive per sincronitzar privada i automàticament totes les llibretes entre dispositius.'
        }
      ]
    },

    {
      type: 'section',
      title: 'Pas 9 — Novetats d\'Aritmètic v1.1 (Vectors, Matrius, Parcials, Weibull i Format)'
    },
    {
      type: 'apartat',
      label: 'Apartat 9a — Àlgebra lineal real, derivades parcials, funció Gamma i avaluació',
      accent: 'none',
      items: [
        {
          kind: 'text',
          text: 'La **versió 1.1** amplia profundament el motor simbòlic-numèric: opera directament amb **vectors i matrius** (producte escalar, vectorial, norma, inversa, transposada, traça i rang), **derivades parcials i gradients**, la barra d\'__avaluar en__, la funció **Gamma**, operadors de definició («:=», «≡», «≜») i resolució analítica d\'equacions no lineals encadenades!'
        },
        {
          kind: 'math',
          latex: '\\vec{u} := (1, 2, 3), \\qquad \\vec{v} := (4, -1, 2), \\qquad \\vec{w} = \\vec{u} \\times \\vec{v}, \\qquad m_u = \\|\\vec{u}\\|'
        },
        {
          kind: 'math',
          latex: 'K = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}, \\qquad B = K^{-1}, \\qquad d_K = \\det(K), \\qquad r_K = \\operatorname{rang}(K)'
        },
        {
          kind: 'math',
          latex: 'h(x, y) := x^3 y + 2 x y^2, \\qquad p_1 = \\left. \\frac{\\partial h}{\\partial x} \\right|_{x=2, y=1}, \\qquad \\vec{g} = \\nabla h(1, 2)'
        },
        {
          kind: 'math',
          latex: '\\alpha = 2,8 \\qquad x_w = 16 \\qquad F_w(x_w) = 0,9 = 1 - e^{-(x_w/\\beta)^{\\alpha}} \\qquad E_w = \\beta \\cdot \\Gamma\\left(1 + \\frac{1}{\\alpha}\\right)'
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
