#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

// Determine this script's filename to exclude it from commits
const scriptName = path.basename(__filename);

// Parse command-line arguments
const args = process.argv.slice(2);
const isPreview = args.includes('--preview');

// Handle --exclude <pattern>
const excludeIdx = args.indexOf('--exclude');
let excludeRegex = null;
if (excludeIdx !== -1) {
  const pattern = args[excludeIdx + 1];
  if (!pattern) {
    console.error('Error: --exclude requires a glob pattern');
    process.exit(1);
  }
  excludeRegex = globToRegex(pattern);
}

// Convert a simple glob pattern to a RegExp
function globToRegex(glob) {
  const special = ['.', '+', '^', '$', '(', ')', '=', '!', '|', '{', '}', '[', ']', ':', '\\'];
  let str = '';
  for (const char of glob) {
    if (char === '*') {
      str += '.*';
    } else if (char === '?') {
      str += '.';
    } else if (special.includes(char)) {
      str += '\\' + char;
    } else {
      str += char;
    }
  }
  return new RegExp('^' + str + '$');
}

// Retrieve uncommitted files via git status
let raw;
try {
  raw = execSync('git status --porcelain').toString().trim();
} catch (err) {
  console.error('Error retrieving git status:', err.message);
  process.exit(1);
}

const files = raw
  ? raw.split('\n').map(line => line.slice(3)).filter(f => f !== scriptName)
  : [];

// Support only files matching name[.number].extension
const pattern = /^(.+?)(?:\.(\d+))?(\.[^\.]+)$/;
let items = files
  .map(file => {
    const m = pattern.exec(file);
    if (!m) return null;
    return { file, base: m[1], num: m[2] ? parseInt(m[2], 10) : 0, ext: m[3] };
  })
  .filter(x => x !== null);

// Apply exclude pattern if provided
if (excludeRegex) {
  items = items.filter(item => !excludeRegex.test(item.file));
}

if (items.length === 0) {
  console.log('No uncommitted files matching criteria to process.');
  process.exit(0);
}

// Sort by base, extension, then numeric suffix
items.sort((a, b) => {
  if (a.base < b.base) return -1;
  if (a.base > b.base) return 1;
  if (a.ext < b.ext) return -1;
  if (a.ext > b.ext) return 1;
  return a.num - b.num;
});

const sortedFiles = items.map(i => i.file);

if (isPreview) {
  console.log('Preview mode: the files will be committed in the following order:');
  sortedFiles.forEach((f, i) => console.log(`${i + 1}. ${f}`));
  process.exit(0);
}

// Sequentially add and commit each file
for (const file of sortedFiles) {
  console.log(`Committing ${file}...`);
  execSync(`git add "${file}"`);
  execSync(`git commit -m "Add ${file}"`);
}

console.log('All matching uncommitted files have been committed in order.');