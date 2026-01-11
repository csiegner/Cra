// netlify/functions/gh_check.js

exports.handler = async () => {
  try {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";

    // Basic config check
    if (!token) {
      return { statusCode: 500, body: JSON.stringify({ ok: false, error: "Missing GITHUB_TOKEN" }) };
    }
    if (!owner || !repo) {
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, error: "Missing GITHUB_OWNER or GITHUB_REPO", owner, repo }),
      };
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "cra-gh-check",
    };

    // 1) Can we access the repo?
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    const repoText = await repoRes.text();

    if (!repoRes.ok) {
      return {
        statusCode: 502,
        body: JSON.stringify({
          ok: false,
          step: "repo_check",
          status: repoRes.status,
          details: repoText.slice(0, 1000),
          hint:
            repoRes.status === 404
              ? "Repo not found. Check GITHUB_OWNER and GITHUB_REPO values."
              : repoRes.status === 401 || repoRes.status === 403
              ? "Auth failed. Token may be wrong or lacks repo scope."
              : "Unexpected error from GitHub.",
        }),
      };
    }

    const repoJson = JSON.parse(repoText);

    // 2) Can we access the branch?
    const branchRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
      { headers }
    );
    const branchText = await branchRes.text();

    if (!branchRes.ok) {
      return {
        statusCode: 502,
        body: JSON.stringify({
          ok: false,
          step: "branch_check",
          status: branchRes.status,
          details: branchText.slice(0, 1000),
          hint: "Branch not accessible. Check GITHUB_BRANCH (usually main).",
        }),
      };
    }

    const branchJson = JSON.parse(branchText);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        repo: repoJson.full_name,
        private: repoJson.private,
        default_branch: repoJson.default_branch,
        branch_checked: branch,
        latest_commit_sha: branchJson.commit?.sha || null,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: "Server error", details: String(err) }),
    };
  }
};
