// Template seeding and AI integration planner modals.

// --- New from template (the Authenik8 CLI bridge) ---

const templateOverlay = document.getElementById("template-overlay");
const templateModal = templateOverlay.querySelector(".agent-modal");
const templateBtn = document.getElementById("template-btn");
const templateClose = document.getElementById("template-close");
const templateDismiss = document.getElementById("template-dismiss");
const templatePreset = document.getElementById("template-preset");
const templateForm = document.getElementById("template-form");
const templateStatus = document.getElementById("template-status");
const templateState = document.getElementById("template-state");
const templateOutput = document.getElementById("template-output");
const templateRunBtn = document.getElementById("template-run");
const templateProSaas = document.getElementById("template-pro-saas");
const templateProNote = document.getElementById("template-pro-note");
const templateDemo = document.getElementById("template-demo");
const templateDemoRow = document.getElementById("template-demo-row");
const templateActions = document.getElementById("template-actions");
let templateBusy = false;
let templateOpener = null;

const MAX_TEMPLATE_LINES = 300;
function appendTemplateLine(line) {
  const lines = templateOutput.textContent === "" ? [] : templateOutput.textContent.split("\n");
  if (lines[0] === "…") lines.shift();
  lines.push(line);
  if (lines.length > MAX_TEMPLATE_LINES) {
    lines.splice(0, lines.length - MAX_TEMPLATE_LINES);
    lines.unshift("…");
  }
  templateOutput.textContent = lines.join("\n");
  templateOutput.scrollTop = templateOutput.scrollHeight;
}

function syncTemplateRows() {
  const preset = templatePreset.value;
  document.getElementById("template-frontend-row").hidden = preset !== "fullstack";
  document.getElementById("template-providers-row").hidden = preset !== "auth-oauth";
  templateDemoRow.hidden = preset !== "fullstack";
  if (preset !== "fullstack") templateProNote.textContent = "";
  if (preset === "fullstack") {
    // The CLI's own contract: fullstack requires PostgreSQL.
    document.getElementById("template-database").value = "postgresql";
  }
}
templatePreset.addEventListener("change", syncTemplateRows);

// The first Pro template: a curated fullstack configuration with demo data.
// It fills the form instead of generating immediately so the user can review.
templateProSaas.addEventListener("click", () => {
  templatePreset.value = "fullstack";
  syncTemplateRows();
  document.getElementById("template-frontend").value = "react";
  document.getElementById("template-database").value = "postgresql";
  document.getElementById("template-package-manager").value = "npm";
  document.getElementById("template-prisma").checked = true;
  templateDemo.checked = true;
  templateProNote.textContent = "SaaS starter selected. Review the options, then generate.";
  templateRunBtn.focus({ preventScroll: true });
});

function openTemplate(opener) {
  if (!templateOverlay.hidden) {
    if (templateBusy) templateDismiss.focus();
    else templatePreset.focus();
    return;
  }
  templateOpener = opener instanceof HTMLElement ? opener : modalOpener(templateBtn);
  templateOverlay.hidden = false;
  setModalBackgroundInert(templateOverlay, true);
  if (templateBusy) {
    templateForm.hidden = true;
    templateStatus.hidden = false;
    templateActions.hidden = true;
    templateDismiss.focus();
    return;
  }
  templateForm.hidden = false;
  templateStatus.hidden = true;
  templateActions.hidden = false;
  syncTemplateRows();
  templatePreset.focus();
}

function closeTemplate() {
  // Always allowed: hiding the dialog never cancels the generation, and a
  // stuck busy-flag must never trap the user.
  if (templateOverlay.hidden) return;
  templateOverlay.hidden = true;
  setModalBackgroundInert(templateOverlay, false);
  const opener = templateOpener;
  templateOpener = null;
  restoreModalFocus(opener, templateBtn);
}

templateBtn.addEventListener("click", openTemplate);

function aiPattern() {
  return aiIntegrationForm.querySelector('[name="ai-pattern"]:checked')?.value ?? "content";
}

function syncAiIntegrationFields() {
  const pattern = aiPattern();
  const needsKnowledge = pattern === "knowledge";
  const needsActions = pattern === "actions";
  aiDataRow.hidden = !needsKnowledge && !needsActions;
  aiActionsRow.hidden = !needsActions;
  aiApprovalRow.hidden = !needsActions;
  aiDataInput.required = needsKnowledge;
  aiActionsInput.required = needsActions;
  document.getElementById("ai-data-label").textContent = needsKnowledge
    ? "Which business information should it use?"
    : "Which records or context may it read?";
}

