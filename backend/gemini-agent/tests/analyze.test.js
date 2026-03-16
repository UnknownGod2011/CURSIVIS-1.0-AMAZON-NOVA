import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createBrowserActionPlanner } from "../src/browserActionPlanner.js";
import { detectBrowserTaskPack } from "../src/browserTaskPacks.js";
import { inferFallbackType, inferUsefulEmailAction, looksLikeQuestionSet } from "../src/contentClassifier.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..");

const requestSchema = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "shared", "ipc-protocol", "schema", "agent-request.schema.json"), "utf8")
);
const responseSchema = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "shared", "ipc-protocol", "schema", "agent-response.schema.json"), "utf8")
);

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateRequestSchema = ajv.compile(requestSchema);
const validateResponseSchema = ajv.compile(responseSchema);

const fakeGenerator = async ({ action, useGrounding }) => ({
  text: useGrounding
    ? `As of March 10, 2026, generated output for ${action}.`
    : `Generated output for ${action}.`,
  model: "fake-test-model",
  latencyMs: 10,
  usage: { inputTokens: 12, outputTokens: 27 }
});

const fakeRouter = async ({ selectionKind, text }) => {
  if (selectionKind === "image") {
    return {
      contentType: "image",
      bestAction: "describe_image",
      confidence: 0.72,
      alternatives: ["describe_image", "extract_key_details", "identify_objects"]
    };
  }

  const normalized = (text || "").toLowerCase();
  if (normalized.includes("broken_code_case")) {
    return {
      contentType: "code",
      bestAction: "debug_code",
      confidence: 0.9,
      alternatives: ["debug_code", "explain_code", "improve_code"]
    };
  }

  if (normalized.includes("function")) {
    return {
      contentType: "code",
      bestAction: "explain_code",
      confidence: 0.9,
      alternatives: ["explain_code", "debug_code", "improve_code"]
    };
  }

  if (normalized.includes("iphone") || normalized.includes("price")) {
    return {
      contentType: "product",
      bestAction: "extract_product_info",
      confidence: 0.88,
      alternatives: ["extract_product_info", "compare_prices", "find_reviews"]
    };
  }

  if (normalized.includes("who")) {
    return {
      contentType: "question",
      bestAction: "answer_question",
      confidence: 0.91,
      alternatives: ["answer_question", "explain", "rewrite"]
    };
  }

  if (normalized.includes("smartest")) {
    return {
      contentType: "general_text",
      bestAction: "search_web",
      confidence: 0.78,
      alternatives: ["search_web", "rewrite_structured", "summarize"]
    };
  }

  if (normalized.includes("bad route")) {
    return {
      contentType: "general_text",
      bestAction: "debug_code",
      confidence: 0.74,
      alternatives: ["debug_code", "rewrite_structured", "summarize"]
    };
  }

  return {
    contentType: "general_text",
    bestAction: "rewrite_structured",
    confidence: 0.8,
    alternatives: ["rewrite_structured", "summarize", "bullet_points"]
  };
};

const fakeBrowserPlanner = async ({ voiceCommand, browserContext }) => ({
  goal: "apply_result_in_browser",
  summary: voiceCommand
    ? `Apply the voice-directed result on ${browserContext?.title || "current page"}.`
    : "Apply the generated result to the current page.",
  requiresConfirmation: false,
  steps: [
    {
      tool: "fill_label",
      label: "Message",
      text: "Generated output for rewrite_structured."
    }
  ]
});

function makePayload(text, actionHint = "summarize") {
  const payload = {
    protocolVersion: "1.0.0",
    requestId: "5d36e68b-2bf3-4a62-b446-c9ff1f5c2f74",
    mode: "smart",
    actionHint,
    selection: {
      kind: "text",
      text
    },
    context: {
      activeApp: "notepad",
      cursorX: 200,
      cursorY: 100
    },
    timestampUtc: new Date().toISOString()
  };

  assert.equal(validateRequestSchema(payload), true, "Fixture should match request schema");
  return payload;
}

