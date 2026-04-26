# Plugin Improvement Next Prompts

The following prompts are ready-to-use implementation prompts for the top 5 follow-up tasks from the audit. Each prompt is written for a deep implementation run and assumes the agent must inspect real code first.

## 1. Persist Pending Writeback Recovery

### Prompt title

`pending-writeback-persistence`

### Prompt

```text
Use the attached request as the primary reference for this task.

Repository: Anki Heading Sync Obsidian plugin.

Goal:
Persist pending markdown write-back recovery across plugin reloads/restarts.

Important instructions:
- Do a real code review first. Do not guess.
- Start from the actual current implementation of pending write-back:
  - src/application/services/MarkdownWriteBackService.ts
  - src/application/services/FileIndexerService.ts
  - src/infrastructure/persistence/DataJsonPluginStateRepository.ts
  - src/infrastructure/persistence/DataJsonPluginStateRepository.test.ts
- Verify how pendingWriteBack is produced, consumed, saved, and loaded.
- Minimize source changes. Do not rewrite unrelated persistence code.

Required workflow:
1. Inspect the real repository code in depth.
2. Write a gap report to:
   docs/pending-writeback-persistence-gap-report.md
3. Write a decisions doc to:
   docs/pending-writeback-persistence-decisions.md
4. Implement the fix.
5. Add or update tests.
6. Run validation:
   - npm run lint
   - npm test
7. If validation passes, run build and sync built plugin artifacts to the Obsidian plugin directory.
8. Commit the work with a bilingual commit message.

Implementation requirements:
- Preserve modern pendingWriteBack entries on load.
- Keep any required legacy migration behavior explicit and isolated.
- Ensure restart/reload does not silently discard recovery entries.
- Do not modify production behavior outside this slice unless required by the fix.

Validation requirements:
- Add at least one round-trip persistence test for pendingWriteBack.
- Add at least one recovery-oriented test proving the loaded state is usable.

Build and sync requirements:
- After passing lint/tests, run the project build.
- Sync only built plugin files:
  - main.js
  - manifest.json
  - styles.css if present
- Do not delete or overwrite data.json.

Commit requirements:
- Commit only the relevant source/test/docs changes for this task.
- Use a bilingual commit message.

Final response format:
1. gap summary
2. decisions made
3. files changed
4. tests added/updated
5. commands run and results
6. final commit hash
7. final bilingual commit message
8. whether plugin artifacts were synced
9. known risks
```

## 2. Add AnkiConnect Health Check and Timeout UX

### Prompt title

`anki-health-check-timeout-ux`

### Prompt

```text
Use the attached request as the primary reference for this task.

Repository: Anki Heading Sync Obsidian plugin.

Goal:
Add explicit AnkiConnect health-check and timeout-aware offline UX.

Important instructions:
- Review the real repository code before making recommendations or edits.
- Start from these files:
  - src/infrastructure/anki/AnkiConnectGateway.ts
  - src/presentation/AnkiHeadingSyncPlugin.ts
  - src/presentation/settings/PluginSettingTab.ts
  - src/application/errors/PluginUserError.ts
  - src/presentation/i18n/messages/en.ts
  - src/presentation/i18n/messages/zh.ts
- Do not add generic status UI. Make it fit the existing plugin architecture.

Required workflow:
1. Inspect the real code path for current sync failures and settings UI.
2. Write a gap report to:
   docs/anki-health-check-timeout-gap-report.md
3. Write a decisions doc to:
   docs/anki-health-check-timeout-decisions.md
4. Implement the feature.
5. Add tests.
6. Run validation:
   - npm run lint
   - npm test
7. If validation passes, run build and sync built plugin files.
8. Commit with a bilingual commit message.

Implementation requirements:
- Add an explicit gateway-level health-check path.
- Add timeout-aware handling for slow/offline AnkiConnect behavior.
- Surface a user-facing check in settings and improve sync error messages.
- Keep the UI concise and aligned with the current settings page.

Testing requirements:
- Add gateway tests for timeout/offline behavior.
- Add plugin/settings tests for the user-facing health-check or error surface.

Build and sync requirements:
- Sync only main.js, manifest.json, and styles.css if present.
- Never overwrite or delete data.json.

Final response format:
1. gap summary
2. decisions made
3. files changed
4. UX changes delivered
5. tests added/updated
6. commands run and results
7. final commit hash
8. final bilingual commit message
9. whether plugin artifacts were synced
10. known follow-ups
```

## 3. Bring Semantic QA to Settings Parity

### Prompt title

`semantic-qa-settings-parity`

### Prompt

