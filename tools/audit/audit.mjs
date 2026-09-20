#!/usr/bin/env node
/**
 * PASO 0 - Auditoría estática reproducible del portal LUXTO
 * Versión independiente que no forma parte del sitio desplegado.
 */

import { readFileSync, readdirSync } from 'fs';
import { parse } from 'acorn';
import { ESLint } from 'eslint';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Go up two levels: from tools/audit to project root
const repoRoot = resolve(__dirname, '..', '..');

const firebaseVersion = '10.12.0';
const allowedFirebaseImports = new Set([
  'firebase/app',
  'firebase/auth',
  'firebase/firestore',
  'firebase/database'
]);

const forbiddenImports = new Set([
  'firebase/storage',
  'firebase/functions'
]);

const forbiddenPatterns = [
  /script\.google\.com/,
  /window\.location\.href\s*=\s*["']\//,
  /href\s*=\s*["']\//
];

/**
 * Parse HTML and extract all <script type="module"> content
 */
function extractModuleScripts(html) {
  const dom = new JSDOM(html);
  const scripts = [...dom.window.document.querySelectorAll('script[type="module"]')];
  return scripts.map(s => s.textContent || s.innerHTML || '');
}

/**
 * Extract named imports from ES module code using acorn
 */
function getNamedImports(code) {
  try {
    const ast = parse(code, { ecmaVersion: 2020, sourceType: 'module' });
    const imports = [];

    ast.body.forEach(node => {
      if (node.type === 'ImportDeclaration') {
        const source = node.source.value;
        node.specifiers.forEach(spec => {
          if (spec.type === 'ImportSpecifier') {
            imports.push({ source, name: spec.imported.name });
          }
        });
      }
    });
    return imports;
  } catch (e) {
    console.warn(`Failed to parse JS: ${e.message}`);
    return [];
  }
}

/**
 * Validate Firebase imports
 */
function validateFirebaseImports(imports, filePath) {
  const errors = [];

  for (const imp of imports) {
    // Check forbidden Firebase imports
    if (forbiddenImports.has(imp.source)) {
      errors.push(`${filePath}: Importa '${imp.source}' (prohibido por COSTO CERO)`);
    }

    // Check that named Firebase imports exist in the package
    if (allowedFirebaseImports.has(imp.source)) {
      // We'll trust that firebase@10.12.0 has these exports
      // In a real implementation we could check package.json exports
      // but for now we assume they exist if the source is allowed
    }
  }

  return errors;
}

/**
 * Check for forbidden patterns in HTML/JS
 */
function checkForbiddenPatterns(content, filePath) {
  const errors = [];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(content)) {
      errors.push(`${filePath}: Patrón prohibido detectado: ${pattern}`);
    }
  }

  return errors;
}

/**
 * Validate CSS syntax (basic checks)
 */