function makeImagePayload(actionHint = "summarize") {
  const payload = {
    protocolVersion: "1.0.0",
    requestId: "2f514490-f06c-4a0a-a79c-4847de8d1cf4",
    mode: "smart",
    actionHint,
    selection: {
      kind: "image",
      imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6f2l8AAAAASUVORK5CYII=",
      imageMimeType: "image/png"
    },
    context: {
      activeApp: "chrome",
      cursorX: 120,
      cursorY: 80
    },
    timestampUtc: new Date().toISOString()
  };

  assert.equal(validateRequestSchema(payload), true, "Image fixture should match request schema");
  return payload;
}

function makeTextImagePayload(text, actionHint = "summarize") {
  const payload = {
    protocolVersion: "1.0.0",
    requestId: "598529c5-f113-4517-9122-fe4ddf5b61cf",
    mode: "smart",
    actionHint,
    selection: {
      kind: "text_image",
      text,
      imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6f2l8AAAAASUVORK5CYII=",
      imageMimeType: "image/png"
    },
    context: {
      activeApp: "chrome",
      cursorX: 220,
      cursorY: 160
    },
    timestampUtc: new Date().toISOString()
  };

  assert.equal(validateRequestSchema(payload), true, "Text+image fixture should match request schema");
  return payload;
}

test("returns 400 when request schema is invalid", async () => {
  const app = createApp({ textGenerator: fakeGenerator, intentRouter: fakeRouter });
  const invalidPayload = {
    protocolVersion: "1.0.0",
    requestId: "5d36e68b-2bf3-4a62-b446-c9ff1f5c2f74",
    selection: { kind: "text", text: "missing mode and timestamp" }
  };

  const response = await request(app).post("/analyze").send(invalidPayload);
  assert.equal(response.statusCode, 400);
  assert.match(response.body.error, /schema validation/i);
});

test("returns schema-compliant response for text request", async () => {
  const app = createApp({ textGenerator: fakeGenerator, intentRouter: fakeRouter });
  const response = await request(app)
    .post("/analyze")
    .send(makePayload("This is a short paragraph for testing."));

  assert.equal(response.statusCode, 200);
  assert.equal(validateResponseSchema(response.body), true, JSON.stringify(validateResponseSchema.errors));
  assert.equal(response.body.action, "rewrite_structured");
  assert.equal(typeof response.body.result, "string");
  assert.ok(response.body.result.length > 0);
});

test("supports /api/intent as an alias for /analyze", async () => {
  const app = createApp({ textGenerator: fakeGenerator, intentRouter: fakeRouter });
  const payload = makePayload("Alias route verification text.");

  const analyzeResponse = await request(app).post("/analyze").send(payload);
  const intentResponse = await request(app).post("/api/intent").send(payload);

  assert.equal(analyzeResponse.statusCode, 200);
  assert.equal(intentResponse.statusCode, 200);
  assert.equal(analyzeResponse.body.action, intentResponse.body.action);
  assert.equal(analyzeResponse.body.protocolVersion, "1.0.0");
  assert.equal(intentResponse.body.protocolVersion, "1.0.0");
});

test("alternatives vary by detected content type", async () => {
  const app = createApp({ textGenerator: fakeGenerator, intentRouter: fakeRouter });

  const codeResponse = await request(app)
    .post("/analyze")
    .send(makePayload("function add(a, b) { return a + b; }"));
  assert.equal(codeResponse.statusCode, 200);
  assert.ok(codeResponse.body.alternatives.includes("explain_code"));

  const productResponse = await request(app)
    .post("/analyze")
    .send(makePayload("Compare iPhone 16 price and reviews in India"));
  assert.equal(productResponse.statusCode, 200);
  assert.ok(productResponse.body.alternatives.includes("extract_product_info"));

  const textResponse = await request(app)
    .post("/analyze")
    .send(makePayload("This paragraph discusses planning and team collaboration."));
  assert.equal(textResponse.statusCode, 200);
  assert.ok(textResponse.body.alternatives.includes("rewrite_structured"));

  const questionResponse = await request(app)
    .post("/analyze")
    .send(makePayload("Who is the richest person in the world?"));
  assert.equal(questionResponse.statusCode, 200);
  assert.equal(questionResponse.body.action, "answer_question");
  assert.ok(questionResponse.body.alternatives.includes("answer_question"));
});

