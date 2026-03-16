/**
 * services/bedrockClient.js
 * Singleton Bedrock Runtime client.
 * Supports both naming conventions:
 *   BEDROCK_TEXT_MODEL_ID  (hackathon spec)
 *   NOVA_LITE_MODEL        (legacy compat)
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  InvokeModelCommand,
  InvokeModelWithBidirectionalStreamCommand
} from "@aws-sdk/client-bedrock-runtime";
import { fromEnv } from "@aws-sdk/credential-providers";

// ── Region ────────────────────────────────────────────────────────────────────
export const REGION = process.env.AWS_REGION || "eu-north-1";

// ── Model IDs — BEDROCK_* vars take priority, fall back to NOVA_* legacy names
export const TEXT_MODEL_ID =
  process.env.BEDROCK_TEXT_MODEL_ID ||
  process.env.NOVA_LITE_MODEL ||
  "amazon.nova-lite-v1:0";

export const VOICE_MODEL_ID =
  process.env.BEDROCK_VOICE_MODEL_ID ||
  process.env.NOVA_SONIC_MODEL ||
  "amazon.nova-2-sonic-v1:0";

export const EMBEDDING_MODEL_ID =
  process.env.BEDROCK_EMBEDDING_MODEL_ID ||
  "amazon.titan-embed-image-v1"; // swap to Nova multimodal embedding when available in region

// ── Singleton client ──────────────────────────────────────────────────────────
let _client = null;

export function getBedrockClient() {
  if (!_client) {
    _client = new BedrockRuntimeClient({
      region: REGION,
      credentials: fromEnv()
    });
  }
  return _client;
}

// ── Credential check ──────────────────────────────────────────────────────────
export function hasConfiguredCredentials() {
  return Boolean(
    (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ||
    process.env.AWS_PROFILE ||
    process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
    process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI ||
    process.env.AWS_WEB_IDENTITY_TOKEN_FILE
  );
}

// ── Error helpers ─────────────────────────────────────────────────────────────
export function isThrottlingError(error) {
  const msg = error instanceof Error ? error.message : String(error);
  return /ThrottlingException|TooManyRequestsException|ServiceUnavailableException|429|rate limit|quota/i.test(msg);
}

export function extractRetryAfterSeconds(error) {
  const msg = error instanceof Error ? error.message : String(error);
  const match = msg.match(/retry.*?(\d+)\s*s/i);
  return match ? Number(match[1]) : 30;
}

// ── Re-exports for consumers ──────────────────────────────────────────────────
export {
  ConverseCommand,
  InvokeModelCommand,
  InvokeModelWithBidirectionalStreamCommand
};
