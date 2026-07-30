import type { Command } from "commander";
import type {
  SocialAccountConnectData,
  SocialAccountCopyData,
  SocialAccountCreatePortalLinkData,
  SocialAccountGetByTypeData,
  SocialAccountRefreshChannelsData,
  SocialAccountSetChannelData,
} from "bundlesocial";
import { safeAction } from "../program";
import { createContext, resolveExplicitTeamId, resolveTeamId, type CliContext } from "../context";
import { CliError, emitResult } from "../output";
import { parseJsonObject, resolveDataArgument } from "../post-data";
import { normalizePlatform } from "../platforms";
import { listIntegrationTools, runIntegrationTool } from "../integration-tools";

type AnyPlatform = SocialAccountGetByTypeData["type"];
type ChannelPlatform = NonNullable<SocialAccountSetChannelData["requestBody"]>["type"];
type RefreshChannelsPlatform = NonNullable<SocialAccountRefreshChannelsData["requestBody"]>["type"];
type ConnectBody = NonNullable<SocialAccountConnectData["requestBody"]>;
type PortalLinkBody = NonNullable<SocialAccountCreatePortalLinkData["requestBody"]>;
type CopyBody = NonNullable<SocialAccountCopyData["requestBody"]>;

type SocialAccount = {
  id: string;
  type: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  channels?: Array<{ id: string; name?: string | null; username?: string | null; address?: string | null }> | null;
};

function mapAccounts(accounts: SocialAccount[] | undefined) {
  return (accounts ?? []).map((account) => ({
    id: account.id,
    type: account.type,
    username: account.username ?? null,
    displayName: account.displayName ?? null,
    avatarUrl: account.avatarUrl ?? null,
    channels: (account.channels ?? []).map((channel) => ({
      id: channel.id,
      name: channel.name ?? null,
      username: channel.username ?? null,
      address: channel.address ?? null,
    })),
  }));
}

async function listForTeam(ctx: CliContext, teamId: string) {
  const team = await ctx.client.team.teamGetTeam({ id: teamId });
  return { teamId: team.id, teamName: team.name, integrations: mapAccounts(team.socialAccounts) };
}

