#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const acornWalk = require('acorn-walk');

// --- Парсинг аргументов командной строки ---
const args = process.argv.slice(2);
let target = null;
let outputFile = null;
let minLength = 0;
let pattern = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '-o' || args[i] === '--output') {
    outputFile = args[++i];
  } else if (args[i] === '-l' || args[i] === '--min-length') {
    minLength = parseInt(args[++i], 10);
  } else if (args[i] === '-p' || args[i] === '--pattern') {
    pattern = new RegExp(args[++i], 'i');
  } else if (!target) {
    target = args[i];
  }
}

if (!target) {
  console.error('Usage: node extract-strings.js <file-or-directory> [options]');
  console.error('Options:');
  console.error('  -o, --output <file>     Save strings to file (default: stdout)');
  console.error('  -l, --min-length <num>  Minimum string length to include (default: 0)');
  console.error('  -p, --pattern <regex>   Only include strings matching regex (case-insensitive)');
  process.exit(1);
}

// --- Вспомогательные функции ---
function extractStringsFromCode(code, filePath) {
  const strings = new Set();
  let ast;
  try {
    // Сначала пробуем как модуль
    ast = acorn.parse(code, { ecmaVersion: 2022, sourceType: 'module' });
  } catch (e) {
    try {
      // Пробуем как скрипт (не модуль)
      ast = acorn.parse(code, { ecmaVersion: 2022 });
    } catch (e2) {
      console.warn(`⚠️ Не удалось распарсить ${filePath}: ${e2.message}`);
      return strings;
    }
  }

  acornWalk.simple(ast, {
    Literal(node) {
      if (typeof node.value === 'string') strings.add(node.value);
    },
    TemplateLiteral(node) {
      for (const quasi of node.quasis) {
        if (quasi.value.cooked) strings.add(quasi.value.cooked);
      }
    },
    BinaryExpression(node) {
      if (node.operator === '+') {
        function collectStringFromNode(n) {
          if (n.type === 'Literal' && typeof n.value === 'string') return n.value;
          if (n.type === 'BinaryExpression' && n.operator === '+') {
            const left = collectStringFromNode(n.left);
            const right = collectStringFromNode(n.right);
            if (left !== null && right !== null) return left + right;
          }
          return null;
        }
        const full = collectStringFromNode(node);
        if (full !== null) strings.add(full);
      }
    }
  });

  return strings;
}

function processFile(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const strings = extractStringsFromCode(code, filePath);
  return strings;
}

function walkDirectory(dir) {
  const allStrings = new Set();
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const subStrings = walkDirectory(fullPath);
      subStrings.forEach(s => allStrings.add(s));
    } else if (file.endsWith('.js')) {
      const fileStrings = processFile(fullPath);
      fileStrings.forEach(s => allStrings.add(s));
    }
  }
  return allStrings;
}

// --- Основная логика ---
let allStrings;
const stats = fs.statSync(target);
if (stats.isDirectory()) {
  console.log(`📁 Обработка папки: ${target}`);
  allStrings = walkDirectory(target);
} else if (stats.isFile() && target.endsWith('.js')) {
  console.log(`📄 Обработка файла: ${target}`);
  allStrings = processFile(target);
} else {
  console.error('❌ Укажите .js файл или папку с .js файлами');
  process.exit(1);
}

// Фильтрация
let filtered = Array.from(allStrings);
if (minLength > 0) {
  filtered = filtered.filter(s => s.length >= minLength);
}
if (pattern) {
  filtered = filtered.filter(s => pattern.test(s));
}
filtered.sort();

// Вывод
const output = filtered.join('\n');
if (outputFile) {
  fs.writeFileSync(outputFile, output);
  console.log(`✅ Сохранено ${filtered.length} строк в ${outputFile}`);
} else {
  console.log(`\n🔍 Найдено ${filtered.length} строк (отфильтровано):`);
  console.log(output);
}
