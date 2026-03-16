/**
 * services/novaEmbeddings.js
 * Multimodal embeddings via Amazon Bedrock.
 *
 * Exposes:
 *   rankOrEmbedContext(items)  — rank/embed a list of text or image items
 *   embedText(text)            — embed a single text string
 *   embedImage(imageBase64)    — embed a single image
 *
 * Model: configured via BEDROCK_EMBEDDING_MODEL_ID
 * Default: amazon.titan-embed-image-v1
 * Swap to Nova multimodal embedding model ID when available in your region.
 */

import {
  getBedrockClient,
  hasConfiguredCredentials,
  EMBEDDING_MODEL_ID,
  InvokeModelCommand
} from "./bedrockClient.js";

// ── embedText ─────────────────────────────────────────────────────────────────
/**
 * Embed a single text string.
 * @param {string} text
 * @returns {{ embedding: number[], model: string, latencyMs: number }}
 */
export async function embedText(text) {
  if (!hasConfiguredCredentials()) throw new Error("AWS credentials required for embeddings.");
  if (!text?.trim()) throw new Error("text is required.");

  const client = getBedrockClient();
  const startedAt = Date.now();

  const body = JSON.stringify({ inputText: text.slice(0, 8192) });
  const command = new InvokeModelCommand({
    modelId: EMBEDDING_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: Buffer.from(body)
  });

  const response = await client.send(command);
  const result = JSON.parse(Buffer.from(response.body).toString("utf8"));
  const embedding = result.embedding ?? result.embeddings?.[0] ?? [];

  return { embedding, model: EMBEDDING_MODEL_ID, latencyMs: Date.now() - startedAt };
}

// ── embedImage ────────────────────────────────────────────────────────────────
/**
 * Embed a single image (base64).
 * @param {string} imageBase64
 * @returns {{ embedding: number[], model: string, latencyMs: number }}
 */
export async function embedImage(imageBase64) {
  if (!hasConfiguredCredentials()) throw new Error("AWS credentials required for embeddings.");
  if (!imageBase64) throw new Error("imageBase64 is required.");

  const client = getBedrockClient();
  const startedAt = Date.now();

  const body = JSON.stringify({ inputImage: imageBase64 });
  const command = new InvokeModelCommand({
    modelId: EMBEDDING_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: Buffer.from(body)
  });

  const response = await client.send(command);
  const result = JSON.parse(Buffer.from(response.body).toString("utf8"));
  const embedding = result.embedding ?? result.embeddings?.[0] ?? [];

  return { embedding, model: EMBEDDING_MODEL_ID, latencyMs: Date.now() - startedAt };
}

// ── rankOrEmbedContext ────────────────────────────────────────────────────────
/**
 * Embed a list of items and rank them by cosine similarity to a query.
 * Each item: { text?, imageBase64?, id? }
 * Returns items sorted by relevance (highest first).
 *
 * @param {{ query: string, items: Array<{ text?, imageBase64?, id? }> }} opts
 * @returns {{ ranked: Array<{ item, score, embedding }>, queryEmbedding, model, latencyMs }}
 */
export async function rankOrEmbedContext({ query, items = [] }) {
  if (!hasConfiguredCredentials()) throw new Error("AWS credentials required for embeddings.");
  if (!query?.trim()) throw new Error("query is required.");
  if (items.length === 0) return { ranked: [], queryEmbedding: [], model: EMBEDDING_MODEL_ID, latencyMs: 0 };

  const startedAt = Date.now();

  // Embed query
  const { embedding: queryEmbedding } = await embedText(query);

  // Embed all items in parallel (cap at 20 to avoid throttling)
  const capped = items.slice(0, 20);
  const embeddings = await Promise.all(
    capped.map(item =>
      item.imageBase64
        ? embedImage(item.imageBase64).catch(() => ({ embedding: [] }))
        : embedText(item.text || "").catch(() => ({ embedding: [] }))
    )
  );

  // Cosine similarity ranking
  const ranked = capped
    .map((item, i) => ({
      item,
      score: cosineSimilarity(queryEmbedding, embeddings[i].embedding),
      embedding: embeddings[i].embedding
    }))
    .sort((a, b) => b.score - a.score);

  return { ranked, queryEmbedding, model: EMBEDDING_MODEL_ID, latencyMs: Date.now() - startedAt };
}

// ── Cosine similarity ─────────────────────────────────────────────────────────
function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
