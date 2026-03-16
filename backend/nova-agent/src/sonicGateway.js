/**
 * sonicGateway.js
 * WebSocket gateway bridging the companion app to Amazon Nova 2 Sonic
 * via the Bedrock InvokeModelWithBidirectionalStream API.
 *
 * Drop-in replacement for liveGateway.js — same WS message protocol,
 * same path (/live), same event types the companion expects.
 *
 * Nova 2 Sonic event flow (per AWS docs):
 *   Client → sessionStart → promptStart → contentStart(SYSTEM/TEXT)
 *          → textInput → contentEnd → contentStart(USER/AUDIO)
 *          → audioInput chunks → contentEnd → promptEnd → sessionEnd
 *   Server → contentStart → audioOutput / textOutput → contentEnd → turnComplete
 */

import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";
import {
  getBedrockClient,
  hasConfiguredCredentials,
  InvokeModelWithBidirectionalStreamCommand
} from "./bedrockClient.js";

const SONIC_MODEL = process.env.NOVA_SONIC_MODEL || "amazon.nova-2-sonic-v1:0";
const LIVE_PATH   = process.env.CURSIVIS_LIVE_VOICE_PATH || "/live";

const SYSTEM_PROMPT =
  "You are Cursivis, a cursor-native AI assistant. " +
  "The user will speak a command about their current screen selection. " +
  "Listen carefully, then return only the cleaned command text. " +
  "Keep responses short — two or three sentences at most.";

export function attachSonicGateway(server) {
  const wss = new WebSocketServer({ server, path: LIVE_PATH });

  wss.on("connection", async (socket) => {
    if (!hasConfiguredCredentials()) {
      safeSend(socket, { type: "error", error: "AWS credentials are required for Nova Sonic voice." });
      socket.close();
      return;
    }

    const promptName      = randomUUID();
    const systemContent   = randomUUID();
    const audioContent    = randomUUID();

    let inputStream  = null;
    let outputStream = null;
    let active       = true;

    try {
      const client = getBedrockClient();

      // ── Open bidirectional stream ──────────────────────────────────────────
      const command = new InvokeModelWithBidirectionalStreamCommand({
        modelId: SONIC_MODEL
      });

      const response = await client.send(command);
      inputStream  = response.input;
      outputStream = response.output;

      // ── Send session bootstrap events ──────────────────────────────────────
      await sendEvent(inputStream, {
        event: {
          sessionStart: {
            inferenceConfiguration: { maxTokens: 1024, topP: 0.9, temperature: 0.7 },
            turnDetectionConfiguration: { endpointingSensitivity: "HIGH" }
          }
        }
      });

      await sendEvent(inputStream, {
        event: {
          promptStart: {
            promptName,
            textOutputConfiguration:  { mediaType: "text/plain" },
            audioOutputConfiguration: {
              mediaType: "audio/lpcm",
              sampleRateHertz: 24000,
              sampleSizeBits: 16,
              channelCount: 1,
              voiceId: "matthew",
              encoding: "base64",
              audioType: "SPEECH"
            }
          }
        }
      });

      // System prompt block
      await sendEvent(inputStream, {
        event: {
          contentStart: {
            promptName,
            contentName: systemContent,
            type: "TEXT",
            interactive: true,
            role: "SYSTEM",
            textInputConfiguration: { mediaType: "text/plain" }
          }
        }
      });
      await sendEvent(inputStream, {
        event: { textInput: { promptName, contentName: systemContent, content: SYSTEM_PROMPT } }
      });
      await sendEvent(inputStream, {
        event: { contentEnd: { promptName, contentName: systemContent } }
      });

      // Open audio input block
      await sendEvent(inputStream, {
        event: {
          contentStart: {
            promptName,
            contentName: audioContent,
            type: "AUDIO",
            interactive: true,
            role: "USER",
            audioInputConfiguration: {
              mediaType: "audio/lpcm",
              sampleRateHertz: 16000,
              sampleSizeBits: 16,
              channelCount: 1,
              audioType: "SPEECH",
              encoding: "base64"
            }
          }
        }
      });

      safeSend(socket, { type: "live_open" });

      // ── Process server output stream ───────────────────────────────────────
      (async () => {
        try {
          for await (const chunk of outputStream) {
            if (!active) break;
            const raw = chunk?.chunk?.bytes;
            if (!raw) continue;
            const json = JSON.parse(
              typeof raw === "string" ? raw : Buffer.from(raw).toString("utf8")
            );
            const ev = json?.event;
            if (!ev) continue;

            if (ev.textOutput) {
              const role = ev.textOutput.role || "ASSISTANT";
              const text = ev.textOutput.content || "";
              if (role === "USER")      safeSend(socket, { type: "input_transcription", text });
              else                      safeSend(socket, { type: "model_text", text });
            }
            if (ev.audioOutput) {
              safeSend(socket, { type: "audio_output", dataBase64: ev.audioOutput.content });
            }
            if (ev.contentEnd?.type === "AUDIO" && ev.contentEnd?.role === "ASSISTANT") {
              safeSend(socket, { type: "turn_complete" });
            }
          }
        } catch (err) {
          if (active) safeSend(socket, { type: "error", error: err.message });
        } finally {
          safeSend(socket, { type: "live_closed" });
        }
      })();

      // ── Handle inbound messages from companion ─────────────────────────────
      socket.on("message", async (raw) => {
        try {
          const msg = JSON.parse(String(raw));
          switch (msg.type) {
            case "audio_chunk":
              if (msg.dataBase64 && active) {
                await sendEvent(inputStream, {
                  event: {
                    audioInput: {
                      promptName,
                      contentName: audioContent,
                      content: msg.dataBase64
                    }
                  }
                });
              }
              break;

            case "audio_end":
              if (active) {
                await sendEvent(inputStream, {
                  event: { contentEnd: { promptName, contentName: audioContent } }
                });
                await sendEvent(inputStream, {
                  event: { promptEnd: { promptName } }
                });
                await sendEvent(inputStream, {
                  event: { sessionEnd: {} }
                });
                inputStream.end?.();
              }
              break;

            case "close":
              active = false;
              inputStream.end?.();
              socket.close();
              break;
          }
        } catch (err) {
          safeSend(socket, { type: "error", error: err.message });
        }
      });

      socket.on("close", () => {
        active = false;
        try { inputStream.end?.(); } catch { /* ignore */ }
      });

    } catch (err) {
      safeSend(socket, { type: "error", error: err.message });
      socket.close();
    }
  });
}

async function sendEvent(inputStream, payload) {
  const bytes = Buffer.from(JSON.stringify(payload), "utf8");
  await inputStream.write({ chunk: { bytes } });
}

function safeSend(socket, payload) {
  if (socket.readyState !== 1) return;
  socket.send(JSON.stringify(payload));
}
