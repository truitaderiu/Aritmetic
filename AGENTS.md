# AGENTS.md — Guia d'Arquitectura i Manteniment d'Aritmètic

Aquest document està pensat per facilitar la feina a **futures instàncies d'agents d'IA i desenvolupadors** que treballin en el repositori d'**Aritmètic** (`https://truitaderiu.github.io/Aritmetic/`).

---

## 1. Visió General del Projecte

**Aritmètic** és una aplicació web *client-side* pura (sense *bundler* ni servidor intermedi) de pissarra matemàtica interactiva i càlcul simbòlic-numèric en català. Combina l'escriptura fluida de fórmules LaTeX (via **MathLive** local), blocs de text pla, imatges redimensionables dins d'apartats, un motor matemàtic tolerant (*Zero-Error Blackboard Engine*), gràfica cartesiana 2D interactiva, exportació tipogràfica a PDF (A4) i sincronització privada al núvol amb **Google Drive (`appDataFolder`)**.

### Mapa de fitxers

| Fitxer / Ruta | Responsabilitat principal |
| :--- | :--- |
| `index.html` | Estructura de l'aplicació (Topbar, 3 columnes, Teclat inferior, Modals de Desar/Gràfica/Ajuda/Conflictes/Configuració i contenidor `#printDocument`). |
| `css/styles.css` | Sistema de variables CSS, 6 temes visuals (`classic`, `paper`, `sage`, `midnight`, `chalkboard`, `carbon`), disseny responsiu mòbil/tauleta i maquetació A4 `@media print`. |
| `js/math-engine.js` | Motor matemàtic independent (`window.MathEngine`): tokenitzador LaTeX, parser AST, aritmètica racional exacta, resolució d'equacions, Gauss-Jordan i estudi de funcions a trossos. |
| `js/keypads.js` | Definició declarativa dels teclats matemàtics (`window.KeypadConfig.KEYPAD_TABS`), dreceres `CUSTOM_INLINE_SHORTCUTS` i el document mostra `FULL_SHOWCASE_BLOCKS`. |
| `js/app.js` | Estat central (`state`), gestió de Llibretes/Pàgines/Apartats, integració amb MathLive, compressió i redimensionament d'imatges, gràfica `<canvas>`, llapis/làser, PDF i pont `window.PissarraApp`. |
| `js/cloud-drive.js` | Autenticació OAuth 2.0 (Google Identity Services) i sincronització REST amb Google Drive `appDataFolder` (`window.PissarraCloud`), detecció i resolució de conflictes. |
| `vendor/mathlive/` | Còpia autohostajada de MathLive (`mathlive.min.js`, `mathlive-fonts.css`, `mathlive-static.css`) perquè l'app funcioni ràpid i sense dependre de CDNs de scripts matemàtics. |

---

## 2. Invariants Crítics de Compatibilitat (NO MODIFICAR MAI!)

Per no perdre mai cap llibreta ni configuració ja desada pels usuaris al seu navegador o al seu Google Drive, **NO canvieu mai** aquests identificadors interns:

1. `STORAGE_KEY_V2 = 'pissarra_mat_batx_v2'` (a `js/app.js` — clau de `localStorage`).
2. `CLOUD_FILE_NAME = 'pissarra_workspace_v2.json'` (a `js/cloud-drive.js` — fitxer ocult a `appDataFolder` de Google Drive).
3. `AUTH_STORAGE_KEY = 'pissarra_gdrive_auth_v1'` (a `js/cloud-drive.js` — metadades locals de sessió OAuth).
4. Els discriminadors JSON d'exportació/importació: `kind: 'pissarra_workspace'`, `kind: 'pissarra_notebook'`, `kind: 'pissarra_page'`.
5. `GOOGLE_CLIENT_ID = '937960659753-p8gvd4uuif8bbejk6qvu0428tbtt1mvp.apps.googleusercontent.com'`.

Quan actualitzeu el contingut de la pàgina d'exemple `🌟 Tour Complet (Totes les funcions)` a `js/keypads.js`, incrementeu `TOUR_VERSION` a `js/app.js` perquè `migrateLegacyStarterTitles()` refresqui únicament la pàgina del Tour sense tocar cap apunt de l'usuari.