function openAiIntegration(opener) {
  aiIntegrationOpener = opener instanceof HTMLElement ? opener : modalOpener(aiIntegrationBtn);
  aiIntegrationForm.reset();
  aiIntegrationError.hidden = true;
  aiIntegrationError.textContent = "";
  syncAiIntegrationFields();
  closeComposerOptions();
  aiIntegrationOverlay.hidden = false;
  setModalBackgroundInert(aiIntegrationOverlay, true);
  aiGoal.focus();
}

function closeAiIntegration() {
  if (aiIntegrationOverlay.hidden) return;
  aiIntegrationOverlay.hidden = true;
  setModalBackgroundInert(aiIntegrationOverlay, false);
  const opener = aiIntegrationOpener;
  aiIntegrationOpener = null;
  restoreModalFocus(opener, aiIntegrationBtn);
}

aiIntegrationBtn.addEventListener("click", () => openAiIntegration(aiIntegrationBtn));
aiIntegrationClose.addEventListener("click", closeAiIntegration);
aiIntegrationOverlay.addEventListener("mousedown", (event) => {
  if (event.target === aiIntegrationOverlay) closeAiIntegration();
});
aiPatternInputs.forEach((input) => input.addEventListener("change", syncAiIntegrationFields));
aiIntegrationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  aiIntegrationError.hidden = true;
  aiIntegrationError.textContent = "";
  if (typeof chatRunning !== "undefined" && chatRunning) {
    aiIntegrationError.textContent = "Wait for the current response to finish, or stop it before planning an AI capability.";
    aiIntegrationError.hidden = false;
    document.getElementById("ai-integration-start")?.focus();
    return;
  }
  const pattern = aiPattern();
  const goal = aiGoal.value.trim();
  const data = aiDataInput.value.trim();
  const actions = aiActionsInput.value.trim();
  const firstInvalid = goal === "" ? aiGoal
    : (pattern === "knowledge" && data === "") ? aiDataInput
    : (pattern === "actions" && actions === "") ? aiActionsInput
    : null;
  if (firstInvalid !== null) {
    aiIntegrationError.textContent = "Add the user task and the required knowledge source or connected action to continue.";
    aiIntegrationError.hidden = false;
    firstInvalid.focus();
    return;
  }

  const patternLabel = {
    content: "Content generation or understanding",
    knowledge: "Answers grounded in business knowledge (RAG)",
    actions: "Connected business tools and actions",
  }[pattern] ?? "Content generation or understanding";
  const providerLabel = aiProvider.selectedOptions[0]?.textContent ?? "Choose during planning";
  const details = [
    "Add an AI capability to the current Authenik8 app. Keep it optional and fit the existing product; first inspect the current project and its identity and authorization architecture.",
    `Requested pattern: ${patternLabel}.`,
    `User task: ${goal}`,
    data ? `${pattern === "knowledge" ? "Knowledge sources" : "Readable business records"}: ${data}` : "",
    actions ? `Connected systems and requested actions: ${actions}` : "",
    document.getElementById("ai-access").value.trim()
      ? `Intended users and access scope: ${document.getElementById("ai-access").value.trim()}`
      : "Determine the users and access scope; ask a focused question if private or tenant-scoped data is involved.",
    `Provider preference: ${providerLabel}. If undecided or incompatible with the app, explain practical options before choosing. Never reuse Studio's OpenRouter key as an app credential.`,
    pattern === "actions"
      ? `Require human confirmation before writes: ${aiApproval.checked ? "yes" : "no, but preserve server authorization and audit controls"}.`
      : "",
    "Before implementing, summarize the integration plan and any blocking setup choice. If the required choices are clear, include an AI setup step in update_plan and proceed with the build.",
    "Keep model calls on the server. Configure provider credentials and model through server environment variables; create .env.example with placeholders only. Never put secrets in browser code, logs, or source control. Explain expected provider cost and what data leaves the app.",
    pattern === "knowledge"
      ? "For retrieval, enforce the signed-in user's and tenant's permissions before each retrieval and before sending chunks to the model. Preserve source citations, ingestion provenance, re-indexing and deletion. Treat retrieved text as untrusted data, not instructions."
      : "",
    pattern === "actions"
      ? "Expose only narrow allowlisted server functions with validated inputs. Re-check Authenik8 authorization when executing each action. Ask before consequential writes by default and record appropriate audit metadata. Never give the model raw credentials or direct database/API access."
      : "",
    "Build only the requested scope. Do not add RAG, embeddings, autonomous loops, or broad permissions unless the user task requires them.",
  ].filter(Boolean);
  promptEl.value = details.join("\n\n");
  promptEl.style.height = "auto";
  promptEl.style.height = `${Math.min(promptEl.scrollHeight, 180)}px`;
  closeAiIntegration();
  composer.requestSubmit();
});

