import type { APIRoute } from "astro";

export const prerender = false;

// In-memory cache, 1 hour TTL
const cache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL = 3600_000;

function formatCompact(num: number): string {
    return Intl.NumberFormat("en-us", {
        notation: "compact",
        maximumFractionDigits: 1,
    })
        .format(num)
        .replaceAll(" ", "");
}

async function fetchRepoInfo(owner: string, repo: string) {
    const key = `${owner}/${repo}`;

    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const headers: Record<string, string> = {
        "User-Agent": "Astro-GitHub-Card/1.0",
        Accept: "application/vnd.github.v3+json",
    };

    const token = import.meta.env.GITHUB_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
        if (!res.ok) return { error: `GitHub API ${res.status}` };

        const j = await res.json();
        const data = {
            description: j.description?.replace(/:[a-zA-Z0-9_]+:/g, "") || "",
            language: j.language || "",
            stars: formatCompact(j.stargazers_count || 0),
            forks: formatCompact(j.forks || 0),
            license: j.license?.spdx_id || "",
            avatarUrl: j.owner?.avatar_url || "",
        };

        cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
        return data;
    } catch (err: any) {
        return { error: err.message };
    }
}

export const GET: APIRoute = async ({ params }) => {
    const slug = params.slug;
    if (!slug || typeof slug !== "string") {
        return new Response(JSON.stringify({ error: "Missing repo path" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    const [owner, repo] = slug.split("/");
    if (!owner || !repo) {
        return new Response(JSON.stringify({ error: 'Path must be "owner/repo"' }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    const data = await fetchRepoInfo(owner, repo);

    return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=3600, s-maxage=7200",
        },
    });
};
