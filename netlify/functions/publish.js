const crypto = require("crypto");

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(obj),
  };
}

function sha1(content) {
  return crypto.createHash("sha1").update(content).digest("hex");
}

function isValidSlug(slug) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 60;
}

function basicHtmlRiskCheck(html) {
  const s = String(html || "").toLowerCase();
  const blocked = [
    "<script",
    "javascript:",
    "onerror=",
    "onclick=",
    "onload=",
    "<iframe",
  ];
  const hit = blocked.find((x) => s.includes(x));
  return hit ? `Blocked content detected: ${hit}` : null;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

    // Netlify Identity user context
    const user = event.clientContext && event.clientContext.user;
    if (!user) return json(401, { error: "Unauthorized" });

    const roles = (user.app_metadata && user.app_metadata.roles) || [];
    if (!roles.includes("admin")) return json(403, { error: "Forbidden, missing admin role" });

    const { slug, html } = JSON.parse(event.body || "{}");
    if (!slug || !html) return json(400, { error: "Missing slug or html" });
    if (!isValidSlug(slug)) return json(400, { error: "Invalid slug" });

    const risk = basicHtmlRiskCheck(html);
    if (risk) return json(400, { error: risk });

    const token = process.env.NETLIFY_AUTH_TOKEN;
    const siteId = process.env.NETLIFY_SITE_ID;
    if (!token || !siteId) {
      return json(500, { error: "Missing NETLIFY_AUTH_TOKEN or NETLIFY_SITE_ID env vars" });
    }

    // Publish under /cra/<slug>/
    const filePath = `cra/${slug}/index.html`;
    const fileSha = sha1(html);

    // Create a deploy with this one file
    const createDeployResp = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        files: {
          [filePath]: fileSha,
        },
      }),
    });

    const deploy = await createDeployResp.json();
    if (!createDeployResp.ok) {
      return json(createDeployResp.status, { error: "Failed to create deploy", details: deploy });
    }

    // Upload the file
    const uploadResp = await fetch(
      `https://api.netlify.com/api/v1/deploys/${deploy.id}/files/${encodeURIComponent(filePath)}`,
      {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "text/html; charset=utf-8",
        },
        body: html,
      }
    );

    if (!uploadResp.ok) {
      const details = await uploadResp.text().catch(() => "");
      return json(uploadResp.status, { error: "Failed to upload file", details });
    }

    const publicUrl = (deploy.ssl_url || deploy.url || "").replace(/\/$/, "");
    return json(200, {
      ok: true,
      url: `${publicUrl}/cra/${slug}/`,
      deploy_id: deploy.id,
    });
  } catch (err) {
    return json(500, { error: "Publish crashed", details: String(err && err.message ? err.message : err) });
  }
};
