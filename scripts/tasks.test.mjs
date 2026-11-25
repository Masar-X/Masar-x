import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  DEFAULT_WIP_LIMIT,
  applyMainCardStatuses,
  buildIssueCreateArgs,
  compareCards,
  computeStatusRows,
  deriveCardStatus,
  getLatestBranchActivity,
  globsOverlap,
  isRefAlreadyExistsError,
  LABEL_SCHEME,
  lintCards,
  loadTaskCards,
  normalizePosixPath,
  parseFrontmatter,
  parseLsRemoteBranches,
  parseOpenIssues,
  parseOpenPrs,
  parseRepoSlug,
  runLint,
  runNext,
  runRelease,
  runStatus,
  runSyncIssues,
  selectNextCandidates,
  touchesOverlap,
} from "./tasks.mjs";

function makeCardBody({ extraAcceptance = "" } = {}) {
  return [
    "## Context",
    "- [VERIFIED] context item",
    "",
    "## Goal",
    "Ship the change.",
    "",
    "## Non-goals",
    "- Nothing else.",
    "",
    "## Steps",
    "1. Do the thing.",
    "",
    "## Acceptance criteria",
    "- [ ] Run test suite -> exits 0",
    extraAcceptance,
    "## Evidence",
    "",
    "## Rollback",
    "Revert PR.",
    "",
    "## Open questions",
    "None.",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

function makeCardMarkdown(overrides = {}, bodyOpts = {}) {
  const fm = {
    id: "T-001",
    title: "Sample task",
    priority: "P0",
    status: "todo",
    depends_on: "[]",
    touches: '["apps/web/src/a.ts"]',
    owner_action: false,
    area: "web",
    estimate: "2h",
    ...overrides,
  };
  return [
    "---",
    `id: ${fm.id}`,
    `title: ${fm.title}`,
    `priority: ${fm.priority}`,
    `status: ${fm.status}`,
    `depends_on: ${fm.depends_on}`,
    `touches: ${fm.touches}`,
    `owner_action: ${fm.owner_action}`,
    `area: ${fm.area}`,
    `estimate: ${fm.estimate}`,
    "---",
    makeCardBody(bodyOpts),
    "",
  ].join("\n");
}

function withTempTasksDir(files, fn) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "masarx-tasks-test-"));
  const tasksDir = path.join(dir, "docs", "tasks");
  mkdirSync(tasksDir, { recursive: true });
  try {
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(path.join(tasksDir, name), content, "utf8");
    }
    return fn({ rootDir: dir, tasksDir });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("frontmatter parsing", () => {
  it("parses strings, booleans, inline arrays, multiline arrays, and # comments", () => {
    const md = [
      "---",
      "# top comment",
      'id: "T-001" # inline comment',
      'title: "Fix #123: auth callback"',
      "priority: P0",
      "status: todo",
      "depends_on: [T-002, 'T-003'] # deps",
      "touches:",
      "  - apps/web/src/** # web files",
      "  # comment inside list",
      '  - "packages/shared/src/index.ts"',
      "owner_action: true",
      "area: auth",
      "estimate: 4h",
      "---",
      "## Context",
      "Body here.",
    ].join("\n");

    const parsed = parseFrontmatter(md, "docs/tasks/T-001.md");
    assert.deepEqual(parsed.errors, []);
    assert.equal(parsed.data.id, "T-001");
    assert.equal(parsed.data.title, "Fix #123: auth callback");
    assert.equal(parsed.data.priority, "P0");
    assert.equal(parsed.data.status, "todo");
    assert.deepEqual(parsed.data.depends_on, ["T-002", "T-003"]);
    assert.deepEqual(parsed.data.touches, [
      "apps/web/src/**",
      "packages/shared/src/index.ts",
    ]);
    assert.equal(parsed.data.owner_action, true);
    assert.equal(parsed.data.area, "auth");
    assert.equal(parsed.data.estimate, "4h");
  });

  it("handles Windows CRLF line endings and normalizes touches to POSIX", () => {
    const md = makeCardMarkdown({
      touches: '["apps\\\\web\\\\src\\\\**"]',
    }).replace(/\n/g, "\r\n");

    withTempTasksDir({ "T-001-win.md": md }, ({ tasksDir }) => {
      const { cards, errors } = loadTaskCards(tasksDir);
      assert.deepEqual(errors, []);
      assert.equal(cards.length, 1);
      assert.deepEqual(cards[0].touches, ["apps/web/src/**"]);
    });
  });

  it("parses repo slug from HTTPS and SSH git remotes with fallback", () => {
    assert.equal(parseRepoSlug("https://github.com/Masar-X/Masar-x.git"), "Masar-X/Masar-x");
    assert.equal(parseRepoSlug("git@github.com:Masar-X/Masar-x.git"), "Masar-X/Masar-x");
    assert.equal(parseRepoSlug(""), "Masar-X/Masar-x");
  });
});

