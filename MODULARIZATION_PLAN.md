# Modularization Plan for Multiple Lottery Support

## Current Structure Analysis

### Existing Files
- **Workflow**: `.github/workflows/playwright.yml` - Runs all Playwright tests
- **Test File**: `e2e/broadway-direct.spec.ts` - BroadwayDirect lottery tests
- **Source File**: `src/broadway-direct.ts` - BroadwayDirect lottery logic
- **Shared Utilities**:
  - `src/get-user-info.ts` - User info extraction from env vars
  - `src/types.ts` - Shared TypeScript types
  - `src/email-confirmation.ts` - Email confirmation handling

## Required Changes for Modularity

### 1. Workflow Files

**Current Issue**: The workflow runs `npx playwright test` which executes ALL tests in the `e2e/` directory.

**Solution**:
- Rename `playwright.yml` → `broadway-direct-lottery.yml`
- Update test command to target specific file: `npx playwright test e2e/broadway-direct.spec.ts`
- Create new `telecharge-lottery.yml` workflow that runs `npx playwright test e2e/telecharge.spec.ts`

### 2. Test Files

**Current**: `e2e/broadway-direct.spec.ts` (already well-named)

**Needed**:
- Keep `e2e/broadway-direct.spec.ts` for BroadwayDirect
- Create `e2e/telecharge.spec.ts` for Telecharge lottery

### 3. Source Files

**Current**: `src/broadway-direct.ts` (already well-named)

**Needed**:
- Keep `src/broadway-direct.ts` for BroadwayDirect
- Create `src/telecharge.ts` for Telecharge lottery logic

### 4. Shared Components

These can remain shared across both lotteries:
- ✅ `src/get-user-info.ts` - Both lotteries need user info
- ✅ `src/types.ts` - May need to extend with Telecharge-specific types
- ⚠️ `src/email-confirmation.ts` - Review if Telecharge uses different email patterns

### 5. Configuration

**Playwright Config**: `playwright.config.ts` is already modular - it runs all tests in `e2e/` directory, which is fine since we'll target specific files in workflows.

## Implementation Steps

1. **Rename workflow file** for clarity
2. **Update workflow** to target specific test file
3. **Create Telecharge workflow** following the same pattern
4. **Ensure test files can be run independently** (already supported by Playwright)
5. **Update README** to document both workflows

## Key Modularity Principles

1. **Separate Workflows**: Each lottery has its own workflow file
2. **Separate Test Files**: Each lottery has its own test file
3. **Separate Source Files**: Each lottery has its own implementation
4. **Shared Utilities**: Common functionality remains shared
5. **Independent Execution**: Each workflow can run independently without affecting the other

## Workflow Naming Convention

- `broadway-direct-lottery.yml` - BroadwayDirect lottery automation
- `telecharge-lottery.yml` - Telecharge lottery automation
- `tests.yml` - Unit tests (Jest)

