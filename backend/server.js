require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');

const app = express();
app.use(cors());

const auth = new google.auth.GoogleAuth({
    keyFile: 'Key/serviceKey.json',
    scopes: [
        'https://www.googleapis.com/auth/spreadsheets.readonly',
        'https://www.googleapis.com/auth/calendar.readonly'
    ],
});

app.get('/dashboard-data', async (req, res) => {
    try {
        const authClient = await auth.getClient();
        const calendar = google.calendar({ version: 'v3', auth: authClient });
        const sheets = google.sheets({ version: 'v4', auth: authClient });
        
        const calendarIds = process.env.GOOGLE_CALENDAR_IDS.split(',');
        const promises = calendarIds.map(calId => calendar.events.list({
            calendarId: calId.trim(),
            timeMin: new Date().toISOString(),
            maxResults: 5,
            singleEvents: true,
            orderBy: 'startTime',
        }));

        const results = await Promise.all(promises);
        let allEvents = results.flatMap(result => result.data.items || []);
        
        allEvents.sort((a, b) => {
            const timeA = new Date(a.start.dateTime || a.start.date);
            const timeB = new Date(b.start.dateTime || b.start.date);
            return timeA - timeB;
        });

        const nextEvent = allEvents[0] || null;

        // --- CORRECTED LOGIC HERE ---
        let sheetData = []; // Default to an empty task list

        // Only try to fetch sheet data if there is an event
        if (nextEvent) {
            const now = new Date();
            const startTime = new Date(nextEvent.start.dateTime || nextEvent.start.date);
            const endTime = new Date(nextEvent.end.dateTime || nextEvent.end.date);

            // Check if the event is a routine AND if it's currently in progress
            if (nextEvent.description && nextEvent.description.toLowerCase().endsWith('.r') && now >= startTime && now < endTime) {
                const routineSheetName = nextEvent.description.replace(/\.r$/i, '').trim();
                const sheetRange = `${routineSheetName}!A3:B`;
                
                const sheetResponse = await sheets.spreadsheets.values.get({
                    spreadsheetId: process.env.GOOGLE_SHEET_ID,
                    range: sheetRange,
                });
                
                sheetData = sheetResponse.data.values || [];
            }
        }

        res.json({
            nextEvent: nextEvent || { summary: 'No upcoming events found.' },
            sheetData: sheetData,
        });

    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`✅ Backend server is running on http://localhost:${PORT}`);
});