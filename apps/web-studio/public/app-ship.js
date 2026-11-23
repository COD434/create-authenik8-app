// Ship panel: Supabase, Vercel, Netlify, GitHub, and CI.

// --- ship ------------------------------------------------------------------

function errorText(error) {
  return error instanceof Error && error.message !== "" ? error.message : "The request failed.";
}

function setShipResult(element, message, tone = "", href = null) {
  element.textContent = "";
  element.dataset.tone = tone;
  if (message !== "") element.append(document.createTextNode(message));
  if (href !== null && href !== "") {
    const link = document.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = href;
    element.append(" ", link);
  }
}

function syncShipControls() {
  const staticReady = shipStatus?.project?.kind === "static";
  shipVercelDeploy.disabled = shipBusy || !staticReady;
  shipNetlifyDeploy.disabled = shipBusy || !staticReady;
  shipSupabaseSave.disabled = shipBusy || shipStatus?.project?.kind === "empty";
  shipGithubVerify.disabled = shipBusy;
  shipGithubPublish.disabled = shipBusy || shipGithubReviewed.checked !== true;
  githubCiLoad.disabled = shipBusy;
  for (const control of [shipGithubToken, shipGithubRepository, shipGithubBranch, shipGithubMessage, shipGithubActions, shipGithubReviewed]) {
    control.disabled = shipBusy;
  }
  shipRefresh.disabled = shipBusy;
}

let shipBusy = false;

function renderShipStatus(status) {
  shipStatus = status;
  const project = status?.project ?? { kind: "empty", rootIndex: false };
  const kind = project.kind;
  if (kind === "static") {
    shipProject.textContent = "Static site detected at the sandbox root. Vercel or Netlify can publish it.";
    shipStaticNote.hidden = true;
  } else if (kind === "fullstack") {
    shipProject.textContent = "Fullstack project detected. The frontend is static, but the Express API needs a Node host.";
    shipStaticNote.textContent = "This project has an Express API. A static host would publish the frontend without identity, sessions, or the database, so the Studio will not run that deploy. Export the ZIP and host the API on Railway or Render.";
    shipStaticNote.hidden = false;
  } else if (kind === "server") {
    shipProject.textContent = "Server project detected. Vercel and Netlify static deploys cannot run its Node server.";
    shipStaticNote.textContent = "This project is a server app. Export the ZIP and use a Node host such as Railway or Render. Static hosting would leave the server behind.";
    shipStaticNote.hidden = false;
  } else {
    shipProject.textContent = "The sandbox is empty. Build or generate a project first.";
    shipStaticNote.textContent = "There is no static site to deploy yet. Build a project with an index.html at the sandbox root first.";
    shipStaticNote.hidden = false;
  }

  const supabase = status?.supabase;
  if (supabase?.configured === true) {
    shipSupabaseDot.dataset.tone = "ok";
    shipSupabaseState.textContent = `Connected to ${supabase.url}`;
    const keyLabel = supabase.keyKind === "publishable" ? "publishable" : supabase.keyKind === "anon" ? "anon" : "public";
    const database = supabase.databaseConfigured
      ? ` Database ${supabase.databaseHost}/${supabase.databaseName}.`
      : " No database string saved yet.";
    const external = supabase.externalDatabase ? " External database mode is on." : "";
    shipSupabaseDetail.textContent = `${keyLabel} key.${database}${external}`;
    if (shipSupabaseUrl.value.trim() === "") shipSupabaseUrl.value = supabase.url;
  } else if (supabase?.databaseConfigured === true) {
    shipSupabaseDot.dataset.tone = "warn";
    shipSupabaseState.textContent = "Database saved, public connection missing";
    shipSupabaseDetail.textContent = `Database ${supabase.databaseHost}/${supabase.databaseName}. Add the project URL and public key to finish the connection.`;
  } else {
    shipSupabaseDot.dataset.tone = "idle";
    shipSupabaseState.textContent = "Not connected";
    shipSupabaseDetail.textContent = "Paste the project URL and public key to verify this project.";
  }

  shipState.textContent = supabase?.configured === true ? "Connected" : githubRepositoryLinked ? "GitHub synced" : "Not set";
  syncShipControls();
}

async function refreshShipStatus() {
  try {
    const res = await fetch("/api/integrations");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    renderShipStatus(await res.json());
  } catch (error) {
    shipStatus = null;
    shipProject.textContent = `Could not read the sandbox: ${errorText(error)}`;
    shipStaticNote.hidden = true;
    shipSupabaseDot.dataset.tone = "idle";
    shipSupabaseState.textContent = "Status unavailable";
    shipSupabaseDetail.textContent = "Could not read the sandbox environment. Refresh to try again.";
    shipState.textContent = "Unknown";
    syncShipControls();
  }
}

