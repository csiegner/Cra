// netlify/functions/publish.js

const json = (statusCode, payload) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(payload),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const withCors = (resp) => ({
  ...resp,
  headers: { ...(resp.headers || {}), ...corsHeaders },
});

exports.handler = async (event) => {
  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return withCors({ statusCode: 204, body: "" });
  }

  if (event.httpMethod !== "POST") {
    return withCors(json(405, { ok: false, error: "Method not allowed" }));
  }

  try {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";

    if (!token || !owner || !repo) {
      return withCors(
        json(500, { ok: false, error: "Missing env vars", hasToken: !!token, owner, repo, branch })
      );
    }

    const { slug, html, title } = JSON.parse(event.body || "{}");

    // Slug rules: lowercase letters, numbers, hyphen
    const slugOk = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || "");
    if (!slugOk) {
      return withCors(
        json(400, {
          ok: false,
          error: "Invalid slug. Use lowercase letters, numbers, and hyphens only.",
        })
      );
    }

    if (!html || String(html).trim().length < 20) {
      return withCors(json(400, { ok: false, error: "HTML is empty" }));
    }

    // Force published path
    const path = `cra/${slug}/index.html`;

    // Optional: wrap fragment HTML into a full document if needed
    const isFullDoc = /<html[\s>]/i.test(html) && /<body[\s>]/i.test(html);
    const finalHtml = isFullDoc
      ? html
      : `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${(title || slug).replace(/</g, "&lt;")}</title>
</head>
<body>
${html}
</body>
</html>`;

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "cra-publisher",
    };

    const apiBase = "https://api.github.com";
    const getUrl = `${apiBase}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`;

    // 1) Check if file exists (to get sha)
    let existingSha = null;
    const getRes = await fetch(getUrl, { headers });
    if (getRes.status === 200) {
      const existing = await getRes.json();
      existingSha = existing.sha;
    } else if (getRes.status !== 404) {
      const text = await getRes.text();
      return withCors(json(502, { ok: false, step: "github_read", status: getRes.status, details: text }));
    }

    // 2) Create/update file
    const putUrl = `${apiBase}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
    const contentBase64 = Buffer.from(finalHtml, "utf8").toString("base64");

    const body = {
      message: `Publish /cra/${slug}/`,
      content: contentBase64,
      branch,
    };
    if (existingSha) body.sha = existingSha;

    const putRes = await fetch(putUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });

    if (!putRes.ok) {
      const text = await putRes.text();
      return withCors(json(502, { ok: false, step: "github_write", status: putRes.status, details: text }));
    }

    const putJson = await putRes.json();

    return withCors(
      json(200, {
        ok: true,
        path,
        url: `/cra/${slug}/`,
        commit: putJson.commit?.sha || null,
      })
    );
  } catch (err) {
    return withCors(json(500, { ok: false, error: "Server error", details: String(err) }));
  }
};
