import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "./helpers";

// --- bundlesocial mock -------------------------------------------------------

const mocks = vi.hoisted(() => {
  const client = {
    app: { appGetHealth: vi.fn() },
    organization: {
      organizationGetOrganization: vi.fn(),
      organizationGetPostsUsage: vi.fn(),
      organizationGetCommentsUsage: vi.fn(),
      organizationGetUploadsUsage: vi.fn(),
    },
    team: { teamGetTeam: vi.fn() },
    post: {
      postCreate: vi.fn(),
      postGetList: vi.fn(),
      postGet: vi.fn(),
      postDelete: vi.fn(),
      postUpdate: vi.fn(),
      postRetry: vi.fn(),
    },
    comment: {
      commentCreate: vi.fn(),
      commentGetList: vi.fn(),
      commentGet: vi.fn(),
      commentDelete: vi.fn(),
    },
    analytics: {
      analyticsGetPostAnalytics: vi.fn(),
      analyticsGetSocialAccountAnalytics: vi.fn(),
    },
    upload: {
      uploadCreate: vi.fn(),
      uploadCreateFromUrl: vi.fn(),
    },
    misc: {
      miscRedditGetSubredditFlairs: vi.fn(),
      miscYoutubeGetVideoCategories: vi.fn(),
      miscLinkedinGetTags: vi.fn(),
    },
  };
  return { client };
});

vi.mock("bundlesocial", () => {
  class ApiError extends Error {
    status: number;
    statusText: string;
    body: unknown;
    url: string;
    request: unknown;
    constructor(status: number, body: unknown, statusText = "Error") {
      super(typeof body === "string" ? body : statusText);
      this.name = "ApiError";
      this.status = status;
      this.statusText = statusText;
      this.body = body;
      this.url = "https://api.bundle.social/test";
      this.request = {};
    }
  }
  return {
    Bundlesocial: vi.fn(() => mocks.client),
    OpenAPI: { BASE: "https://api.bundle.social" },
    ApiError,
  };
});

const client = mocks.client;

// --- shared fixtures ---------------------------------------------------------

const TEAM = {
  id: "team_test",
  name: "Test Team",
  organizationId: "org_test",
  socialAccounts: [
    { id: "acc_tw", type: "TWITTER", username: "acme", displayName: "Acme", channels: [] },
    { id: "acc_ig", type: "INSTAGRAM", username: "acme.ig", displayName: "Acme IG", channels: [] },
  ],
};

const ORG = { id: "org_test", name: "Acme", apiAccess: true, teams: [{ id: "team_test", name: "Test Team" }] };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BUNDLESOCIAL_API_KEY = "test-key";
  process.env.BUNDLESOCIAL_TEAM_ID = "team_test";
  delete process.env.BUNDLESOCIAL_API_URL;
  client.organization.organizationGetOrganization.mockResolvedValue(ORG);
  client.team.teamGetTeam.mockResolvedValue(TEAM);
});

afterEach(() => {
  delete process.env.BUNDLESOCIAL_API_KEY;
  delete process.env.BUNDLESOCIAL_TEAM_ID;
});

// --- meta --------------------------------------------------------------------