async function shipRequest(route, payload) {
  let res;
  try {
    res = await fetch(route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Could not reach the Studio server. Check that it is still running.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body !== null && typeof body.error === "string" ? body.error : `The request failed with HTTP ${res.status}.`);
  }
  return body ?? {};
}

function clearGithubCiResults() {
  githubCiResults.replaceChildren();
}

async function loadGithubRuns() {
  if (shipBusy) return;
  const token = shipGithubToken.value.trim();
  const repository = shipGithubRepository.value.trim();
  if (token.length === 0 || repository.length === 0) {
    githubCiStatus.textContent = "Enter the GitHub token and repository above first.";
    return;
  }
  shipBusy = true;
  syncShipControls();
  clearGithubCiResults();
  githubCiRuns.replaceChildren();
  githubCiStatus.textContent = "Loading the latest workflow runs…";
  try {
    const result = await shipRequest("/api/github/actions/runs", { token, repository });
    if (!Array.isArray(result.runs) || result.runs.length === 0) {
      githubCiStatus.textContent = `No workflow runs were found for ${result.repository ?? repository}. Add a workflow or check repository access.`;
      return;
    }
    for (const run of result.runs) {
      const item = document.createElement("li");
      const detail = `${run.branch} · ${run.conclusion ?? run.status} · ${run.event}`;
      if (run.conclusion === "failure" || run.conclusion === "timed_out" || run.conclusion === "action_required") {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "github-ci-run";
        button.textContent = `${run.name}: ${run.title} · ${detail}`;
        button.addEventListener("click", () => { void diagnoseGithubRun(run); });
        item.appendChild(button);
      } else {
        const label = document.createElement("span");
        label.className = "github-ci-run-label";
        label.textContent = `${run.name}: ${run.title} · ${detail}`;
        item.appendChild(label);
      }
      githubCiRuns.appendChild(item);
    }
    githubCiStatus.textContent = `Showing ${result.runs.length} recent run${result.runs.length === 1 ? "" : "s"} for ${result.repository ?? repository}. Select a failed run to inspect it.`;
  } catch (error) {
    githubCiStatus.textContent = errorText(error);
  } finally {
    shipBusy = false;
    syncShipControls();
  }
}

function safeGithubUrl(url) {
  return typeof url === "string" && /^https:\/\/github\.com\//i.test(url) ? url : "https://github.com/";
}

async function diagnoseGithubRun(run) {
  if (shipBusy) return;
  shipBusy = true;
  syncShipControls();
  clearGithubCiResults();
  githubCiStatus.textContent = `Downloading failed job logs for run ${run.id}…`;
  try {
    const result = await shipRequest("/api/github/actions/diagnose", {
      token: shipGithubToken.value.trim(),
      repository: shipGithubRepository.value.trim(),
      runId: run.id,
    });
    for (const job of result.jobs ?? []) {
      const card = document.createElement("article");
      card.className = "github-ci-diagnosis";
      const heading = document.createElement("h4");
      heading.textContent = `${job.name} · ${job.conclusion}`;
      const finding = document.createElement("strong");
      finding.textContent = job.diagnosis.title;
      const explanation = document.createElement("p");
      explanation.textContent = job.diagnosis.explanation;
      const nextStep = document.createElement("p");
      nextStep.textContent = `Next step: ${job.diagnosis.nextStep}`;
      const link = document.createElement("a");
      link.href = safeGithubUrl(job.url);
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Open failed job on GitHub";
      card.append(heading, finding, explanation, nextStep);
      if (Array.isArray(job.evidence) && job.evidence.length > 0) {
        const evidence = document.createElement("pre");
        evidence.className = "github-ci-evidence";
        evidence.textContent = job.evidence.join("\n");
        card.appendChild(evidence);
      }
      const logs = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "Show log excerpt (common credential patterns redacted)";
      const excerpt = document.createElement("pre");
      excerpt.className = "github-ci-evidence github-ci-log";
      excerpt.textContent = job.logExcerpt;
      logs.append(summary, excerpt);
      card.append(logs, link);
      githubCiResults.appendChild(card);
    }
    if ((result.jobs ?? []).length === 0) {
      githubCiStatus.textContent = "GitHub did not report a failed job with downloadable logs for this run.";
    } else {
      githubCiStatus.textContent = `Log-based triage for ${result.repository}, run ${result.run.id}. Findings are heuristic; confirm them in the linked GitHub logs.`;
    }
  } catch (error) {
    githubCiStatus.textContent = errorText(error);
  } finally {
    shipBusy = false;
    syncShipControls();
  }
}

