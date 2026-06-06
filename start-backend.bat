@echo off
title LeadPro Backend
cd /d C:\Projects\LeadPro\backend
.venv\Scripts\uvicorn.exe app.api.main:app --reload
