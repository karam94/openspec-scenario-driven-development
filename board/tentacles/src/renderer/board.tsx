import { Fragment } from "react";
import type { Change, Phase } from "../shared/ipc-contract";

interface WithOpen {
  openArtifacts: (files: string[]) => void;
}

function PhaseNode({ p, openArtifacts }: { p: Phase } & WithOpen) {
  if (!p.applicable) {
    return (
      <div className="node na">
        <div className="phase">{p.id}</div>
        <div className="state">n/a</div>
      </div>
    );
  }
  if (p.inProgress) {
    return (
      <div className="node progress">
        <div className="phase">{p.id}</div>
        <div className="state">
          <span className="spinner" />
          in progress
        </div>
      </div>
    );
  }
  const cls = p.done ? "done clickable" : "pending";
  const onClick = p.done && p.files.length ? () => openArtifacts(p.files) : undefined;
  return (
    <div className={`node ${cls}`} onClick={onClick}>
      <div className="phase">{p.id}</div>
      <div className="state">{p.done ? "✓ done" : "· pending"}</div>
    </div>
  );
}

function ApplyNode({ c, openArtifacts }: { c: Change } & WithOpen) {
  const a = c.apply;
  const spin = c.applying ? <span className="spinner" /> : null;
  let label: React.ReactNode;
  if (a.source === "commits") {
    label = c.applyDone ? `✓ ${a.commits} commits` : (
      <>
        {spin}
        {a.commits} commit(s)
      </>
    );
  } else {
    label = c.applyDone ? `✓ ${a.done}/${a.total}` : (
      <>
        {spin}
        {a.done || 0}/{a.total}
      </>
    );
  }
  const cls = c.applyDone ? "done clickable" : c.applying ? "progress" : "pending";
  const onClick = a.file ? () => openArtifacts([a.file as string]) : undefined;
  return (
    <div className={`node ${cls}`} onClick={onClick}>
      <div className="phase">apply</div>
      <div className="state">{label}</div>
    </div>
  );
}

function ReviewNode({ c }: { c: Change }) {
  if (c.review === "passed") {
    return (
      <div className="node done">
        <div className="phase">review</div>
        <div className="state">✓ approved</div>
      </div>
    );
  }
  if (c.review === "pending") {
    return (
      <div className="node progress">
        <div className="phase">review</div>
        <div className="state">
          <span className="spinner" />
          in review
        </div>
      </div>
    );
  }
  return (
    <div className="node pending">
      <div className="phase">review</div>
      <div className="state">· pending</div>
    </div>
  );
}

function DoneNode({ c }: { c: Change }) {
  if (c.pr) {
    const cls = c.complete ? "done" : "progress";
    const state = c.pr.state === "MERGED" ? "✓ merged" : c.pr.state.toLowerCase();
    return (
      <a className={`node ${cls} pr-node`} href={c.pr.url} target="_blank" rel="noopener">
        <div className="phase">done</div>
        <div className="state">PR ↗ {state}</div>
      </a>
    );
  }
  return (
    <div className="node pending">
      <div className="phase">done</div>
      <div className="state">· no PR</div>
    </div>
  );
}

function ApplyBar({ c }: { c: Change }) {
  const a = c.apply;
  if (a.source === "tasks.md" && a.total) {
    return (
      <div className="apply">
        <div className="bar">
          <i style={{ width: `${Math.round((100 * (a.done || 0)) / a.total)}%` }} />
        </div>
        <div className="apply-label">
          <span>apply progress</span>
          <span>
            {a.done || 0} / {a.total} tasks
          </span>
        </div>
      </div>
    );
  }
  if (a.source === "commits") {
    return (
      <div className="apply">
        <div className="apply-label">
          <span>apply progress</span>
          <span>{a.commits} commit(s) · tasks.md not ticked</span>
        </div>
      </div>
    );
  }
  return null;
}

export function ChangeCard({
  c,
  showBranch,
  openArtifacts,
  onArchive,
  busy,
  removing,
}: { c: Change; showBranch: boolean; onArchive: (c: Change) => void; busy: boolean; removing: boolean } & WithOpen) {
  const badge = c.complete ? (
    <span className="badge complete">COMPLETE</span>
  ) : c.review === "pending" ? (
    <span className="badge planning">IN REVIEW</span>
  ) : c.applying ? (
    <span className="badge planning">APPLYING</span>
  ) : (
    <span className="badge planning">PLANNING</span>
  );
  const typeBadge =
    c.type === "refactor" ? (
      <span className="badge type-refactor">REFACTOR</span>
    ) : (
      <span className="badge type-feature">FEATURE</span>
    );
  return (
    <div className={`change ${removing ? "archiving" : ""}`}>
      <div className="change-head">
        <span className="cname">{c.change}</span>
        {showBranch && c.branch ? <span className="branch-chip">{c.branch}</span> : null}
        {typeBadge}
        {badge}
        <span className="crepo">{c.schema}</span>
        <button className="archive-btn" onClick={() => onArchive(c)} disabled={busy}>
          {busy ? "Archiving…" : "Archive"}
        </button>
      </div>
      <div className="chain">
        {c.phases.map((p, i) => (
          <Fragment key={p.id}>
            {i > 0 && <div className="arrow">→</div>}
            <PhaseNode p={p} openArtifacts={openArtifacts} />
          </Fragment>
        ))}
        <div className="arrow">→</div>
        <ApplyNode c={c} openArtifacts={openArtifacts} />
        <div className="arrow">→</div>
        <ReviewNode c={c} />
        <div className="arrow">→</div>
        <DoneNode c={c} />
      </div>
      <ApplyBar c={c} />
    </div>
  );
}

export function RepoGroup({
  repositoryId,
  repositoryName,
  nested,
  list,
  collapsed,
  onToggle,
  openArtifacts,
  onArchive,
  archivingKeys,
  removingKeys,
}: {
  repositoryId: string;
  repositoryName: string;
  nested: boolean;
  list: Change[];
  collapsed: boolean;
  onToggle: (repositoryId: string) => void;
  onArchive: (c: Change) => void;
  archivingKeys: Set<string>;
  removingKeys: Set<string>;
} & WithOpen) {
  const done = list.filter((c) => c.complete).length;
  return (
    <div className={`repo-group ${collapsed ? "collapsed" : ""}`}>
      <div className="repo-bar" onClick={() => onToggle(repositoryId)}>
        <span className="repo-caret">▼</span>
        <span className="repo-title">{repositoryName}</span>
        <span className="repo-summary">
          {list.length} change(s) · {done} complete
        </span>
      </div>
      <div className="repo-body">
        {list.map((c) => {
          const k = `${c.repoPath}\u0000${c.change}`;
          return (
            <ChangeCard
              key={k}
              c={c}
              showBranch={nested}
              openArtifacts={openArtifacts}
              onArchive={onArchive}
              busy={archivingKeys.has(k)}
              removing={removingKeys.has(k)}
            />
          );
        })}
      </div>
    </div>
  );
}
