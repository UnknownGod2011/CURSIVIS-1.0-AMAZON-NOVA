/**
 * bedrockClient.js
 * Singleton Amazon Bedrock Runtime client for Nova 2 Lite (text/multimodal).
 * Uses @aws-sdk/client-bedrock-runtime with the Converse API.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  InvokeModelWithBidirectionalStreamCommand
} from "@aws-sdk/client-bedrock-runtime";
import { fromEnv } from "@aws-sdk/credential-providers";

const REGION = process.env.AWS_REGION || "us-east-1";

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

export function hasConfiguredCredentials() {
  return Boolean(
    (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ||
    process.env.AWS_PROFILE ||
    // ECS / Lambda / EC2 instance role — no explicit keys needed
    process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
    process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI ||
    process.env.AWS_WEB_IDENTITY_TOKEN_FILE
  );
}

export function isThrottlingError(error) {
  const msg = error instanceof Error ? error.message : String(error);
  return /ThrottlingException|TooManyRequestsException|ServiceUnavailableException|429|rate limit|quota/i.test(msg);
}

export function extractRetryAfterSeconds(error) {
  const msg = error instanceof Error ? error.message : String(error);
  const match = msg.match(/retry.*?(\d+)\s*s/i);
  return match ? Number(match[1]) : 30;
}

export { ConverseCommand, InvokeModelWithBidirectionalStreamCommand };