describe("status derivation and dependency resolution", () => {
  it("derives done, blocked, review, doing, waiting-deps, and todo accurately", () => {
    const cards = [
      { id: "T-001", priority: "P0", status: "done", depends_on: [], touches: ["a"] },
      { id: "T-002", priority: "P0", status: "todo", depends_on: ["T-001"], touches: ["b"] },
      { id: "T-003", priority: "P1", status: "todo", depends_on: ["T-002"], touches: ["c"] },
      { id: "T-004", priority: "P1", status: "todo", depends_on: [], touches: ["d"] },
      { id: "T-005", priority: "P1", status: "todo", depends_on: [], touches: ["e"] },
      { id: "T-006", priority: "P2", status: "todo", depends_on: [], touches: ["f"] },
    ];
    const cardsById = new Map(cards.map((c) => [c.id, c]));
    const remoteBranches = parseLsRemoteBranches(
      [
        "1111\trefs/heads/task/T-004",
        "2222\trefs/heads/task/T-005",
        "3333\trefs/heads/task/T-006",
      ].join("\n")
    );
    const openPrsByTaskId = parseOpenPrs(
      JSON.stringify([
        {
          headRefName: "task/T-005",
          number: 10,
          url: "https://github.com/Masar-X/Masar-x/pull/10",
          labels: [{ name: "enhancement" }],
          author: { login: "alice" },
        },
        {
          headRefName: "task/T-006",
          number: 11,
          url: "https://github.com/Masar-X/Masar-x/pull/11",
          labels: [{ name: "owner-action" }],
          author: { login: "bob" },
        },
      ])
    );

    const state = { cardsById, remoteBranches, openPrsByTaskId };
    assert.equal(deriveCardStatus(cards[0], state), "done");
    assert.equal(deriveCardStatus(cards[1], state), "todo"); // T-001 is done
    assert.equal(deriveCardStatus(cards[2], state), "waiting-deps"); // T-002 is not done
    assert.equal(deriveCardStatus(cards[3], state), "doing"); // remote branch, no PR
    assert.equal(deriveCardStatus(cards[4], state), "review"); // open PR without an owner label
    assert.equal(deriveCardStatus(cards[5], state), "blocked"); // open PR with a former owner label
  });

  it("blocked needs an in-flight card and an owner label on its Issue; the label alone changes nothing", () => {
    const cards = [
      { id: "T-001", priority: "P0", status: "todo", depends_on: [], touches: ["a"] },
      { id: "T-002", priority: "P0", status: "todo", depends_on: [], touches: ["b"] },
      { id: "T-006a", priority: "P0", status: "todo", depends_on: [], touches: ["d"] },
    ];
    const cardsById = new Map(cards.map((c) => [c.id, c]));
    const issueLabelsByTaskId = parseOpenIssues(
      JSON.stringify([
        { title: "T-001 Sample task", labels: [{ name: "needs: owner" }, { name: "priority: P0" }] },
        { title: "T-006a Other card", labels: [{ name: "needs: owner" }] },
      ])
    );
    assert.deepEqual([...issueLabelsByTaskId.keys()].sort(), ["T-001", "T-006a"]);
    assert.deepEqual(issueLabelsByTaskId.get("T-001"), ["needs: owner", "priority: P0"]);

    const state = { cardsById, remoteBranches: new Set(), openPrsByTaskId: new Map(), issueLabelsByTaskId };
    assert.equal(deriveCardStatus(cards[0], state), "todo"); // labeled, but nothing in flight
    assert.equal(deriveCardStatus(cards[2], state), "todo"); // "T-006a" never borrows the "T-006" label

    const withBranch = {
      ...state,
      remoteBranches: parseLsRemoteBranches("111\trefs/heads/task/T-001\n222\trefs/heads/task/T-002\n"),
    };
    assert.equal(deriveCardStatus(cards[0], withBranch), "blocked"); // branch + owner label
    assert.equal(deriveCardStatus(cards[1], withBranch), "doing"); // branch, no owner label

    const withPr = {
      ...withBranch,
      openPrsByTaskId: parseOpenPrs(
        JSON.stringify([
          { headRefName: "task/T-002", number: 20, url: "", labels: [{ name: "needs: owner" }] },
        ])
      ),
    };
    assert.equal(deriveCardStatus(cards[1], withPr), "blocked"); // the label on the PR itself still counts
  });

  it("sorts P0 -> P1 -> P2 then ID ascending", () => {
    const sorted = [
      { id: "T-010", priority: "P0" },
      { id: "T-002", priority: "P2" },
      { id: "T-001", priority: "P1" },
      { id: "T-003", priority: "P0" },
    ].sort(compareCards);
    assert.deepEqual(
      sorted.map((c) => c.id),
      ["T-003", "T-010", "T-001", "T-002"]
    );
  });
});

describe("touches glob overlap", () => {
  it("detects exact, nested, *, **, .github/**, and non-overlapping siblings", () => {
    assert.equal(globsOverlap("apps/web/src/a.ts", "apps/web/src/a.ts"), true);
    assert.equal(globsOverlap("apps/web/src/a.ts", "apps/web/src/b.ts"), false);

    // Dir prefixes and trailing slashes
    assert.equal(globsOverlap("apps/web/src", "apps/web/src/a.ts"), true);
    assert.equal(globsOverlap("apps/web/src/", "apps/web/src/nested/a.ts"), true);
    assert.equal(globsOverlap("apps/web", "apps/web2/src/a.ts"), false);

    // Single-segment * vs multi-segment **
    assert.equal(globsOverlap("scripts/*.mjs", "scripts/tasks.mjs"), true);
    assert.equal(globsOverlap("scripts/*.mjs", "scripts/nested/tasks.mjs"), false);
    assert.equal(globsOverlap("scripts/**/*.mjs", "scripts/nested/tasks.mjs"), true);

    // .github/** and nested globs
    assert.equal(globsOverlap(".github/**", ".github/workflows/ci.yml"), true);
    assert.equal(globsOverlap(".github/**", "apps/web/src/page.tsx"), false);
    assert.equal(globsOverlap("apps/web/src/**", "apps/**/lib/**"), true);
    assert.equal(globsOverlap("apps/web/src/**", "packages/shared/src/**"), false);

    // Windows slashes normalized
    assert.equal(normalizePosixPath(".\\apps\\web\\src\\a.ts"), "apps/web/src/a.ts");
    assert.equal(touchesOverlap(["apps\\web\\**"], ["apps/web/src/page.tsx"]), true);
  });
});

