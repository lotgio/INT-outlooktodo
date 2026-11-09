import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
const allowedOrigins = new Set((Deno.env.get("CORS_ORIGINS") || "").split(",").map(v => v.trim()).filter(Boolean));
const corsHeaders = (request: Request) => {
  const origin = request.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "null",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-ingest-secret",
    "Vary": "Origin"
  };
};
const json = (request: Request, status: number, payload: unknown) => new Response(JSON.stringify(payload), {
  status,
  headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8" }
});
const db = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function signedIn(request: Request): Promise<string | null> {
  const raw = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!raw) return null;
  try {
    const { data, error } = await db().auth.getUser(raw);
    const email = data.user?.email?.trim().toLowerCase();
    const allowedEmail = Deno.env.get("APP_USER_EMAIL")?.trim().toLowerCase();
    return !error && email && allowedEmail && email === allowedEmail ? email : null;
  } catch {
    return null;
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  const url = new URL(request.url);

  if (request.method === "POST" && url.pathname.endsWith("/email-archive")) {
    const expected = Deno.env.get("INGEST_SECRET");
    if (!expected || request.headers.get("x-ingest-secret") !== expected) {
      return json(request, 401, { error: "Invalid ingestion credential." });
    }
    let input: Record<string, unknown>;
    try { input = await request.json(); } catch { return json(request, 400, { error: "Expected a JSON payload." }); }
    const sourceKey = String(input.sourceKey ?? input.source_key ?? input.internetMessageId ?? "").trim();
    const subject = String(input.subject ?? input.title ?? "").trim();
    const sender = String(input.sender ?? input.from ?? "").trim();
    const receivedAt = String(input.receivedAt ?? input.received_at ?? "").trim();
    if (!sourceKey || !subject || !sender || !receivedAt) {
      return json(request, 400, { error: "Required fields: sourceKey, subject, sender, receivedAt." });
    }
    const { data, error } = await db().from("emails").upsert({
      source_key: sourceKey,
      subject,
      sender,
      received_at: receivedAt,
      body: String(input.body ?? ""),
      importance: String(input.importance ?? "normal"),
      web_link: String(input.webLink ?? input.web_link ?? "")
    }, { onConflict: "source_key", ignoreDuplicates: true }).select("id");
    if (error) {
      console.error("Email insert failed", error.message);
      return json(request, 500, { error: "Could not archive this email." });
    }
    const stored = Boolean(data?.length);
    return json(request, stored ? 201 : 200, { stored, duplicate: !stored, sourceKey });
  }

  if (request.method === "GET" && url.pathname.endsWith("/email-archive")) {
    if (!await signedIn(request)) return json(request, 401, { error: "Accedi con l'account autorizzato dell'app." });
    const showDismissed = url.searchParams.get("dismissed") === "true";
    const { data, error } = await db().from("emails")
      .select("source_key,subject,sender,received_at,body,importance,web_link,category,client_name,assignee_name,is_dismissed")
      .eq("is_dismissed", showDismissed)
      .order("received_at", { ascending: false }).limit(1000);
    if (error) {
      console.error("Email query failed", error.message);
      return json(request, 500, { error: "Could not load the email archive." });
    }
    return json(request, 200, { value: data || [] });
  }

  if (request.method === "PATCH" && url.pathname.endsWith("/email-archive")) {
    const ownerId = await signedIn(request);
    if (!ownerId) return json(request, 401, { error: "Accedi con l'account autorizzato dell'app." });
    let input: Record<string, unknown>;
    try { input = await request.json(); } catch { return json(request, 400, { error: "Expected a JSON payload." }); }
    const sourceKey = String(input.sourceKey ?? "").trim();
    if (!sourceKey) return json(request, 400, { error: "sourceKey is required." });
    const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const field of ["category", "client_name", "assignee_name"] as const) {
      if (field in input) changes[field] = String(input[field] ?? "").trim().slice(0, 160);
    }
    if ("is_dismissed" in input) {
      if (typeof input.is_dismissed !== "boolean") return json(request, 400, { error: "is_dismissed must be boolean." });
      changes.is_dismissed = input.is_dismissed;
    }
    const { error } = await db().from("emails").update(changes).eq("source_key", sourceKey);
    if (error) {
      console.error("Email update failed", error.message);
      return json(request, 500, { error: "Could not update this email." });
    }
    const taskChanges: Record<string, unknown> = {};
    for (const [emailField, taskField] of [["category", "category"], ["client_name", "client_name"], ["assignee_name", "assignee_name"]] as const) {
      if (emailField in changes) taskChanges[taskField] = changes[emailField];
    }
    if (Object.keys(taskChanges).length) {
      const { error: taskError } = await db().from("agenda_tasks")
        .update({ ...taskChanges, updated_at: new Date().toISOString() })
        .eq("owner_id", ownerId).eq("source_key", sourceKey);
      if (taskError) {
        console.error("Linked task classification update failed", taskError.message);
        return json(request, 500, { error: "Email updated, but its linked activity classification could not be updated." });
      }
    }
    return json(request, 200, { updated: true, linkedTaskUpdated: Object.keys(taskChanges).length > 0 });
  }

  for (const [route, table] of [["/clients", "app_clients"], ["/assignees", "app_assignees"]] as const) {
    if (!url.pathname.endsWith(route)) continue;
    if (!await signedIn(request)) return json(request, 401, { error: "Accedi con l'account autorizzato dell'app." });
    if (request.method === "GET") {
      const values: Array<{ name: string }> = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await db().from(table).select("name").order("name", { ascending: true }).range(offset, offset + 999);
        if (error) return json(request, 500, { error: "Could not load the list." });
        values.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      return json(request, 200, { value: values });
    }
    if (request.method === "POST") {
      let input: Record<string, unknown>;
      try { input = await request.json(); } catch { return json(request, 400, { error: "Expected a JSON payload." }); }
      const name = String(input.name ?? "").trim().slice(0, 160);
      if (!name) return json(request, 400, { error: "name is required." });
      const { data, error } = await db().from(table).upsert({ name }, { onConflict: "name" }).select("name").single();
      if (error) return json(request, 500, { error: "Could not save the list item." });
      return json(request, 200, { item: data });
    }
    if (request.method === "DELETE") {
      let input: Record<string, unknown>;
      try { input = await request.json(); } catch { return json(request, 400, { error: "Expected a JSON payload." }); }
      const name = String(input.name ?? "").trim();
      if (!name) return json(request, 400, { error: "name is required." });
      const { error } = await db().from(table).delete().eq("name", name);
      if (error) return json(request, 500, { error: "Could not remove the list item." });
      return json(request, 200, { deleted: true });
    }
  }

  if (url.pathname.endsWith("/tasks")) {
    const ownerId = await signedIn(request);
    if (!ownerId) return json(request, 401, { error: "Accedi con l'account autorizzato dell'app." });

    if (request.method === "GET") {
      const { data, error } = await db().from("agenda_tasks")
        .select("source_key,title,description,category,urgency,due_date,due_label,is_completed,client_name,assignee_name,created_at")
        .eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(1000);
      if (error) {
        console.error("Task query failed", error.message);
        return json(request, 500, { error: "Could not load tasks." });
      }
      return json(request, 200, { value: data || [] });
    }

    if (request.method === "PATCH") {
      let input: Record<string, unknown>;
      try { input = await request.json(); } catch { return json(request, 400, { error: "Expected a JSON payload." }); }
      const sourceKey = String(input.sourceKey ?? "").trim();
      if (!sourceKey) return json(request, 400, { error: "sourceKey is required." });
      const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const emailChanges: Record<string, unknown> = {};
      if ("isCompleted" in input) {
        if (typeof input.isCompleted !== "boolean") return json(request, 400, { error: "isCompleted must be boolean." });
        changes.is_completed = input.isCompleted;
      }
      if ("title" in input) {
        const title = String(input.title ?? "").trim().slice(0, 500);
        if (!title) return json(request, 400, { error: "title cannot be empty." });
        changes.title = title;
      }
      if ("description" in input) changes.description = String(input.description ?? "").trim().slice(0, 5000);
      for (const [inputField, taskField, emailField] of [["category", "category", "category"], ["clientName", "client_name", "client_name"], ["assigneeName", "assignee_name", "assignee_name"]] as const) {
        if (inputField in input) {
          const value = String(input[inputField] ?? "").trim().slice(0, 160);
          changes[taskField] = value;
          emailChanges[emailField] = value;
        }
      }
      if ("urgency" in input) {
        const urgency = String(input.urgency ?? "").trim();
        if (!["Alta", "Media", "Bassa"].includes(urgency)) return json(request, 400, { error: "urgency must be Alta, Media or Bassa." });
        changes.urgency = urgency;
      }
      if ("dueDate" in input) {
        const dueDate = input.dueDate ? String(input.dueDate) : null;
        if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return json(request, 400, { error: "dueDate must use YYYY-MM-DD format." });
        changes.due_date = dueDate;
      }
      if ("dueLabel" in input) changes.due_label = String(input.dueLabel ?? "").trim().slice(0, 80);
      if (Object.keys(changes).length === 1) return json(request, 400, { error: "No task fields to update." });
      const { error } = await db().from("agenda_tasks").update(changes).eq("owner_id", ownerId).eq("source_key", sourceKey);
      if (error) return json(request, 500, { error: "Could not update task." });
      if (Object.keys(emailChanges).length) {
        const { error: emailError } = await db().from("emails").update({ ...emailChanges, updated_at: new Date().toISOString() }).eq("source_key", sourceKey);
        if (emailError) return json(request, 500, { error: "Task saved, but linked email classification could not be updated." });
      }
      return json(request, 200, { updated: true });
    }

    if (request.method === "POST") {
      let input: Record<string, unknown>;
      try { input = await request.json(); } catch { return json(request, 400, { error: "Expected a JSON payload." }); }
      const sourceKey = String(input.sourceKey ?? "").trim();
      const title = String(input.title ?? "").trim();
      const category = String(input.category ?? "").trim();
      const urgency = String(input.urgency ?? "Media").trim();
      if (!sourceKey || !title || !category || !["Alta", "Media", "Bassa"].includes(urgency)) {
        return json(request, 400, { error: "Required fields: sourceKey, title, category and valid urgency." });
      }
      const dueDate = input.dueDate ? String(input.dueDate) : null;
      if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
        return json(request, 400, { error: "dueDate must use YYYY-MM-DD format." });
      }
      const { data, error } = await db().from("agenda_tasks").upsert({
        owner_id: ownerId,
        source_key: sourceKey,
        title,
        description: String(input.description ?? "").trim().slice(0, 5000),
        category,
        urgency,
        due_date: dueDate,
        due_label: String(input.dueLabel ?? ""),
        client_name: String(input.clientName ?? "").trim().slice(0, 160),
        assignee_name: String(input.assigneeName ?? "").trim().slice(0, 160),
        is_completed: false
      }, { onConflict: "owner_id,source_key" })
        .select("source_key,title,description,category,urgency,due_date,due_label,is_completed,client_name,assignee_name,created_at")
        .single();
      if (error) {
        console.error("Task save failed", error.message);
        return json(request, 500, { error: "Could not save task metadata." });
      }
      return json(request, 200, { task: data });
    }
  }

  return json(request, 404, { error: "Route not found." });
});