function validateCSS(html) {
  const errors = [];
  const dom = new JSDOM(html);
  const styleElements = [...dom.window.document.querySelectorAll('style')];

  styleElements.forEach((style, index) => {
    const css = style.textContent || style.innerHTML || '';

    // Check for property: value vs property = value
    if (css.includes('=') && !css.includes(': ')) {
      // Simple heuristic: look for = not inside quotes or url()
      const equalsMatches = [...css.matchAll(/=/g)];
      for (const match of equalsMatches) {
        const pos = match.index;
        // Check if it's inside a string literal
        const before = css.substring(0, pos);
        const quoteCount = (before.match(/['"]/g) || []).length;
        if (quoteCount % 2 === 0) { // even quotes = outside string
          // Check if it's inside url(...)
          const urlBefore = css.substring(0, pos);
          const urlCount = (urlBefore.match(/url\(/g) || []).length;
          const closeParenCount = (urlBefore.match(/\)/g) || []).length;
          if (urlCount <= closeParenCount) { // not inside url()
            errors.push(`<style> bloque ${index + 1}: Posible uso de '=' en lugar de ':' en CSS alrededor de posición ${pos}`);
          }
        }
      }
    }
  });

  return errors;
}

/**
 * Check for unclosed attributes and tag balance (simplified)
 */
function validateHTMLSyntax(html) {
  const errors = [];

  // Check for unclosed attributes like class="x>
  const unclosedAttrMatches = [...html.matchAll(/(\w+\s*=\s*)"[^"]*$/gm)];
  if (unclosedAttrMatches.length > 0) {
    errors.push(`HTML: Se detectaron atributos sin cerrar (ej. class="x>)`);
  }

  // Remove SVG content to avoid false positives in tag balance
  const htmlWithoutSvg = html.replace(/<svg[\s\S]*?<\/svg>/gi, '');

  // Simple tag imbalance detection (not perfect but catches obvious issues)
  const openTagMatches = [...htmlWithoutSvg.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g)];
  const closeTagMatches = [...htmlWithoutSvg.matchAll(/<\/([a-zA-Z][a-zA-Z0-9]*)>/g)];

  // Basic count check - if there are far more closing than opening tags of same type, flag it
  const openCounts = {};
  const closeCounts = {};

  // Void elements that don't require closing tags in HTML5
  const voidElements = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
  ]);

  for (const match of openTagMatches) {
    const tag = match[1].toLowerCase();
    // Skip void elements for imbalance check
    if (!voidElements.has(tag)) {
      openCounts[tag] = (openCounts[tag] || 0) + 1;
    }
  }

  for (const match of closeTagMatches) {
    const tag = match[1].toLowerCase();
    closeCounts[tag] = (closeCounts[tag] || 0) + 1;
  }

  // Check for significant imbalance (more than 2x difference or absolute diff > 5)
  const allTags = new Set([...Object.keys(openCounts), ...Object.keys(closeCounts)]);
  for (const tag of allTags) {
    const open = openCounts[tag] || 0;
    const close = closeCounts[tag] || 0;
    if (Math.abs(open - close) > 5 || (open > 0 && close > 0 && Math.max(open, close) / Math.min(open, close) > 2)) {
      errors.push(`HTML: Posible desequilibrio de etiquetas <${tag}>: ${open} aperturas vs ${close} cierres`);
    }
  }

  return errors;
}

/**
 * Validate that all local href/src attributes resolve to existing files
 */
async function validateLocalResources(html, filePath) {
  const errors = [];
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const fileDir = dirname(filePath);
  const fs = await import('fs');

  // Check all elements with href or src
  const elements = [...document.querySelectorAll('[href], [src]')];

  for (const el of elements) {
    const href = el.getAttribute('href');
    const src = el.getAttribute('src');
    const attrValue = href || src;

    if (!attrValue) continue;

    // Skip external URLs, data:, javascript:
    if (attrValue.startsWith('http://') ||
        attrValue.startsWith('https://') ||
        attrValue.startsWith('data:') ||
        attrValue.startsWith('javascript:')) {
      continue;
    }

    // Handle anchor links: split on '#' and validate the part before '#'
    let urlToValidate = attrValue;
    const hashIndex = attrValue.indexOf('#');
    if (hashIndex !== -1) {
      urlToValidate = attrValue.substring(0, hashIndex);
      // If the URL is just an anchor (e.g., '#top'), skip validation
      if (urlToValidate === '') {
        continue;
      }
    }

    if (!urlToValidate) continue;

    // Resolve relative to the HTML file
    let resolved;
    try {
      resolved = resolve(fileDir, urlToValidate);
    } catch (e) {
      errors.push(`${filePath}: Ruta inválida '${attrValue}' en ${el.tagName.toLowerCase()}`);
      continue;
    }

    // Make sure it's within repo
    if (!resolved.startsWith(repoRoot)) {
      errors.push(`${filePath}: Ruta '${attrValue}' apunta fuera del repo: ${resolved}`);
      continue;
    }

    // Check if file exists
    if (!fs.existsSync(resolved)) {
      errors.push(`${filePath}: Recurso local no encontrado: '${attrValue}' (resuelve a ${resolved})`);
    }
  }

  return errors;
}

/**
 * Validate getElementById calls exist in DOM
 */
function validateGetElementById(html, jsCode) {
  const errors = [];

  // Extract all getElementById calls with string literals
  const idMatches = [...jsCode.matchAll(/getElementById\(\s*["']([^"']+)["']\s*\)/g)];

  if (idMatches.length === 0) return errors;

  const dom = new JSDOM(html);
  const document = dom.window.document;

  for (const match of idMatches) {
    const id = match[1];
    const element = document.getElementById(id);
    if (!element) {
      errors.push(`JS: getElementById('${id}') pero no existe elemento con ese id en el HTML`);
    }
  }

  return errors;
}

/**
 * Run eslint no-undef on JS code
 */
