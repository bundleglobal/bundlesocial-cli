import type { Command } from "commander";
import { safeAction, VERSION } from "../program";
import {
  DASHBOARD_API_KEYS_URL,
  DASHBOARD_SOCIAL_ACCOUNTS_URL,
  createClient,
  resolveApiUrl,
  resolveExplicitTeamId,
} from "../context";
import { errorSummary } from "../output";
import { renderPretty } from "../pretty";

type CheckStatus = "ok" | "warn" | "fail";
interface Check {
  name: string;
  status: CheckStatus;
  message: string;
  [key: string]: unknown;
}

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .summary("diagnose your CLI setup")
    .description("Diagnose the bundle.social CLI setup: API key, API connectivity, organization API access, team selection, connected integrations and posts quota. Always prints a diagnostic JSON; exits non-zero if any check fails.")
    .action(
      safeAction(async (_opts: unknown, command: Command) => {
        const globalOptions = command.optsWithGlobals();
        const pretty = Boolean(globalOptions.pretty);
        const apiUrl = resolveApiUrl(globalOptions);
        const checks: Check[] = [];
        const add = (name: string, status: CheckStatus, message: string, extra: Record<string, unknown> = {}) =>
          checks.push({ name, status, message, ...extra });

        const finish = () => {
          const ok = checks.every((check) => check.status !== "fail");
          const result = { ok, apiUrl, cliVersion: VERSION, node: process.version, checks };
          process.stdout.write(`${pretty ? renderPretty(result) : JSON.stringify(result, null, 2)}\n`);
          process.exitCode = ok ? 0 : 1;
        };

        const apiKey = globalOptions.apiKey ?? process.env.BUNDLESOCIAL_API_KEY;
        if (!apiKey) {
          add("api_key", "fail", "No API key found. Set BUNDLESOCIAL_API_KEY or pass --api-key.", { dashboardUrl: DASHBOARD_API_KEYS_URL });
          finish();
          return;
        }
        add("api_key", "ok", "API key found", { source: globalOptions.apiKey ? "--api-key flag" : "BUNDLESOCIAL_API_KEY env var" });

        const client = createClient(apiKey, apiUrl);

        try {
          const health = await client.app.appGetHealth();
          add("api_reachable", "ok", `API reachable at ${apiUrl}`, { health });
        } catch (error) {
          add("api_reachable", "fail", `Could not reach the API at ${apiUrl}`, { error: errorSummary(error) });
          finish();
          return;
        }

        let teams: Array<{ id: string; name: string }> = [];
        let organizationApiAccess: boolean | undefined;
        try {
          const organization = await client.organization.organizationGetOrganization();
          teams = (organization.teams ?? []).map((team) => ({ id: team.id, name: team.name }));
          organizationApiAccess = organization.apiAccess;
          add("authentication", "ok", "API key is valid", {
            organizationId: organization.id,
            organizationName: organization.name ?? null,
          });
        } catch (error) {
          add("authentication", "fail", "API key was rejected by the API", { error: errorSummary(error) });
          finish();
          return;
        }
        add(
          "api_access",
          organizationApiAccess ? "ok" : "fail",
          organizationApiAccess
            ? "Organization has API access enabled"
            : "Organization does not have API access enabled — upgrade your plan or contact bundle.social support",
        );

        const explicitTeamId = resolveExplicitTeamId(globalOptions);
        let teamId: string | undefined;
        if (explicitTeamId) {
          teamId = explicitTeamId;
          add("team", "ok", "Using team from --team-id / BUNDLESOCIAL_TEAM_ID", { teamId });
        } else if (teams.length === 1) {
          teamId = teams[0].id;
          add("team", "ok", "Using the organization's only team", { teamId, teamName: teams[0].name });
        } else if (teams.length === 0) {
          add("team", "fail", "Organization has no teams — create one in the dashboard");
        } else {
          add("team", "warn", `Organization has ${teams.length} teams; commands need --team-id or BUNDLESOCIAL_TEAM_ID`, { teams });
        }

        if (teamId) {
          try {
            const team = await client.team.teamGetTeam({ id: teamId });
            const accounts = team.socialAccounts ?? [];
            add(
              "integrations",
              accounts.length > 0 ? "ok" : "warn",
              accounts.length > 0
                ? `${accounts.length} connected integration(s)`
                : "No integrations connected — connect one in the dashboard before posting",
              { count: accounts.length, platforms: accounts.map((account) => account.type), connectUrl: DASHBOARD_SOCIAL_ACCOUNTS_URL },
            );
          } catch (error) {
            add("integrations", "fail", "Could not load the team's integrations", { teamId, error: errorSummary(error) });
          }
        }

        try {
          const usage = await client.organization.organizationGetPostsUsage();
          add(
            "posts_quota",
            usage.remaining > 0 ? "ok" : "warn",
            `Posts quota: ${usage.used}/${usage.limit} used, ${usage.remaining} remaining`,
            { used: usage.used, limit: usage.limit, remaining: usage.remaining },
          );
        } catch (error) {
          add("posts_quota", "warn", "Could not read posts quota", { error: errorSummary(error) });
        }

        finish();
      }),
    );
}