describe("meta", () => {
  it("prints the version", async () => {
    const { stdout, exitCode } = await runCli(["--version"]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("prints help listing every command", async () => {
    const { stdout, exitCode } = await runCli(["--help"]);
    expect(exitCode).toBe(0);
    for (const command of [
      "integrations:list",
      "posts:create",
      "posts:schedule",
      "posts:list",
      "posts:get",
      "posts:delete",
      "media:upload",
      "analytics:post",
      "analytics:summary",
      "doctor",
    ]) {
      expect(stdout).toContain(command);
    }
  });

  it("reports a missing API key as an error envelope", async () => {
    delete process.env.BUNDLESOCIAL_API_KEY;
    const { json, exitCode } = await runCli(["integrations:list"]);
    expect(exitCode).toBe(1);
    expect(json).toMatchObject({ error: { code: "MISSING_API_KEY" } });
    expect((json as { error: { details: { dashboardUrl: string } } }).error.details.dashboardUrl).toContain("bundle.social");
  });

  it("normalizes an API error from the SDK", async () => {
    const { ApiError } = await import("bundlesocial");
    // @ts-expect-error the bundlesocial mock's ApiError takes (status, body, statusText?)
    client.post.postGet.mockRejectedValueOnce(new ApiError(404, { message: "Post not found" }, "Not Found"));
    const { json, exitCode } = await runCli(["posts:get", "post_missing"]);
    expect(exitCode).toBe(1);
    expect(json).toMatchObject({ error: { code: "HTTP_404", message: "Post not found" } });
  });
});

// --- integrations ------------------------------------------------------------

describe("integrations:list", () => {
  it("lists the team's integrations", async () => {
    const { json, exitCode, stdout } = await runCli(["integrations:list"]);
    expect(exitCode).toBe(0);
    expect(client.team.teamGetTeam).toHaveBeenCalledWith({ id: "team_test" });
    expect(json).toMatchObject({
      teamId: "team_test",
      teamName: "Test Team",
      integrations: [
        { id: "acc_tw", type: "TWITTER", username: "acme" },
        { id: "acc_ig", type: "INSTAGRAM" },
      ],
    });
    // stdout is exactly one JSON object
    expect(() => JSON.parse(stdout)).not.toThrow();
  });

  it("falls back to the only team when no team id is set", async () => {
    delete process.env.BUNDLESOCIAL_TEAM_ID;
    const { exitCode } = await runCli(["integrations:list"]);
    expect(exitCode).toBe(0);
    expect(client.organization.organizationGetOrganization).toHaveBeenCalled();
    expect(client.team.teamGetTeam).toHaveBeenCalledWith({ id: "team_test" });
  });

  it("renders a table with --pretty (stdout is not JSON)", async () => {
    const { stdout, exitCode, json } = await runCli(["integrations:list", "--pretty"]);
    expect(exitCode).toBe(0);
    expect(json).toBeUndefined();
    expect(stdout).toContain("TWITTER");
  });
});

// --- posts -------------------------------------------------------------------

describe("posts:create", () => {
  beforeEach(() => {
    client.post.postCreate.mockResolvedValue({ id: "post_1", status: "SCHEDULED", title: "Hello" });
  });

  it("creates a post for platform aliases without touching the team", async () => {
    const { json, exitCode } = await runCli(["posts:create", "-c", "Hello", "-i", "x", "-i", "bluesky"]);
    expect(exitCode).toBe(0);
    expect(client.team.teamGetTeam).not.toHaveBeenCalled();
    expect(client.post.postCreate).toHaveBeenCalledTimes(1);
    const body = client.post.postCreate.mock.calls[0][0].requestBody;
    expect(body.teamId).toBe("team_test");
    expect(body.status).toBe("SCHEDULED");
    expect(body.socialAccountTypes.sort()).toEqual(["BLUESKY", "TWITTER"]);
    expect(body.data).toMatchObject({ TWITTER: { text: "Hello" }, BLUESKY: { text: "Hello" } });
    expect(json).toMatchObject({ id: "post_1" });
  });

  it("resolves a connected integration id to its platform", async () => {
    await runCli(["posts:create", "-c", "Hi", "-i", "acc_ig"]);
    expect(client.team.teamGetTeam).toHaveBeenCalledWith({ id: "team_test" });
    const body = client.post.postCreate.mock.calls[0][0].requestBody;
    expect(body.socialAccountTypes).toEqual(["INSTAGRAM"]);
  });

  it("merges --platform-settings keyed by platform", async () => {
    await runCli([
      "posts:create",
      "-c",
      "Launch",
      "-i",
      "tiktok",
      "--platform-settings",
      '{"TIKTOK":{"privacy":"PUBLIC_TO_EVERYONE"}}',
    ]);
    const body = client.post.postCreate.mock.calls[0][0].requestBody;
    expect(body.data.TIKTOK).toMatchObject({ text: "Launch", privacy: "PUBLIC_TO_EVERYONE" });
  });

  it("uploads --media references and attaches their ids", async () => {
    client.upload.uploadCreateFromUrl.mockResolvedValue({ id: "up_1", type: "image" });
    await runCli(["posts:create", "-c", "Pic", "-i", "x", "-m", "https://example.com/a.png"]);
    expect(client.upload.uploadCreateFromUrl).toHaveBeenCalledWith({
      requestBody: { teamId: "team_test", url: "https://example.com/a.png" },
    });
    const body = client.post.postCreate.mock.calls[0][0].requestBody;
    expect(body.data.TWITTER.uploadIds).toEqual(["up_1"]);
  });

  it("creates a DRAFT with --draft", async () => {
    await runCli(["posts:create", "-c", "Later", "-i", "x", "--draft"]);
    expect(client.post.postCreate.mock.calls[0][0].requestBody.status).toBe("DRAFT");
  });

  it("errors when no target is given", async () => {
    const { json, exitCode } = await runCli(["posts:create", "-c", "Orphan"]);
    expect(exitCode).toBe(1);
    expect(json).toMatchObject({ error: { code: "NO_TARGET" } });
    expect(client.post.postCreate).not.toHaveBeenCalled();
  });

  it("errors on an unknown integration id", async () => {
    const { json, exitCode } = await runCli(["posts:create", "-c", "x", "-i", "acc_nope"]);
    expect(exitCode).toBe(1);
    expect(json).toMatchObject({ error: { code: "INTEGRATION_NOT_FOUND" } });
  });
});

describe("posts:schedule", () => {
  it("schedules a post at the given ISO date", async () => {
    client.post.postCreate.mockResolvedValue({ id: "post_2", status: "SCHEDULED" });
    const { json, exitCode } = await runCli(["posts:schedule", "-c", "Soon", "-i", "linkedin", "-d", "2026-06-01T09:00:00Z"]);
    expect(exitCode).toBe(0);
    const body = client.post.postCreate.mock.calls[0][0].requestBody;
    expect(body.status).toBe("SCHEDULED");
    expect(body.postDate).toBe("2026-06-01T09:00:00.000Z");
    expect(body.socialAccountTypes).toEqual(["LINKEDIN"]);
    expect(json).toMatchObject({ id: "post_2" });
  });

  it("rejects an invalid date", async () => {
    const { json, exitCode } = await runCli(["posts:schedule", "-c", "Soon", "-i", "x", "-d", "not-a-date"]);
    expect(exitCode).toBe(1);
    expect(json).toMatchObject({ error: { code: "INVALID_DATE" } });
  });
});

describe("posts:list", () => {
  it("lists posts with filters", async () => {
    client.post.postGetList.mockResolvedValue({ items: [{ id: "post_1", title: "A", status: "POSTED" }] });
    const { json, exitCode } = await runCli(["posts:list", "--status", "posted", "--limit", "5", "--platform", "x"]);
    expect(exitCode).toBe(0);
    expect(client.post.postGetList).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: "team_test", limit: 5, status: "POSTED", platforms: ["TWITTER"] }),
    );
    expect(json).toMatchObject({ items: [{ id: "post_1" }] });
  });
});

