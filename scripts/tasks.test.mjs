import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  DEFAULT_WIP_LIMIT,
  buildIssueCreateArgs,
  compareCards,
  computeStatusRows,
  deriveCardStatus,
  globsOverlap,
  lintCards,
  loadTaskCards,
  normalizePosixPath,
  parseFrontmatter,
  parseLsRemoteBranches,
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
    assert.equal(deriveCardStatus(cards[4], state), "review"); // open PR without blocked/owner-action
    assert.equal(deriveCardStatus(cards[5], state), "blocked"); // open PR with owner-action
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
          if (cmd === "git" && args[0] === "ls-remote") {
            return [
              "111\trefs/heads/task/T-001",
              "222\trefs/heads/task/T-002",
              "333\trefs/heads/task/T-003",
            ].join("\n");
          }
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
          if (cmd === "git" && args[0] === "ls-remote") return "111\trefs/heads/task/T-001\n";
          if (cmd === "gh" && args[0] === "pr") return "[]";
          if (cmd === "git" && args[0] === "fetch") return "";
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
        assert.match(stderr.join("\n"), /422.*T-003/);
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
          if (cmd === "git" && args[0] === "ls-remote") return "111\trefs/heads/task/T-001\n";
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
      if (cmd === "gh" && args[0] === "api" && args[1]?.includes("/commits/")) {
        return "2026-11-20T00:00:00Z\n";
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

  it("refuses release when last commit is < 24h old unless --force, and allows >= 24h", () => {
    const makeExec = (commitDate) => {
      const calls = [];
      const exec = (cmd, args) => {
        calls.push([cmd, ...args]);
        if (cmd === "git" && args[0] === "remote") return "https://github.com/Masar-X/Masar-x.git\n";
        if (cmd === "git" && args[0] === "ls-remote") return "111\trefs/heads/task/T-002\n";
        if (cmd === "gh" && args[0] === "pr") return "[]";
        if (cmd === "gh" && args[0] === "api" && args[1]?.includes("/commits/")) {
          return `${commitDate}\n`;
        }
        if (cmd === "gh" && args[0] === "api" && args[1] === "-X") return "";
        throw new Error(`Unexpected: ${cmd} ${args.join(" ")}`);
      };
      return { exec, calls };
    };

    // 5 hours ago -> refuse
    const recent = makeExec("2026-11-24T07:00:00Z");
    const r1 = runRelease(["T-002"], {
      exec: recent.exec,
      now: () => nowMs,
      out: () => {},
      err: () => {},
    });
    assert.equal(r1.exitCode, 1);
    assert.equal(r1.reason, "recent-commit");
    assert.equal(recent.calls.some((c) => c.includes("DELETE")), false);

    // 5 hours ago with --force -> delete
    const r2 = runRelease(["T-002", "--force"], {
      exec: recent.exec,
      now: () => nowMs,
      out: () => {},
      err: () => {},
    });
    assert.equal(r2.exitCode, 0);
    assert.equal(recent.calls.some((c) => c.includes("DELETE")), true);

    // 25 hours ago -> delete without --force
    const stale = makeExec("2026-11-23T11:00:00Z");
    const r3 = runRelease(["T-002"], {
      exec: stale.exec,
      now: () => nowMs,
      out: () => {},
      err: () => {},
    });
    assert.equal(r3.exitCode, 0);
    assert.equal(stale.calls.some((c) => c.includes("DELETE")), true);
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
          if (cmd === "git" && args[0] === "ls-remote") return "111\trefs/heads/task/T-002\n";
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

  it("sync-issues is dry-run by default and builds labels including owner-action", () => {
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
        assert.match(output, /owner-action/);
        assert.equal(calls.some((c) => c[0] === "gh"), false);

        // Verify buildIssueCreateArgs directly
        const { cards } = loadTaskCards(tasksDir);
        const args = buildIssueCreateArgs(cards[0], { repo: "Masar-X/Masar-x" });
        assert.ok(args.includes("T-001 Rotate secrets"));
        assert.ok(args.includes("P0"));
        assert.ok(args.includes("security"));
        assert.ok(args.includes("owner-action"));
      }
    );
  });

  it("sync-issues --apply creates missing issues and skips existing ones", () => {
    withTempTasksDir(
      {
        "T-001.md": makeCardMarkdown({ id: "T-001", title: "Already exists", priority: "P0", area: "web" }),
        "T-002.md": makeCardMarkdown({ id: "T-002", title: "New task", priority: "P1", area: "ci" }),
      },
      ({ rootDir, tasksDir }) => {
        const createdTitles = [];
        const exec = (cmd, args) => {
          if (cmd === "git" && args[0] === "remote") return "https://github.com/Masar-X/Masar-x.git\n";
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
            if (cmd === "gh" && args[0] === "api" && args[1]?.includes("/commits/")) {
              return "2026-11-22T00:00:00Z\n";
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
