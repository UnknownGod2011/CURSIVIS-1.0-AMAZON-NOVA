/**
 * startupCheck.js
 * Validates AWS credentials and Bedrock connectivity at startup.
 * Sends a minimal test request to Nova 2 Lite and logs the result.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand
} from "@aws-sdk/client-bedrock-runtime";
import { fromEnv } from "@aws-sdk/credential-providers";

const REQUIRED_VARS = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"];
const TEXT_MODEL =
  process.env.BEDROCK_TEXT_MODEL_ID ||
  process.env.NOVA_LITE_MODEL ||
  "amazon.nova-lite-v1:0";

export async function validateBedrockConnection() {
  console.log("[startup] Validating AWS Bedrock connection...");

  // 1. Check required env vars
  const missing = REQUIRED_VARS.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error(`[startup] ✗ Missing environment variables: ${missing.join(", ")}`);
    console.error("[startup]   Copy .env.example to .env and fill in your AWS credentials.");
    console.error("[startup]   Server will start but Nova calls will fail until credentials are set.");
    return;
  }

  console.log(`[startup] Region : ${process.env.AWS_REGION}`);
  console.log(`[startup] Model  : ${TEXT_MODEL}`);
  console.log(`[startup] Key ID : ${process.env.AWS_ACCESS_KEY_ID.slice(0, 8)}...`);

  // 2. Send a minimal test request
  try {
    const client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION,
      credentials: fromEnv()
    });

    const command = new ConverseCommand({
      modelId: TEXT_MODEL,
      messages: [{ role: "user", content: [{ text: "ping" }] }],
      inferenceConfig: { maxTokens: 8, temperature: 0.1 }
    });

    const response = await client.send(command);
    const text = response?.output?.message?.content?.find(b => b.text)?.text ?? "(empty)";
    console.log(`[startup] ✓ Bedrock connection OK — Nova responded: "${text.trim()}"`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[startup] ✗ Bedrock connection FAILED: ${msg}`);
    diagnose(msg);
    console.error("[startup]   Server will start but Nova calls may fail.");
  }
}

function diagnose(msg) {
  if (/UnrecognizedClientException|InvalidSignatureException|InvalidClientTokenId/i.test(msg)) {
    console.error("[startup]   → Cause: Invalid AWS credentials (wrong key ID or secret).");
    console.error("[startup]   → Fix  : Check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in your .env file.");
  } else if (/ExpiredTokenException/i.test(msg)) {
    console.error("[startup]   → Cause: AWS credentials have expired.");
    console.error("[startup]   → Fix  : Refresh your IAM access keys.");
  } else if (/Could not load credentials/i.test(msg)) {
    console.error("[startup]   → Cause: AWS credentials not found.");
    console.error("[startup]   → Fix  : Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in your .env file.");
  } else if (/AccessDeniedException|not authorized/i.test(msg)) {
    console.error("[startup]   → Cause: IAM user lacks Bedrock permissions or model access is not enabled.");
    console.error("[startup]   → Fix  : Attach AmazonBedrockFullAccess policy and enable Nova 2 Lite in Bedrock console.");
  } else if (/ResourceNotFoundException|Could not resolve host/i.test(msg)) {
    console.error("[startup]   → Cause: Wrong region or model ID not available in this region.");
    console.error(`[startup]   → Fix  : Verify AWS_REGION=${process.env.AWS_REGION} supports Nova 2 Lite.`);
    console.error(`[startup]            Try cross-region inference prefix: us.amazon.nova-lite-v1:0`);
  } else if (/ValidationException/i.test(msg)) {
    console.error("[startup]   → Cause: Model ID is invalid or not supported.");
    console.error(`[startup]   → Fix  : Check BEDROCK_TEXT_MODEL_ID. Current value: ${TEXT_MODEL}`);
  } else if (/ThrottlingException|TooManyRequests/i.test(msg)) {
    console.error("[startup]   → Cause: Bedrock rate limit hit during startup check.");
    console.error("[startup]   → Fix  : This is transient — the server will still work.");
  } else {
    console.error("[startup]   → Check your AWS_REGION, model access, and network connectivity.");
  }
}