describe("posts:get / posts:delete", () => {
  it("gets a post by id", async () => {
    client.post.postGet.mockResolvedValue({ id: "post_9", title: "Nine" });
    const { json } = await runCli(["posts:get", "post_9"]);
    expect(client.post.postGet).toHaveBeenCalledWith({ id: "post_9" });
    expect(json).toMatchObject({ id: "post_9" });
  });

  it("deletes a post by id", async () => {
    client.post.postDelete.mockResolvedValue({ id: "post_9" });
    const { json } = await runCli(["posts:delete", "post_9"]);
    expect(client.post.postDelete).toHaveBeenCalledWith({ id: "post_9" });
    expect(json).toMatchObject({ id: "post_9" });
  });
});

// --- media -------------------------------------------------------------------

describe("media:upload", () => {
  it("uploads from a URL", async () => {
    client.upload.uploadCreateFromUrl.mockResolvedValue({ id: "up_url", type: "image", url: "https://cdn/x" });
    const { json, exitCode } = await runCli(["media:upload", "https://example.com/banner.png"]);
    expect(exitCode).toBe(0);
    expect(client.upload.uploadCreateFromUrl).toHaveBeenCalledWith({
      requestBody: { teamId: "team_test", url: "https://example.com/banner.png" },
    });
    expect(json).toMatchObject({ id: "up_url" });
  });

  it("uploads a local file", async () => {
    client.upload.uploadCreate.mockResolvedValue({ id: "up_file", type: "image" });
    const file = path.join(os.tmpdir(), `bundlesocial-cli-test-${Date.now()}.png`);
    await fs.writeFile(file, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    try {
      const { json, exitCode } = await runCli(["media:upload", file]);
      expect(exitCode).toBe(0);
      expect(client.upload.uploadCreate).toHaveBeenCalledTimes(1);
      const arg = client.upload.uploadCreate.mock.calls[0][0];
      expect(arg.formData.teamId).toBe("team_test");
      expect(arg.formData.file).toBeInstanceOf(File);
      expect((arg.formData.file as File).type).toBe("image/png");
      expect(json).toMatchObject({ id: "up_file" });
    } finally {
      await fs.rm(file, { force: true });
    }
  });

  it("errors when the local file does not exist", async () => {
    const { json, exitCode } = await runCli(["media:upload", "/no/such/file.png"]);
    expect(exitCode).toBe(1);
    expect(json).toMatchObject({ error: { code: "MEDIA_NOT_FOUND" } });
  });
});

// --- analytics ---------------------------------------------------------------

describe("analytics:post", () => {
  it("fetches post analytics", async () => {
    client.analytics.analyticsGetPostAnalytics.mockResolvedValue({ post: { id: "post_1" }, items: [] });
    const { json, exitCode } = await runCli(["analytics:post", "post_1", "--platform", "instagram"]);
    expect(exitCode).toBe(0);
    expect(client.analytics.analyticsGetPostAnalytics).toHaveBeenCalledWith({ postId: "post_1", platformType: "INSTAGRAM" });
    expect(json).toMatchObject({ post: { id: "post_1" } });
  });
});

describe("analytics:summary", () => {
  it("composes an org-level summary", async () => {
    client.organization.organizationGetPostsUsage.mockResolvedValue({ used: 12, limit: 10000, remaining: 9988 });
    client.organization.organizationGetCommentsUsage.mockResolvedValue({ used: 0, limit: 100, remaining: 100 });
    client.organization.organizationGetUploadsUsage.mockResolvedValue({ used: 3, limit: 1000, remaining: 997 });
    client.analytics.analyticsGetSocialAccountAnalytics.mockResolvedValue({
      socialAccount: { id: "acc_ig", type: "INSTAGRAM" },
      items: [{ id: "a1", followers: 1000, likes: 50, comments: 4, createdAt: "2026-05-10T00:00:00Z" }],
    });
    const { json, exitCode } = await runCli(["analytics:summary"]);
    expect(exitCode).toBe(0);
    const result = json as {
      organization: { id: string };
      usage: { posts: { used: number } };
      integrations: Array<{ type: string; latest?: { followers: number }; note?: string }>;
    };
    expect(result.organization.id).toBe("org_test");
    expect(result.usage.posts.used).toBe(12);
    const twitter = result.integrations.find((i) => i.type === "TWITTER");
    const instagram = result.integrations.find((i) => i.type === "INSTAGRAM");
    expect(twitter?.note).toMatch(/not available/i); // TWITTER has no analytics surface
    expect(instagram?.latest?.followers).toBe(1000);
    // analytics is only requested for analytics-capable platforms
    expect(client.analytics.analyticsGetSocialAccountAnalytics).toHaveBeenCalledWith({ teamId: "team_test", platformType: "INSTAGRAM" });
  });
});

// --- doctor ------------------------------------------------------------------

describe("doctor", () => {
  it("reports a healthy setup", async () => {
    client.app.appGetHealth.mockResolvedValue({ status: "ok", createdAt: "2026-05-12T00:00:00Z" });
    client.organization.organizationGetPostsUsage.mockResolvedValue({ used: 1, limit: 10000, remaining: 9999 });
    const { json, exitCode } = await runCli(["doctor"]);
    expect(exitCode).toBe(0);
    const result = json as { ok: boolean; checks: Array<{ name: string; status: string }> };
    expect(result.ok).toBe(true);
    const names = result.checks.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(["api_key", "api_reachable", "authentication", "api_access", "team", "integrations", "posts_quota"]));
  });

  it("fails when the API key is missing", async () => {
    delete process.env.BUNDLESOCIAL_API_KEY;
    const { json, exitCode } = await runCli(["doctor"]);
    expect(exitCode).toBe(1);
    const result = json as { ok: boolean; checks: Array<{ name: string; status: string }> };
    expect(result.ok).toBe(false);
    expect(result.checks[0]).toMatchObject({ name: "api_key", status: "fail" });
  });

  it("fails when the API rejects the key", async () => {
    client.app.appGetHealth.mockResolvedValue({ status: "ok" });
    const { ApiError } = await import("bundlesocial");
    // @ts-expect-error the bundlesocial mock's ApiError takes (status, body, statusText?)
    client.organization.organizationGetOrganization.mockRejectedValueOnce(new ApiError(401, { message: "Unauthorized" }, "Unauthorized"));
    const { json, exitCode } = await runCli(["doctor"]);
    expect(exitCode).toBe(1);
    const result = json as { ok: boolean; checks: Array<{ name: string; status: string }> };
    expect(result.checks.find((c) => c.name === "authentication")).toMatchObject({ status: "fail" });
  });
});

