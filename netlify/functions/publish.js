// netlify/functions/publish.js
export default async (request) => {
  try {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;

    const dir = "cra";

    if (!token || !owner || !repo) {
      return json(500, {
        ok: false,
        error: "Missing GitHub env vars. Need GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO."
      });
    }

    const body = await request.json().catch(() => ({}));
    const slug = sanitizeSlug(body.slug);
    const html = typeof body.html === "string" ? body.html : "";
    const overwrite = !!body.overwrite;

    if (!slug) return json(400, { ok: false, error: "Missing or invalid slug." });
    if (!html || !html.trim()) return json(400, { ok: false, error: "Missing HTML." });

    const path = `${dir}/${slug}`;
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

    // 1) Check if file exists to get sha
    let sha = null;
    const checkRes = await fetch(apiUrl, { headers: ghHeaders(token) });

    if (checkRes.ok) {
      const existing = await checkRes.json();
      sha = existing && existing.sha;

      if (!overwrite) {
        return json(409, {
          ok: false,
          error: "File already exists. Turn on overwrite to replace it."
        });
      }
    } else if (checkRes.status !== 404) {
      const text = await checkRes.text();
      return json(checkRes.status, { ok: false, error: "GitHub check failed.", details: text });
    }

    // 2) Create or update
    const putRes = await fetch(apiUrl, {
      method: "PUT",
      headers: { ...ghHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: sha ? `Update ${path}` : `Create ${path}`,
        content: Buffer.from(html, "utf8").toString("base64"),
        sha: sha || undefined
      })
    });

    if (!putRes.ok) {
      const text = await putRes.text();
      return json(putRes.status, { ok: false, error: "GitHub write failed.", details: text });
    }

    const result = await putRes.json().catch(() => ({}));
    const commit = (result && result.commit && result.commit.sha) ? result.commit.sha : null;

    // Your site should serve pages from /cra/<slug>
    const url = `/cra/${encodeURIComponent(slug)}`;

    return json(200, { ok: true, url, commit });
  } catch (err) {
    return json(500, { ok: false, error: "Unexpected error.", details: String(err) });
  }
};

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "cra-publisher"
  };
}

function sanitizeSlug(slug) {
  const raw = String(slug || "").trim();
  if (!raw) return "";

  // block folder paths and traversal
  if (raw.includes("/") || raw.includes("\\") || raw.includes("..")) return "";

  // If user typed just a name, default to .html
  if (!raw.includes(".")) return raw + ".html";

  return raw;
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
