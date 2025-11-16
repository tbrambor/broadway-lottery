.PHONY: help test test-headed test-headless install setup

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dependencies
	npm install
	npx playwright install chromium

setup: install ## Set up the project (install deps and browsers)
	@echo "✅ Setup complete!"
	@echo ""
	@echo "Next steps:"
	@echo "1. Set up environment variables:"
	@echo ""
	@echo "   Using direnv (recommended):"
	@echo "   cp .envrc.example .envrc"
	@echo "   # Edit .envrc with your information"
	@echo "   direnv allow"
	@echo ""
	@echo "   Or export in your shell:"
	@echo "   - FIRST_NAME"
	@echo "   - LAST_NAME"
	@echo "   - NUMBER_OF_TICKETS (1 or 2)"
	@echo "   - EMAIL"
	@echo "   - DOB_MONTH (1-12)"
	@echo "   - DOB_DAY (1-31)"
	@echo "   - DOB_YEAR (e.g., 1999)"
	@echo "   - ZIP"
	@echo "   - COUNTRY (USA, CANADA, or OTHER)"
	@echo ""
	@echo "2. Run 'make test' to run tests with browser visible"
	@echo "   or 'make test-headless' to run in headless mode"

test: test-headed ## Run tests with browser visible (default)

test-headed: ## Run tests with browser visible (headed mode)
	@echo "🎭 Running Playwright tests in headed mode (browser will be visible)..."
	@echo ""
	npx playwright test

test-headless: ## Run tests in headless mode
	@echo "🎭 Running Playwright tests in headless mode..."
	@echo ""
	CI=true npx playwright test

test-ui: ## Run tests with Playwright UI mode (interactive)
	@echo "🎭 Running Playwright tests in UI mode..."
	@echo ""
	npx playwright test --ui

test-debug: ## Run tests in debug mode (step through)
	@echo "🎭 Running Playwright tests in debug mode..."
	@echo ""
	npx playwright test --debug

test-report: ## Open the last test report
	@echo "📊 Opening test report..."
	npx playwright show-report

