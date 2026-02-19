const startButton = document.getElementById("startCall");
const stopButton = document.getElementById("stopCall");
const googleStatus = document.getElementById("googleStatus");
const logElement = document.getElementById("log");
const eventLinkRow = document.getElementById("eventLinkRow");
const eventLink = document.getElementById("eventLink");

let ws;
let mediaStream;
let inputContext;
let outputContext;
let sourceNode;
let workletNode;
let outputAtTime = 0;
const activeOutputSources = new Set();

function log(message, data) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  const payload = data ? ` ${JSON.stringify(data)}` : "";
  logElement.textContent += `${line}${payload}\n`;
  logElement.scrollTop = logElement.scrollHeight;
}

async function refreshGoogleStatus() {
  try {
    const response = await fetch("/api/google/status");
    const data = await response.json();
    googleStatus.textContent = data.connected
      ? "Google Calendar: connected"
      : "Google Calendar: not connected";
  } catch (error) {
    googleStatus.textContent = "Google Calendar: status unavailable";
  }
}

function decodePcm16ToFloat32(arrayBuffer) {
  const pcm = new Int16Array(arrayBuffer);
  const float32 = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i += 1) {
    float32[i] = pcm[i] / 0x8000;
  }
  return float32;
}

function enqueueAudio(arrayBuffer) {
  if (!outputContext) {
    return;
  }

  const samples = decodePcm16ToFloat32(arrayBuffer);
  const audioBuffer = outputContext.createBuffer(1, samples.length, 24000);
  audioBuffer.copyToChannel(samples, 0);

  const source = outputContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(outputContext.destination);
  activeOutputSources.add(source);
  source.onended = () => {
    activeOutputSources.delete(source);
  };
  outputAtTime = Math.max(outputAtTime, outputContext.currentTime + 0.01);
  source.start(outputAtTime);
  outputAtTime += audioBuffer.duration;
}

function interruptPlayback() {
  if (!outputContext) {
    return;
  }
  for (const source of activeOutputSources) {
    try {
      source.stop();
    } catch (_error) {
      // no-op
    }
  }
  activeOutputSources.clear();
  outputAtTime = outputContext.currentTime;
}

async function handleFunctionCall(message) {
  const calls = message.functions || [];
  for (const fnCall of calls) {
    if (fnCall.name !== "create_calendar_event") {
      continue;
    }

    let args;
    try {
      args = JSON.parse(fnCall.arguments || "{}");
    } catch (error) {
      args = {};
    }

    const response = await fetch("/api/calendar/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(args)
    });
    const result = await response.json();
    const normalizedResult = response.ok
      ? result
      : {
        ok: false,
        error: result?.detail || result?.error || "Calendar event creation failed."
      };

    const contentForAgent = normalizedResult.ok
      ? {
        ok: true,
        status: "created"
      }
      : normalizedResult;

    ws.send(
      JSON.stringify({
        type: "FunctionCallResponse",
        id: fnCall.id,
        name: fnCall.name,
        content: JSON.stringify(contentForAgent)
      })
    );

    if (normalizedResult.ok && normalizedResult.eventLink) {
      eventLinkRow.hidden = false;
      eventLink.href = normalizedResult.eventLink;
      eventLink.textContent = normalizedResult.eventLink;
      log("Calendar event created");
    } else {
      log("Calendar event creation failed", {
        error: normalizedResult.error || "Unknown error"
      });
    }
  }
}

async function startAudioStreaming() {
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  });

  inputContext = new AudioContext({ sampleRate: 48000 });
  outputContext = new AudioContext();
  outputAtTime = outputContext.currentTime;
  log("Audio contexts ready", {
    inputState: inputContext.state,
    outputState: outputContext.state,
    inputSampleRate: inputContext.sampleRate,
    outputSampleRate: outputContext.sampleRate
  });

  mediaStream.getAudioTracks().forEach((track) => {
    track.onended = () => log("Microphone track ended");
    track.onmute = () => log("Microphone track muted");
    track.onunmute = () => log("Microphone track unmuted");
  });

  await inputContext.audioWorklet.addModule("/audio-worklet-processor.js");
  sourceNode = inputContext.createMediaStreamSource(mediaStream);
  workletNode = new AudioWorkletNode(inputContext, "pcm-capture-processor");
  sourceNode.connect(workletNode);

  workletNode.port.onmessage = (event) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }
    ws.send(event.data);
  };
}

async function stopAudioStreaming() {
  if (workletNode) {
    workletNode.disconnect();
    workletNode.port.onmessage = null;
    workletNode = null;
  }

  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  if (inputContext) {
    await inputContext.close();
    inputContext = null;
  }

  if (outputContext) {
    interruptPlayback();
    await outputContext.close();
    outputContext = null;
  }
}

async function startSession() {
  startButton.disabled = true;
  try {
    eventLinkRow.hidden = true;
    eventLink.removeAttribute("href");
    eventLink.textContent = "";
    await startAudioStreaming();

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${protocol}://${window.location.host}/ws/voice`);

    ws.onopen = () => {
      stopButton.disabled = false;
      log("Voice session started");
    };

    ws.onmessage = async (event) => {
      if (typeof event.data !== "string") {
        const audioBuffer = await event.data.arrayBuffer();
        enqueueAudio(audioBuffer);
        return;
      }

      const message = JSON.parse(event.data);
      if (message.type === "ConversationText" && message.role && message.content) {
        const content = String(message.content || "").trim();
        if (content) {
          log(`${message.role}: ${content}`);
        }
        return;
      }

      if (message.type === "FunctionCallRequest") {
        await handleFunctionCall(message);
        return;
      }

      if (message.type === "AgentStartedSpeaking") {
        log("Agent speaking");
        return;
      }

      if (message.type === "UserStartedSpeaking") {
        interruptPlayback();
        return;
      }

      if (message.type === "AgentStoppedSpeaking") {
        log("Agent stopped speaking");
        return;
      }

      if (message.type === "Error") {
        log("Deepgram error", message);
        return;
      }

      if (message.type === "Warning") {
        log("Deepgram warning", message);
        return;
      }

      if (message.type === "Close") {
        log("Deepgram close", message);
        return;
      }

      if (message.type === "ConversationEnded") {
        log("Deepgram conversation ended", message);
        return;
      }

    };

    ws.onclose = async (event) => {
      stopButton.disabled = true;
      startButton.disabled = false;
      await stopAudioStreaming();
      log("Voice session ended", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean
      });
    };

    ws.onerror = (error) => {
      log("WebSocket error", { message: error?.message || "Unknown error" });
    };
  } catch (error) {
    startButton.disabled = false;
    stopButton.disabled = true;
    await stopAudioStreaming();
    log("Failed to start session", { error: error.message });
  }
}

function stopSession() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  } else {
    startButton.disabled = false;
    stopButton.disabled = true;
  }
}

startButton.addEventListener("click", () => {
  startSession();
});

stopButton.addEventListener("click", () => {
  stopSession();
});

refreshGoogleStatus();
