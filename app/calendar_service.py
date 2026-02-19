from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from googleapiclient.discovery import build

from app.google_auth import get_google_credentials


def validate_event_payload(payload: dict[str, Any]) -> dict[str, Any]:
    meeting_with_name = str(
        payload.get("meeting_with_name") or payload.get("attendee_name") or ""
    ).strip()
    meeting_title = str(payload.get("meeting_title", "")).strip()
    start_time_iso = str(payload.get("start_time_iso", "")).strip()
    timezone_name = str(payload.get("timezone", "")).strip() or None
    normalized_timezone = normalize_timezone(timezone_name)

    duration_raw = payload.get("duration_minutes", 30)
    try:
        duration_minutes = int(duration_raw)
    except (TypeError, ValueError) as exc:
        raise ValueError("duration_minutes must be an integer.") from exc

    if not meeting_with_name:
        raise ValueError("meeting_with_name is required.")
    if not start_time_iso:
        raise ValueError("start_time_iso is required.")
    if not normalized_timezone:
        raise ValueError("timezone is required and must be a valid IANA timezone.")
    if duration_minutes < 5 or duration_minutes > 240:
        raise ValueError("duration_minutes must be between 5 and 240.")

    try:
        start_dt = datetime.fromisoformat(start_time_iso.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("start_time_iso must be a valid ISO-8601 datetime.") from exc

    if start_dt.tzinfo is None:
        start_dt = start_dt.replace(tzinfo=ZoneInfo(normalized_timezone))

    now_utc = datetime.now(timezone.utc)
    start_utc = start_dt.astimezone(timezone.utc)
    if start_utc < now_utc - timedelta(minutes=2):
        raise ValueError("Meeting time is in the past. Please provide a future date and time.")

    summary = meeting_title or f"Meeting with {meeting_with_name}"

    return {
        "meeting_with_name": meeting_with_name,
        "summary": summary,
        "start_dt": start_dt,
        "duration_minutes": duration_minutes,
        "timezone": normalized_timezone,
    }


def normalize_timezone(value: str | None) -> str | None:
    if not value:
        return None
    if value == "UTC":
        return value
    try:
        ZoneInfo(value)
        return value
    except ZoneInfoNotFoundError:
        return None


def create_calendar_event(payload: dict[str, Any]) -> dict[str, Any]:
    event_input = validate_event_payload(payload)
    end_dt = event_input["start_dt"] + timedelta(minutes=event_input["duration_minutes"])

    credentials = get_google_credentials()
    calendar = build("calendar", "v3", credentials=credentials)

    event = {
        "summary": event_input["summary"],
        "description": f"Booked by voice assistant. Meeting with {event_input['meeting_with_name']}.",
        "start": {
            "dateTime": event_input["start_dt"].isoformat(),
        },
        "end": {
            "dateTime": end_dt.isoformat(),
        },
    }
    if event_input["timezone"]:
        event["start"]["timeZone"] = event_input["timezone"]
        event["end"]["timeZone"] = event_input["timezone"]

    created = (
        calendar.events()
        .insert(calendarId="primary", body=event)
        .execute()
    )

    return {
        "ok": True,
        "eventId": created.get("id", ""),
        "eventLink": created.get("htmlLink", ""),
        "meetingWithName": event_input["meeting_with_name"],
        "startsAt": event["start"]["dateTime"],
        "endsAt": event["end"]["dateTime"],
    }