async function refreshGithubFiles() {
  shipGithubFiles.replaceChildren();
  shipGithubFilesSummary.textContent = "Reading files to publish…";
  try {
    const res = await fetch("/api/github/preview");
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body !== null && typeof body.error === "string" ? body.error : `HTTP ${res.status}`);
    if (typeof body?.repository === "string" && shipGithubRepository.value.trim() === "") {
      shipGithubRepository.value = body.repository;
      if (typeof body.branch === "string" && shipGithubBranch.value.trim() === "") shipGithubBranch.value = body.branch;
    }
    githubRepositoryLinked = typeof body?.repository === "string";
    if (githubRepositoryLinked) shipState.textContent = "GitHub synced";
    const files = Array.isArray(body?.files) ? body.files.filter((file) => typeof file === "string") : [];
    const findings = Array.isArray(body?.sensitiveContent) ? body.sensitiveContent : [];
    shipGithubFilesSummary.textContent = `${files.length} included files${typeof body?.repository === "string" ? ` · last synced to ${body.repository}` : ""}${body?.skippedSecretLike ? ` · ${body.skippedSecretLike} secret-like files skipped` : ""}${findings.length ? ` · possible credentials flagged in ${findings.length} file${findings.length === 1 ? "" : "s"}` : ""}`;
    for (const finding of findings) {
      if (typeof finding?.path !== "string") continue;
      const item = document.createElement("li");
      item.className = "github-file-warning";
      const code = document.createElement("code");
      code.textContent = finding.path;
      const note = document.createElement("span");
      const patterns = Array.isArray(finding.patterns) ? finding.patterns.filter((name) => typeof name === "string") : [];
      note.textContent = `Potential credential pattern: ${patterns.join(", ") || "review this file"}. Inspect the file contents; this scan can miss secrets.`;
      item.append(code, note);
      shipGithubFiles.append(item);
    }
    if (files.length === 0) {
      const empty = document.createElement("li");
      empty.textContent = "No project files are available to publish yet.";
      shipGithubFiles.append(empty);
      return;
    }
    for (const file of files) {
      const item = document.createElement("li");
      const code = document.createElement("code");
      code.textContent = file;
      item.append(code);
      shipGithubFiles.append(item);
    }
  } catch (error) {
    shipGithubFilesSummary.textContent = `Could not inspect project files: ${errorText(error)}`;
  }
}

function githubPayload() {
  const token = shipGithubToken.value.trim();
  const repository = shipGithubRepository.value.trim();
  if (token === "") {
    setShipResult(shipGithubResult, "Paste a GitHub fine-grained token first.", "error");
    shipGithubToken.focus();
    return null;
  }
  if (repository === "") {
    setShipResult(shipGithubResult, "Enter the repository as owner/name.", "error");
    shipGithubRepository.focus();
    return null;
  }
  return { token, repository };
}

async function verifyGithub() {
  const credentials = githubPayload();
  if (credentials === null) return;
  shipBusy = true;
  syncShipControls();
  setShipResult(shipGithubResult, "Checking GitHub account and repository access…", "");
  try {
    const body = await shipRequest("/api/github/verify", credentials);
    if (shipGithubBranch.value.trim() === "") shipGithubBranch.value = body.defaultBranch ?? "main";
    setShipResult(shipGithubResult, `Verified access to ${body.repository}. Default branch: ${body.defaultBranch}.`, "ok");
  } catch (error) {
    setShipResult(shipGithubResult, errorText(error), "error");
  } finally {
    shipBusy = false;
    syncShipControls();
  }
}

