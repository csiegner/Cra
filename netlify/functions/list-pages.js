export default async (request, context) => {
  try {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const dir = process.env.GITHUB_PAGES_DIR || "cra/ai";

    if (!token || !owner || !repo) {
      return new Response(JSON.stringify({ error: "Missing GitHub env vars" }), { status: 500 });
    }

    // List directory contents
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${dir}`;
    const res = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "cra-publisher"
      }
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: "GitHub list failed", details: text }), { status: res.status });
    }

    const items = await res.json();

    // Only return files (not subdirs)
    const files = (Array.isArray(items) ? items : [])
      .filter((x) => x.type === "file")
      .map((x) => ({
        name: x.name,
        path: x.path,
        sha: x.sha,
        size: x.size,
        download_url: x.download_url
      }));

    return new Response(JSON.stringify({ dir, files }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Unexpected error", details: String(err) }), { status: 500 });
  }
};