describe("WIP limit enforcement and next selection / 422 retry", () => {
  it("refuses next when doing + review >= DEFAULT_WIP_LIMIT (3) and lists occupied slots", () => {
    assert.equal(DEFAULT_WIP_LIMIT, 3);
    withTempTasksDir(
      {
        "T-001.md": makeCardMarkdown({ id: "T-001", touches: '["a.ts"]' }),
        "T-002.md": makeCardMarkdown({ id: "T-002", touches: '["b.ts"]' }),
        "T-003.md": makeCardMarkdown({ id: "T-003", touches: '["c.ts"]' }),
        "T-004.md": makeCardMarkdown({ id: "T-004", touches: '["d.ts"]' }),
      },
      ({ rootDir, tasksDir }) => {
        const stderr = [];
        const stdout = [];
        const exec = (cmd, args) => {
          if (cmd === "git" && args[0] === "remote") return "https://github.com/Masar-X/Masar-x.git\n";
          if (cmd === "git" && args[0] === "fetch") return "";
          if (cmd === "git" && args[0] === "ls-tree") return "";
          if (cmd === "git" && args[0] === "ls-remote") {
            return [
              "111\trefs/heads/task/T-001",
              "222\trefs/heads/task/T-002",
              "333\trefs/heads/task/T-003",
            ].join("\n");
          }
          if (cmd === "gh" && args[0] === "issue") return "[]";
          if (cmd === "gh" && args[0] === "pr") {
            return JSON.stringify([
              {
                headRefName: "task/T-003",
                number: 42,
                url: "https://github.com/Masar-X/Masar-x/pull/42",
                labels: [],
              },
            ]);
          }
          throw new Error(`Unexpected command: ${cmd} ${args.join(" ")}`);
        };

        const res = runNext(["--dry-run"], {
          cwd: rootDir,
          tasksDir,
          exec,
          out: (m) => stdout.push(m),
          err: (m) => stderr.push(m),
        });

        assert.equal(res.exitCode, 1);
        assert.equal(res.reason, "wip-limit");
        const errText = stderr.join("\n");
        assert.match(errText, /WIP limit reached \(3\/3\)/);
        assert.match(errText, /T-001 \(doing\)/);
        assert.match(errText, /T-002 \(doing\)/);
        assert.match(errText, /T-003 \(review\)/);

        // --force overrides WIP limit
        const forced = runNext(["--dry-run", "--force"], {
          cwd: rootDir,
          tasksDir,
          exec,
          out: (m) => stdout.push(m),
          err: (m) => stderr.push(m),
        });
        assert.equal(forced.exitCode, 0);
        assert.equal(forced.selected.id, "T-004");
      }
    );
  });

  it("skips overlapping todo candidates and retries on 422 collision", () => {
    withTempTasksDir(
      {
        "T-001.md": makeCardMarkdown({ id: "T-001", priority: "P0", touches: '["apps/web/**"]' }),
        "T-002.md": makeCardMarkdown({ id: "T-002", priority: "P0", touches: '["apps/web/src/a.ts"]' }),
        "T-003.md": makeCardMarkdown({ id: "T-003", priority: "P0", touches: '[".github/**"]' }),
        "T-004.md": makeCardMarkdown({ id: "T-004", priority: "P1", touches: '["packages/shared/**"]' }),
      },
      ({ rootDir, tasksDir }) => {
        const calls = [];
        const stdout = [];
        const stderr = [];
        const exec = (cmd, args) => {
          calls.push([cmd, ...args]);
          if (cmd === "git" && args[0] === "remote") return "https://github.com/Masar-X/Masar-x.git\n";
          if (cmd === "git" && args[0] === "fetch") return "";
          if (cmd === "git" && args[0] === "ls-tree") return "";
          if (cmd === "git" && args[0] === "ls-remote") return "111\trefs/heads/task/T-001\n";
          if (cmd === "gh" && args[0] === "issue") return "[]";
          if (cmd === "gh" && args[0] === "pr") return "[]";
          if (cmd === "git" && args[0] === "rev-parse") return "deadbeef1234\n";
          if (cmd === "gh" && args[0] === "api") {
            const refArg = args.find((a) => a.startsWith("ref="));
            if (refArg === "ref=refs/heads/task/T-003") {
              const err = new Error("gh: Reference already exists (HTTP 422)");
              err.status = 1;
              err.stderr = "gh: Reference already exists (HTTP 422)";
              throw err;
            }
            return "{}";
          }
          if (cmd === "git" && args[0] === "worktree") return "";
          throw new Error(`Unexpected command: ${cmd} ${args.join(" ")}`);
        };

        const res = runNext([], {
          cwd: rootDir,
          tasksDir,
          exec,
          out: (m) => stdout.push(m),
          err: (m) => stderr.push(m),
        });

        assert.equal(res.exitCode, 0);
        // T-001 is doing; T-002 overlaps T-001; T-003 collides with 422; T-004 wins!
        assert.equal(res.selected.id, "T-004");
        assert.equal(res.branch, "task/T-004");
        assert.equal(res.worktreePath, "../masarx-wt/task-T-004");
        assert.match(stderr.join("\n"), /T-003 \(Reference already exists\)/);
        assert.ok(
          calls.some(
            (c) =>
              c[0] === "git" &&
              c[1] === "worktree" &&
              c[2] === "add" &&
              c[3] === "../masarx-wt/task-T-004" &&
              c[5] === "task/T-004" &&
              c[6] === "origin/task/T-004"
          )
        );
      }
    );
  });

  it("dry-run selects first non-overlapping todo without calling gh api or git worktree", () => {
    withTempTasksDir(
      {
        "T-001.md": makeCardMarkdown({ id: "T-001", priority: "P0", touches: '["apps/web/**"]' }),
        "T-002.md": makeCardMarkdown({ id: "T-002", priority: "P0", touches: '["apps/web/src/x.ts"]' }),
        "T-003.md": makeCardMarkdown({ id: "T-003", priority: "P1", touches: '["docs/**"]' }),
      },
      ({ rootDir, tasksDir }) => {
        const calls = [];
        const stdout = [];
        const exec = (cmd, args) => {
          calls.push([cmd, ...args]);
          if (cmd === "git" && args[0] === "remote") return "https://github.com/Masar-X/Masar-x.git\n";
          if (cmd === "git" && args[0] === "fetch") return "";
          if (cmd === "git" && args[0] === "ls-tree") return "";
          if (cmd === "git" && args[0] === "ls-remote") return "111\trefs/heads/task/T-001\n";
          if (cmd === "gh" && args[0] === "issue") return "[]";
          if (cmd === "gh" && args[0] === "pr") return "[]";
          throw new Error(`Should not have run: ${cmd} ${args.join(" ")}`);
        };

        const res = runNext(["--dry-run"], {
          cwd: rootDir,
          tasksDir,
          exec,
          out: (m) => stdout.push(m),
          err: () => {},
        });

        assert.equal(res.exitCode, 0);
        assert.equal(res.selected.id, "T-003");
        assert.equal(calls.some((c) => c[0] === "gh" && c[1] === "api"), false);
        assert.equal(calls.some((c) => c[0] === "git" && c[1] === "worktree"), false);
      }
    );
  });
});