test("broken code routes to debug_code even when router suggests explanation", async () => {
  const app = createApp({ textGenerator: fakeGenerator, intentRouter: fakeRouter });
  const response = await request(app)
    .post("/analyze")
    .send(makePayload("broken_code_case\nfunction add(a, b { return a + b;"));

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.action, "debug_code");
  assert.ok(response.body.alternatives.includes("debug_code"));
});

test("phrase query without question mark routes to direct answer", async () => {
  const app = createApp({ textGenerator: fakeGenerator, intentRouter: fakeRouter });
  const response = await request(app)
    .post("/analyze")
    .send(makePayload("richest county in the world"));

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.action, "answer_question");
});

test("short factual phrase query ignores meta router actions and answers directly", async () => {
  const app = createApp({ textGenerator: fakeGenerator, intentRouter: fakeRouter });
  const response = await request(app)
    .post("/analyze")
    .send(makePayload("smartest person in the world"));

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.action, "answer_question");
});

test("question answers retry when first generation is a weak search instruction", async () => {
  let callCount = 0;
  const retryingGenerator = async () => {
    callCount += 1;
    return {
      text:
        callCount === 1
          ? "Search web for \"smartest person in the world\"."
          : "As of March 12, 2026, there is no universally accepted single smartest person in the world, though Terence Tao is often cited among the most exceptionally gifted living mathematicians.",
      model: "fake-test-model",
      latencyMs: 10,
      usage: { inputTokens: 12, outputTokens: 27 }
    };
  };

  const app = createApp({
    textGenerator: retryingGenerator,
    intentRouter: async () => ({
      contentType: "question",
      bestAction: "answer_question",
      confidence: 0.92,
      alternatives: ["answer_question", "explain", "rewrite"]
    })
  });

  const response = await request(app)
    .post("/analyze")
    .send(makePayload("smartest person in the world"));

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.action, "answer_question");
  assert.match(response.body.result, /there is no universally accepted/i);
  assert.equal(callCount, 2);
});

test("email polishing retries when first generation is mostly unchanged", async () => {
  let callCount = 0;
  const retryingEmailGenerator = async () => {
    callCount += 1;
    return {
      text:
        callCount === 1
          ? `Subject: Google Play testing link update

hi judges

sharing quick update on google play link for my submission
app is ready but developer verification still pending so i cant publish test build yet
will send the link as soon as verification finishes`
          : `Subject: Update on Google Play Testing Link for My RevenueCat Shipyard Challenge Submission

Dear RevenueCat Shipyard Challenge Judges,

I hope you are doing well. I wanted to share a quick update regarding my submission. The app is fully functional and release-ready, but my new Google Play Developer account is still undergoing Google's identity verification, so I cannot publish an internal testing build yet.

As soon as verification is complete, I will immediately upload the build and share the testing link. In the meantime, I am happy to provide the signed build, repository access, or a live walkthrough if helpful.

Thank you for your understanding and consideration.

Best regards,
Tanush Shah`,
      model: "fake-test-model",
      latencyMs: 10,
      usage: { inputTokens: 12, outputTokens: 27 }
    };
  };

  const emailRouter = async () => ({
    contentType: "email",
    bestAction: "polish_email",
    confidence: 0.9,
    alternatives: ["polish_email", "rewrite", "bullet_points"]
  });

  const app = createApp({
    textGenerator: retryingEmailGenerator,
    intentRouter: emailRouter
  });

  const response = await request(app)
    .post("/analyze")
    .send(makePayload(`hi judges

sharing quick update on google play link for my submission
app is ready but developer verification still pending so i cant publish test build yet
will send the link as soon as verification finishes`));

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.action, "polish_email");
  assert.doesNotMatch(response.body.result, /^To:/im);
  assert.match(response.body.result, /Subject:/);
  assert.equal(callCount, 2);
});