---

## 3. Esquema de Dades (`Workspace -> Notebook -> Page -> Block -> Item`)

```json
{
  "kind": "pissarra_workspace",
  "version": 2,
  "tourVersion": 5,
  "savedAt": "2026-11-07T12:00:00.000Z",
  "activeNotebookId": "nb_...",
  "activePageId": "page_...",
  "settings": {
    "textFont": "jakarta",
    "textLineHeight": "normal",
    "theme": "classic",
    "lastLightTheme": "classic",
    "lastDarkTheme": "midnight",
    "darkMode": false,
    "boardPattern": "plain",
    "boardWidth": "full",
    "zoomIndex": 2,
    "showApartatNumbers": true,
    "angleMode": "RAD",
    "scoreboardScope": "section",
    "preferFractions": true,
    "decimalPlaces": 6,
    "decimalComma": true,
    "showInlineQuickEval": true,
    "inkStrokeWidth": 2.8,
    "pdfShowHeader": true
  },
  "notebooks": [
    {
      "id": "nb_...",
      "title": "📘 Apunts i Càlculs",
      "color": "#059669",
      "pages": [
        {
          "id": "page_...",
          "title": "Pàgina 1",
          "updatedAt": 1794050000000,
          "overrides": { "k": 5 },
          "inkStrokes": [
            { "color": "#ef4444", "width": 2.8, "points": [{ "x": 120, "y": 80 }] }
          ],
          "blocks": [
            { "id": "blk_1", "type": "section", "title": "Exercici 1" },
            {
              "id": "blk_2",
              "type": "apartat",
              "label": "Apartat a)",
              "accent": "none",
              "items": [
                {
                  "id": "it_1",
                  "kind": "image",
                  "src": "data:image/webp;base64,...",
                  "widthPct": 65,
                  "naturalW": 1100,
                  "naturalH": 340,
                  "caption": "Enunciat de l'exercici"
                },
                { "id": "it_2", "kind": "text", "text": "Plantejament del problema..." },
                { "id": "it_3", "kind": "math", "latex": "v_{\\text{màx}} = 12" }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

> **Important per a la sincronització:** Si mai afegiu una nova propietat persistent a un `item`, un `block` o a `settings`:
> 1. Valideu-la i acoteu-la a `sanitizeBlocksList()` o `applySettingsToState()` (`js/app.js`).
> 2. Incloeu-la a `stripBlockIds()` o `getSyncedSettingsSnapshot()` perquè canviï l'empremta digital (`getWorkspaceSyncFingerprint`) i es pugi automàticament a Google Drive!

---

## 4. Motor Matemàtic (`js/math-engine.js`)

El motor està dissenyat sota el principi de **Pissarra sense Errors**: l'usuari pot escriure passos intermedis oberts, notació de conjunts (`\mathbb{R} - \{0\}`) o comentaris sense que aparegui mai cap triangle d'error. Si una expressió no és numèricament avaluable, simplement s'ignora o es llista com a simbòlica.

### Pipeline intern en 5 fases

1. **Divisió de Clàusules (`splitRowIntoClauses`)**:
   - Desempaqueta comandes visuals (`\boxed`, `\cancel`, `\textcolor`, `\underbrace`) i expandeix determinants `\begin{vmatrix}...\end{vmatrix}` (2×2 i 3×3 per Sarrus).
   - Distingeix entre `\begin{cases}` d'un **sistema d'equacions** (sense `=` al davant -> es divideix en equacions individuals) i `f(x) = \begin{cases}...\end{cases}` d'una **funció definida a trossos** (precedit per `=` -> es conserva íntegre).
   - Separa clàusules en una mateixa línia per `;`, fletxes (`\Rightarrow`, `\rightarrow`, etc.), `\qquad`/`\quad`, i comes de nivell 0 quan separen dues igualtats (`a = 1,5, b = 2,5` -> no trenca mai la coma decimal `1,5`!).

2. **Regla del Text en Línia `"` (`stripProseAnnotations`)**:
   - Dins d'un `<math-field>`, prémer `"` insereix `\text{...}`.
   - **Regla estricta**: El text introduït amb `"` (`\text`, `\textrm`, `\textit`, `\textbf`) **MAI és una variable per si sol**, ni tan sols mentre l'usuari escriu la primera lletra (`\text{a}`). `stripProseAnnotations` manté una pila de claus `subBraceStack` i **només conserva `\text{...}` quan es troba dins del subíndex `_` o `_{...}` d'una variable** (com ara `v_{\text{màx}}` o `A_{\text{triangle}}`). Qualsevol altre `\text{...}` es reemplaça per `' '`.