async function publishToGithub() {
  const credentials = githubPayload();
  if (credentials === null) return;
  if (!shipGithubReviewed.checked) {
    setShipResult(shipGithubResult, "Review the included filenames and contents, including any possible credential warnings, before publishing.", "error");
    shipGithubReviewed.focus();
    return;
  }
  shipBusy = true;
  syncShipControls();
  setShipResult(shipGithubResult, "Publishing a project commit to GitHub…", "");
  try {
    const body = await shipRequest("/api/github/publish", {
      ...credentials,
      branch: shipGithubBranch.value.trim(),
      message: shipGithubMessage.value.trim(),
      includeWorkflow: shipGithubActions.checked,
      reviewedFiles: shipGithubReviewed.checked,
    });
    shipGithubToken.value = "";
    const message = body.alreadyUpToDate
      ? `${body.repository} is already up to date on ${body.branch} (${body.files} files).`
      : `Published ${body.files} files to ${body.repository} on ${body.branch}.${body.workflowAdded ? " Added GitHub Actions CI." : ""}`;
    const localNotes = `${body.workflowAdded && !body.workflowSavedLocally ? " The workflow is on GitHub but could not be saved to the local project." : ""}${body.localSyncStateSaved === false ? " Local sync tracking could not be saved; deleted-file sync may be incomplete next time." : ""}`;
    setShipResult(shipGithubResult, `${message}${localNotes}`, "ok", body.commitUrl ?? `https://github.com/${body.repository}`);
    if (shipGithubActions.checked && body.workflowSavedLocally) {
      shipGithubActions.checked = false;
      await refreshGithubFiles();
    }
    shipGithubReviewed.checked = false;
    githubRepositoryLinked = true;
    shipState.textContent = "GitHub synced";
    syncShipControls();
  } catch (error) {
    setShipResult(shipGithubResult, errorText(error), "error");
  } finally {
    shipBusy = false;
    syncShipControls();
  }
}

async function submitSupabase() {
  const url = shipSupabaseUrl.value.trim();
  const key = shipSupabaseKey.value.trim();
  const databaseUrl = shipSupabaseDb.value.trim();
  if (url === "" || key === "") {
    setShipResult(shipSupabaseResult, "Enter the project URL and the public key.", "error");
    (url === "" ? shipSupabaseUrl : shipSupabaseKey).focus();
    return;
  }
  shipBusy = true;
  syncShipControls();
  setShipResult(shipSupabaseResult, databaseUrl !== "" ? "Connecting and deploying schema..." : "Connecting...", "");
  try {
    const payload = { url, anonKey: key, apply: true, deploy: databaseUrl !== "" };
    if (databaseUrl !== "") payload.databaseUrl = databaseUrl;
    const res = await fetch("/api/integrations/supabase", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }

    // Deploy path streams SSE; connect-only path returns JSON.
    const isStream = res.headers.get("content-type")?.includes("text/event-stream");
    if (!isStream) {
      const body = await res.json();
      shipSupabaseKey.value = "";
      const database = body.database ? ` Database ${body.database.host}/${body.database.database}.` : "";
      setShipResult(shipSupabaseResult, `Connected ${body.supabase.url} with the ${body.supabase.keyKind} key.${database}`, "ok");
      if (body.status !== undefined) renderShipStatus(body.status);
      return;
    }

    // Stream: connection result, then schema-push lines, then done/error.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let connected = false;
    let deployLines = [];
    let deployDone = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        for (const line of rawEvent.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const payloadEvent = JSON.parse(line.slice(6));
          if (payloadEvent.supabaseConnect) {
            connected = true;
            shipSupabaseKey.value = "";
            shipSupabaseDb.value = "";
            setShipResult(shipSupabaseResult, `Connected ${payloadEvent.supabaseConnect.supabase.url}. Pushing schema...`, "");
          }
          if (payloadEvent.supabaseDeploy?.phase === "line") {
            deployLines.push(payloadEvent.supabaseDeploy.line);
            setShipResult(shipSupabaseResult, `Deploying schema...\n${deployLines.slice(-3).join("\n")}`, "");
          }
          if (payloadEvent.supabaseDeploy?.phase === "done" || payloadEvent.supabaseDeploy?.phase === "error") {
            deployDone = payloadEvent.supabaseDeploy;
          }
        }
      }
    }
    if (deployDone?.phase === "done") {
      setShipResult(shipSupabaseResult, "Connected and schema deployed to Supabase.", "ok");
    } else if (deployDone?.phase === "error") {
      setShipResult(shipSupabaseResult, `Schema push failed: ${deployDone.message ?? "see output"}\n${deployLines.slice(-5).join("\n")}`, "error");
    } else if (connected) {
      setShipResult(shipSupabaseResult, "Connected to Supabase.", "ok");
    }
  } catch (error) {
    setShipResult(shipSupabaseResult, errorText(error), "error");
  } finally {
    shipBusy = false;
    syncShipControls();
  }
}