test("mailbox-style polished email switches from polish to draft_reply", async () => {
  const emailRouter = async ({ text }) => ({
    contentType: "email",
    bestAction: inferUsefulEmailAction(text),
    confidence: 0.88,
    alternatives: ["draft_reply", "polish_email", "rewrite"]
  });

  const app = createApp({
    textGenerator: fakeGenerator,
    intentRouter: emailRouter
  });

  const response = await request(app)
    .post("/analyze")
    .send(makePayload(`Tanush Shah <tanushshah2006@gmail.com>
Thu, Feb 12, 4:37 PM
to julie.farley

Dear RevenueCat Shipyard Challenge Judges,

I hope you are doing well.

The app is release-ready and I will share the testing link as soon as Google completes verification.

Thank you for your understanding.

Best regards,
Tanush Shah`));

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.action, "draft_reply");
  assert.match(response.body.result, /draft_reply/i);
  assert.ok(response.body.alternatives.includes("draft_reply"));
});

test("mailbox-style rough email prefers polishing over drafting a reply", () => {
  const action = inferUsefulEmailAction(`Tanush Shah <tanushshah2006@gmail.com>
Thu, Feb 12, 4:37 PM
to julie.farley

hi judges

sharing quick update on google play link for my submission
app is ready but developer verification still pending so i cant publish test build yet
will send the link as soon as verification finishes`);

  assert.equal(action, "polish_email");
});

test("email selections are not misclassified as code", () => {
  const type = inferFallbackType(`Tanush Shah <tanush@example.com>
Thu, Feb 12, 4:37 PM
to julie.farley

Dear Judges,

I hope you are doing well.

Best regards,
Tanush Shah`);

  assert.equal(type, "email");
});

test("smart mode preserves substantive Gemini actions instead of forcing a predefined fallback", async () => {
  const app = createApp({ textGenerator: fakeGenerator, intentRouter: fakeRouter });
  const response = await request(app)
    .post("/analyze")
    .send(makePayload("This is bad route sample text for a memo."));

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.action, "debug_code");
});

test("supports image selection analysis", async () => {
  const app = createApp({ textGenerator: fakeGenerator, intentRouter: fakeRouter });
  const response = await request(app).post("/analyze").send(makeImagePayload());

  assert.equal(response.statusCode, 200);
  assert.equal(validateResponseSchema(response.body), true, JSON.stringify(validateResponseSchema.errors));
  assert.ok(response.body.alternatives.includes("describe_image"));
});

test("supports combined text and image selection analysis", async () => {
  const app = createApp({ textGenerator: fakeGenerator, intentRouter: fakeRouter });
  const response = await request(app)
    .post("/analyze")
    .send(makeTextImagePayload("Who is the richest person in the world?"));

  assert.equal(response.statusCode, 200);
  assert.equal(validateResponseSchema(response.body), true, JSON.stringify(validateResponseSchema.errors));
  assert.equal(response.body.action, "answer_question");
});

test("rejects selection kind none", async () => {
  const app = createApp({ textGenerator: fakeGenerator, intentRouter: fakeRouter });
  const response = await request(app).post("/analyze").send({
    protocolVersion: "1.0.0",
    requestId: "e11c50d7-404f-4b6a-b278-3aaf7e6176a7",
    mode: "smart",
    selection: { kind: "none" },
    timestampUtc: new Date().toISOString()
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.body.error, /not actionable/i);
});

test("suggest-actions returns code-oriented alternatives", async () => {
  const app = createApp({ textGenerator: fakeGenerator, intentRouter: fakeRouter });
  const response = await request(app)
    .post("/suggest-actions")
    .send(makePayload("function normalize(input) { return input.trim(); }"));

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.contentType, "code");
  assert.equal(response.body.bestAction, "explain_code");
  assert.ok(response.body.alternatives.includes("debug_code"));
});

test("suggest-actions returns image-oriented alternatives", async () => {
  const app = createApp({ textGenerator: fakeGenerator, intentRouter: fakeRouter });
  const response = await request(app)
    .post("/suggest-actions")
    .send(makeImagePayload());

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.contentType, "image");
  assert.ok(response.body.alternatives.includes("describe_image"));
});

test("suggest-actions supports combined text and image context", async () => {
  const app = createApp({ textGenerator: fakeGenerator, intentRouter: fakeRouter });
  const response = await request(app)
    .post("/suggest-actions")
    .send(makeTextImagePayload("Compare this product offer and tell me if it is worth buying."));

  assert.equal(response.statusCode, 200);
  assert.ok(Array.isArray(response.body.alternatives));
  assert.ok(response.body.alternatives.length > 0);
});