3. **Tokenització i Claus Canòniques (`tokenizeLatex`, `canonicalizeVarKey`)**:
   - Converteix `v_{\text{màx}}` i `v_{màx}` en la clau canònica interna `v_màx`, mantenint `v_{\text{màx}}` per a la visualització LaTeX al Tauler de Variables.
   - Reconstrueix la multiplicació implícita (`2x`, `3\pi`, `(x+1)(x-1)`, `\sin 2x`) respectant la precedència d'operadors i les crides a funcions declarades `f(x)` o derivades `f'(x)`, `f''(x)`.

4. **Parser AST i Seguretat contra DoS**:
   - Rebutja cadenes superiors a `8000` caràcters i limita la recursió sintàctica a `MAX_AST_DEPTH = 64`.
   - Admet derivades numèriques d'ordre 1–3 (diferències centrades d'ordre 4), límits numèrics i laterals (`x \to a^+`, `x \to a^-`, `x \to \pm\infty`), integrals definides per Simpson adaptatiu i sumatoris/productoris finits.

5. **Resolució de Punt Fix (`analyzeRows`)**:
   - Executa iteracions d'avaluació fins a convergir (permetent escriure primer la fórmula i a sota les dades!).
   - Resol equacions d'1 incògnita: lineals exactes, quadràtiques amb detecció d'arrels múltiples o complexes (`\notin \mathbb{R}`), branques `\pm` i cerca numèrica d'arrels (mostreig + bisecció/secant).
   - Resol sistemes lineals $N \times N$ per eliminació de Gauss-Jordan amb pivotatge parcial i classifica segons Rouché-Frobenius (`SCD`, `SCI`, `SI`).
   - Per a funcions a trossos, identifica punts frontera, calcula límits esquerre/dret i derivades laterals, classifica cada punt (`continuous`, `jump`, `removable`, `asymptotic`) i genera els punts oberts (`○`) i tancats (`●`) exactes per al `<canvas>` de la gràfica!

---

## 5. Integració amb MathLive, Tipografies i Temes Visuals

### Com canvia de tipografia el text amb `"` (`\text{...}`)
- MathLive renderitza cada `<math-field>` dins d'un **Shadow DOM** aïllat. Internament, MathLive estilitza `.ML__text` amb:
  `font-family: var(--text-font-family, system-ui, ...)`
- Les propietats personalitzades CSS (`--*`) **sí que travessen la frontera del Shadow DOM**! Per això `applyThemeAndZoom()` (`js/app.js`) i `:root` (`css/styles.css`) defineixen tant `--font-plain-text` com `--text-font-family` amb la mateixa pila tipogràfica (`FONT_STACKS[state.textFont]`), a més de `.ML__text { font-family: var(--font-plain-text) !important; }` per al HTML estàtic del Scoreboard i del PDF.

### Sistema de Temes (`THEMES`)
- Els 6 temes (`classic`, `paper`, `sage`, `midnight`, `chalkboard`, `carbon`) s'activen mitjançant `document.body.dataset.theme = state.theme` i sincronitzen `document.body.classList.toggle('dark-theme', isDark)`.
- `state.lastLightTheme` i `state.lastDarkTheme` recorden quin tema clar i quin tema fosc ha triat l'usuari al Selector de Temes (`⚙️`), de manera que el botó ràpid `🌙 / ☀️` de la barra superior alterna entre els seus dos temes preferits.

---

## 6. Imatges dins d'Apartats (`kind: 'image'`)

