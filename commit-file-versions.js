#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

// Determine this script's filename to exclude it from commits
const scriptName = path.basename(__filename);

// Check for --preview flag
const isPreview = process.argv.includes('--preview');

// Get uncommitted files via git status
let files = [];
try {
  const statusOutput = execSync('git status --porcelain').toString().trim().split('\n').filter(Boolean);
  files = statusOutput
    .map(line => line.slice(3)) // file path starts at index 3
    .filter(file => file !== scriptName)
    .sort();
} catch (err) {
  console.error('Error retrieving git status:', err.message);
  process.exit(1);
}

if (files.length === 0) {
  console.log('No uncommitted files to process.');
  process.exit(0);
}

if (isPreview) {
  console.log('Preview mode: the files will be committed in the following order:');
  files.forEach((file, index) => {
    console.log(`${index + 1}. ${file}`);
  });
  process.exit(0);
}

// Sequentially add and commit each file with a descriptive message
files.forEach(file => {
  console.log(`Committing ${file}...`);
  execSync(`git add "${file}"`);
  execSync(`git commit -m "Add ${file}"`);
});

console.log('All uncommitted files have been committed in order.');