// Starter prompts on the empty state: two fill the composer, two open the
// real doors (the template wizard and the agent) in one click.
document.querySelectorAll(".starter").forEach((starter) => {
  starter.addEventListener("click", () => {
    if (starter.dataset.open === "template") { openTemplate(starter); return; }
    if (starter.dataset.open === "agent") { openAgent(starter); return; }
    if (starter.dataset.open === "ai-integration") { openAiIntegration(starter); return; }
    promptEl.value = starter.dataset.prompt ?? "";
    promptEl.style.height = "auto";
    promptEl.style.height = `${Math.min(promptEl.scrollHeight, 180)}px`;
    promptEl.focus();
  });
});
templateClose.addEventListener("click", closeTemplate);
templateDismiss.addEventListener("click", closeTemplate);
templateOverlay.addEventListener("mousedown", (event) => {
  if (event.target === templateOverlay) closeTemplate();
});

templateRunBtn.addEventListener("click", async () => {
  if (templateBusy) return;
  const preset = templatePreset.value;
  const spec = {
    preset,
    database: document.getElementById("template-database").value,
    packageManager: document.getElementById("template-package-manager").value,
    usePrisma: document.getElementById("template-prisma").checked,
    confirm: true, // the modal itself is the explicit replacement warning
  };
  if (preset === "fullstack") {
    spec.frontend = document.getElementById("template-frontend").value;
    spec.demo = templateDemo.checked;
    // The Studio fullstack form has no provider choice; the CLI requires an
    // explicit OAuth decision, so this configuration is password-only.
    spec.oauthProviders = [];
  }
  if (preset === "auth-oauth") {
    const providers = [];
    if (document.getElementById("template-oauth-google").checked) providers.push("google");
    if (document.getElementById("template-oauth-github").checked) providers.push("github");
    spec.oauthProviders = providers;
  }

  templateBusy = true;
  templateRunBtn.disabled = true;
  templateForm.hidden = true;
  templateStatus.hidden = false;
  templateActions.hidden = true;
  if (!templateOverlay.hidden) templateDismiss.focus();
  templateState.textContent = "Generating with the Authenik8 CLI. Runs locally, nothing is uploaded…";
  templateOutput.textContent = "";
  setWorkspaceStatus("Generating project", "live");

  try {
    const res = await fetch("/api/template", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(spec),
    });
    if (!res.ok && res.headers.get("content-type")?.includes("application/json")) {
      const body = await res.json();
      throw new Error(body.error ?? `Request failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let seeded = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
        const dataLine = rawEvent.split("\n").find((line) => line.startsWith("data: "));
        if (dataLine === undefined) continue;
        const payload = JSON.parse(dataLine.slice(6));
        if (payload.template !== undefined) {
          const t = payload.template;
          if (t.phase === "line") appendTemplateLine(t.line);
          if (t.phase === "seeded") seeded = t;
        }
        if (payload.error !== undefined) throw new Error(payload.error);
        if (payload.done === true && seeded !== null) {
          historyEpoch++;
          messagesEl.innerHTML = "";
          renderPlan(null);
          addMessage(
            "assistant",
            `Sandbox seeded from the Authenik8 template (${seeded.files} files). Describe changes in chat, or hit Run project to install and start it.`,
          );
          setWorkspaceStatus("Project ready", "ok");
          closeTemplate();
        }
      }
    }
    if (seeded === null && templateState.textContent !== "") {
      // Stream ended without seeded/error: the server closed early.
      throw new Error("Template stream ended before seeding completed.");
    }
  } catch (error) {
    templateState.textContent = `Template failed: ${error.message}`;
    setWorkspaceStatus("Template failed", "error");
  } finally {
    if (templateState.textContent.startsWith("Template failed") || templateState.textContent === "") {
      templateState.textContent = templateState.textContent; // keep error visible
    } else {
      templateState.textContent = "Seeded.";
    }
    templateBusy = false;
    templateRunBtn.disabled = false;
  }
});

