const XLSX = require('xlsx');
const path = require('path');

// Read the file
const filePath = path.join(__dirname, 'ملف المناديب.xlsx');
console.log('Reading file:', filePath);

try {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
  
  console.log('\n=== File Structure ===');
  console.log('Total rows:', data.length);
  console.log('\nHeader row:', JSON.stringify(data[0]));
  console.log('\nFirst data row:', JSON.stringify(data[1]));
  console.log('\nSecond data row:', JSON.stringify(data[2]));
  
  // Check column detection
  const headerRow = data[0] || [];
  console.log('\n=== Column Analysis ===');
  headerRow.forEach((cell, i) => {
    console.log(`Column ${i}: "${cell}"`);
  });
} catch (err) {
  console.error('Error:', err.message);
}