describe("release guards", () => {
  const nowMs = Date.parse("2026-11-24T12:00:00Z");

  it("refuses invalid task ID", () => {
    const stderr = [];
    const res = runRelease(["bad-id"], {
      err: (m) => stderr.push(m),
      exec: () => {
        throw new Error("should not call exec");
      },
    });
    assert.equal(res.exitCode, 1);
    assert.equal(res.reason, "invalid-id");
  });

  it("refuses release when open PR exists unless --force", () => {
    const calls = [];
    const stderr = [];
    const exec = (cmd, args) => {
      calls.push([cmd, ...args]);
      if (cmd === "git" && args[0] === "remote") return "https://github.com/Masar-X/Masar-x.git\n";
      if (cmd === "git" && args[0] === "ls-remote") return "111\trefs/heads/task/T-001\n";
      if (cmd === "gh" && args[0] === "pr") {
        return JSON.stringify([{ number: 77, url: "https://github.com/Masar-X/Masar-x/pull/77" }]);
      }
      if (cmd === "gh" && args[0] === "api" && args[1]?.includes("/activity")) {
        return JSON.stringify([
          {
            activity_type: "branch_creation",
            ref: "refs/heads/task/T-001",
            timestamp: "2026-11-20T00:00:00Z",
          },
        ]);
      }
      if (cmd === "gh" && args[0] === "api" && args[1] === "-X") {
        return "";
      }
      throw new Error(`Unexpected: ${cmd} ${args.join(" ")}`);
    };

    const refused = runRelease(["T-001"], {
      exec,
      now: () => nowMs,
      out: () => {},
      err: (m) => stderr.push(m),
    });
    assert.equal(refused.exitCode, 1);
    assert.equal(refused.reason, "open-pr");
    assert.equal(calls.some((c) => c.includes("DELETE")), false);

    const forced = runRelease(["T-001", "--force"], {
      exec,
      now: () => nowMs,
      out: () => {},
      err: () => {},
    });
    assert.equal(forced.exitCode, 0);
    assert.ok(calls.some((c) => c.includes("DELETE") && c.at(-1).endsWith("/refs/heads/task/T-001")));
  });

  it("refuses release when latest activity is < 24h old unless --force, allows > 24h, and refuses empty activity", () => {
    const makeExec = (activities) => {
      const calls = [];
      const exec = (cmd, args) => {
        calls.push([cmd, ...args]);
        if (cmd === "git" && args[0] === "remote") return "https://github.com/Masar-X/Masar-x.git\n";
        if (cmd === "git" && args[0] === "ls-remote") return "111\trefs/heads/task/T-002\n";
        if (cmd === "gh" && args[0] === "pr") return "[]";
        if (cmd === "gh" && args[0] === "api" && args[1]?.includes("/activity")) {
          return JSON.stringify(activities);
        }
        if (cmd === "gh" && args[0] === "api" && args[1] === "-X") return "";
        throw new Error(`Unexpected: ${cmd} ${args.join(" ")}`);
      };
      return { exec, calls };
    };

    // Fresh branch_creation (1h ago) -> refuse with exact age & timestamp
    const freshStderr = [];
    const recent = makeExec([
      {
        activity_type: "branch_creation",
        ref: "refs/heads/task/T-002",
        timestamp: "2026-11-24T11:00:00Z",
      },
    ]);
    const r1 = runRelease(["T-002"], {
      exec: recent.exec,
      now: () => nowMs,
      out: () => {},
      err: (m) => freshStderr.push(m),
    });
    assert.equal(r1.exitCode, 1);
    assert.equal(r1.reason, "recent-activity");
    assert.equal(r1.ageHours, 1);
    assert.match(freshStderr.join("\n"), /1\.0h old.*2026-11-24T11:00:00Z/);
    assert.equal(recent.calls.some((c) => c.includes("DELETE")), false);

    // 1h ago with --force -> delete
    const r2 = runRelease(["T-002", "--force"], {
      exec: recent.exec,
      now: () => nowMs,
      out: () => {},
      err: () => {},
    });
    assert.equal(r2.exitCode, 0);
    assert.equal(recent.calls.some((c) => c.includes("DELETE")), true);

    // push > 24h ago -> delete without --force (ignores unrelated ref entries)
    const stale = makeExec([
      {
        activity_type: "push",
        ref: "refs/heads/task/T-002",
        timestamp: "2026-11-23T11:00:00Z",
      },
      {
        activity_type: "push",
        ref: "refs/heads/task/T-999",
        timestamp: "2026-11-24T11:55:00Z",
      },
    ]);
    const r3 = runRelease(["T-002"], {
      exec: stale.exec,
      now: () => nowMs,
      out: () => {},
      err: () => {},
    });
    assert.equal(r3.exitCode, 0);
    assert.equal(stale.calls.some((c) => c.includes("DELETE")), true);

    // Empty activity [] -> refuse without --force, allow with --force
    const empty = makeExec([]);
    const emptyStderr = [];
    const r4 = runRelease(["T-002"], {
      exec: empty.exec,
      now: () => nowMs,
      out: () => {},
      err: (m) => emptyStderr.push(m),
    });
    assert.equal(r4.exitCode, 1);
    assert.equal(r4.reason, "no-activity");
    assert.match(emptyStderr.join("\n"), /--force/);
    assert.equal(empty.calls.some((c) => c.includes("DELETE")), false);

    const r5 = runRelease(["T-002", "--force"], {
      exec: empty.exec,
      now: () => nowMs,
      out: () => {},
      err: () => {},
    });
    assert.equal(r5.exitCode, 0);
    assert.equal(empty.calls.some((c) => c.includes("DELETE")), true);
  });
});