test("suggest-actions returns question-oriented alternatives", async () => {
  const app = createApp({ textGenerator: fakeGenerator, intentRouter: fakeRouter });
  const response = await request(app)
    .post("/suggest-actions")
    .send(makePayload("Who founded Tesla?"));

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.contentType, "question");
  assert.equal(response.body.recommendedAction, "answer_question");
  assert.ok(response.body.alternatives.includes("answer_question"));
});

test("supports novel Gemini-decided actions in smart mode", async () => {
  const novelRouter = async () => ({
    contentType: "general_text",
    bestAction: "create_outline",
    confidence: 0.86,
    alternatives: ["create_outline", "rewrite_structured", "bullet_points"]
  });

  const app = createApp({ textGenerator: fakeGenerator, intentRouter: novelRouter });
  const response = await request(app)
    .post("/analyze")
    .send(makePayload("Random meeting notes that should be organized."));

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.action, "create_outline");
});

test("suggest-actions exposes expanded menu options", async () => {
  const app = createApp({ textGenerator: fakeGenerator, intentRouter: fakeRouter });
  const response = await request(app)
    .post("/suggest-actions")
    .send(makePayload("This is a long report with findings and recommendations for Q2."));

  assert.equal(response.statusCode, 200);
  assert.ok(Array.isArray(response.body.extendedAlternatives));
  assert.ok(response.body.extendedAlternatives.length > 0);
});

test("suggest-actions includes Gemini-generated dynamic options", async () => {
  const fakeOptionGenerator = async () => ["novel_action"];
  const app = createApp({ textGenerator: fakeGenerator, intentRouter: fakeRouter, optionGenerator: fakeOptionGenerator });
  const response = await request(app)
    .post("/suggest-actions")
    .send(makePayload("Create a better structure for these notes."));

  assert.equal(response.statusCode, 200);
  assert.ok(response.body.extendedAlternatives.includes("novel_action"));
});

test("transcribe endpoint returns transcription payload", async () => {
  const app = createApp({ textGenerator: fakeGenerator, intentRouter: fakeRouter });
  const response = await request(app)
    .post("/transcribe")
    .send({
      audioBase64: "UklGRhQAAABXQVZFZm10IBAAAAABAAEA",
      mimeType: "audio/wav"
    });

  assert.equal(response.statusCode, 200);
  assert.equal(typeof response.body.text, "string");
  assert.ok(response.body.text.length > 0);
});

test("plan-browser-action returns a structured browser action plan", async () => {
  const app = createApp({
    textGenerator: fakeGenerator,
    intentRouter: fakeRouter,
    browserActionPlanner: fakeBrowserPlanner
  });

  const response = await request(app)
    .post("/plan-browser-action")
    .send({
      originalText: "draft email body",
      resultText: "Polished email body",
      action: "polish_email",
      voiceCommand: "rewrite and send this email",
      contentType: "email",
      browserContext: {
        url: "https://mail.google.com/mail/u/0/#inbox",
        title: "Inbox",
        visibleText: "Compose Inbox",
        interactiveElements: [
          { role: "button", label: "Compose", nameAttribute: "", type: "button", options: [] }
        ]
      }
    });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.goal, "apply_result_in_browser");
  assert.ok(Array.isArray(response.body.steps));
  assert.equal(response.body.steps[0].tool, "fill_label");
});

test("plan-browser-action rejects requests without browser context", async () => {
  const app = createApp({
    textGenerator: fakeGenerator,
    intentRouter: fakeRouter,
    browserActionPlanner: fakeBrowserPlanner
  });

  const response = await request(app)
    .post("/plan-browser-action")
    .send({
      originalText: "draft email body",
      resultText: "Polished email body"
    });

  assert.equal(response.statusCode, 400);
  assert.match(response.body.error, /browsercontext is required/i);
});

test("detectBrowserTaskPack recognizes mail workflows", () => {
  const pack = detectBrowserTaskPack({
    browserContext: {
      url: "https://mail.google.com/mail/u/0/#inbox",
      title: "Inbox",
      visibleText: "Compose Inbox"
    },
    contentType: "email",
    action: "polish_email",
    voiceCommand: "rewrite and send this email"
  });

  assert.equal(pack?.id, "mail_compose");
});

