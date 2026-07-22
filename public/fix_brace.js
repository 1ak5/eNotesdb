const fs = require('fs');
const p = 'C:/flutter apks/project 3 - enotes-soja.onrender.com/public/script.js';
let js = fs.readFileSync(p, 'utf8');
const lines = js.split('\n');

// Show current line 862 (index 861)
console.log('Before:', JSON.stringify(lines[861]));

// Fix: change }} to just } with newline before closing brace
if (lines[861].trim() === '}}') {
  lines[861] = '    }';
  console.log('Fixed double brace to single brace');
} else {
  console.log('Pattern not found, checking context...');
  for (let i = 858; i < 866 && i < lines.length; i++) {
    console.log((i+1) + ': ' + JSON.stringify(lines[i]));
  }
}

console.log('After:', JSON.stringify(lines[861]));

js = lines.join('\n');
fs.writeFileSync(p, js, 'utf8');

try {
  require('vm').createScript(js);
  console.log('SYNTAX OK');
} catch(e) {
  console.log('SYNTAX ERROR:', e.message);
}