export function registerIntegrationsCommands(program: Command): void {
  program
    .command("integrations:list")
    .description("List connected social-media integrations (accounts). Scoped to --team-id / BUNDLESOCIAL_TEAM_ID when set, otherwise the whole organization.")
    .action(
      safeAction(async (_opts: unknown, command: Command) => {
        const globalOptions = command.optsWithGlobals();
        const ctx = createContext(globalOptions);

        const explicitTeamId = resolveExplicitTeamId(globalOptions);
        if (explicitTeamId) {
          emitResult(await listForTeam(ctx, explicitTeamId), ctx.pretty);
          return;
        }

        const organization = await ctx.client.organization.organizationGetOrganization();
        const teams = organization.teams ?? [];
        if (teams.length === 1) {
          emitResult(await listForTeam(ctx, teams[0].id), ctx.pretty);
          return;
        }

        const perTeam = [];
        for (const team of teams) {
          perTeam.push(await listForTeam(ctx, team.id));
        }
        emitResult({ organizationId: organization.id, organizationName: organization.name, teams: perTeam }, ctx.pretty);
      }),
    );

  program
    .command("integrations:tools")
    .summary("list available platform helper tools")
    .description(
      "List the read-only platform helper tools you can call with `integrations:trigger` — e.g. fetch subreddit flairs, YouTube categories/playlists, LinkedIn mentions, Instagram locations, Google Business categories, TikTok trending music. Each entry shows its method id and the params it accepts.",
    )
    .action(
      safeAction(async (_opts: unknown, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        emitResult({ tools: listIntegrationTools() }, ctx.pretty);
      }),
    );

  program
    .command("integrations:trigger")
    .summary("call a platform helper tool")
    .description(
      "Call one of the platform helper tools (see `integrations:tools`) — for example `integrations:trigger reddit:flairs --data '{\"subreddit\":\"r/test\"}'`. Returns the raw result. Use it to discover values the API needs (flair ids, YouTube category ids, LinkedIn mention URNs, locations, etc.).",
    )
    .argument("<method>", "tool method id, e.g. reddit:flairs (run `integrations:tools` to list them)")
    .option("--data <json>", "JSON object of parameters for the tool, e.g. '{\"subreddit\":\"r/test\"}'")
    .action(
      safeAction(async (method: string, opts: { data?: string }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const teamId = await resolveTeamId(ctx);
        const params = opts.data ? parseJsonObject(opts.data, "--data") : {};
        emitResult(await runIntegrationTool(ctx.client, teamId, method, params), ctx.pretty);
      }),
    );

  program
    .command("integrations:connect")
    .summary("start connecting a social account (get an OAuth URL)")
    .description(
      "Generate the OAuth URL for connecting a social account to the team. Redirect the user to the returned `url` to complete the connection. For Mastodon/Bluesky pass --server-url.",
    )
    .requiredOption("-p, --platform <platform>", "platform to connect (e.g. x, instagram, tiktok)")
    .requiredOption("--redirect-url <url>", "URL the user is sent back to after connecting")
    .option("--server-url <url>", "Mastodon or Bluesky instance URL")
    .option("--disable-auto-login", "ask the provider to avoid automatic login / auto-approval where supported")
    .option("--tiktok-force-login", "TikTok only (experimental): force the account picker when TikTok keeps reusing the wrong active account")
    .option("--force-browser-oauth", "Instagram only: force browser login on phones")
    .option("--instagram-connection-method <method>", "Instagram only: FACEBOOK | INSTAGRAM")
    .option("--with-business-scope", "Facebook/Instagram/YouTube only: request business/ads scopes (YouTube monetization analytics)")
    .option("--data <json>", "advanced: the full request body as JSON; overrides the other options")
    .option("--data-file <path>", "advanced: read the full request body from a JSON file")
    .action(
      safeAction(
        async (
          opts: {
            platform: string;
            redirectUrl: string;
            serverUrl?: string;
            disableAutoLogin?: boolean;
            tiktokForceLogin?: boolean;
            forceBrowserOauth?: boolean;
            instagramConnectionMethod?: string;
            withBusinessScope?: boolean;
            data?: string;
            dataFile?: string;
          },
          command: Command,
        ) => {
          const ctx = createContext(command.optsWithGlobals());
          const teamId = await resolveTeamId(ctx);
          const dataArg = resolveDataArgument(opts.data, opts.dataFile);
          const requestBody: ConnectBody = dataArg
            ? (dataArg as unknown as ConnectBody)
            : {
                type: normalizePlatform(opts.platform) as ConnectBody["type"],
                teamId,
                redirectUrl: opts.redirectUrl,
                ...(opts.serverUrl ? { serverUrl: opts.serverUrl } : {}),
                ...(opts.disableAutoLogin ? { disableAutoLogin: true } : {}),
                ...(opts.tiktokForceLogin ? { tiktokForceLogin: true } : {}),
                ...(opts.forceBrowserOauth ? { forceBrowserOAuth: true } : {}),
                ...(opts.instagramConnectionMethod
                  ? { instagramConnectionMethod: opts.instagramConnectionMethod.trim().toUpperCase() as ConnectBody["instagramConnectionMethod"] }
                  : {}),
                ...(opts.withBusinessScope ? { withBusinessScope: true } : {}),
              };
          emitResult(await ctx.client.socialAccount.socialAccountConnect({ requestBody }), ctx.pretty);
        },
      ),
    );

  program
    .command("integrations:disconnect")
    .summary("disconnect a social account from the team")
    .description("Disconnect a social account of the given platform from the team. This also removes it from any scheduled posts.")
    .requiredOption("-p, --platform <platform>", "platform to disconnect")
    .action(
      safeAction(async (opts: { platform: string }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const teamId = await resolveTeamId(ctx);
        emitResult(
          await ctx.client.socialAccount.socialAccountDisconnect({
            requestBody: { type: normalizePlatform(opts.platform) as AnyPlatform, teamId },
          }),
          ctx.pretty,
        );
      }),
    );

  program
    .command("integrations:set-channel")
    .summary("select a channel/page for a social account")
    .description("Select the channel/page to post to for a social account. Needed for FACEBOOK, INSTAGRAM, LINKEDIN, YOUTUBE and GOOGLE_BUSINESS. Use --channel-id (see the account's `channels` from integrations:list).")
    .requiredOption("-p, --platform <platform>", "platform: facebook | instagram | linkedin | youtube | gbp")
    .requiredOption("--channel-id <id>", "id of the channel/page to select")
    .action(
      safeAction(async (opts: { platform: string; channelId: string }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const teamId = await resolveTeamId(ctx);
        emitResult(
          await ctx.client.socialAccount.socialAccountSetChannel({
            requestBody: { type: normalizePlatform(opts.platform) as ChannelPlatform, teamId, channelId: opts.channelId },
          }),
          ctx.pretty,
        );
      }),
    );

  program
    .command("integrations:unset-channel")
    .summary("clear the selected channel/page for a social account")
    .description("Clear the selected channel/page for a social account while keeping its authorization. Applies to FACEBOOK, INSTAGRAM, LINKEDIN, YOUTUBE and GOOGLE_BUSINESS.")
    .requiredOption("-p, --platform <platform>", "platform: facebook | instagram | linkedin | youtube | gbp")
    .action(
      safeAction(async (opts: { platform: string }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const teamId = await resolveTeamId(ctx);
        emitResult(
          await ctx.client.socialAccount.socialAccountUnsetChannel({
            requestBody: { type: normalizePlatform(opts.platform) as ChannelPlatform, teamId },
          }),
          ctx.pretty,
        );
      }),
    );

  program
    .command("integrations:refresh-channels")
    .summary("refresh the cached channels for a social account")
    .description("Refresh the list of channels stored on a social account. Needed for DISCORD, SLACK, REDDIT, PINTEREST (and FACEBOOK, INSTAGRAM, LINKEDIN, YOUTUBE, GOOGLE_BUSINESS).")
    .requiredOption("-p, --platform <platform>", "platform whose channels to refresh")
    .action(
      safeAction(async (opts: { platform: string }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const teamId = await resolveTeamId(ctx);
        emitResult(
          await ctx.client.socialAccount.socialAccountRefreshChannels({
            requestBody: { type: normalizePlatform(opts.platform) as RefreshChannelsPlatform, teamId },
          }),
          ctx.pretty,
        );
      }),
    );

  program
    .command("integrations:portal-link")
    .summary("create a hosted portal link for connecting accounts")
    .description("Create a bundle.social-hosted portal link the user can use to connect/manage social accounts without you implementing the OAuth flow. Pass --platform once per platform to offer.")
    .requiredOption("-p, --platform <platform...>", "platform to offer in the portal; repeatable")
    .option("--redirect-url <url>", "URL the user is sent back to after using the portal")
    .option("--expires-in <minutes>", "minutes until the link expires (min 5, max 2880)")
    .option(
      "--data <json>",
      "advanced: extra portal-link options as JSON, merged into the request body — branding (logoUrl, userLogoUrl, userName, goBackButtonText, hidePoweredBy, hideGoBackButton, hideUserLogo, hideUserName, hideLanguageSwitcher, showModalOnConnectSuccess, language, maxSocialAccountsConnected) and the same OAuth flags as integrations:connect (serverUrl, instagramConnectionMethod, withBusinessScope, disableAutoLogin, forceBrowserOAuth, tiktokForceLogin)",
    )
    .option("--data-file <path>", "advanced: read extra portal-link options from a JSON file")
    .action(
      safeAction(
        async (
          opts: { platform: string[]; redirectUrl?: string; expiresIn?: string; data?: string; dataFile?: string },
          command: Command,
        ) => {
          const ctx = createContext(command.optsWithGlobals());
          const teamId = await resolveTeamId(ctx);
          const extra = resolveDataArgument(opts.data, opts.dataFile) ?? {};
          const requestBody: PortalLinkBody = {
            teamId,
            socialAccountTypes: opts.platform.map((p) => normalizePlatform(p)) as PortalLinkBody["socialAccountTypes"],
            ...(opts.redirectUrl ? { redirectUrl: opts.redirectUrl } : {}),
            ...(opts.expiresIn !== undefined ? { expiresIn: Number(opts.expiresIn) } : {}),
            ...(extra as Record<string, unknown>),
          };
          emitResult(await ctx.client.socialAccount.socialAccountCreatePortalLink({ requestBody }), ctx.pretty);
        },
      ),
    );

  program
    .command("integrations:check")
    .summary("run a connection/disconnect check for a social account")
    .description("Manually run the connection/disconnect check for a social account of the given platform.")
    .requiredOption("-p, --platform <platform>", "platform to check")
    .action(
      safeAction(async (opts: { platform: string }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const teamId = await resolveTeamId(ctx);
        emitResult(
          await ctx.client.socialAccount.socialAccountConnectionCheck({
            requestBody: { type: normalizePlatform(opts.platform) as AnyPlatform, teamId },
          }),
          ctx.pretty,
        );
      }),
    );

  program
    .command("integrations:refresh-profile")
    .summary("refresh a social account's profile info")
    .description("Manually refresh the cached profile info (username, display name, avatar) for a social account of the given platform.")
    .requiredOption("-p, --platform <platform>", "platform whose profile to refresh")
    .action(
      safeAction(async (opts: { platform: string }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const teamId = await resolveTeamId(ctx);
        emitResult(
          await ctx.client.socialAccount.socialAccountProfileRefresh({
            requestBody: { type: normalizePlatform(opts.platform) as AnyPlatform, teamId },
          }),
          ctx.pretty,
        );
      }),
    );

  program
    .command("integrations:by-type")
    .summary("fetch a connected social account by platform")
    .description("Fetch the connected social account of a given platform for the team.")
    .argument("<type>", "platform name/alias (e.g. instagram, tiktok)")
    .action(
      safeAction(async (type: string, _opts: unknown, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        const teamId = await resolveTeamId(ctx);
        emitResult(
          await ctx.client.socialAccount.socialAccountGetByType({ teamId, type: normalizePlatform(type) as AnyPlatform }),
          ctx.pretty,
        );
      }),
    );

  program
    .command("integrations:copy")
    .summary("copy social accounts between teams")
    .description("Copy connected social accounts from one team to another. Pass --platform once per platform to copy; --reset-channel makes the user re-pick pages for FACEBOOK/INSTAGRAM/LINKEDIN/YOUTUBE.")
    .requiredOption("--from-team-id <id>", "source team id")
    .requiredOption("--to-team-id <id>", "destination team id")
    .requiredOption("-p, --platform <platform...>", "platform to copy; repeatable")
    .option("--reset-channel", "do not transfer the selected page; the user re-selects it (Facebook/Instagram/LinkedIn/YouTube)")
    .action(
      safeAction(
        async (
          opts: { fromTeamId: string; toTeamId: string; platform: string[]; resetChannel?: boolean },
          command: Command,
        ) => {
          const ctx = createContext(command.optsWithGlobals());
          if (opts.platform.length === 0) throw new CliError("NO_TARGET", "Pass at least one --platform to copy.");
          const requestBody: CopyBody = {
            fromTeamId: opts.fromTeamId,
            toTeamId: opts.toTeamId,
            socialAccountTypes: opts.platform.map((p) => normalizePlatform(p)) as CopyBody["socialAccountTypes"],
            ...(opts.resetChannel ? { resetChannel: true } : {}),
          };
          emitResult(await ctx.client.socialAccount.socialAccountCopy({ requestBody }), ctx.pretty);
        },
      ),
    );

  program
    .command("integrations:to-delete")
    .summary("list social accounts scheduled for deletion")
    .description("List the social accounts scheduled to be deleted (paginated).")
    .option("--page <n>", "page number")
    .option("--page-size <n>", "items per page")
    .action(
      safeAction(async (opts: { page?: string; pageSize?: string }, command: Command) => {
        const ctx = createContext(command.optsWithGlobals());
        emitResult(
          await ctx.client.socialAccount.socialAccountGetAccountsToDelete({
            page: opts.page !== undefined ? Number(opts.page) : undefined,
            pageSize: opts.pageSize !== undefined ? Number(opts.pageSize) : undefined,
          }),
          ctx.pretty,
        );
      }),
    );
}
