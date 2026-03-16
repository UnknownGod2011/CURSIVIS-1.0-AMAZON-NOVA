(function () {
  if (window.__cursivisBridgeLoaded) {
    return;
  }

  window.__cursivisBridgeLoaded = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleMessage(message)
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      });

    return true;
  });

  async function handleMessage(message) {
    switch (message?.type) {
      case "ping":
        return { ok: true };
      case "collect_context":
        return {
          ok: true,
          payload: collectContext()
        };
      case "execute_step":
        return await executeStep(message.step || {});
      default:
        return {
          ok: false,
          error: `Unsupported content-script message: ${message?.type || "unknown"}`
        };
    }
  }

  function collectContext() {
    return {
      url: window.location.href,
      title: document.title || "",
      visibleText: normalize(document.body?.innerText || "").slice(0, 4000),
      interactiveElements: collectInteractiveElements()
    };
  }

  function collectInteractiveElements() {
    const candidates = Array.from(document.querySelectorAll("button, a, input, textarea, select, [role], label, [contenteditable='true']"));
    const elements = [];

    for (const element of candidates) {
      if (!isVisible(element)) {
        continue;
      }

      const tagName = element.tagName.toLowerCase();
      const role = element.getAttribute("role") || (element.hasAttribute("contenteditable") ? "textbox" : tagName);
      const label =
        normalize(element.getAttribute("aria-label")) ||
        normalize(element.getAttribute("title")) ||
        normalize(element.getAttribute("placeholder")) ||
        normalize(element.innerText) ||
        normalize(element.textContent);

      if (!label && !["input", "textarea", "select"].includes(tagName)) {
        continue;
      }

      const options = tagName === "select"
        ? Array.from(element.querySelectorAll("option")).map((option) => normalize(option.textContent)).filter(Boolean).slice(0, 10)
        : [];

      elements.push({
        role,
        label,
        nameAttribute: normalize(element.getAttribute("name")),
        type: normalize(element.getAttribute("type")) || tagName,
        options
      });

      if (elements.length >= 120) {
        break;
      }
    }

    return elements;
  }

  async function executeStep(step) {
    const normalized = normalizeStep(step);
    if (!normalized) {
      throw new Error("Invalid DOM action step.");
    }

    switch (normalized.tool) {
      case "click_role":
        clickElement(findByRole(normalized.role, normalized.name || normalized.text));
        return { ok: true };
      case "click_text":
        clickElement(findByText(normalized.text || normalized.name));
        return { ok: true };
      case "fill_label":
        fillField(findFieldByLabel(normalized.label || normalized.name), normalized.text || "");
        return { ok: true };
      case "fill_name":
        fillField(findFieldByName(normalized.nameAttribute || normalized.name), normalized.text || "");
        return { ok: true };
      case "fill_placeholder":
        fillField(findFieldByPlaceholder(normalized.placeholder || normalized.label || normalized.name), normalized.text || "");
        return { ok: true };
      case "type_active":
        typeIntoActiveElement(normalized.text || "");
        return { ok: true };
      case "select_option":
        selectOption(normalized);
        return { ok: true };
      case "check_radio":
        setChoice("radio", normalized);
        return { ok: true };
      case "check_checkbox":
        setChoice("checkbox", normalized);
        return { ok: true };
      case "apply_answer_key":
        await applyAnswerKey(normalized);
        return { ok: true };
      case "press_key":
        pressKey(normalized.key || "Enter");
        return { ok: true };
      case "wait_for_text":
        await waitForText(normalized.text || normalized.name || "", 5000);
        return { ok: true };
      case "wait_ms":
        await delay(normalized.waitMs || 250);
        return { ok: true };
      case "scroll":
        scrollPage(normalized);
        return { ok: true };
      case "extract_dom":
        return {
          ok: true,
          payload: collectContext()
        };
      default:
        throw new Error(`Unsupported DOM tool: ${normalized.tool}`);
    }
  }

  function normalizeStep(step) {
    if (!step || typeof step !== "object" || typeof step.tool !== "string") {
      return null;
    }

    const normalized = {
      tool: step.tool.trim().toLowerCase()
    };

    for (const key of ["role", "name", "text", "label", "nameAttribute", "placeholder", "question", "option", "url", "key"]) {
      if (typeof step[key] === "string" && step[key].trim()) {
        normalized[key] = step[key].trim();
      }
    }

    if (Number.isFinite(step.waitMs) && step.waitMs > 0) {
      normalized.waitMs = Math.min(10000, Math.round(step.waitMs));
    }

    if (Array.isArray(step.answers)) {
      const answers = step.answers
        .map((answer) => ({
          question: typeof answer?.question === "string" && answer.question.trim() ? answer.question.trim() : undefined,
          option: typeof answer?.option === "string" ? answer.option.trim() : ""
        }))
        .filter((answer) => answer.option)
        .slice(0, 20);

      if (answers.length > 0) {
        normalized.answers = answers;
      }
    }

    if (typeof step.advancePages === "boolean") {
      normalized.advancePages = step.advancePages;
    }

    return normalized;
  }

  function findByRole(role, name) {
    const tagMatches = roleToTagList(role);
    const candidates = Array.from(document.querySelectorAll(tagMatches.join(","))).filter(isVisible);
    const aliases = expandRoleNames(role, name);
    const match = candidates.find((element) => aliases.some((value) => textMatches(elementLabel(element), value)));
    if (!match && normalize(role) === "button" && aliases.some((value) => /next|continue|submit|finish|done/i.test(value))) {
      const fallback = findLikelyNavigationElement(aliases);
      if (fallback) {
        return fallback;
      }
    }

    if (!match) {
      throw new Error(`Could not find ${role || "element"} '${name || ""}'.`);
    }

    return match;
  }

  function findByText(text) {
    const query = String(text || "").trim();
    if (!query) {
      throw new Error("click_text requires text.");
    }

    const candidates = Array.from(document.querySelectorAll("button, a, span, div, label, [role], [contenteditable='true']")).filter(isVisible);
    const match = candidates.find((element) => textMatches(elementLabel(element), query));
    if (!match) {
      throw new Error(`Could not find visible text '${query}'.`);
    }

    return match;
  }

  function findFieldByLabel(label) {
    const queries = expandFieldQueries(label);
    for (const query of queries) {
      const byDirectLabel = findFieldUsingLabelTag(query);
      if (byDirectLabel) {
        return byDirectLabel;
      }

      const candidates = getFieldCandidates();
      const match = candidates.find((element) => {
        const combined = `${elementLabel(element)} ${closestContainerText(element)}`;
        return textMatches(combined, query);
      });

      if (match) {
        return match;
      }
    }

    throw new Error(`Could not find field '${label || ""}'.`);
  }

  function findFieldUsingLabelTag(label) {
    const labelElements = Array.from(document.querySelectorAll("label")).filter(isVisible);
    for (const labelElement of labelElements) {
      if (!textMatches(normalize(labelElement.innerText || labelElement.textContent), label)) {
        continue;
      }

      const forId = labelElement.getAttribute("for");
      if (forId) {
        const field = document.getElementById(forId);
        if (field && isEditable(field)) {
          return field;
        }
      }

      const nestedField = labelElement.querySelector("input, textarea, select, [contenteditable='true']");
      if (nestedField && isEditable(nestedField)) {
        return nestedField;
      }
    }

    return null;
  }

  function findFieldByName(name) {
    const query = String(name || "").trim();
    if (!query) {
      throw new Error("Field name is required.");
    }

    const field = document.querySelector(`[name="${cssEscape(query)}"]`);
    if (!field || !isEditable(field)) {
      throw new Error(`Could not find field named '${query}'.`);
    }

    return field;
  }

  function findFieldByPlaceholder(placeholder) {
    const query = String(placeholder || "").trim();
    if (!query) {
      throw new Error("Field placeholder is required.");
    }

    const candidates = getFieldCandidates();
    const match = candidates.find((element) => textMatches(element.getAttribute("placeholder"), query) || textMatches(elementLabel(element), query));
    if (!match) {
      throw new Error(`Could not find field placeholder '${query}'.`);
    }

    return match;
  }

  function getFieldCandidates() {
    return Array.from(document.querySelectorAll("input, textarea, select, [contenteditable='true'], [role='textbox']")).filter(
      (element) => isVisible(element) && isEditable(element)
    );
  }

  function fillField(element, text) {
    focusElement(element);

    if (isContentEditable(element)) {
      element.innerHTML = "";
      element.textContent = text;
      dispatchInputEvents(element);
      verifyTextValue(element, text);
      return;
    }

    if ("value" in element) {
      element.value = text;
      dispatchInputEvents(element);
      verifyTextValue(element, text);
      return;
    }

    throw new Error("The matched element is not fillable.");
  }

  function typeIntoActiveElement(text) {
    const activeElement = document.activeElement;
    if (!activeElement || !isEditable(activeElement)) {
      throw new Error("No editable active element is focused.");
    }

    if (isContentEditable(activeElement)) {
      activeElement.textContent = `${activeElement.textContent || ""}${text}`;
      dispatchInputEvents(activeElement);
      return;
    }

    const currentValue = "value" in activeElement ? String(activeElement.value || "") : "";
    activeElement.value = `${currentValue}${text}`;
    dispatchInputEvents(activeElement);
  }

  function selectOption(step) {
    const optionText = String(step.option || step.text || "").trim();
    if (!optionText) {
      throw new Error("select_option requires option text.");
    }

    const field = step.label || step.name
      ? findFieldByLabel(step.label || step.name)
      : getFieldCandidates().find((element) => element.tagName.toLowerCase() === "select");

    if (!field) {
      throw new Error("Could not find a select field.");
    }

    if (field.tagName.toLowerCase() === "select") {
      const option = Array.from(field.options).find((item) => textMatches(item.textContent, optionText));
      if (!option) {
        throw new Error(`Could not find option '${optionText}'.`);
      }

      field.value = option.value;
      dispatchInputEvents(field);
      return;
    }

    clickElement(field);
    const optionElement = findByText(optionText);
    clickElement(optionElement);
  }

  function setChoice(type, step) {
    const optionText = String(step.option || step.label || step.name || "").trim();
    if (!optionText) {
      throw new Error(`${type} option is required.`);
    }

    const selector = type === "radio"
      ? "input[type='radio'], [role='radio']"
      : "input[type='checkbox'], [role='checkbox']";

    const candidates = Array.from(document.querySelectorAll(selector)).filter(isVisible);
    const questionText = normalize(step.question);
    let match = candidates.find((element) => {
      const combined = `${elementLabel(element)} ${closestContainerText(element)}`;
      return textMatches(combined, optionText) &&
        (!questionText || textMatches(combined, questionText) || textMatches(closestContainerText(element), questionText));
    });

    if (!match) {
      const labels = Array.from(document.querySelectorAll("label")).filter(isVisible);
      const labelMatch = labels.find((label) => {
        const combined = `${normalize(label.innerText || label.textContent)} ${closestContainerText(label)}`;
        return textMatches(combined, optionText) &&
          (!questionText || textMatches(combined, questionText) || textMatches(closestContainerText(label), questionText));
      });

      if (labelMatch) {
        const forId = labelMatch.getAttribute("for");
        if (forId) {
          const input = document.getElementById(forId);
          if (input) {
            match = input;
          }
        } else {
          match = labelMatch.querySelector(selector);
        }
      }
    }

    if (!match) {
      match = findChoiceLikeElement(optionText, questionText, type);
    }

    if (!match) {
      throw new Error(`Could not find ${type} option '${optionText}'.`);
    }

    focusElement(match);
    if ("checked" in match) {
      match.checked = true;
      dispatchInputEvents(match);
    } else {
      match.setAttribute("aria-checked", "true");
    }

    clickElement(match);
    if ("checked" in match && !match.checked) {
      throw new Error(`The ${type} option '${optionText}' did not stay selected.`);
    }
  }

  function clickElement(element) {
    focusElement(element);
    element.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    const target = element.closest("label") && element.tagName.toLowerCase() === "input"
      ? element.closest("label")
      : element.closest("button, a, label, [role='button'], [role='radio'], [role='checkbox']") || element;

    if (typeof target.click === "function") {
      target.click();
      return;
    }

    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  }

  function pressKey(key) {
    const activeElement = document.activeElement || document.body;
    const normalized = String(key || "Enter").trim();
    const event = new KeyboardEvent("keydown", {
      key: normalized.includes("+") ? normalized.split("+").at(-1) : normalized,
      ctrlKey: normalized.toLowerCase().includes("control+") || normalized.toLowerCase().includes("ctrl+"),
      bubbles: true,
      cancelable: true
    });

    activeElement.dispatchEvent(event);
    if (normalized.toLowerCase() === "enter" && typeof activeElement.click === "function" && activeElement.matches("button, [role='button']")) {
      activeElement.click();
    }
  }

  async function waitForText(text, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    const query = normalize(text);
    while (Date.now() < deadline) {
      if (normalize(document.body?.innerText || "").includes(query)) {
        return;
      }

      await delay(140);
    }

    throw new Error(`Timed out waiting for text '${text}'.`);
  }

  function scrollPage(step) {
    const mode = normalize(step.text || step.name || "down");
    if (mode.includes("top")) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (mode.includes("bottom")) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      return;
    }

    const delta = mode.includes("up") ? -window.innerHeight * 0.8 : window.innerHeight * 0.8;
    window.scrollBy({ top: delta, behavior: "smooth" });
  }

  function roleToTagList(role) {
    switch (normalize(role)) {
      case "button":
        return ["button", "input[type='button']", "input[type='submit']", "[role='button']", "[aria-label]"];
      case "link":
        return ["a", "[role='link']"];
      case "textbox":
        return ["input", "textarea", "[role='textbox']", "[contenteditable='true']"];
      case "radio":
        return ["input[type='radio']", "[role='radio']"];
      case "checkbox":
        return ["input[type='checkbox']", "[role='checkbox']"];
      case "combobox":
        return ["select", "[role='combobox']"];
      default:
        return ["button", "a", "input", "textarea", "select", "[role]", "[contenteditable='true']"];
    }
  }

  function expandRoleNames(role, name) {
    const values = [];
    if (name) {
      values.push(name);
    }

    const normalizedName = normalize(name);
    if (normalize(role) === "button") {
    if (normalizedName.includes("compose")) {
      pushUnique(values, "Compose");
      pushUnique(values, "New message");
      pushUnique(values, "New mail");
    } else if (normalizedName.includes("reply")) {
      pushUnique(values, "Reply");
      pushUnique(values, "Reply all");
      pushUnique(values, "Send reply");
    } else if (normalizedName.includes("next") || normalizedName.includes("continue")) {
      pushUnique(values, "Next");
      pushUnique(values, "Continue");
        pushUnique(values, "Next question");
        pushUnique(values, "Go to next");
      } else if (normalizedName === "send" || normalizedName.includes("send")) {
        pushUnique(values, "Send");
        pushUnique(values, "Send now");
        pushUnique(values, "Schedule send");
      } else if (normalizedName.includes("submit")) {
        pushUnique(values, "Submit");
        pushUnique(values, "Finish");
        pushUnique(values, "Done");
      } else if (normalizedName.includes("schedule")) {
        pushUnique(values, "Schedule send");
        pushUnique(values, "More send options");
      }
    }

    return values.length > 0 ? values : [""];
  }

  function expandFieldQueries(label) {
    const values = [];
    if (label) {
      values.push(label);
    }

    const normalized = normalize(label);
    if (normalized.includes("to")) {
      pushUnique(values, "To");
      pushUnique(values, "Recipients");
      pushUnique(values, "To recipients");
    } else if (normalized.includes("subject")) {
      pushUnique(values, "Subject");
      pushUnique(values, "Add a subject");
    } else if (normalized.includes("message") || normalized.includes("body") || normalized.includes("compose")) {
      pushUnique(values, "Message Body");
      pushUnique(values, "Message");
      pushUnique(values, "Compose email");
    }

    return values;
  }

  function closestContainerText(element) {
    let current = element;
    let depth = 0;
    const parts = [];
    while (current && depth < 4) {
      const text = normalize(current.innerText || current.textContent);
      if (text) {
        parts.push(text);
      }
      current = current.parentElement;
      depth += 1;
    }

    return parts.join(" ");
  }

  function elementLabel(element) {
    if (!element) {
      return "";
    }

    return normalize(
      element.getAttribute?.("aria-label") ||
      element.getAttribute?.("title") ||
      element.getAttribute?.("placeholder") ||
      element.innerText ||
      element.textContent ||
      element.value ||
      ""
    );
  }

  function textMatches(candidate, query) {
    const normalizedCandidate = normalize(candidate);
    const normalizedQuery = normalize(query);
    if (!normalizedCandidate || !normalizedQuery) {
      return false;
    }

    return normalizedCandidate.includes(normalizedQuery) || normalizedQuery.includes(normalizedCandidate);
  }

  function normalize(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isVisible(element) {
    if (!(element instanceof Element)) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) {
      return false;
    }

    const style = window.getComputedStyle(element);
    return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
  }

  function isLikelyClickable(element) {
    if (!(element instanceof Element)) {
      return false;
    }

    if (element.matches("button, a, input, label, [role='button'], [role='radio'], [role='checkbox'], [onclick]")) {
      return true;
    }

    const tabindex = element.getAttribute("tabindex");
    if (tabindex && tabindex !== "-1") {
      return true;
    }

    return window.getComputedStyle(element).cursor === "pointer";
  }

  function findChoiceLikeElement(optionText, questionText, type) {
    const candidates = Array.from(
      document.querySelectorAll("label, button, [role], [tabindex], [onclick], div, li, span")
    ).filter((element) => {
      if (!isVisible(element)) {
        return false;
      }

      const label = elementLabel(element);
      const context = closestContainerText(element);
      if (!textMatches(`${label} ${context}`, optionText)) {
        return false;
      }

      if (questionText && !textMatches(context, questionText) && !textMatches(label, questionText)) {
        return false;
      }

      return isLikelyClickable(element) || textMatches(label, optionText);
    });

    return candidates
      .sort((left, right) => scoreChoiceCandidate(right, optionText, questionText, type) - scoreChoiceCandidate(left, optionText, questionText, type))
      .at(0) || null;
  }

  function scoreChoiceCandidate(element, optionText, questionText, type) {
    const label = elementLabel(element);
    const context = closestContainerText(element);
    const rect = element.getBoundingClientRect();
    let score = 0;

    if (textMatches(label, optionText)) {
      score += 25;
    }

    if (textMatches(context, optionText)) {
      score += 12;
    }

    if (questionText && textMatches(context, questionText)) {
      score += 18;
    }

    if (element.matches(`input[type='${type}'], [role='${type}']`)) {
      score += 30;
    }

    if (isLikelyClickable(element)) {
      score += 10;
    }

    score -= Math.min((rect.width * rect.height) / 1200, 18);
    return score;
  }

  function findLikelyNavigationElement(aliases) {
    const candidates = Array.from(
      document.querySelectorAll("button, a, [role='button'], [tabindex], [onclick], div, span")
    ).filter((element) => isVisible(element) && isLikelyClickable(element));

    const direct = candidates.find((element) => aliases.some((alias) => textMatches(elementLabel(element), alias) || textMatches(closestContainerText(element), alias)));
    if (direct) {
      return direct;
    }

    const ranked = candidates
      .map((element) => ({ element, score: scoreNavigationCandidate(element) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score);

    return ranked[0]?.element || null;
  }

  function scoreNavigationCandidate(element) {
    const rect = element.getBoundingClientRect();
    const label = `${elementLabel(element)} ${closestContainerText(element)}`.toLowerCase();
    let score = 0;

    if (/(next|continue|submit|finish|done)/.test(label)) {
      score += 50;
    }

    if (/(arrow|chevron|next)/.test((element.className || "").toString().toLowerCase())) {
      score += 20;
    }

    if (element.querySelector("svg, path")) {
      score += 10;
    }

    if (rect.left > window.innerWidth * 0.55) {
      score += 12;
    }

    if (rect.top > window.innerHeight * 0.45) {
      score += 12;
    }

    return score;
  }

  function isEditable(element) {
    if (!(element instanceof Element)) {
      return false;
    }

    const tagName = element.tagName.toLowerCase();
    return tagName === "input" ||
      tagName === "textarea" ||
      tagName === "select" ||
      isContentEditable(element) ||
      element.getAttribute("role") === "textbox";
  }

  function isContentEditable(element) {
    return element instanceof HTMLElement && element.isContentEditable;
  }

  function focusElement(element) {
    if (typeof element.focus === "function") {
      element.focus({ preventScroll: false });
    }
  }

  function verifyTextValue(element, text) {
    const actual = isContentEditable(element)
      ? normalize(element.textContent)
      : normalize("value" in element ? element.value : element.textContent);
    if (!actual.includes(normalize(text))) {
      throw new Error("Field value did not update as expected.");
    }
  }

  function dispatchInputEvents(element) {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function cssEscape(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function pushUnique(values, nextValue) {
    if (!values.some((value) => normalize(value) === normalize(nextValue))) {
      values.push(nextValue);
    }
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function applyAnswerKey(step) {
    const answers = Array.isArray(step.answers) ? step.answers.filter((answer) => answer?.option) : [];
    if (answers.length === 0) {
      throw new Error("apply_answer_key requires answers.");
    }

    const pending = [...answers];
    const maxPages = Math.min(Math.max(pending.length + 1, 2), 12);
    let applied = 0;

    for (let pageIndex = 0; pageIndex < maxPages && pending.length > 0; pageIndex += 1) {
      let appliedThisPage = 0;

      for (let index = pending.length - 1; index >= 0; index -= 1) {
        const answer = pending[index];
        const questionText = normalize(answer.question);
        const match = findChoiceLikeElement(answer.option, questionText, "radio") ||
          findChoiceLikeElement(answer.option, questionText, "checkbox");
        if (match) {
          clickElement(match);
          await delay(140);
          pending.splice(index, 1);
          applied += 1;
          appliedThisPage += 1;
          continue;
        }

        const textField = findTextResponseField(questionText, answer.option);
        if (!textField) {
          continue;
        }

        fillField(textField, answer.option);
        await delay(140);
        pending.splice(index, 1);
        applied += 1;
        appliedThisPage += 1;
      }

      if (pending.length === 0) {
        break;
      }

      if (!step.advancePages) {
        break;
      }

      const nextElement = findLikelyNavigationElement(["Next", "Continue", "Go to next", "Done", "Submit"]);
      if (!nextElement) {
        break;
      }

      clickElement(nextElement);
      await delay(appliedThisPage > 0 ? 950 : 700);
    }

    if (applied === 0) {
      throw new Error("Could not match the answer key to responsive quiz options in this tab.");
    }

    if (pending.length > 0) {
      throw new Error(`Applied ${applied} answer(s), but ${pending.length} question(s) could not be matched yet.`);
    }
  }

  function findTextResponseField(questionText, answerText) {
    const fields = getFieldCandidates().filter((element) => {
      const tagName = element.tagName.toLowerCase();
      const type = normalize(element.getAttribute("type"));
      return tagName === "textarea" ||
        tagName === "select" ||
        tagName === "input" && !["radio", "checkbox", "button", "submit", "reset", "file", "hidden"].includes(type) ||
        isContentEditable(element);
    });

    const best = fields
      .map((element) => ({
        element,
        score: scoreTextFieldCandidate(element, questionText, answerText)
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .at(0);

    return best?.element || null;
  }

  function scoreTextFieldCandidate(element, questionText, answerText) {
    const label = elementLabel(element);
    const context = closestContainerText(element);
    const placeholder = normalize(element.getAttribute("placeholder"));
    const type = normalize(element.getAttribute("type"));
    let score = 0;

    if (questionText && textMatches(context, questionText)) {
      score += 35;
    }

    if (questionText && textMatches(label, questionText)) {
      score += 28;
    }

    if (textMatches(`${label} ${placeholder}`, "answer") || textMatches(context, "answer")) {
      score += 12;
    }

    if (textMatches(`${label} ${placeholder}`, "response") || textMatches(context, "response")) {
      score += 12;
    }

    if (type === "email" && /@/.test(answerText || "")) {
      score += 18;
    }

    if (element.tagName.toLowerCase() === "textarea" || isContentEditable(element)) {
      score += 10;
    }

    return score;
  }
})();