async function deployToProvider(provider) {
  const vercel = provider === "vercel";
  const tokenInput = vercel ? shipVercelToken : shipNetlifyToken;
  const nameInput = vercel ? shipVercelName : shipNetlifyName;
  const result = vercel ? shipVercelResult : shipNetlifyResult;
  const token = tokenInput.value.trim();
  if (token === "") {
    setShipResult(result, "Paste an access token first.", "error");
    tokenInput.focus();
    return;
  }
  if (shipStatus?.project?.kind !== "static") {
    setShipResult(result, "Only a static site can be deployed from the Studio. Export the ZIP for a server project.", "error");
    return;
  }
  shipBusy = true;
  syncShipControls();
  setShipResult(result, `Deploying to ${vercel ? "Vercel" : "Netlify"}...`, "");
  try {
    const payload = { token, name: nameInput.value.trim() };
    if (!vercel) payload.siteId = shipNetlifySite.value.trim();
    const body = await shipRequest(`/api/deploy/${provider}`, payload);
    tokenInput.value = "";
    const state = typeof body.state === "string" && body.state !== "" ? body.state : "queued";
    const count = Number.isFinite(body.files) ? `${body.files} files` : "the site";
    setShipResult(
      result,
      `Deployed ${count} to ${vercel ? "Vercel" : "Netlify"}. State: ${state}.`,
      "ok",
      typeof body.url === "string" ? body.url : null,
    );
  } catch (error) {
    setShipResult(result, errorText(error), "error");
  } finally {
    shipBusy = false;
    syncShipControls();
  }
}

function selectShipTab(tab, focus = false) {
  if (!shipTabButtons.some((button) => button.dataset.shipTab === tab)) return;
  shipTab = tab;
  for (const button of shipTabButtons) {
    const active = button.dataset.shipTab === tab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
    if (active && focus) button.focus();
  }
  for (const panel of shipPanels) panel.hidden = panel.id !== `ship-panel-${tab}`;
}

function clearShipSecrets() {
  shipGithubToken.value = "";
  shipGithubActions.checked = false;
  shipGithubReviewed.checked = false;
  shipSupabaseKey.value = "";
  shipSupabaseDb.value = "";
  shipVercelToken.value = "";
  shipNetlifyToken.value = "";
}

function openShip(opener) {
  if (!shipOverlay.hidden) {
    shipClose.focus();
    return;
  }
  shipOpener = opener instanceof HTMLElement ? opener : modalOpener(shipBtn);
  clearShipSecrets();
  setShipResult(shipSupabaseResult, "", "");
  setShipResult(shipVercelResult, "", "");
  setShipResult(shipNetlifyResult, "", "");
  setShipResult(shipGithubResult, "", "");
  shipOverlay.hidden = false;
  setModalBackgroundInert(shipOverlay, true);
  selectShipTab(shipTab);
  shipClose.focus();
  void refreshShipStatus();
  void refreshGithubFiles();
}

function closeShip() {
  if (shipOverlay.hidden) return;
  shipOverlay.hidden = true;
  setModalBackgroundInert(shipOverlay, false);
  clearShipSecrets();
  const opener = shipOpener;
  shipOpener = null;
  restoreModalFocus(opener, shipBtn);
}

shipBtn.addEventListener("click", () => openShip(shipBtn));
shipClose.addEventListener("click", closeShip);
shipDone.addEventListener("click", closeShip);
shipRefresh.addEventListener("click", () => { void refreshShipStatus(); void refreshGithubFiles(); });
shipOverlay.addEventListener("mousedown", (event) => {
  if (event.target === shipOverlay) closeShip();
});
shipSupabaseSave.addEventListener("click", () => { void submitSupabase(); });
shipVercelDeploy.addEventListener("click", () => { void deployToProvider("vercel"); });
shipNetlifyDeploy.addEventListener("click", () => { void deployToProvider("netlify"); });
shipGithubVerify.addEventListener("click", () => { void verifyGithub(); });
shipGithubPublish.addEventListener("click", () => { void publishToGithub(); });
githubCiLoad.addEventListener("click", () => { void loadGithubRuns(); });
shipGithubReviewed.addEventListener("change", syncShipControls);

for (const button of shipTabButtons) {
  button.addEventListener("click", () => selectShipTab(button.dataset.shipTab ?? "supabase"));
  button.addEventListener("keydown", (event) => {
    const index = shipTabButtons.indexOf(button);
    let next = null;
    if (event.key === "ArrowRight") next = (index + 1) % shipTabButtons.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + shipTabButtons.length) % shipTabButtons.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = shipTabButtons.length - 1;
    if (next === null) return;
    event.preventDefault();
    selectShipTab(shipTabButtons[next].dataset.shipTab ?? "supabase", true);
  });
}

void refreshShipStatus();

