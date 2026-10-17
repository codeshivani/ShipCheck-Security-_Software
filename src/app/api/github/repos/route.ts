import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const UsernameSchema = z.string().trim().regex(/^[A-Za-z0-9-]{1,39}$/, "Enter a valid GitHub username.");

type GitHubRepo = { id: number; name: string; full_name: string; html_url: string; description: string | null; language: string | null; stargazers_count: number; forks_count: number; updated_at: string; private: boolean; fork: boolean; archived: boolean; default_branch: string };

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username") ?? "";
  const parsed = UsernameSchema.safeParse(username);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid GitHub username." }, { status: 400 });
  const repos: GitHubRepo[] = [];
  try {
    for (let page = 1; page <= 3; page += 1) {
      const url = `https://api.github.com/users/${encodeURIComponent(parsed.data)}/repos?per_page=100&page=${page}&sort=updated&direction=desc&type=owner`;
      const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "ShipCheck" };
      if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      const response = await fetch(url, { headers, next: { revalidate: 60 } });
      if (response.status === 404) return NextResponse.json({ error: `GitHub profile “${parsed.data}” was not found.` }, { status: 404 });
      if (!response.ok) {
        const remaining = response.headers.get("x-ratelimit-remaining");
        const detail = response.status === 403 && remaining === "0" ? "GitHub's public API rate limit has been reached. Please try again later or configure a GitHub token." : `GitHub returned ${response.status}.`;
        return NextResponse.json({ error: detail }, { status: 502 });
      }
      const pageRepos = (await response.json()) as GitHubRepo[];
      repos.push(...pageRepos); if (pageRepos.length < 100) break;
    }
    const unique = Array.from(new Map(repos.map(repo => [repo.id, repo])).values());
    const publicRepos = unique.filter(repo => !repo.private && !repo.archived);
    return NextResponse.json({ username: parsed.data, count: publicRepos.length, repositories: publicRepos });
  } catch (error) { console.error("GitHub repository lookup failed:", error); return NextResponse.json({ error: "Unable to reach GitHub right now. Please try again." }, { status: 502 }); }
}
