import { google } from "googleapis";

function getAuth() {
  const credentials = JSON.parse(
    process.env.GOOGLE_SHEETS_CREDENTIALS || "{}"
  );
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

export async function appendToSheet(values: string[][]) {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.GOOGLE_SHEET_ID || "";

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Sheet1!A:N",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values,
    },
  });
}
