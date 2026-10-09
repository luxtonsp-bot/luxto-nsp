#!/usr/bin/env node
/**
 * check-imports.mjs — Valida que todos los imports nombrados de módulos locales
 * existan y estén exportados.
 * Uso: node scripts/check-imports.mjs
 */

import fs from 'fs';
import path from 'path';

const JS_DIR = 'assets/js';
const EXTENSIONS = ['.js', '.mjs'];

function stripComments(content) {
  // Remove single-line comments
  content = content.replace(/\/\/.*$/gm, '');
  // Remove multi-line comments
  content = content.replace(/\/\*[\s\S]*?\*\//g, '');
  return content;
}

function getExportedNames(filePath) {
  const content = stripComments(fs.readFileSync(filePath, 'utf8'));
  const exports = new Set();

  // export function name() / export const name = / export class name
  const namedExportRegex = /^export\s+(?:function|const|let|var|class|async\s+function)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/gm;
  let match;
  while ((match = namedExportRegex.exec(content)) !== null) {
    exports.add(match[1]);
  }

  // export { name, name2, name3 as alias }
  const braceExportRegex = /export\s*\{([^}]+)\}/g;
  while ((match = braceExportRegex.exec(content)) !== null) {
    const items = match[1].split(',');
    for (const item of items) {
      const trimmed = item.trim();
      const asMatch = trimmed.match(/^([a-zA-Z_$][\w$]*)\s+as\s+([a-zA-Z_$][\w$]*)$/);
      if (asMatch) {
        exports.add(asMatch[1]); // original name
        exports.add(asMatch[2]); // alias
      } else if (trimmed) {
        exports.add(trimmed);
      }
    }
  }

  // re-export: export { ref, onValue as get } from '...'
  const reExportRegex = /export\s*\{([^}]+)\}\s*from/g;
  while ((match = reExportRegex.exec(content)) !== null) {
    const items = match[1].split(',');
    for (const item of items) {
      const trimmed = item.trim();
      const asMatch = trimmed.match(/^([a-zA-Z_$][\w$]*)\s+as\s+([a-zA-Z_$][\w$]*)$/);
      if (asMatch) {
        exports.add(asMatch[2]); // alias is what's available
      } else if (trimmed) {
        exports.add(trimmed);
      }
    }
  }

  return exports;
}

function getImportedNames(filePath) {
  const content = stripComments(fs.readFileSync(filePath, 'utf8'));
  const imports = [];

  // import { name, name2 } from './path'
  const namedImportRegex = /import\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/g;
  let match;
  while ((match = namedImportRegex.exec(content)) !== null) {
    const names = match[1].split(',').map(n => n.trim().split(' as ')[0].trim());
    const from = match[2];
    imports.push({ names, from });
  }

  return imports;
}

function resolveImport(fromPath, baseDir) {
  const fullPath = path.resolve(baseDir, fromPath);
  const possible = [
    fullPath,
    fullPath + '.js',
    fullPath + '.mjs',
    path.join(fullPath, 'index.js'),
    path.join(fullPath, 'index.mjs'),
  ];
  for (const p of possible) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function main() {
  console.log('=== Check Imports ===\n');

  const files = fs.readdirSync(JS_DIR).filter(f =>
    EXTENSIONS.some(ext => f.endsWith(ext))
  );

  // Build export map
  const exportMap = new Map();
  for (const file of files) {
    const filePath = path.join(JS_DIR, file);
    exportMap.set(file, getExportedNames(filePath));
  }

  let errors = 0;
  let warnings = 0;

  // Check imports
  for (const file of files) {
    const filePath = path.join(JS_DIR, file);
    const imports = getImportedNames(filePath);

    for (const imp of imports) {
      const resolved = resolveImport(imp.from, JS_DIR);
      if (!resolved) {
        console.error(`❌ ${file}: Cannot resolve module "${imp.from}"`);
        errors++;
        continue;
      }

      const resolvedName = path.basename(resolved);
      const exported = exportMap.get(resolvedName) || new Set();

      for (const name of imp.names) {
        if (!exported.has(name)) {
          console.error(`❌ ${file}: Import "${name}" from "${imp.from}" not exported (available: ${Array.from(exported).sort().join(', ') || 'none'})`);
          errors++;
        }
      }
    }
  }

  if (errors === 0 && warnings === 0) {
    console.log('✅ All local imports resolve correctly');
  } else {
    console.error(`\n❌ ${errors} errors, ${warnings} warnings`);
    process.exit(1);
  }
}

main();