```text
Use the attached request as the primary reference for this task.

Repository: Anki Heading Sync Obsidian plugin.

Goal:
Resolve the mismatch where semantic QA is active in runtime but not surfaced in the settings UI.

Important instructions:
- Inspect the real repository code first.
- Start from:
  - src/application/config/PluginSettings.ts
  - src/domain/manual-sync/services/CardIndexingService.ts
  - src/application/services/RenderConfigService.ts
  - src/application/services/NoteFieldMappingService.ts
  - src/presentation/settings/PluginSettingTab.ts
  - src/presentation/settings/PluginSettingTab.test.ts
- Decide whether semantic QA should be fully exposed or intentionally gated/disabled, but justify the decision from real code.

Required workflow:
1. Inspect the actual runtime and settings code.
2. Write a gap report to:
   docs/semantic-qa-settings-parity-gap-report.md
3. Write a decisions doc to:
   docs/semantic-qa-settings-parity-decisions.md
4. Implement the chosen direction.
5. Add tests.
6. Run validation:
   - npm run lint
   - npm test
7. If validation passes, run build and sync built plugin files.
8. Commit with a bilingual commit message.

Implementation requirements:
- If semantic QA remains active runtime behavior, users must be able to configure it coherently.
- If semantic QA is intentionally not ready, runtime behavior must not silently remain active and unconfigurable.
- Preserve existing behavior for basic, cloze, and QA Group paths.

Testing requirements:
- Add settings UI coverage for semantic QA.
- Add runtime sync coverage for the chosen semantic QA behavior.

Build and sync requirements:
- Sync only built plugin files.
- Do not overwrite data.json.

Final response format:
1. gap summary
2. decision taken and why
3. files changed
4. UX impact
5. tests added/updated
6. commands run and results
7. final commit hash
8. final bilingual commit message
9. whether plugin artifacts were synced
10. known tradeoffs
```

## 4. Harden Clear Current File Reset

### Prompt title

`clear-current-file-reset-hardening`

### Prompt

```text
Use the attached request as the primary reference for this task.

Repository: Anki Heading Sync Obsidian plugin.

Goal:
Make “clear current file synced cards” safer under marker conflicts and partial failure.

Important instructions:
- Review the real code before changing anything.
- Start from:
  - src/application/use-cases/ClearCurrentFileSyncedCardsUseCase.ts
  - src/application/services/MarkdownSyncedMarkerRemovalService.ts
  - src/infrastructure/persistence/DataJsonPluginStateRepository.ts
  - src/application/use-cases/ClearCurrentFileSyncedCardsUseCase.test.ts
- Keep the change narrowly scoped to reset safety and recoverability.

Required workflow:
1. Inspect the real destructive path and its current tests.
2. Write a gap report to:
   docs/clear-current-file-reset-hardening-gap-report.md
3. Write a decisions doc to:
   docs/clear-current-file-reset-hardening-decisions.md
4. Implement the hardening.
5. Add tests.
6. Run validation:
   - npm run lint
   - npm test
7. If validation passes, run build and sync built plugin files.
8. Commit with a bilingual commit message.

Implementation requirements:
- Avoid ending in a state where remote notes are deleted but local cleanup cannot be resumed safely.
- If a staged or pending reset state is needed, make it explicit.
- Preserve existing user-facing command behavior unless the safety fix requires improved messaging.

Testing requirements:
- Add tests for marker conflict or cleanup failure after remote deletion would otherwise occur.
- Add retry/resume coverage if new state is introduced.

Build and sync requirements:
- Sync only built plugin files.
- Do not overwrite data.json.

Final response format:
1. gap summary
2. decisions made
3. files changed
4. safety behavior changed
5. tests added/updated
6. commands run and results
7. final commit hash
8. final bilingual commit message
9. whether plugin artifacts were synced
10. residual risks
```

## 5. Unify QA Group Model Authority

### Prompt title

`qa-group-authority-unification`

### Prompt

```text
Use the attached request as the primary reference for this task.

Repository: Anki Heading Sync Obsidian plugin.

Goal:
Unify the QA Group note-model strategy so the plugin no longer carries both an active user-selected path and a dormant managed-model branch.

Important instructions:
- Inspect the real code first.
- Start from:
  - src/application/services/QaGroupSyncService.ts
  - src/application/services/QaGroupFieldMappingService.ts
  - src/application/services/QaGroupModelService.ts
  - src/application/services/QaGroupModelDefinition.ts
  - src/application/config/ManagedNoteModels.ts
  - src/presentation/settings/PluginSettingTab.ts
  - src/presentation/i18n/messages/en.ts
  - src/presentation/i18n/messages/zh.ts
- Decide one product authority model and remove or fully integrate the other.

Required workflow:
1. Inspect the real production call sites and tests.
2. Write a gap report to:
   docs/qa-group-authority-unification-gap-report.md
3. Write a decisions doc to:
   docs/qa-group-authority-unification-decisions.md
4. Implement the chosen authority model.
5. Add tests.
6. Run validation:
   - npm run lint
   - npm test
7. If validation passes, run build and sync built plugin files.
8. Commit with a bilingual commit message.

Implementation requirements:
- The final codebase should tell one coherent QA Group story.
- Align settings copy, tests, and runtime behavior with that story.
- Remove or archive dead production code if it is no longer part of the chosen path.

Testing requirements:
- Add or update tests so the chosen QA Group authority path is fully covered.
- Remove misleading tests that only validate dead code paths.

Build and sync requirements:
- Sync only built plugin files.
- Do not overwrite data.json.

Final response format:
1. gap summary
2. authority model chosen and why
3. files changed
4. runtime/UI alignment changes
5. tests added/updated
6. commands run and results
7. final commit hash
8. final bilingual commit message
9. whether plugin artifacts were synced
10. follow-up migration tasks
```