// --- posts:update / posts:retry ----------------------------------------------

describe("posts:update", () => {
  it("updates only the fields passed", async () => {
    client.post.postUpdate.mockResolvedValue({ id: "post_1", title: "New title", status: "DRAFT" });
    const { json, exitCode } = await runCli(["posts:update", "post_1", "--title", "New title", "--status", "draft"]);
    expect(exitCode).toBe(0);
    expect(client.post.postUpdate).toHaveBeenCalledWith({ id: "post_1", requestBody: { title: "New title", status: "DRAFT" } });
    expect(json).toMatchObject({ id: "post_1" });
  });

  it("reuses the post's platforms when changing content without -i/-p", async () => {
    client.post.postGet.mockResolvedValue({ id: "post_1", data: { TWITTER: { text: "old" } } });
    client.post.postUpdate.mockResolvedValue({ id: "post_1" });
    await runCli(["posts:update", "post_1", "-c", "new text"]);
    expect(client.post.postGet).toHaveBeenCalledWith({ id: "post_1" });
    const body = client.post.postUpdate.mock.calls[0][0].requestBody;
    expect(body.socialAccountTypes).toEqual(["TWITTER"]);
    expect(body.data).toMatchObject({ TWITTER: { text: "new text" } });
  });

  it("errors when nothing is changed", async () => {
    const { json, exitCode } = await runCli(["posts:update", "post_1"]);
    expect(exitCode).toBe(1);
    expect(json).toMatchObject({ error: { code: "NOTHING_TO_UPDATE" } });
  });
});

