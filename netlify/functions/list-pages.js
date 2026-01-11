// netlify/functions/list-pages.js
export default async () => {
  try {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;

    // You told me published pages live in /cra/
    const dir = "cra";

    if (!token || !owner || !repo) {
      return json(500, {
        ok: false,
        error: "Missing GitHub env vars. Need GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO."
      });
    }

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${dir}`;

    const res = await fetch(apiUrl, {
      headers: ghHeaders(token)
    });

    if (!res.ok) {
      const text = await res.text();
      return json(res.status, {
        ok: false,
        error: "GitHub list failed.",
        details: text
      });
    }

    const items = await res.json();

    // items is an array of repo contents objects
    const pages = (Array.isArray(items) ? items : [])
      .filter((x) => x && x.type === "file")
      .map((x) => {
        const slug = x.name; // filename, e.g. landing.html
        return {
          slug,
          url: `/cra/${encodeURIComponent(slug)}`,
          // optional debug fields if you ever want them:
          // path: x.path,
          // sha: x.sha
        };
      })
      .sort((a, b) => a.slug.localeCompare(b.slug));

    return json(200, { ok: true, pages });
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

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