describe("status and sync-issues", () => {
  it("status prints sorted table with derived statuses", () => {
    withTempTasksDir(
      {
        "T-002.md": makeCardMarkdown({ id: "T-002", priority: "P0", owner_action: true }),
        "T-001.md": makeCardMarkdown({ id: "T-001", priority: "P1", status: "done" }),
      },
      ({ rootDir, tasksDir }) => {
        const stdout = [];
        const exec = (cmd, args) => {
          if (cmd === "git" && args[0] === "remote") return "https://github.com/Masar-X/Masar-x.git\n";
          if (cmd === "git" && args[0] === "fetch") return "";
          if (cmd === "git" && args[0] === "ls-tree") return "";
          if (cmd === "git" && args[0] === "ls-remote") return "111\trefs/heads/task/T-002\n";
          if (cmd === "gh" && args[0] === "issue") return "[]";
          if (cmd === "gh" && args[0] === "pr") return "[]";
          throw new Error(`Unexpected: ${cmd} ${args.join(" ")}`);
        };

        const res = runStatus({
          cwd: rootDir,
          tasksDir,
          exec,
          out: (m) => stdout.push(m),
          err: () => {},
        });
        assert.equal(res.exitCode, 0);
        const text = stdout.join("\n");
        const idx002 = text.indexOf("T-002");
        const idx001 = text.indexOf("T-001");
        assert.ok(idx002 !== -1 && idx001 !== -1 && idx002 < idx001);
        assert.match(text, /doing/);
        assert.match(text, /done/);
      }
    );
  });

  it("sync-issues is dry-run by default and uses the priority, area, and owner labels", () => {
    withTempTasksDir(
      {
        "T-001.md": makeCardMarkdown({
          id: "T-001",
          title: "Rotate secrets",
          priority: "P0",
          area: "security",
          owner_action: true,
        }),
      },
      ({ rootDir, tasksDir }) => {
        const calls = [];
        const stdout = [];
        const exec = (cmd, args) => {
          calls.push([cmd, ...args]);
          if (cmd === "git" && args[0] === "remote") return "https://github.com/Masar-X/Masar-x.git\n";
          if (cmd === "gh" && args[0] === "label" && args[1] === "list") return "[]";
          throw new Error(`Should not execute gh in dry-run: ${cmd} ${args.join(" ")}`);
        };

        const res = runSyncIssues([], {
          cwd: rootDir,
          tasksDir,
          exec,
          out: (m) => stdout.push(m),
          err: () => {},
        });
        assert.equal(res.exitCode, 0);
        assert.equal(res.applied, false);
        const output = stdout.join("\n");
        assert.match(output, /gh issue create/);
        assert.match(output, /T-001 Rotate secrets/);
        // The only GitHub call is the read-only label listing.
        assert.deepEqual(
          calls.filter((c) => c[0] === "gh").map((c) => c.slice(0, 3).join(" ")),
          ["gh label list"]
        );
        // No scheme label exists here, so every one gets a create command, before the issues.
        assert.equal(res.labelCommands.length, LABEL_SCHEME.length);
        assert.match(output, /gh label create "needs: owner" --repo Masar-X\/Masar-x --color FBCA04/);
        assert.ok(output.indexOf("gh label create") < output.indexOf("gh issue create"));

        // Verify buildIssueCreateArgs directly
        const { cards } = loadTaskCards(tasksDir);
        const args = buildIssueCreateArgs(cards[0], { repo: "Masar-X/Masar-x" });
        assert.ok(args.includes("T-001 Rotate secrets"));
        assert.ok(args.includes("priority: P0"));
        assert.ok(args.includes("area: security"));
        assert.ok(args.includes("needs: owner"));
        assert.ok(!args.includes("owner-action"));
      }
    );
  });

  it("sync-issues --apply creates missing labels, then missing issues, and skips existing ones", () => {
    withTempTasksDir(
      {
        "T-001.md": makeCardMarkdown({ id: "T-001", title: "Already exists", priority: "P0", area: "web" }),
        "T-002.md": makeCardMarkdown({ id: "T-002", title: "New task", priority: "P1", area: "ci" }),
      },
      ({ rootDir, tasksDir }) => {
        const createdTitles = [];
        const createdLabels = [];
        const exec = (cmd, args) => {
          if (cmd === "git" && args[0] === "remote") return "https://github.com/Masar-X/Masar-x.git\n";
          if (cmd === "gh" && args[0] === "label" && args[1] === "list") {
            return JSON.stringify([{ name: "needs: owner" }, { name: "priority: P0" }]);
          }
          if (cmd === "gh" && args[0] === "label" && args[1] === "create") {
            createdLabels.push(args[2]);
            return "";
          }
          if (cmd === "gh" && args[0] === "issue" && args[1] === "list") {
            return JSON.stringify([{ title: "T-001 Already exists" }]);
          }
          if (cmd === "gh" && args[0] === "issue" && args[1] === "create") {
            const titleIdx = args.indexOf("--title");
            createdTitles.push(args[titleIdx + 1]);
            return "https://github.com/Masar-X/Masar-x/issues/99\n";
          }
          throw new Error(`Unexpected: ${cmd} ${args.join(" ")}`);
        };

        const res = runSyncIssues(["--apply"], {
          cwd: rootDir,
          tasksDir,
          exec,
          out: () => {},
          err: () => {},
        });
        assert.equal(res.exitCode, 0);
        assert.equal(res.applied, true);
        // Two labels already exist; the other nine are created first.
        assert.equal(res.labelCommands.length, LABEL_SCHEME.length - 2);
        assert.ok(createdLabels.includes("priority: P1") && createdLabels.includes("area: ci"));
        assert.ok(!createdLabels.includes("needs: owner") && !createdLabels.includes("priority: P0"));
        assert.deepEqual(res.skippedExisting, ["T-001"]);
        assert.deepEqual(createdTitles, ["T-002 New task"]);
      }
    );
  });
});