describe("posts:retry", () => {
  it("retries a post", async () => {
    client.post.postRetry.mockResolvedValue({ id: "post_1", status: "RETRYING" });
    const { json } = await runCli(["posts:retry", "post_1"]);
    expect(client.post.postRetry).toHaveBeenCalledWith({ id: "post_1" });
    expect(json).toMatchObject({ id: "post_1" });
  });
});

// --- posts:create --data-file ------------------------------------------------

describe("posts:create --data-file", () => {
  it("reads the post data object from a JSON file", async () => {
    client.post.postCreate.mockResolvedValue({ id: "post_df", status: "SCHEDULED" });
    const file = path.join(os.tmpdir(), `bundlesocial-cli-data-${Date.now()}.json`);
    await fs.writeFile(file, JSON.stringify({ REDDIT: { sr: "r/test", text: "hi", uploadIds: [] } }));
    try {
      const { json, exitCode } = await runCli(["posts:create", "--data-file", file]);
      expect(exitCode).toBe(0);
      const body = client.post.postCreate.mock.calls[0][0].requestBody;
      expect(body.socialAccountTypes).toEqual(["REDDIT"]);
      expect(body.data).toEqual({ REDDIT: { sr: "r/test", text: "hi", uploadIds: [] } });
      expect(json).toMatchObject({ id: "post_df" });
    } finally {
      await fs.rm(file, { force: true });
    }
  });

  it("errors when the data file is missing", async () => {
    const { json, exitCode } = await runCli(["posts:create", "--data-file", "/no/such/data.json"]);
    expect(exitCode).toBe(1);
    expect(json).toMatchObject({ error: { code: "FILE_NOT_FOUND" } });
  });
});

// --- comments ----------------------------------------------------------------

