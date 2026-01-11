export default async (request, context) => {
  try {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;

    if (!token || !owner || !repo) {
      return new Response(JSON.stringify({ error: "Missing GitHub env vars" }), { status: 500 });
    }

    const body = await request.json();
    const { path, sha, message } = body || {};

    if (!path || !sha) {
      return new Response(JSON.stringify({ error: "Missing path or sha" }), { status: 400 });
    }

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const res = await fetch(apiUrl, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "cra-publisher"
      },
      body: JSON.stringify({
        message: message || `Delete ${path}`,
        sha
      })
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: "GitHub delete failed", details: text }), { status: res.status });
    }

    return new Response(JSON.stringify({ ok: true, path }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Unexpected error", details: String(err) }), { status: 500 });
  }
};