test("detectBrowserTaskPack recognizes Google Forms workflows", () => {
  const pack = detectBrowserTaskPack({
    browserContext: {
      url: "https://docs.google.com/forms/d/e/example/viewform",
      title: "Quiz",
      visibleText: "Question 1 Option A Option B"
    },
    contentType: "mcq",
    action: "answer_question",
    voiceCommand: "fill the answers"
  });

  assert.equal(pack?.id, "google_forms");
});

test("inferFallbackType recognizes MCQ selections", () => {
  const type = inferFallbackType(`
1. Capital of France
A) Berlin
B) Paris
C) Madrid
D) Rome
`);

  assert.equal(type, "mcq");
});

test("question-set heuristics recognize numbered quiz forms", () => {
  const sample = `
1. What is your name?
2. Capital of France?
3. Largest planet in the solar system?
`;

  assert.equal(looksLikeQuestionSet(sample), true);
  assert.equal(inferFallbackType(sample), "mcq");
});

test("long informational article text is treated like report content, not a question", () => {
  const sample = `The platypus is a semiaquatic mammal native to eastern Australia, including Tasmania. It is one of the few living monotremes, which means it lays eggs instead of giving birth to live young. The platypus has a broad bill, webbed feet, dense waterproof fur, and a flattened tail that helps it swim efficiently. Early European naturalists were so surprised by its appearance that some believed the first preserved specimen was a hoax.`;

  assert.equal(inferFallbackType(sample), "report");
});

test("long informational text does not stay stuck on answer_question when the router misfires", async () => {
  const app = createApp({
    textGenerator: fakeGenerator,
    intentRouter: async () => ({
      contentType: "question",
      bestAction: "answer_question",
      confidence: 0.87,
      alternatives: ["answer_question", "summarize", "extract_insights"]
    })
  });

  const sample = `The platypus is a semiaquatic mammal native to eastern Australia, including Tasmania. It is one of the few living monotremes, which means it lays eggs instead of giving birth to live young. The platypus has a broad bill, webbed feet, dense waterproof fur, and a flattened tail that helps it swim efficiently. Early European naturalists were so surprised by its appearance that some believed the first preserved specimen was a hoax.`;

  const response = await request(app)
    .post("/analyze")
    .send(makePayload(sample));

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.action, "extract_insights");
});

test("browser planner falls back to Gmail compose steps for email actions", async () => {
  const planner = createBrowserActionPlanner({
    generateText: async () => ({
      text: JSON.stringify({
        goal: "mail_flow",
        summary: "No safe action.",
        requiresConfirmation: false,
        steps: []
      }),
      model: "fake-test-model",
      latencyMs: 5,
      usage: { inputTokens: 10, outputTokens: 10 }
    })
  });

  const plan = await planner({
    originalText: "Subject: Demo follow-up\n\nHi team,\nPlease see the update below.",
    resultText: "Subject: Demo follow-up\n\nHi team,\nSharing the polished update.",
    action: "polish_email",
    voiceCommand: "rewrite and send this email to test@example.com",
    contentType: "email",
    browserContext: {
      url: "https://www.google.com",
      title: "Google",
      visibleText: "Search",
      interactiveElements: []
    }
  });

  assert.equal(plan.goal, "apply_email_result");
  assert.ok(plan.steps.some((step) => step.tool === "open_new_tab"));
  assert.ok(plan.steps.some((step) => step.tool === "fill_label" && step.label === "Message Body"));
});

test("browser planner falls back to reply flow for draft_reply actions on an open mail thread", async () => {
  const planner = createBrowserActionPlanner({
    generateText: async () => ({
      text: JSON.stringify({
        goal: "mail_flow",
        summary: "No safe action.",
        requiresConfirmation: false,
        steps: []
      }),
      model: "fake-test-model",
      latencyMs: 5,
      usage: { inputTokens: 10, outputTokens: 10 }
    })
  });

  const plan = await planner({
    originalText: "Re: Demo follow-up\n\nCan you send an update?",
    resultText: "Thanks for the follow-up. Here is the updated status.",
    action: "draft_reply",
    voiceCommand: "reply to this email",
    contentType: "email",
    browserContext: {
      url: "https://mail.google.com/mail/u/0/#inbox/FMfcgzQexample",
      title: "Demo follow-up - Gmail",
      visibleText: "Reply Reply all Forward",
      interactiveElements: []
    }
  });

  assert.equal(plan.goal, "reply_to_email");
  assert.ok(plan.steps.some((step) => step.tool === "click_role" && step.name === "Reply"));
  assert.ok(plan.steps.some((step) => step.tool === "type_active"));
});