describe("comments:create", () => {
  it("posts a single comment, defaulting platforms to the post's", async () => {
    client.post.postGet.mockResolvedValue({ id: "post_1", data: { TWITTER: { text: "x" }, REDDIT: { sr: "r/x", text: "y" } } });
    client.comment.commentCreate.mockResolvedValue({ id: "cmt_1", status: "SCHEDULED" });
    const { json, exitCode } = await runCli(["comments:create", "--post-id", "post_1", "-c", "Nice work!"]);
    expect(exitCode).toBe(0);
    expect(client.comment.commentCreate).toHaveBeenCalledTimes(1);
    const body = client.comment.commentCreate.mock.calls[0][0].requestBody;
    expect(body.internalPostId).toBe("post_1");
    // TWITTER is filtered out (not comment-capable); REDDIT stays
    expect(body.socialAccountTypes).toEqual(["REDDIT"]);
    expect(body.data).toMatchObject({ REDDIT: { text: "Nice work!" } });
    expect(json).toMatchObject({ id: "cmt_1" });
  });

  it("creates a chain of comments, threading each reply under the previous", async () => {
    client.comment.commentCreate
      .mockResolvedValueOnce({ id: "cmt_1" })
      .mockResolvedValueOnce({ id: "cmt_2" })
      .mockResolvedValueOnce({ id: "cmt_3" });
    const { json, exitCode } = await runCli([
      "comments:create",
      "--post-id",
      "post_1",
      "-i",
      "linkedin",
      "-c",
      "one",
      "-c",
      "two",
      "-c",
      "three",
    ]);
    expect(exitCode).toBe(0);
    expect(client.comment.commentCreate).toHaveBeenCalledTimes(3);
    expect(client.comment.commentCreate.mock.calls[0][0].requestBody.internalParentCommentId).toBeUndefined();
    expect(client.comment.commentCreate.mock.calls[1][0].requestBody.internalParentCommentId).toBe("cmt_1");
    expect(client.comment.commentCreate.mock.calls[2][0].requestBody.internalParentCommentId).toBe("cmt_2");
    expect(Array.isArray(json)).toBe(true);
    expect((json as Array<{ id: string }>).map((c) => c.id)).toEqual(["cmt_1", "cmt_2", "cmt_3"]);
  });

  it("rejects a non-comment-capable platform", async () => {
    const { json, exitCode } = await runCli(["comments:create", "--post-id", "post_1", "-i", "pinterest", "-c", "hi"]);
    expect(exitCode).toBe(1);
    expect(json).toMatchObject({ error: { code: "COMMENTS_NOT_SUPPORTED" } });
  });
});

describe("comments:list / get / delete", () => {
  it("lists comments for a post", async () => {
    client.comment.commentGetList.mockResolvedValue({ items: [{ id: "cmt_1" }] });
    const { json } = await runCli(["comments:list", "--post-id", "post_1", "--status", "posted"]);
    expect(client.comment.commentGetList).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: "team_test", postId: "post_1", status: "POSTED", limit: 20 }),
    );
    expect(json).toMatchObject({ items: [{ id: "cmt_1" }] });
  });

  it("gets and deletes a comment by id", async () => {
    client.comment.commentGet.mockResolvedValue({ id: "cmt_9" });
    client.comment.commentDelete.mockResolvedValue({ id: "cmt_9" });
    await runCli(["comments:get", "cmt_9"]);
    expect(client.comment.commentGet).toHaveBeenCalledWith({ id: "cmt_9" });
    await runCli(["comments:delete", "cmt_9"]);
    expect(client.comment.commentDelete).toHaveBeenCalledWith({ id: "cmt_9" });
  });
});

// --- integrations:tools / trigger --------------------------------------------

describe("integrations:tools / integrations:trigger", () => {
  it("lists the available helper tools", async () => {
    const { json, exitCode } = await runCli(["integrations:tools"]);
    expect(exitCode).toBe(0);
    const methods = (json as { tools: Array<{ method: string }> }).tools.map((t) => t.method);
    expect(methods).toEqual(expect.arrayContaining(["reddit:flairs", "youtube:categories", "linkedin:mentions"]));
  });

  it("triggers a helper tool with params", async () => {
    client.misc.miscRedditGetSubredditFlairs.mockResolvedValue([{ id: "flair_1", text: "Discussion" }]);
    const { json, exitCode } = await runCli(["integrations:trigger", "reddit:flairs", "--data", '{"subreddit":"r/test"}']);
    expect(exitCode).toBe(0);
    expect(client.misc.miscRedditGetSubredditFlairs).toHaveBeenCalledWith({ teamId: "team_test", subreddit: "r/test" });
    expect(json).toEqual([{ id: "flair_1", text: "Discussion" }]);
  });

  it("errors on a required param missing", async () => {
    const { json, exitCode } = await runCli(["integrations:trigger", "reddit:flairs"]);
    expect(exitCode).toBe(1);
    expect(json).toMatchObject({ error: { code: "MISSING_PARAMS" } });
  });

  it("errors on an unknown tool", async () => {
    const { json, exitCode } = await runCli(["integrations:trigger", "bogus:thing"]);
    expect(exitCode).toBe(1);
    expect(json).toMatchObject({ error: { code: "UNKNOWN_INTEGRATION_TOOL" } });
  });
});
