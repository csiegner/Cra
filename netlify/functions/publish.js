// netlify/functions/publish.js
export default async (request) => {
  try {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;

    const dir = "cra"; // your target directory

    if (!token || !owner || !repo) {
      return json(500, {
        error: "Missing GitHub env vars. Need GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO."
      });
    }

    const body = await request.json().catch(() => ({}));
    const filename = sanitizeFilename(body.filename);
    const html = typeof body.html === "string" ? body.html : "";
    const overwrite = !!body.overwrite;

    if (!filename) return json(400, { error: "Invalid filename." });
    if (!html || html.trim().length < 10) return json(400, { error: "HTML is empty." });

    const path = `${dir}/${filename}`;
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

    let sha = null;
    const checkRes = await fetch(apiUrl, { headers: ghHeaders(token) });

    if (checkRes.ok) {
      const existing = await checkRes.json();
      sha = existing.sha;

      if (!overwrite) {
        return json(409, {
          error: "File already exists. Turn on overwrite to replace it.",
          filename,
          path
        });
      }
    } else if (checkRes.status !== 404) {
      const t = await checkRes.text();
      return json(checkRes.status, { error: "GitHub check failed.", details: t });
    }

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
      const t = await putRes.text();
      return json(putRes.status, { error: "GitHub write failed.", details: t });
    }

    const publicUrl = `/cra/${encodeURIComponent(filename)}`;

    return json(200, { ok: true, filename, path, publicUrl, overwritten: !!sha });
  } catch (err) {
    return json(500, { error: "Unexpected error.", details: String(err) });
  }
};

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "cra-publisher"
  };
}

function sanitizeFilename(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  if (raw.includes("/") || raw.includes("\\") || raw.includes("..")) return "";
  if (!raw.includes(".")) return raw + ".html";
  return raw;
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
