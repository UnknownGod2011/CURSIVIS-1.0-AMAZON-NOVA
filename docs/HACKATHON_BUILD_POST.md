# How I Built Cursivis: A Cursor-Native Gemini UI Agent on Google Cloud

I created this content for the purposes of entering the Gemini Live Agent Challenge.  
#GeminiLiveAgentChallenge

## Introduction

Most AI products still start with the same workflow: open a chatbot, describe the context, paste content, wait for an answer, then manually apply that answer somewhere else.

I wanted to build something different.

That idea became **Cursivis**:

> **Selection = Context, Trigger = Intent, Gemini = Intelligence**

Instead of moving work into a prompt box, Cursivis brings AI directly to what the user is already looking at. The user selects text, an image, or a UI region, presses a trigger, and Gemini decides the most useful action based on context. Then Cursivis either returns a useful result or takes action directly in the browser UI.

## What Cursivis Does

Cursivis is a **cursor-native multimodal AI agent** designed for desktop workflows.

It can:

- summarize long reports and articles
- explain or debug selected code
- rewrite rough text or emails
- draft responses to emails
- analyze selected images
- accept voice commands
- autofill forms
- reply in live browser tabs

The goal is to move beyond text-in/text-out AI and toward an interaction model where the AI becomes part of the interface itself.

## Core Product Idea

The main interaction loop is very simple:

1. The user selects something on screen
2. The user presses a trigger
3. Gemini reasons about the selection
4. Cursivis returns the most useful result
5. The user can optionally press **Take Action** to execute it in the UI

That means a selection is not just text. It is context.

This made Cursivis a strong fit for the **UI Navigator** category of the Gemini Live Agent Challenge, because it does not stop at answering. It interprets screen context and can output executable actions for the interface.

## How I Built It

Cursivis is built as a multi-part system:

- a **Windows companion app** in WPF and .NET 8
- a **Gemini backend** in Node.js using the **Google GenAI SDK**
- a **voice pipeline** for hold-to-talk capture and transcription
- a **Chromium browser extension** for real current-tab actions
- a **local browser bridge** for DOM-aware execution
- a **Google Cloud Run deployment** for the backend
- integration with the **Logitech MX Creative Console** interaction model

The backend handles:

- contextual reasoning
- multimodal text and image understanding
- dynamic action suggestion
- voice transcription
- browser action planning

The companion app handles:

- text selection capture
- lasso screenshot capture
- orb and result UI
- guided and smart modes
- action preview and follow-up flows

For browser execution, I built a real-tab path through a Chromium extension so Cursivis can act in the browser session the user is already logged into, instead of depending only on a separate managed automation browser.

## Why Gemini Was Important

Gemini was central to the project because I did not want a rigid menu-driven assistant.

The most important design goal was:

- the system should look at the selection
- understand what kind of content it is
- infer the likely user intent
- return the most useful result

That means the same trigger can behave differently depending on context:

- a report might be summarized
- foreign-language text might be translated
- broken code might be debugged
- correct code might be explained
- an email might be polished or replied to

This flexibility is what made the interaction feel agentic instead of scripted.

## Google Cloud Deployment

To meet the challenge requirement and make the backend reproducible, I deployed the Gemini backend to **Google Cloud Run**.

That deployment path includes:

- containerizing the backend
- building it with Cloud Build
- deploying it to Cloud Run
- verifying the live backend with a health endpoint

I also added an automated deployment script so the cloud deployment process is visible in the codebase and reproducible by judges.

## Challenges I Faced

The hardest part was not generating text. The hard part was building a system that feels like a real UI agent.

Some of the biggest challenges were:

- keeping Smart Mode useful without over-hardcoding behavior
- handling text, image, and voice in one coherent flow
- making browser actions work inside real logged-in tabs
- keeping the UI smooth and understandable
- balancing flexibility with safe execution

Voice interaction and browser action reliability were especially challenging, because those are the places where a project stops being a demo and starts behaving like a real agent.

## What I Learned

This project taught me a few important things:

- multimodal AI becomes much more compelling when tied to a real interface
- good agent UX depends heavily on trust and clarity
- hardware triggers create a much more natural feeling than opening a chatbot
- the most useful AI interaction is often not “ask a prompt” but simply “select and trigger”
- execution quality matters as much as model quality

## Why Cursivis Matters

Cursivis is my attempt to explore a future where AI is no longer a separate destination.

Instead of:

- opening a chat app
- explaining context
- copying data in and out
- manually taking action

the user can simply:

- select
- trigger
- review
- act

That is the experience I wanted to prototype: a multimodal AI layer that lives directly on top of everyday work.

## Closing

Cursivis started from one simple idea:

**What if the cursor itself became an AI agent?**

By combining Gemini, Google Cloud, multimodal input, browser execution, and a hardware-triggered UX, I built a system that moves beyond the text box and turns ordinary on-screen context into something actionable.
