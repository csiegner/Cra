// netlify/functions/delete-page.js
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

    if (!slug) {
      return json(400, { ok: false, error: "Missing or invalid slug." });
    }

    // If the slug includes an extension, treat it as a file.
    // Otherwise treat it as a folder and delete /index.html inside.
    const isFile = slug.includes(".");
    const path = isFile ? `${dir}/${slug}` : `${dir}/${slug}/index.html`;

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

    // 1) Get sha (required for GitHub delete)
    const getRes = await fetch(apiUrl, { headers: ghHeaders(token) });

    if (getRes.status === 404) {
      return json(404, {
        ok: false,
        error: `Not found: ${path}`,
        slug,
        path
      });
    }

    if (!getRes.ok) {
      const text = await getRes.text();
      return json(getRes.status, {
        ok: false,
        error: "GitHub read failed.",
        details: text,
        slug,
        path
      });
    }

    const existing = await getRes.json();
    const sha = existing && existing.sha;

    if (!sha) {
      return json(500, { ok: false, error: "Could not determine file sha for delete.", slug, path });
    }

    // 2) Delete file
    const delRes = await fetch(apiUrl, {
      method: "DELETE",
      headers: { ...ghHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Delete ${path}`,
        sha
      })
    });

    if (!delRes.ok) {
      const text = await delRes.text();
      return json(delRes.status, {
        ok: false,
        error: "GitHub delete failed.",
        details: text,
        slug,
        path
      });
    }

    return json(200, {
      ok: true,
      slug,
      path,
      deletedType: isFile ? "file" : "folder-index"
    });
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

  // block folder traversal
  if (raw.includes("\\") || raw.includes("..")) return "";

  // Allow slugs like "folder" or "file.html"
  // Disallow nested paths like "a/b" for safety
  if (raw.includes("/")) return "";

  return raw;
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