test("browser planner falls back to answer-key execution for Google Forms answer keys", async () => {
  const planner = createBrowserActionPlanner({
    generateText: async () => ({
      text: JSON.stringify({
        goal: "form_fill",
        summary: "No safe action.",
        requiresConfirmation: false,
        steps: []
      }),
      model: "fake-test-model",
      latencyMs: 5,
      usage: { inputTokens: 10, outputTokens: 10 }
    })
  });

  const plan = await planner({
    originalText: "1. Capital of France\nA) Berlin\nB) Paris\nC) Rome",
    resultText: "Q1 [Capital of France]: Paris - It is the capital city of France.",
    action: "answer_question",
    voiceCommand: "fill these answers",
    contentType: "mcq",
    browserContext: {
      url: "https://docs.google.com/forms/d/e/example/viewform",
      title: "Quiz",
      visibleText: "Capital of France Berlin Paris Rome",
      interactiveElements: []
    }
  });

  assert.equal(plan.goal, "fill_form_answers");
  const answerKeyStep = plan.steps.find((step) => step.tool === "apply_answer_key");
  assert.ok(answerKeyStep);
  assert.equal(answerKeyStep.advancePages, false);
  assert.ok(answerKeyStep.answers.some((answer) => answer.option === "Paris"));
});

test("browser planner preserves multi-question answer summaries for take action", async () => {
  const planner = createBrowserActionPlanner({
    generateText: async () => ({
      text: JSON.stringify({
        goal: "form_fill",
        summary: "No safe action.",
        requiresConfirmation: false,
        steps: []
      }),
      model: "fake-test-model",
      latencyMs: 5,
      usage: { inputTokens: 10, outputTokens: 10 }
    })
  });

  const plan = await planner({
    originalText: "Arithmetic progression worksheet selection.",
    resultText: `Q1 Sum of 1 to 100: 5050 - (n(n+1)/2)
Q2 4th from end: 40 - (a_18 from start)
Q3 First negative term: 10th - (a_n < 0 for n=10)
Q4 Term is 210: 10th - (a_n = 210 for n=10)
Q5 Common difference: 8 - (a_18 - a_14 = 4d)
Q6 Sequence type: an AP with d = 4 - (constant difference of 4)
Q7 Value of p: 4 - (2b = a+c property)
Q8 First negative term: 24th - (a_n < 0 for n=24)
Q9 15th term: x + 63 - (a + 14d, where d=5)
Q10 Term is zero: 11th - (a_n = 0 for n=11)
Q11 Term is 0: 24 - (a_n = 0 for n=24)
Q12 Term is 88: 30 - (a_n = 88 for n=30)
Q13 12th term: 25 - (substitute n=12 in 2n+1)
Q14 Find k: 16/33 - (2k = 2/3 + 5k/8)
Q15 Find a, b: a= 11, b = 4 - (common difference is -7)
Q16 Next term: 97 - continue the pattern`,
    action: "answer_question",
    voiceCommand: "attempt all questions",
    contentType: "mcq",
    browserContext: {
      url: "https://docs.google.com/forms/d/e/example/viewform",
      title: "Quiz",
      visibleText: "1 / 16 Next",
      interactiveElements: []
    }
  });

  assert.equal(plan.goal, "fill_form_answers");
  const answerKeyStep = plan.steps.find((step) => step.tool === "apply_answer_key");
  assert.ok(answerKeyStep);
  assert.equal(answerKeyStep.answers.length, 16);
  assert.equal(answerKeyStep.advancePages, true);
  assert.ok(answerKeyStep.answers.some((answer) => answer.question === "Find k" && answer.option === "16/33"));
  assert.ok(answerKeyStep.answers.some((answer) => answer.question === "Next term" && answer.option === "97"));
});
