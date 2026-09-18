import type { Change, RepositoryGroup } from "./ipc-contract";

// Pure grouping of carded changes into Repository rows, keyed on the resolved git
// common-dir (repositoryId). A group is `nested` only when 2+ distinct worktrees
// (distinct repoPaths) share one common-dir — counting worktrees, not change
// records, so a lone checkout that happens to hold more than one active change
// still renders flat exactly as today rather than masquerading as concurrent
// worktrees. Within a group the primary checkout's cards are pinned first, then
// the existing default ordering (complete-last, then change name). No I/O — a pure
// function over resolved records, directly testable with fabricated data.
export function groupWorktrees(changes: Change[]): RepositoryGroup[] {
  const byId = new Map<string, Change[]>();
  for (const c of changes) {
    const list = byId.get(c.repositoryId);
    if (list) list.push(c);
    else byId.set(c.repositoryId, [c]);
  }

  const groups: RepositoryGroup[] = [];
  for (const [repositoryId, worktrees] of byId) {
    const sorted = [...worktrees].sort(
      (a, b) =>
        (a.isPrimary ? 0 : 1) - (b.isPrimary ? 0 : 1) ||
        (a.complete ? 1 : 0) - (b.complete ? 1 : 0) ||
        a.change.localeCompare(b.change)
    );
    const distinctWorktrees = new Set(sorted.map((w) => w.repoPath)).size;
    groups.push({
      repositoryId,
      repositoryName: sorted[0]?.repositoryName ?? repositoryId,
      nested: distinctWorktrees >= 2,
      worktrees: sorted,
    });
  }

  groups.sort(
    (a, b) => a.repositoryName.localeCompare(b.repositoryName) || a.repositoryId.localeCompare(b.repositoryId)
  );
  return groups;
}