describe("lint and Evidence rule", () => {
  it("passes when - [x] is immediately followed by evidence: <cmd + output>", () => {
    withTempTasksDir(
      {
        "T-001.md": makeCardMarkdown(
          { id: "T-001" },
          {
            extraAcceptance: [
              "- [x] Checked item with evidence",
              "  evidence: pnpm test -> 12 passed",
            ].join("\n"),
          }
        ),
      },
      ({ rootDir, tasksDir }) => {
        const res = runLint({
          cwd: rootDir,
          tasksDir,
          out: () => {},
          err: () => {},
        });
        assert.equal(res.exitCode, 0);
        assert.deepEqual(res.errors, []);
      }
    );
  });

  it("fails with file:line when - [x] lacks an immediate evidence: line", () => {
    withTempTasksDir(
      {
        "T-001.md": makeCardMarkdown(
          { id: "T-001" },
          {
            extraAcceptance: [
              "- [x] Checked item missing evidence",
              "- [ ] Next item",
            ].join("\n"),
          }
        ),
      },
      ({ rootDir, tasksDir }) => {
        const stderr = [];
        const res = runLint({
          cwd: rootDir,
          tasksDir,
          out: () => {},
          err: (m) => stderr.push(m),
        });
        assert.equal(res.exitCode, 1);
        assert.ok(res.errors.some((e) => /^docs\/tasks\/T-001\.md:\d+:.*evidence:/.test(e)));
      }
    );
  });

  it("fails on status: doing in frontmatter", () => {
    withTempTasksDir(
      {
        "T-001.md": makeCardMarkdown({ id: "T-001", status: "doing" }),
      },
      ({ rootDir, tasksDir }) => {
        const res = runLint({
          cwd: rootDir,
          tasksDir,
          out: () => {},
          err: () => {},
        });
        assert.equal(res.exitCode, 1);
        assert.ok(res.errors.some((e) => /invalid status 'doing'/.test(e)));
      }
    );
  });

  it("fails on unknown depends_on IDs, dependency cycles, empty touches, and missing sections", () => {
    withTempTasksDir(
      {
        "T-001.md": makeCardMarkdown({
          id: "T-001",
          depends_on: "[T-002, T-999]",
          touches: "[]",
        }),
        "T-002.md": makeCardMarkdown({
          id: "T-002",
          depends_on: "[T-001]",
        }),
      },
      ({ tasksDir }) => {
        const { cards } = loadTaskCards(tasksDir);
        const lint = lintCards(cards);
        assert.equal(lint.ok, false);
        assert.ok(lint.errors.some((e) => /unknown dependency 'T-999'/.test(e)));
        assert.ok(lint.errors.some((e) => /dependency cycle detected: T-001 -> T-002 -> T-001/.test(e)));
        assert.ok(lint.errors.some((e) => /'touches' must be a non-empty array/.test(e)));
      }
    );
  });
});

describe("PR #310 fixup: sub-cards and blocked PR touch isolation", () => {
  it("supports suffixed sub-card IDs (T-006a, T-006b, T-011a, T-017c) in lint, sort, deriveStatus, and release", () => {
    withTempTasksDir(
      {
        "T-017c-meta.md": makeCardMarkdown({
          id: "T-017c",
          priority: "P1",
          depends_on: "[T-011a]",
          touches: '["docs/tasks/INVENTORY-meta.md"]',
        }),
        "T-006b-ci.md": makeCardMarkdown({
          id: "T-006b",
          priority: "P0",
          depends_on: "[T-006a]",
          touches: '[".github/workflows/ci.yml"]',
        }),
        "T-006a-rls.md": makeCardMarkdown({
          id: "T-006a",
          priority: "P0",
          status: "done",
          touches: '["supabase/tests/rls-verify.sql"]',
        }),
        "T-011a-chat.md": makeCardMarkdown({
          id: "T-011a",
          priority: "P1",
          touches: '["apps/web/src/hooks/useAiChat.ts"]',
        }),
      },
      ({ rootDir, tasksDir }) => {
        const lint = runLint({ cwd: rootDir, tasksDir, out: () => {}, err: () => {} });
        assert.equal(lint.exitCode, 0);
        assert.equal(lint.cardCount, 4);

        const { cards } = loadTaskCards(tasksDir);
        const sorted = [...cards].sort(compareCards);
        assert.deepEqual(
          sorted.map((c) => c.id),
          ["T-006a", "T-006b", "T-011a", "T-017c"]
        );

        const cardsById = new Map(cards.map((c) => [c.id, c]));
        const remoteBranches = parseLsRemoteBranches("111\trefs/heads/task/T-011a\n");
        const openPrsByTaskId = parseOpenPrs(
          JSON.stringify([
            {
              headRefName: "task/T-006b",
              number: 201,
              url: "https://github.com/Masar-X/Masar-x/pull/201",
              labels: [],
            },
          ])
        );
        const state = { cardsById, remoteBranches, openPrsByTaskId };
        assert.equal(deriveCardStatus(cardsById.get("T-006a"), state), "done");
        assert.equal(deriveCardStatus(cardsById.get("T-006b"), state), "review");
        assert.equal(deriveCardStatus(cardsById.get("T-011a"), state), "doing");
        assert.equal(deriveCardStatus(cardsById.get("T-017c"), state), "waiting-deps");

        const deletedCalls = [];
        const rel = runRelease(["T-017c"], {
          now: () => Date.parse("2026-11-24T12:00:00Z"),
          exec: (cmd, args) => {
            if (cmd === "git" && args[0] === "remote") return "https://github.com/Masar-X/Masar-x.git\n";
            if (cmd === "git" && args[0] === "ls-remote") return "abc\trefs/heads/task/T-017c\n";
            if (cmd === "gh" && args[0] === "pr") return "[]";
            if (cmd === "gh" && args[0] === "api" && args[1]?.includes("/activity")) {
              return JSON.stringify([
                {
                  activity_type: "branch_creation",
                  ref: "refs/heads/task/T-017c",
                  timestamp: "2026-11-22T00:00:00Z",
                },
              ]);
            }
            if (cmd === "gh" && args[0] === "api" && args[1] === "-X") {
              deletedCalls.push(args.at(-1));
              return "";
            }
            throw new Error(`Unexpected: ${cmd} ${args.join(" ")}`);
          },
          out: () => {},
          err: () => {},
        });
        assert.equal(rel.exitCode, 0);
        assert.deepEqual(deletedCalls, ["repos/Masar-X/Masar-x/git/refs/heads/task/T-017c"]);
      }
    );
  });

  it("blocks overlapping touches against blocked open PRs without counting blocked toward WIP limit", () => {
    withTempTasksDir(
      {
        "T-001.md": makeCardMarkdown({ id: "T-001", priority: "P0", touches: '["apps/web/a.ts"]' }),
        "T-002.md": makeCardMarkdown({ id: "T-002", priority: "P0", touches: '["apps/web/b.ts"]' }),
        "T-003.md": makeCardMarkdown({
          id: "T-003",
          priority: "P0",
          owner_action: true,
          touches: '[".github/workflows/**"]',
        }),
        "T-004.md": makeCardMarkdown({
          id: "T-004",
          priority: "P0",
          touches: '[".github/workflows/ci.yml"]',
        }),
        "T-005.md": makeCardMarkdown({
          id: "T-005",
          priority: "P1",
          touches: '["packages/shared/**"]',
        }),
      },
      ({ tasksDir }) => {
        const { cards } = loadTaskCards(tasksDir);
        const gitState = {
          remoteBranches: parseLsRemoteBranches(
            [
              "111\trefs/heads/task/T-001",
              "222\trefs/heads/task/T-002",
              "333\trefs/heads/task/T-003",
            ].join("\n")
          ),
          openPrsByTaskId: parseOpenPrs(
            JSON.stringify([
              {
                headRefName: "task/T-002",
                number: 10,
                url: "https://github.com/Masar-X/Masar-x/pull/10",
                labels: [],
              },
              {
                headRefName: "task/T-003",
                number: 11,
                url: "https://github.com/Masar-X/Masar-x/pull/11",
                labels: [{ name: "blocked" }, { name: "owner-action" }],
              },
            ])
          ),
        };

        const selection = selectNextCandidates(cards, gitState);
        assert.equal(selection.ok, true);
        // T-001 (doing) + T-002 (review) = 2; T-003 (blocked) does NOT burn a WIP slot!
        assert.equal(selection.wipCount, 2);
        // T-004 overlaps T-003 (blocked), so it must be skipped and T-005 selected instead.
        assert.deepEqual(
          selection.candidates.map((c) => c.id),
          ["T-005"]
        );
        assert.ok(
          selection.skipped.some(
            (s) => s.id === "T-004" && /T-003 \(blocked\)/.test(s.reason)
          )
        );
      }
    );
  });
});

