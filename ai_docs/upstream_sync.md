# Maintaining the TypeScript Fork Against Upstream igv.js

## Overview

This repository is a TypeScript fork of [igvteam/igv.js](https://github.com/igvteam/igv.js). The upstream maintainers develop in JavaScript; this fork renames `.js` → `.ts`, adds type annotations, and enables strict TypeScript checking.

**What diverges:**
- ~247 files renamed from `.js` to `.ts`
- Type annotations, interfaces, and strict mode (`noImplicitAny`, `strictNullChecks`, etc.)
- Shared type definitions in `js/types/` (new directory)
- `tsconfig.json` configuration
- Import paths updated from `.js` to `.ts` extensions within renamed files

**What stays shared:**
- All runtime logic, algorithms, and rendering code
- Test suite (`test/`)
- Dependencies (`package.json`)
- Build configuration (rollup, etc.)

### Git Structure

```
origin    → riyavsinha/igv.js    (your fork)
upstream  → igvteam/igv.js       (upstream JS repo)

Branch: ts  (26+ commits ahead of upstream/master at fork point 1b86936e9)
```

---

## Sync Workflow

### 1. Fetch upstream changes

```bash
git fetch upstream
```

### 2. Check what's new

```bash
# See new upstream commits since last sync
git log --oneline $(git merge-base ts upstream/master)..upstream/master
```

If empty, there's nothing to sync.

### 3. Merge upstream into your TS branch

```bash
git checkout ts
git merge upstream/master
```

**Why merge, not rebase:** With ~247 file renames, rebase replays each of your commits on top of upstream and must re-detect renames at every step. This is slow, error-prone, and produces repeated conflicts. A merge commit is a single conflict-resolution point and preserves upstream's commit history intact.

### 4. Resolve conflicts

See [Conflict Resolution Patterns](#conflict-resolution-patterns) below.

### 5. Verify

```bash
npx tsc --noEmit          # Type checking — must be 0 errors
npx mocha                 # Tests — expect ~245 passing
npx eslint js/            # Lint
```

### 6. Push

```bash
git push origin ts
```

---

## Conflict Resolution Patterns

### Pattern 1: Upstream modified a file you renamed (most common)

Git usually detects the rename and applies upstream's changes to your `.ts` file automatically. When it can't (e.g., upstream changed lines near your type annotations), you'll see a conflict in the `.ts` file.

**Resolution:**
1. Open the conflicted `.ts` file
2. Accept upstream's logic changes
3. Re-apply type annotations to the changed lines
4. The key insight: upstream changes are always *logic* (new features, bug fixes); your changes are always *types*. They rarely truly conflict — just merge the logic and re-type it.

```bash
# Example: upstream changed wigTrack.js, you have wigTrack.ts
# Git will conflict on wigTrack.ts
# Accept upstream logic, re-add type annotations
```

### Pattern 2: Upstream added a new `.js` file

Git won't conflict — the new file just appears as `.js`. You need to manually convert it.

**Resolution:**
1. Rename the file: `git mv js/path/newFile.js js/path/newFile.ts`
2. Add type annotations (parameters, return types, interfaces)
3. Update any imports in other `.ts` files that reference it
4. Add it to the appropriate phase in `ai_docs/ts_migration.md` if tracking

### Pattern 3: Upstream changed logic in a file you also modified

This happens when you've done more than just rename + type — e.g., fixed a bug or optimized code (tracked in `ai_docs/optimizations.md`). These are true content conflicts.

**Resolution:**
1. Evaluate whether upstream's change supersedes your fix
2. If upstream fixed the same bug differently, prefer upstream's fix (less maintenance burden)
3. If your optimization is orthogonal to upstream's change, keep both
4. Document the decision in `ai_docs/optimizations.md`

### Pattern 4: Upstream deleted or moved a file you renamed

Rare. Git may get confused and show both a delete and an add.

**Resolution:**
1. If upstream deleted the file, delete your `.ts` version too
2. If upstream moved/renamed it (`.js` → different `.js` path), apply the same move to your `.ts` version
3. Check for stale imports referencing the old path

---

## Handling New Upstream Files

When upstream adds new `.js` files that weren't part of your original migration:

### Quick conversion checklist

1. **Rename**: `git mv path/file.js path/file.ts`
2. **Imports**: Update import extensions if the file imports other renamed files
3. **Parameters**: Add types to function parameters (no implicit `any`)
4. **Return types**: Add explicit return types to exported functions
5. **Interfaces**: Create or reuse interfaces from `js/types/` for object shapes
6. **Strict null**: Handle potential `undefined`/`null` values (`strictNullChecks` is on)
7. **Verify**: `npx tsc --noEmit` must pass with 0 errors

### Where to find type definitions

- `js/types/ui.ts` — Track, DrawConfiguration, ClickState, MenuItem, DataRange
- `js/types/feature.ts` — GenomicFeature, PopupData, Exon, BedpeFeature
- `js/types/config.ts` — TrackConfig, BrowserConfig
- `js/types/browser.ts` — Browser-related types
- `CLAUDE.md` — Full typing conventions and patterns

---

## Post-Merge Checklist

After every upstream merge:

- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `npx mocha` — ~245 passing (2 pre-existing timeout failures are expected)
- [ ] `npx eslint js/` — no new warnings
- [ ] Scan `git diff --stat` for any new `.js` files that need `.ts` conversion
- [ ] Check `package.json` for dependency changes — run `npm install` if needed
- [ ] If upstream updated `rollup.config.js` or build tooling, verify `npm run build` still works

---

## Automation

### Detecting upstream changes (GitHub Actions)

Add to `.github/workflows/upstream-check.yml`:

```yaml
name: Check Upstream
on:
  schedule:
    - cron: '0 9 * * 1'  # Weekly on Monday
  workflow_dispatch:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Fetch upstream
        run: |
          git remote add upstream https://github.com/igvteam/igv.js.git || true
          git fetch upstream

      - name: Check for new commits
        id: check
        run: |
          MERGE_BASE=$(git merge-base HEAD upstream/master)
          NEW_COMMITS=$(git log --oneline $MERGE_BASE..upstream/master | wc -l)
          echo "new_commits=$NEW_COMMITS" >> $GITHUB_OUTPUT
          if [ "$NEW_COMMITS" -gt 0 ]; then
            echo "::notice::$NEW_COMMITS new upstream commits since last sync"
            git log --oneline $MERGE_BASE..upstream/master
          fi

      - name: Create issue if behind
        if: steps.check.outputs.new_commits > 0
        uses: actions/github-script@v7
        with:
          script: |
            const existing = await github.rest.issues.listForRepo({
              owner: context.repo.owner,
              repo: context.repo.repo,
              labels: 'upstream-sync',
              state: 'open'
            });
            if (existing.data.length === 0) {
              await github.rest.issues.create({
                owner: context.repo.owner,
                repo: context.repo.repo,
                title: 'Upstream igv.js has new commits',
                body: `There are ${{ steps.check.outputs.new_commits }} new commits on igvteam/igv.js master since the last sync.\n\nRun:\n\`\`\`bash\ngit fetch upstream\ngit merge upstream/master\n\`\`\``,
                labels: ['upstream-sync']
              });
            }
```

### Local shortcut

Add to your shell profile or as a git alias:

```bash
# Check for upstream changes
alias igv-upstream='cd ~/projects/igv.js && git fetch upstream && git log --oneline $(git merge-base ts upstream/master)..upstream/master'

# Or as a git alias
git config alias.upstream-check '!git fetch upstream && git log --oneline $(git merge-base HEAD upstream/master)..upstream/master'
```

---

## Tips

- **Sync frequently.** Small merges are far easier than large ones. Weekly or bi-weekly is ideal.
- **Don't squash your TS commits.** Keeping granular history helps git's rename detection during merges.
- **Tag sync points.** After each successful merge: `git tag upstream-sync-$(date +%Y%m%d)`
- **Keep `ai_docs/optimizations.md` updated.** If you fix bugs or optimize code beyond typing, document it — you'll need to re-evaluate these during merges.
- **Test before and after.** Run `npx mocha` before merging to ensure your branch is clean, then again after to catch regressions.