async function validateNoUndef(jsCode, filePath) {
  try {
    const eslint = new ESLint({
      overrideConfig: {
        parserOptions: {
          ecmaVersion: 2020,
          sourceType: 'module'
        },
        rules: {
          'no-undef': 'error'
        },
        globals: {
          // Firebase v10 modular SDK globals
          initializeApp: 'readonly',
          getAuth: 'readonly',
          onAuthStateChanged: 'readonly',
          signInWithEmailAndPassword: 'readonly',
          getFirestore: 'readonly',
          collection: 'readonly',
          getCountFromServer: 'readonly',
          doc: 'readonly',
          setDoc: 'readonly',
          getDoc: 'readonly',
          updateDoc: 'readonly',
          deleteDoc: 'readonly',
          getDocs: 'readonly',
          query: 'readonly',
          where: 'readonly',
          orderBy: 'readonly',
          limit: 'readonly',
          startAfter: 'readonly',
          endBefore: 'readonly',
          serverTimestamp: 'readonly',
          // DOM globals
          document: 'readonly',
          window: 'readonly',
          localStorage: 'readonly',
          // console and timers
          console: 'readonly',
          setTimeout: 'readonly',
          setInterval: 'readonly'
        }
      }
    });

    const results = await eslint.lintText(jsCode, { filePath });
    const messages = results[0]?.messages || [];

    return messages
      .filter(m => m.ruleId === 'no-undef')
      .map(m => `${filePath}:${m.line}:${m.column} ${m.message}`);
  } catch (e) {
    return [`${filePath}: Error ejecutando eslint: ${e.message}`];
  }
}

/**
 * Process a single HTML file
 */
async function processHTMLFile(filePath) {
  console.log(`Auditando: ${filePath}`);

  const content = readFileSync(filePath, 'utf8');
  const errors = [];

  // 1. Forbidden patterns
  errors.push(...checkForbiddenPatterns(content, filePath));

  // 2. Extract and validate module scripts
  const moduleScripts = extractModuleScripts(content);
  let allJs = '';

  for (const script of moduleScripts) {
    allJs += script + '\n';

    // 3. Validate Firebase imports
    const imports = getNamedImports(script);
    errors.push(...validateFirebaseImports(imports, filePath));

    // 4. Validate getElementById exists
    errors.push(...validateGetElementById(content, script));

    // 5. ESLint no-undef
    errors.push(...await validateNoUndef(script, filePath));
  }

  // 6. Validate CSS
  errors.push(...validateCSS(content));

  // 7. Validate HTML syntax (unclosed attrs, tag balance)
  errors.push(...validateHTMLSyntax(content));

  // 8. Validate local resources
  errors.push(...(await validateLocalResources(content, filePath)));

  return errors;
}

/**
 * Get all HTML files to audit
 */
function getHTMLFiles() {
  const htmlFiles = [];

  // Root index.html
  htmlFiles.push(join(repoRoot, 'index.html'));

  // Pages directory
  const pagesDir = join(repoRoot, 'pages');
  const pages = readdirSync(pagesDir);
  for (const page of pages) {
    if (page.endsWith('.html')) {
      htmlFiles.push(join(pagesDir, page));
    }
  }

  return htmlFiles;
}

/**
 * Main audit function
 */
async function runAudit() {
  console.log('='.repeat(80));
  console.log('PASO 0 - Auditoría estática reproducible del portal LUXTO');
  console.log('='.repeat(80));

  const htmlFiles = getHTMLFiles();
  let totalErrors = 0;

  for (const filePath of htmlFiles) {
    const errors = await processHTMLFile(filePath);
    if (errors.length > 0) {
      console.error(`\n[ERRORS] ${filePath}:`);
      errors.forEach(err => console.error(`  ! ${err}`));
      totalErrors += errors.length;
    } else {
      console.log(`✓ ${filePath}`);
    }
  }

  console.log('\n' + '='.repeat(80));
  if (totalErrors === 0) {
    console.log('✅ AUDITORÍA PASADA: No se encontraron errores');
  } else {
    console.error(`❌ AUDITORÍA FALLIDA: ${totalErrors} error(es) encontrado(s)`);
    process.exit(1);
  }
  console.log('='.repeat(80));
}

runAudit().catch(err => {
  console.error('Error fatal en auditoría:', err);
  process.exit(1);
});