describe("PR #310 logic bugfix round", () => {
  it("isRefAlreadyExistsError matches Reference already exists only, not generic 422", () => {
    assert.equal(
      isRefAlreadyExistsError({ stderr: "gh: Reference already exists (HTTP 422)" }),
      true
    );
    assert.equal(
      isRefAlreadyExistsError({
        status: 422,
        stderr: "gh: Repository rule violations found (HTTP 422)",
      }),
      false
    );
    assert.equal(
      isRefAlreadyExistsError({
        status: 403,
        stderr: "gh: Resource not accessible by integration (HTTP 403)",
      }),
      false
    );
  });

  it("aborts immediately without retrying on non-collision 422 (Repository rule violations) and 403", () => {
    for (const failureCase of [
      {
        label: "non-collision 422",
        stderr: '{"message":"Repository rule violations found","status":"422"}',
        message: "HTTP 422",
      },
      {
        label: "403 forbidden",
        stderr: '{"message":"Resource not accessible by personal access token","status":"403"}',
        message: "HTTP 403",
      },
    ]) {
      withTempTasksDir(
        {
          "T-001.md": makeCardMarkdown({ id: "T-001", priority: "P0", touches: '["apps/web/a.ts"]' }),
          "T-002.md": makeCardMarkdown({ id: "T-002", priority: "P1", touches: '["apps/web/b.ts"]' }),
        },
        ({ rootDir, tasksDir }) => {
          const apiCalls = [];
          const stderr = [];
          const exec = (cmd, args) => {
            if (cmd === "git" && args[0] === "remote") return "https://github.com/Masar-X/Masar-x.git\n";
            if (cmd === "git" && args[0] === "fetch") return "";
            if (cmd === "git" && args[0] === "ls-tree") return "";
            if (cmd === "git" && args[0] === "ls-remote") return "";
            if (cmd === "gh" && args[0] === "issue") return "[]";
            if (cmd === "gh" && args[0] === "pr") return "[]";
            if (cmd === "git" && args[0] === "rev-parse") return "deadbeef\n";
            if (cmd === "gh" && args[0] === "api") {
              apiCalls.push(args.join(" "));
              const err = new Error(failureCase.message);
              err.stderr = failureCase.stderr;
              throw err;
            }
            throw new Error(`Unexpected: ${cmd} ${args.join(" ")}`);
          };

          const res = runNext([], {
            cwd: rootDir,
            tasksDir,
            exec,
            out: () => {},
            err: (m) => stderr.push(m),
          });

          assert.equal(res.exitCode, 1, failureCase.label);
          assert.equal(res.reason, "claim-rejected", failureCase.label);
          assert.equal(apiCalls.length, 1, `${failureCase.label}: must not retry T-002`);
          const errText = stderr.join("\n");
          assert.ok(errText.includes(failureCase.stderr), `${failureCase.label}: prints full body`);
          assert.match(errText, /Owner action required:.*rulesets|permissions/i);
        }
      );
    }
  });

  it("getLatestBranchActivity picks latest push/force_push/branch_creation and release refuses when API fails", () => {
    const latest = getLatestBranchActivity(
      [
        {
          activity_type: "branch_creation",
          ref: "refs/heads/task/T-001",
          timestamp: "2026-11-23T08:00:00Z",
        },
        {
          activity_type: "force_push",
          ref: "refs/heads/task/T-001",
          timestamp: "2026-11-24T09:00:00Z",
        },
        {
          activity_type: "branch_deletion",
          ref: "refs/heads/task/T-001",
          timestamp: "2026-11-24T11:30:00Z",
        },
      ],
      "T-001"
    );
    assert.equal(latest.activityType, "force_push");
    assert.equal(latest.timestamp, "2026-11-24T09:00:00Z");

    const stderr = [];
    const failed = runRelease(["T-001"], {
      now: () => Date.parse("2026-11-24T12:00:00Z"),
      exec: (cmd, args) => {
        if (cmd === "git" && args[0] === "remote") return "https://github.com/Masar-X/Masar-x.git\n";
        if (cmd === "git" && args[0] === "ls-remote") return "111\trefs/heads/task/T-001\n";
        if (cmd === "gh" && args[0] === "pr") return "[]";
        if (cmd === "gh" && args[0] === "api" && args[1]?.includes("/activity")) {
          const err = new Error("API 500");
          err.stderr = "Internal Server Error";
          throw err;
        }
        throw new Error(`Unexpected: ${cmd} ${args.join(" ")}`);
      },
      out: () => {},
      err: (m) => stderr.push(m),
    });
    assert.equal(failed.exitCode, 1);
    assert.equal(failed.reason, "no-activity");
    assert.match(stderr.join("\n"), /--force/);
  });

  it("reads done status authoritatively from origin/main when docs/tasks exists there", () => {
    // Case 1: origin/main has T-001 as done while local worktree has T-001 as todo -> unlocks T-002
    withTempTasksDir(
      {
        "T-001.md": makeCardMarkdown({ id: "T-001", priority: "P0", status: "todo", touches: '["a.ts"]' }),
        "T-002.md": makeCardMarkdown({
          id: "T-002",
          priority: "P0",
          status: "todo",
          depends_on: "[T-001]",
          touches: '["b.ts"]',
        }),
      },
      ({ rootDir, tasksDir }) => {
        const exec = (cmd, args) => {
          if (cmd === "git" && args[0] === "remote") return "https://github.com/Masar-X/Masar-x.git\n";
          if (cmd === "git" && args[0] === "fetch") return "";
          if (cmd === "git" && args[0] === "ls-tree") {
            return ["docs/tasks/T-001.md", "docs/tasks/T-002.md"].join("\n");
          }
          if (cmd === "git" && args[0] === "show" && args[1] === "origin/main:docs/tasks/T-001.md") {
            return makeCardMarkdown({ id: "T-001", priority: "P0", status: "done", touches: '["a.ts"]' });
          }
          if (cmd === "git" && args[0] === "show" && args[1] === "origin/main:docs/tasks/T-002.md") {
            return makeCardMarkdown({
              id: "T-002",
              priority: "P0",
              status: "todo",
              depends_on: "[T-001]",
              touches: '["b.ts"]',
            });
          }
          if (cmd === "git" && args[0] === "ls-remote") return "";
          if (cmd === "gh" && args[0] === "issue") return "[]";
          if (cmd === "gh" && args[0] === "pr") return "[]";
          throw new Error(`Unexpected: ${cmd} ${args.join(" ")}`);
        };

        const statusRes = runStatus({ cwd: rootDir, tasksDir, exec, out: () => {}, err: () => {} });
        assert.equal(statusRes.exitCode, 0);
        assert.equal(statusRes.rows.find((r) => r.id === "T-001").status, "done");
        assert.equal(statusRes.rows.find((r) => r.id === "T-002").status, "todo");

        const nextRes = runNext(["--dry-run"], {
          cwd: rootDir,
          tasksDir,
          exec,
          out: () => {},
          err: () => {},
        });
        assert.equal(nextRes.exitCode, 0);
        assert.equal(nextRes.selected.id, "T-002");
      }
    );

    // Case 2: local worktree has T-001 as done while origin/main has T-001 as todo -> status sees todo
    withTempTasksDir(
      {
        "T-001.md": makeCardMarkdown({ id: "T-001", priority: "P0", status: "done", touches: '["a.ts"]' }),
      },
      ({ rootDir, tasksDir }) => {
        const exec = (cmd, args) => {
          if (cmd === "git" && args[0] === "remote") return "https://github.com/Masar-X/Masar-x.git\n";
          if (cmd === "git" && args[0] === "fetch") return "";
          if (cmd === "git" && args[0] === "ls-tree") return "docs/tasks/T-001.md\n";
          if (cmd === "git" && args[0] === "show" && args[1] === "origin/main:docs/tasks/T-001.md") {
            return makeCardMarkdown({ id: "T-001", priority: "P0", status: "todo", touches: '["a.ts"]' });
          }
          if (cmd === "git" && args[0] === "ls-remote") return "";
          if (cmd === "gh" && args[0] === "issue") return "[]";
          if (cmd === "gh" && args[0] === "pr") return "[]";
          throw new Error(`Unexpected: ${cmd} ${args.join(" ")}`);
        };

        const statusRes = runStatus({ cwd: rootDir, tasksDir, exec, out: () => {}, err: () => {} });
        assert.equal(statusRes.exitCode, 0);
        assert.equal(statusRes.rows.find((r) => r.id === "T-001").status, "todo");

        const { cards } = loadTaskCards(tasksDir);
        const applied = applyMainCardStatuses(cards, exec, rootDir, { skipFetch: true });
        assert.equal(applied.source, "origin/main");
        assert.equal(cards[0].status, "todo");
      }
    );
  });

  it("blocked status comes from the owner label on the linked Issue once a card is in flight", () => {
    const calledCommands = [];
    withTempTasksDir(
      {
        "T-001.md": makeCardMarkdown({
          id: "T-001",
          owner_action: true,
          touches: '["docs/a.md"]',
        }),
      },
      ({ rootDir, tasksDir }) => {
        const exec = (cmd, args) => {
          calledCommands.push(`${cmd} ${args.join(" ")}`);
          if (cmd === "git" && args[0] === "remote") return "https://github.com/Masar-X/Masar-x.git\n";
          if (cmd === "git" && args[0] === "fetch") return "";
          if (cmd === "git" && args[0] === "ls-tree") return "";
          if (cmd === "git" && args[0] === "ls-remote") return "";
          if (cmd === "gh" && args[0] === "pr") return "[]";
          if (cmd === "gh" && args[0] === "issue") {
            return JSON.stringify([{ title: "T-001 Sample task", labels: [{ name: "needs: owner" }] }]);
          }
          throw new Error(`Unexpected: ${cmd} ${args.join(" ")}`);
        };

        const statusRes = runStatus({ cwd: rootDir, tasksDir, exec, out: () => {}, err: () => {} });
        assert.equal(statusRes.exitCode, 0);
        // The Issue carries the label but nothing is in flight: still `todo`.
        assert.equal(statusRes.rows[0].status, "todo");
        assert.ok(calledCommands.some((c) => c.startsWith("gh issue list")));

        // The same labeled Issue with the branch in flight: `blocked`, and no WIP slot used.
        const inFlightExec = (cmd, args) =>
          cmd === "git" && args[0] === "ls-remote" ? "111\trefs/heads/task/T-001\n" : exec(cmd, args);
        const inFlight = runStatus({ cwd: rootDir, tasksDir, exec: inFlightExec, out: () => {}, err: () => {} });
        assert.equal(inFlight.rows[0].status, "blocked");
        assert.equal(inFlight.wipCount, 0);

        const issueArgs = buildIssueCreateArgs(statusRes.rows[0].card, { repo: "Masar-X/Masar-x" });
        const bodyArg = issueArgs[issueArgs.indexOf("--body") + 1];
        assert.doesNotMatch(bodyArg, /blocked|changes status/i);
        assert.ok(issueArgs.includes("needs: owner"));
      }
    );
  });
});
