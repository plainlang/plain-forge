// Records a deploy or a release as a Linear release. Run it from actions/github-script:
//
//   script: return require('./.github/scripts/record-linear-release.cjs')({ github, context, core })
//
// Environment:
//   LINEAR_ACCESS_KEY    The pipeline's access key. Without one, nothing is recorded.
//   LINEAR_RELEASE_MODE  "live" records the release. Anything else only logs what would be sent.
//   RELEASE_SHA          The commit that was deployed or tagged.
//   RELEASE_VERSION      The release tag, or for a deploy its short SHA (the default).
//   RELEASE_BRANCH       The branch PRs merge into. Defaults to main.
//   RELEASE_NOTES        "prs" (the default) lists the PRs. "github-release" copies the body of
//                        the GitHub release tagged RELEASE_VERSION.
//
// Output: release-url, the release's page in Linear. It stays empty when the release is only logged.
'use strict';

const LINEAR_API = 'https://api.linear.app/graphql';
const MAX_BASE_CANDIDATES = 20;

// On GitHub, "#12" is a PR or issue of the same repo. Linear matches a bare "#12" against every
// repo it knows, so it can link a PR from another repo. Every reference is therefore written out
// as a full link, except in code (fenced or inline), existing links and URLs. GitHub redirects
// /pull/N to /issues/N when N is an issue.
function linkReferences(text, owner, repo) {
  const untouched = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`|\[[^\]\n]*\]\([^)\n]*\)|<[^>\n]*>|https?:\/\/[^\s)]+)/;
  return text
    .split(untouched)
    .map((part, i) =>
      i % 2
        ? part
        : part
            .replace(
              /(^|[^\w/#&])([\w.-]+)\/([\w.-]+)#(\d+)\b/g,
              (_, pre, o, r, n) => `${pre}[${o}/${r}#${n}](https://github.com/${o}/${r}/pull/${n})`,
            )
            .replace(
              /(^|[^\w/#&[]|\bPR ?)#(\d+)\b/g,
              (_, pre, n) => `${pre}[#${n}](https://github.com/${owner}/${repo}/pull/${n})`,
            ),
    )
    .join('');
}

function prNotes(prs, owner, repo) {
  const link = (n) => `[#${n}](https://github.com/${owner}/${repo}/pull/${n})`;
  const dependabot = prs.filter((pr) => pr.user.login === 'dependabot[bot]');
  const lines = prs
    .filter((pr) => !dependabot.includes(pr))
    .map((pr) => `- ${link(pr.number)} ${linkReferences(pr.title, owner, repo)} · ${pr.user.login}`);
  if (dependabot.length) {
    const s = dependabot.length > 1 ? 's' : '';
    lines.push(`- ${dependabot.length} Dependabot update${s}: ${dependabot.map((pr) => link(pr.number)).join(', ')}`);
  }
  return lines.join('\n');
}

// The PRs merged into `branch` since the newest earlier release in this pipeline.
async function pullRequestsSince({ github, owner, repo, branch, head, version, releases }) {
  const compare = async (base, target, page = 1, perPage = 1) =>
    (await github.rest.repos.compareCommitsWithBasehead({ owner, repo, basehead: `${base}...${target}`, page, per_page: perPage }))
      .data;

  // Testing can be deployed from a branch. Such a deploy gets no PRs; they count once they reach the branch.
  if (!['ahead', 'identical'].includes((await compare(head, branch)).status)) {
    return { prs: [], reason: `${head.slice(0, 7)} is not on ${branch}` };
  }

  // Sorted by completion time, since an older release whose notes were edited can be listed first.
  // A release that is not on the branch is a branch deploy and is never a base. This release itself
  // (a re-run) is skipped, but another version at the same commit is a base, and leaves no new PRs.
  const candidates = releases
    .filter((r) => r.commitSha && r.version !== version)
    .sort((a, b) => Date.parse(b.completedAt || b.createdAt) - Date.parse(a.completedAt || a.createdAt))
    .slice(0, MAX_BASE_CANDIDATES);
  let base;
  for (const release of candidates) {
    const { status } = await compare(release.commitSha, head);
    if (status === 'diverged') continue;
    // "behind": the newest release is ahead of this commit, so this deploy is a rollback.
    if (status === 'behind') return { prs: [], reason: `rollback: ${release.version} is newer` };
    base = release;
    break;
  }
  if (!base) return { prs: [], reason: 'no earlier release on the branch' };

  const commits = [];
  for (let page = 1; ; page++) {
    const data = await compare(base.commitSha, head, page, 100);
    commits.push(...data.commits);
    if (data.commits.length < 100 || commits.length >= data.total_commits) break;
  }

  // GitHub knows each commit's PR, whatever the merge method.
  const prs = new Map();
  for (const { sha } of commits) {
    const { data } = await github.rest.repos.listPullRequestsAssociatedWithCommit({ owner, repo, commit_sha: sha });
    for (const pr of data) {
      if (pr.merged_at && pr.base.ref === branch && !prs.has(pr.number)) prs.set(pr.number, pr);
    }
  }
  return { prs: [...prs.values()], base };
}

module.exports = async ({ github, context, core }) => {
  const key = process.env.LINEAR_ACCESS_KEY;
  const live = process.env.LINEAR_RELEASE_MODE === 'live';
  if (!key) {
    if (live) throw new Error('LINEAR_RELEASE_MODE is live, but this pipeline has no Linear access key');
    core.notice('No Linear access key for this pipeline, so the release is not recorded.');
    return;
  }
  const required = (name) => {
    if (!process.env[name]) throw new Error(`${name} is not set`);
    return process.env[name];
  };
  const head = required('RELEASE_SHA');
  const version = process.env.RELEASE_VERSION || head.slice(0, 7);
  const branch = process.env.RELEASE_BRANCH || 'main';
  const { owner, repo } = context.repo;

  const linear = async (query, variables) => {
    const res = await fetch(LINEAR_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: key },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.errors) throw new Error(`Linear API ${res.status}: ${JSON.stringify(body.errors || body)}`);
    return body.data;
  };

  const { recentReleasesByAccessKey: releases } = await linear(
    'query { recentReleasesByAccessKey(limit: 50) { commitSha version completedAt createdAt } }',
  );
  const { prs, base, reason } = await pullRequestsSince({ github, owner, repo, branch, head, version, releases });

  const links = [{ label: 'GitHub run', url: `${context.serverUrl}/${owner}/${repo}/actions/runs/${context.runId}` }];
  let notes;
  if (process.env.RELEASE_NOTES === 'github-release') {
    const { data } = await github.rest.repos.getReleaseByTag({ owner, repo, tag: version });
    notes = linkReferences((data.body || '').replace(/\r\n/g, '\n').trim(), owner, repo);
    links.unshift({ label: 'GitHub release', url: data.html_url });
  } else {
    notes = prNotes(prs, owner, repo);
  }

  const input = {
    name: version,
    version,
    commitSha: head,
    repository: { owner, name: repo, provider: 'github', url: `https://github.com/${owner}/${repo}` },
    pullRequestReferences: prs.map((pr) => ({ repositoryOwner: owner, repositoryName: repo, number: pr.number })),
    links,
    ...(notes ? { releaseNotes: { title: version, content: notes } } : {}),
  };

  const since = base ? `since ${base.version}` : `none (${reason})`;
  core.info(`PRs ${since}: ${prs.map((pr) => `#${pr.number}`).join(', ') || '-'}`);
  if (!live) {
    core.notice(`Log-only: ${version} would be recorded in Linear with ${prs.length} PRs. Set LINEAR_RELEASE_MODE=live to record it.`);
    core.info(JSON.stringify(input, null, 2));
    return;
  }

  const { releaseSyncByAccessKey: result } = await linear(
    'mutation ($input: ReleaseSyncInputBase!) { releaseSyncByAccessKey(input: $input) { success release { url } } }',
    { input },
  );
  // Linear can report a failed sync with HTTP 200.
  if (!result.success || !result.release) throw new Error(`Linear did not record ${version}: ${JSON.stringify(result)}`);
  core.setOutput('release-url', result.release.url);
  core.notice(`Recorded ${version} in Linear: ${result.release.url}`);
};

module.exports.linkReferences = linkReferences;
module.exports.prNotes = prNotes;
module.exports.pullRequestsSince = pullRequestsSince;
