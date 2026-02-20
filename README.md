# Voice Scheduling Agent (Deepgram + Google Calendar)

Real-time voice scheduler:
- Starts a live conversation.
- Collects name, preferred date/time and zone, optional meeting title.
- Confirms final details.
- Creates a real Google Calendar event.

## Architecture
- Frontend: browser mic capture and audio playback(`public/`)
- Backend: FastAPI (`app/main.py`)
- Voice transport: frontend -> backend websocket (`/ws/voice`) -> Deepgram Agent websocket
- LLM: OpenAI model configured via Deepgram Voice Agent `think.provider`
- Calendar: Google OAuth + Calendar API `events.insert`



## Requirements
- Python 3.11+
- Deepgram API key
- Google Cloud OAuth client (Web application) with Calendar API enabled

## Environment
Copy `.env.example` to `.env` and set:

```env
PORT=3000
BASE_URL=http://localhost:3000
SESSION_SECRET_KEY=change-me-to-a-random-long-string
DEEPGRAM_API_KEY=...
```



## Deployed URL
- `https://voice-scheduling-agent-33p6.onrender.com/`

## Run locally
Before running locally, follow the Google setup steps in **Calendar integration explanation**, then download `credentials.json` and place it in the project root directory.

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 3000
```

Open `http://localhost:3000`.

## Run with Docker
Build:
```bash
docker build -t vikara-voice-assistant .
```

Run:
```bash
docker run --rm -p 3000:3000 --env-file .env -v "${PWD}/credentials.json:/app/credentials.json" vikara-voice-assistant
```

Alternative ( absolute path):
```bash
docker run --rm -p 3000:3000 --env-file .env -v "C:/Users/Administrator/Desktop/-/-/credentials.json:/app/credentials.json" vikara-voice-assistant
```

## How To Test
1. After the clicking url(localhost or render url) and the page is loaded, click `Connect Google` and finish consent.
2. Click `Start Voice Session`.
3. Agent guides you to provide your name, preferred date/time, timezone, and optional meeting title.
4. Final confirmation with explicit `yes`.
5. Check Google Calendar for the newly created event, you can also click on the url provided once the event is created.

## Calendar integration explanation
I integrated Google Calendar with OAuth 2.0 and Calendar API `events.insert`.

Google Cloud steps I completed:
- I enabled Google Calendar API here: `https://console.cloud.google.com/flows/enableapi?apiid=calendar-json.googleapis.com`
- I configured the OAuth consent screen in Google Auth Platform Branding: `https://console.cloud.google.com/auth/branding`
- In consent setup, I filled neccesary info/details, accepted the user data policy, and created the config.
- For audience, I configured the app as External.
- I created an OAuth client in Clients: `https://console.cloud.google.com/auth/clients`
- I selected application type as Web application and created the client.
- I added two authorized redirect URIs soI can test locally and via Render:
  - `http://localhost:3000/auth/google/callback`
  - `https://voice-scheduling-agent-33p6.onrender.com/auth/google/callback`
- I saved the OAuth client JSON as `credentials.json` for the app.

How this is wired in code:
- `GET /auth/google/start` in `app/main.py` starts OAuth and sends the user to Google consent.
- `GET /auth/google/callback` in `app/main.py` receives the auth code and completes token exchange.
- OAuth/token logic is implemented in `app/google_auth.py`.
- Tokens are stored by `app/token_store.py` in `.data/google-oauth-token.json`.
- Calendar event creation is implemented in `app/calendar_service.py` using Google Calendar `events.insert`.

Auth handling:
- OAuth `state` validation is enabled.
- The app validates state from session with a short-lived HTTP-only cookie fallback to handle deployment redirect/session edge cases.
- Session middleware is configured with `same_site="lax"` and HTTPS-aware cookie behavior.


## Evidence

See `evidence/` folder for:
- Voice session log showing the complete booking flow
- Google Calendar event successfully created
- Event details with correct time and duration
- Render deployment logs
