const fs = require('fs');
const path = require('path');

const testStructure = {
  'empty-dir': {},
  'media': {
    'videos': {
      'sample.mp4': 'dummy video content',
      'test.webm': 'dummy webm content'
    },
    'images': {
      'photo.jpg': 'dummy jpg content',
      'graphic.png': 'dummy png content'
    }
  },
  'nested': {
    'level1': {
      'level2': {
        'deep-file.txt': 'deep nested content'
      }
    }
  },
  'special-chars': {
    'file with spaces.txt': 'content with spaces',
    'file-with-дashes.txt': 'unicode content',
    '!@#$%^&().txt': 'special characters'
  },
  'large-directory': {}
};

function createTestStructure(basePath, structure) {
  Object.entries(structure).forEach(([name, content]) => {
    const currentPath = path.join(basePath, name);
    
    if (typeof content === 'string') {
      fs.writeFileSync(currentPath, content);
    } else {
      fs.mkdirSync(currentPath, { recursive: true });
      createTestStructure(currentPath, content);
    }
  });
}

// Create base test directory
const testDir = path.join(__dirname);
fs.mkdirSync(testDir, { recursive: true });

// Generate test files and directories
createTestStructure(testDir, testStructure);

// Create multiple files in large-directory
const largeDir = path.join(testDir, 'large-directory');
for (let i = 1; i <= 100; i++) {
  fs.writeFileSync(
    path.join(largeDir, `file${i}.txt`),
    `Content for file ${i}`
  );
}

console.log('Test directory structure created successfully');
