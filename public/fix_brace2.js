const fs = require('fs');
const p = 'C:/flutter apks/project 3 - enotes-soja.onrender.com/public/script.js';
let js = fs.readFileSync(p, 'utf8');
const lines = js.split('\n');

// Line 862 (index 861) is '    }' which closes the else-if
// We need to add a closing '}' on line 863 for the switchSectionInstantly method
// Line 863 (index 862) should be empty, and line 864 starts showViewInstantly

console.log('Line 861:', JSON.stringify(lines[861]));
console.log('Line 862:', JSON.stringify(lines[862]));
console.log('Line 863:', JSON.stringify(lines[863]));

// Insert method closing brace after line 862
lines.splice(862, 0, '}');
console.log('Inserted method closing brace at line 863');

js = lines.join('\n');
fs.writeFileSync(p, js, 'utf8');

try {
  require('vm').createScript(js);
  console.log('SYNTAX OK');
} catch(e) {
  console.log('SYNTAX ERROR:', e.message);
}
