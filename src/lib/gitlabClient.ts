import type { BugReportRecord, GitLabStatusInfo } from './types.ts';

export class GitLabNotConfiguredError extends Error {
  constructor() {
    super(
      'GitLab integration is not configured. Set GITLAB_TOKEN and GITLAB_PROJECT_ID environment variables to create live issues.'
    );
    this.name = 'GitLabNotConfiguredError';
  }
}

export function getGitLabStatus(): GitLabStatusInfo {
  const token = (process.env.GITLAB_TOKEN || '').trim();
  const projectId = (process.env.GITLAB_PROJECT_ID || '').trim();
  const baseUrl = (process.env.GITLAB_BASE_URL || 'https://gitlab.com').trim().replace(/\/+$/, '');
  return {
    configured: Boolean(token && projectId),
    baseUrl,
    projectId: projectId ? `Project #${projectId}` : '',
  };
}

export function formatBugAsGitLabMarkdown(bug: BugReportRecord): string {
  return [
    `## ${bug.bugCode}: ${bug.title}`,
    '',
    `- **Module:** ${bug.module}`,
    `- **Severity:** ${bug.severity}`,
    `- **Priority:** ${bug.priority}`,
    `- **Status:** ${bug.status}`,
    `- **Environment:** ${bug.environment}`,
    `- **Browser / Device:** ${bug.browserDevice}`,
    `- **Assigned Developer:** ${bug.assignedDeveloper || 'Unassigned'}`,
    `- **Reporter:** ${bug.reporter || 'QA Engineer'}`,
    bug.linkedRequirementId ? `- **Linked Requirement:** ${bug.linkedRequirementId}` : null,
    bug.linkedTestCaseId ? `- **Linked Test Case:** ${bug.linkedTestCaseId}` : null,
    '',
    bug.description ? `### Description\n${bug.description}\n` : null,
    bug.precondition ? `### Preconditions\n${bug.precondition}\n` : null,
    `### Steps to Reproduce\n${bug.stepsToReproduce}`,
    '',
    `### Expected Behaviour\n${bug.expectedResult}`,
    '',
    `### Actual Behaviour\n${bug.actualResult}`,
    '',
    bug.evidence ? `### Evidence\n${bug.evidence}` : null,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

export async function createRealGitLabIssue(
  bug: BugReportRecord
): Promise<{ issueId: string; issueUrl: string }> {
  const token = (process.env.GITLAB_TOKEN || '').trim();
  const projectId = (process.env.GITLAB_PROJECT_ID || '').trim();
  const baseUrl = (process.env.GITLAB_BASE_URL || 'https://gitlab.com').trim().replace(/\/+$/, '');

  if (!token || !projectId) {
    throw new GitLabNotConfiguredError();
  }

  const endpoint = `${baseUrl}/api/v4/projects/${encodeURIComponent(projectId)}/issues`;
  const labels = [
    `severity::${bug.severity.toLowerCase()}`,
    `priority::${bug.priority.toLowerCase()}`,
    `module::${bug.module.toLowerCase().replace(/\s+/g, '-')}`,
    'bug',
  ].join(',');

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'PRIVATE-TOKEN': token,
    },
    body: JSON.stringify({
      title: `[${bug.bugCode}] ${bug.title}`,
      description: formatBugAsGitLabMarkdown(bug),
      labels,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitLab API returned HTTP ${res.status}: ${errText.slice(0, 240)}`);
  }

  const data = (await res.json()) as { iid?: number; web_url?: string };
  if (!data.iid || !data.web_url) {
    throw new Error('GitLab API response did not include expected issue iid and web_url.');
  }

  return {
    issueId: `#${data.iid}`,
    issueUrl: data.web_url,
  };
}
