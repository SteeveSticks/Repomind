export type GitHubRepoInfo = {
  owner: string;
  repo: string;
  identity: string;
  canonicalUrl: string;
};

export function parseAndValidateGitHubUrl(rawUrl: string): GitHubRepoInfo {
  if (!rawUrl || typeof rawUrl !== "string") {
    throw new Error("Repository URL is required.");
  }

  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Invalid URL format.");
  }

  if (
    parsed.protocol !== "http:" &&
    parsed.protocol !== "https:"
  ) {
    throw new Error("URL must use HTTP or HTTPS protocol.");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== "github.com" && hostname !== "www.github.com") {
    throw new Error("Only public GitHub repositories are supported.");
  }

  let pathname = parsed.pathname.replace(/^\/+|\/+$/g, "");
  if (pathname.endsWith(".git")) {
    pathname = pathname.slice(0, -4);
  }

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 2) {
    throw new Error(
      "URL must match https://github.com/owner/repo without extra subdirectories.",
    );
  }

  const [owner, repo] = segments;
  const namePattern = /^[A-Za-z0-9_.-]+$/;
  if (!namePattern.test(owner) || !namePattern.test(repo)) {
    throw new Error("Invalid repository owner or name characters.");
  }

  const identity = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
  const canonicalUrl = `https://github.com/${owner}/${repo}`;

  return { owner, repo, identity, canonicalUrl };
}
