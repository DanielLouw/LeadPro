@echo off
start "LeadPro Backend" /D "C:\Projects\LeadPro\backend" "C:\Projects\LeadPro\backend\.venv\Scripts\uvicorn.exe" app.api.main:app --reload
start "LeadPro Frontend" /D "C:\Projects\LeadPro\frontend" cmd /c "npm run dev"
echo Both servers starting...
echo Backend: http://localhost:8000
echo Frontend: http://localhost:5173
