import os, json, urllib.request
from dotenv import load_dotenv
load_dotenv("signal-clone/backend/.env")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

payload = json.dumps({"contents": [{"role": "user", "parts": [{"text": "hi"}]}]}).encode()
url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-latest:generateContent?key={GEMINI_API_KEY}"
req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
try:
    resp = urllib.request.urlopen(req, timeout=10)
    print("SUCCESS")
except Exception as e:
    print("FAILED", e)
