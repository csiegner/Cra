// netlify/functions/list-pages.js
export default async () => {
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

    const apiDirUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${dir}`;
    const res = await fetch(apiDirUrl, { headers: ghHeaders(token) });

    if (!res.ok) {
      const text = await res.text();
      return json(res.status, { ok: false, error: "GitHub list failed.", details: text });
    }

    const items = await res.json();
    const contents = Array.isArray(items) ? items : [];

    // 1) Flat files directly under /cra
    const filePages = contents
      .filter((x) => x && x.type === "file")
      .map((x) => ({
        slug: x.name,
        url: `/cra/${encodeURIComponent(x.name)}`
      }));

    // 2) Folder pages under /cra/<folder>/index.html
    const dirs = contents.filter((x) => x && x.type === "dir");

    const dirPages = [];
    for (const d of dirs) {
      const folder = d.name;
      const indexPath = `${dir}/${folder}/index.html`;
      const indexUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${indexPath}`;

      const check = await fetch(indexUrl, { headers: ghHeaders(token) });
      if (check.ok) {
        dirPages.push({
          slug: folder,
          url: `/cra/${encodeURIComponent(folder)}/`
        });
      }
    }

    const pages = [...dirPages, ...filePages].sort((a, b) => a.slug.localeCompare(b.slug));

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