Els apartats accepten tres tipus de sub-ítems (`item.kind`): `'math'`, `'text'` i `'image'`.
- **Inserció per 4 vies**: Botó superior `🖼️ Imatge`, botó `+ Imatge` a la capçalera de l'apartat, enganxar des del porta-retalls (`Cmd/Ctrl + V`) o arrossegar i deixar anar (*Drag & Drop*) sobre l'apartat.
- **Compressió automàtica en `<canvas>` (`compressImageFileToPayload`)**:
  - Com que `localStorage` té un límit d'uns ~5 MB per domini als navegadors, les imatges es redimensionen si superen `1400×1200 px` i es codifiquen en `image/webp` (`0.82`) amb *fallback* a `image/jpeg` (`0.82`) sobre fons blanc. Una captura d'exercici Retina típica passa d'ocupar 1.5 MB en PNG a ocupar només **35–90 KB** sense pèrdua apreciable de nitidesa!
- **Mida inicial intel·ligent (`computeSmartInitialImageWidthPct`)**:
  - Calcula l'amplada inicial (`widthPct`, entre `22%` i `92%`) segons les dimensions naturals i la proporció d'aspecte de la captura, evitant tant que un retall petit es vegi gegant com que una captura vertical ocupi tota la pantalla.
- **Redimensionament interactiu**: L'usuari pot estirar la nansa lateral `.image-resize-handle` (amb ratolí o pantalla tàctil) o prémer els botons ràpids `S` (`35%`), `M` (`55%`), `L` (`75%`), `100%`.

---

## 7. Seguretat i Robustesa

1. **Prevenció de XSS en LaTeX estàtic (`sanitizeMathMarkup`)**: Tot el marcatge generat per `MathLive.convertLatexToMarkup` passa per un filtre DOM (`TreeWalker`) que elimina etiquetes perilloses (`<script>`, `<iframe>`, `<object>`, `<foreignObject>`, `<a>`, etc.), esborra atributs `on*`, `href`, `src` i bloqueja `url()` / `javascript:` dins d'`style`.
2. **Prevenció de XSS en Imatges (`isSafeImageDataUrl`)**: Només s'accepten *data URLs* base64 dels tipus raster `image/webp`, `image/jpeg`, `image/png` i `image/gif` amb una expressió regular estricta. **`image/svg+xml` està explícitament prohibit** perquè un fitxer SVG podria contenir `<script>` incrustat.
3. **Protecció contra Prototype Pollution i Selector Injection**: Totes les claus dinàmiques (`overrides`, `funcQuickInputs`) es validen amb `isSafeKey()`, i totes les cerques d'atributs DOM utilitzen `CSS.escape` (`escapeCssIdent`).
4. **Límit de Memòria Gràfica en iOS/iPadOS (`resizeOverlayCanvases`)**: WebKit desactiva silenciosament qualsevol `<canvas>` que superi ~16.7 MP. Les capes del llapis i del punter làser limiten el seu *backing store* a `12 MP` i escalen la matriu de transformació amb `overlayCanvasScale`.

---

## 8. Sincronització amb Google Drive (`js/cloud-drive.js`) i Desplegament

- **Privacitat Zero-Knowledge**: S'utilitza exclusivament l'àmbit restringit `https://www.googleapis.com/auth/drive.appdata`. L'aplicació només pot veure el seu propi fitxer ocult `pissarra_workspace_v2.json` al Google Drive de l'usuari i no té accés a cap altre fitxer del seu Drive.
- **Detecció de Conflictes**: Es comparen empremtes de contingut (`getWorkspaceSyncFingerprint`, que inclou tant `notebooks` com `settings`) i marques temporals remotes (`modifiedTime`). Si tant el dispositiu local com Google Drive tenen canvis nous divergents, s'obre `#cloudConflictModal` oferint *Carregar del Drive*, *Pujar al Drive* o *Combinar llibretes sense esborrar res*.
- **Desplegament a GitHub Pages**:
  - Repositori remot: `git@github.com:truitaderiu/Aritmetic.git` (branca `main`).
  - Qualsevol `git push origin main` publica els canvis automàticament a `https://truitaderiu.github.io/Aritmetic/`.
  - Abans de fer *push*, verifiqueu sempre la sintaxi amb `node --check js/math-engine.js && node --check js/keypads.js && node --check js/app.js && node --check js/cloud-drive.js`.
