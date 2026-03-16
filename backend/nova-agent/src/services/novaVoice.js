/**
 * services/novaVoice.js
 * Nova 2 Sonic voice service.
 *
 * Exposes:
 *   transcribeOrProcessVoice(audioInput)  — POST /voice handler
 *   attachSonicGateway(server)            — WebSocket /live gateway
 */

import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";
import {
  getBedrockClient,
  hasConfiguredCredentials,
  VOICE_MODEL_ID,
  TEXT_MODEL_ID,
  ConverseCommand,
  InvokeModelWithBidirectionalStreamCommand
} from "./bedrockClient.js";

const SYSTEM_PROMPT =
  "You are Cursivis, a cursor-native AI assistant powered by Amazon Nova. " +
  "The user will speak a command about their current screen selection. " +
  "Listen carefully, then return only the cleaned command text. " +
  "Keep responses short — two or three sentences at most.";

// ── transcribeOrProcessVoice ──────────────────────────────────────────────────
/**
 * Transcribe or process a voice input.
 * Uses Nova 2 Lite for buffered audio transcription (WAV/PCM).
 * For real-time streaming, use attachSonicGateway instead.
 *
 * @param {{ audioBase64: string, mimeType?: string }} audioInput
 * @returns {{ text: string, model: string, latencyMs: number }}
 */
export async function transcribeOrProcessVoice({ audioBase64, mimeType = "audio/wav" }) {
  if (!hasConfiguredCredentials()) throw new Error("AWS credentials required for voice processing.");
  if (!audioBase64) throw new Error("audioBase64 is required.");

  const client = getBedrockClient();
  const startedAt = Date.now();

  // Nova 2 Lite via Converse API — audio as document block
  const messages = [{
    role: "user",
    content: [
      { text: "Transcribe this spoken command accurately. Return only the transcribed command text. No extra commentary." },
      {
        document: {
          format: mimeType.replace("audio/", "").replace("x-", "") || "wav",
          name: "voice_input",
          source: { bytes: Buffer.from(audioBase64, "base64") }
        }
      }
    ]
  }];

  const input = {
    modelId: TEXT_MODEL_ID,
    messages,
    inferenceConfig: { maxTokens: 256, temperature: 0.1, topP: 0.9 }
  };

  const response = await client.send(new ConverseCommand(input));
  const contentList = response?.output?.message?.content ?? [];
  const text = contentList.find(b => b.text)?.text?.trim() ?? "";

  if (!text) throw new Error("Nova returned no transcription result.");

  return {
    text,
    model: TEXT_MODEL_ID,
    latencyMs: Date.now() - startedAt,
    usage: response.usage
      ? { inputTokens: response.usage.inputTokens ?? 0, outputTokens: response.usage.outputTokens ?? 0 }
      : undefined
  };
}

// ── attachSonicGateway ────────────────────────────────────────────────────────
/**
 * Attach Nova 2 Sonic real-time voice WebSocket gateway to an HTTP server.
 * Path: /live (configurable via CURSIVIS_LIVE_VOICE_PATH)
 *
 * Client message protocol:
 *   { type: "audio_chunk", dataBase64: "..." }
 *   { type: "audio_end" }
 *   { type: "close" }
 *
 * Server message protocol:
 *   { type: "live_open" }
 *   { type: "input_transcription", text: "..." }
 *   { type: "model_text", text: "..." }
 *   { type: "audio_output", dataBase64: "..." }
 *   { type: "turn_complete" }
 *   { type: "live_closed" }
 *   { type: "error", error: "..." }
 */
export function attachSonicGateway(server) {
  const livePath = process.env.CURSIVIS_LIVE_VOICE_PATH || "/live";
  const wss = new WebSocketServer({ server, path: livePath });

  wss.on("connection", async (socket) => {
    if (!hasConfiguredCredentials()) {
      safeSend(socket, { type: "error", error: "AWS credentials are required for Nova Sonic voice." });
      socket.close();
      return;
    }

    const promptName    = randomUUID();
    const systemContent = randomUUID();
    const audioContent  = randomUUID();
    let inputStream     = null;
    let outputStream    = null;
    let active          = true;

    try {
      const client = getBedrockClient();
      const command = new InvokeModelWithBidirectionalStreamCommand({ modelId: VOICE_MODEL_ID });
      const response = await client.send(command);
      inputStream  = response.input;
      outputStream = response.output;

      // Bootstrap session
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
              voiceId: process.env.NOVA_SONIC_VOICE_ID || "matthew",
              encoding: "base64",
              audioType: "SPEECH"
            }
          }
        }
      });

      // System prompt block
      await sendEvent(inputStream, { event: { contentStart: { promptName, contentName: systemContent, type: "TEXT", interactive: true, role: "SYSTEM", textInputConfiguration: { mediaType: "text/plain" } } } });
      await sendEvent(inputStream, { event: { textInput: { promptName, contentName: systemContent, content: SYSTEM_PROMPT } } });
      await sendEvent(inputStream, { event: { contentEnd: { promptName, contentName: systemContent } } });

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

      // Output stream reader
      (async () => {
        try {
          for await (const chunk of outputStream) {
            if (!active) break;
            const raw = chunk?.chunk?.bytes;
            if (!raw) continue;
            const json = JSON.parse(typeof raw === "string" ? raw : Buffer.from(raw).toString("utf8"));
            const ev = json?.event;
            if (!ev) continue;

            if (ev.textOutput) {
              const role = ev.textOutput.role || "ASSISTANT";
              const text = ev.textOutput.content || "";
              safeSend(socket, role === "USER"
                ? { type: "input_transcription", text }
                : { type: "model_text", text });
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

      // Inbound messages
      socket.on("message", async (raw) => {
        try {
          const msg = JSON.parse(String(raw));
          if (msg.type === "audio_chunk" && msg.dataBase64 && active) {
            await sendEvent(inputStream, { event: { audioInput: { promptName, contentName: audioContent, content: msg.dataBase64 } } });
          } else if (msg.type === "audio_end" && active) {
            await sendEvent(inputStream, { event: { contentEnd: { promptName, contentName: audioContent } } });
            await sendEvent(inputStream, { event: { promptEnd: { promptName } } });
            await sendEvent(inputStream, { event: { sessionEnd: {} } });
            inputStream.end?.();
          } else if (msg.type === "close") {
            active = false;
            inputStream.end?.();
            socket.close();
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
