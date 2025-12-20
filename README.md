
# Jan Sahayak AI - Setup Guide

## How to run on Localhost
To run this locally, you need a web server. You cannot just double-click `index.html` because the browser will block the microphone for "file://" protocols.

### Option 1: Using VS Code (Easiest)
1. Install the **"Live Server"** extension in VS Code.
2. Right-click `index.html` and select **"Open with Live Server"**.
3. It will open at `http://127.0.0.1:5500`. The microphone **will work** here.

### Option 2: Using Python (No install needed)
Open your terminal in the project folder and run:
```bash
python -m http.server 8000
```
Then open `http://localhost:8000` in your browser.

### Option 3: Using Node.js (Vite)
If you want a professional setup:
```bash
npm create vite@latest . -- --template react-ts
npm install
npm run dev
```

## How to Deploy
When you deploy this to the web (Vercel, Netlify, Github Pages, etc.):

1. **HTTPS is MANDATORY**: Ensure your deployment link starts with `https://`. If it is `http://`, the voice recording will NOT work.
2. **Environment Variable**: Ensure you set `API_KEY` in your deployment dashboard's Environment Variables section.
3. **Antigravity / AI Studio**: The `metadata.json` file in this folder is already configured to tell those platforms to enable the microphone. Do not delete it.

## Troubleshooting Microphone
- **Gray Icon?** Check the address bar. Click the "Lock" or "Settings" icon next to the URL and ensure "Microphone" is set to "Allow".
- **Not Found?** Ensure no other app (like Zoom or Teams) is "hogging" the microphone.
- **Local IP?** If you are accessing via `http://192.168.x.x`, it will fail. Use `http://localhost` instead.
