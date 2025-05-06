#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

// Determine this script's filename to exclude it from commits\ nconst scriptName = path.basename(__filename);

// Check for --preview flag
const isPreview = process.argv.includes('--preview');

// Retrieve uncommitted files via git status
let files = [];
try {
  const status = execSync('git status --porcelain').toString().trim();
  if (status) {
    files = status
      .split('\n')
      .map(line => line.slice(3)) // file path starts at index 3
      .filter(file => file !== scriptName);
  }
} catch (err) {
  console.error('Error retrieving git status:', err.message);
  process.exit(1);
}

// Support only files matching the pattern: name[.number].extension
const pattern = /^(.+?)(?:\.(\d+))?(\.[^\.]+)$/;
const parsed = files
  .map(file => {
    const m = pattern.exec(file);
    if (!m) return null;
    return {
      file,
      base: m[1],
      num: m[2] ? parseInt(m[2], 10) : 0,
      ext: m[3]
    };
  })
  .filter(item => item !== null);

if (parsed.length === 0) {
  console.log('No uncommitted files matching the pattern to process.');
  process.exit(0);
}

// Sort by base name, extension, then numeric suffix
parsed.sort((a, b) => {
  if (a.base < b.base) return -1;
  if (a.base > b.base) return 1;
  if (a.ext < b.ext) return -1;
  if (a.ext > b.ext) return 1;
  return a.num - b.num;
});

const sortedFiles = parsed.map(item => item.file);

if (isPreview) {
  console.log('Preview mode: the files will be committed in the following order:');
  sortedFiles.forEach((file, idx) => {
    console.log(`${idx + 1}. ${file}`);
  });
  process.exit(0);
}

// Sequentially add and commit each file
sortedFiles.forEach(file => {
  console.log(`Committing ${file}...`);
  execSync(`git add "${file}"`);
  execSync(`git commit -m "Add ${file}"`);
});

console.log('All matching uncommitted files have been committed in order.');
