const { google } = require('googleapis');
require('dotenv').config({ path: '.env.local' });

async function checkSupervisors() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'المشرفين!A:B',
  });

  console.log('Supervisors in Google Sheet:');
  const rows = response.data.values || [];
  rows.forEach((row, i) => {
    if (i === 0) console.log('Header:', row);
    else console.log(`Row ${i}: code="${row[0]}", name="${row[1]}"`);
  });
}

checkSupervisors().catch(console.error);
