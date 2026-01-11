// netlify/functions/publish.js
exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { slug, html } = JSON.parse(event.body || "{}");

    // Validate slug
    const slugOk = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || "");
    if (!slugOk) {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid slug" }) };
    }
    if (!html || html.length < 20) {
      return { statusCode: 400, body: JSON.stringify({ error: "HTML is empty" }) };
    }

    // Required env vars
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";

    if (!token || !owner || !repo) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing GitHub environment variables" }),
      };
    }

    const path = `cra/${slug}/index.html`;
    const apiBase = "https://api.github.com";

    // GitHub wants base64 content
    const contentBase64 = Buffer.from(html, "utf8").toString("base64");

    // 1) Check if the file already exists to get its sha (update vs create)
    const getUrl = `${apiBase}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`;
    const headers = {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "User-Agent": "cra-publisher-netlify-function"
    };

    let existingSha = null;
    const getRes = await fetch(getUrl, { headers });

    if (getRes.status === 200) {
      const existing = await getRes.json();
      existingSha = existing.sha;
    } else if (getRes.status !== 404) {
      const text = await getRes.text();
      return { statusCode: 502, body: JSON.stringify({ error: "GitHub read failed", details: text }) };
    }

    // 2) Create or update the file
    const putUrl = `${apiBase}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
    const body = {
      message: `Publish /cra/${slug}/`,
      content: contentBase64,
      branch
    };
    if (existingSha) body.sha = existingSha;

    const putRes = await fetch(putUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify(body)
    });

    if (!putRes.ok) {
      const text = await putRes.text();
      return { statusCode: 502, body: JSON.stringify({ error: "GitHub write failed", details: text }) };
    }

    const putJson = await putRes.json();

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        path,
        commit: putJson.commit?.sha || null,
        url: `/cra/${slug}/`
      })
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server error", details: String(err) }) };
  }
};
