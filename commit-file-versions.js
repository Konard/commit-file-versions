#!/usr/bin/env node

const { execSync } = require('child_process');

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
  ? raw.split('\n').map(line => line.slice(3))
  : [];

// Support only files matching the pattern: name[.number].extension
const namePattern = /^(.+?)(?:\.(\d+))?(\.[^\.]+)$/;
let items = files
  .map(file => {
    const m = namePattern.exec(file);
    if (!m) return null;
    return { file, base: m[1], num: m[2] ? parseInt(m[2], 10) : 0, ext: m[3] };
  })
  .filter(item => item !== null);

// Apply exclude pattern if provided
if (excludeRegex) {
  items = items.filter(item => !excludeRegex.test(item.file));
}

if (items.length === 0) {
  console.log('No uncommitted files matching criteria to process.');
  process.exit(0);
}

// Detect missing sequence numbers per group (only warn for numbers > 2)
const groups = items.reduce((acc, item) => {
  const key = item.base + item.ext;
  if (!acc[key]) acc[key] = { base: item.base, ext: item.ext, nums: [] };
  acc[key].nums.push(item.num);
  return acc;
}, {});

for (const key in groups) {
  const { base, ext, nums } = groups[key];
  const max = Math.max(...nums);
  const missing = [];
  for (let i = 3; i <= max; i++) {
    if (!nums.includes(i)) missing.push(i);
  }
  if (missing.length > 0) {
    const missingFiles = missing.map(n => `${base}.${n}${ext}`).join(', ');
    console.warn(`Warning: missing files in sequence for ${base}${ext} pattern: ${missingFiles}`);
  }
}

// Sort by base name, extension, then numeric suffix
items.sort((a, b) => {
  if (a.base < b.base) return -1;
  if (a.base > b.base) return 1;
  if (a.ext < b.ext) return -1;
  if (a.ext > b.ext) return 1;
  return a.num - b.num;
});

const sortedFiles = items.map(i => i.file);

// Preview mode: show rename and commit steps
if (isPreview) {
  console.log('Preview mode: the files will be committed in the following order:');
  sortedFiles.forEach((file, index) => {
    const m = namePattern.exec(file);
    const target = `${m[1]}${m[3]}`;
    if (file === target) {
      console.log(`${index + 1}. Commit ${file}`);
    } else {
      console.log(`${index + 1}. Rename ${file} -> ${target} and commit`);
    }
  });
  process.exit(0);
}

// Sequentially rename (if needed), add and commit each file
for (const file of sortedFiles) {
  const m = namePattern.exec(file);
  const base = m[1];
  const ext = m[3];
  const target = `${base}${ext}`;

  if (file === target) {
    console.log(`Committing ${file}...`);
    execSync(`git add "${file}"`);
    execSync(`git commit -m "Add ${file}"`);
  } else {
    console.log(`Renaming ${file} to ${target} and committing...`);
    execSync(`mv -f "${file}" "${target}"`);
    execSync(`git add "${target}"`);
    execSync(`git commit -m "Add ${target}"`);
  }
}

console.log('All matching uncommitted files have been committed and renamed in order.');
