.PHONY: help install setup broadway-direct broadway-direct-headed broadway-direct-headless broadway-direct-ui broadway-direct-debug broadway-direct-report telecharge telecharge-headed telecharge-headless discover-telecharge

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dependencies (Node.js for both lotteries)
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
	@echo "2. For Broadway Direct lottery:"
	@echo "   Run 'make broadway-direct' to run with browser visible"
	@echo "   or 'make broadway-direct-headless' to run in headless mode"
	@echo ""
	@echo "3. For Telecharge lottery:"
	@echo "   Edit telecharge/showsToEnter.json with your shows"
	@echo "   Run 'make telecharge' to enter lotteries with browser visible"
	@echo "   or 'make telecharge-headless' to run in headless mode"

broadway-direct: broadway-direct-headed ## Run Broadway Direct lottery with browser visible (default)

broadway-direct-headed: ## Run Broadway Direct lottery with browser visible (headed mode). Use SHOWS=aladdin,wicked to filter shows. Use KEEP_BROWSER_OPEN=true to keep browser open
	@if [ -n "$(SHOWS)" ]; then \
		echo "🎭 Running Broadway Direct lottery in headed mode (filtered to: $(SHOWS))..."; \
	else \
		echo "🎭 Running Broadway Direct lottery in headed mode (browser will be visible)..."; \
	fi
	@if [ "$(KEEP_BROWSER_OPEN)" = "true" ]; then \
		echo "🔍 Browser will stay open after completion. Press Ctrl+C to close."; \
	fi
	@echo ""
	@if [ -f .envrc ]; then \
		set -a && . .envrc && set +a && SHOWS=$(SHOWS) KEEP_BROWSER_OPEN=$(KEEP_BROWSER_OPEN) npx playwright test e2e/broadway-direct.spec.ts; \
	else \
		SHOWS=$(SHOWS) KEEP_BROWSER_OPEN=$(KEEP_BROWSER_OPEN) npx playwright test e2e/broadway-direct.spec.ts; \
	fi

broadway-direct-headless: ## Run Broadway Direct lottery in headless mode. Use SHOWS=aladdin,wicked to filter shows
	@if [ -n "$(SHOWS)" ]; then \
		echo "🎭 Running Broadway Direct lottery in headless mode (filtered to: $(SHOWS))..."; \
	else \
		echo "🎭 Running Broadway Direct lottery in headless mode..."; \
	fi
	@echo ""
	@if [ -f .envrc ]; then \
		set -a && . .envrc && set +a && CI=true SHOWS=$(SHOWS) npx playwright test e2e/broadway-direct.spec.ts; \
	else \
		CI=true SHOWS=$(SHOWS) npx playwright test e2e/broadway-direct.spec.ts; \
	fi

broadway-direct-ui: ## Run Broadway Direct lottery with Playwright UI mode (interactive). Use SHOWS=aladdin,wicked to filter shows
	@if [ -n "$(SHOWS)" ]; then \
		echo "🎭 Running Broadway Direct lottery in UI mode (filtered to: $(SHOWS))..."; \
	else \
		echo "🎭 Running Broadway Direct lottery in UI mode..."; \
	fi
	@echo ""
	@if [ -f .envrc ]; then \
		set -a && . .envrc && set +a && SHOWS=$(SHOWS) npx playwright test e2e/broadway-direct.spec.ts --ui; \
	else \
		SHOWS=$(SHOWS) npx playwright test e2e/broadway-direct.spec.ts --ui; \
	fi

broadway-direct-debug: ## Run Broadway Direct lottery in debug mode (step through). Use SHOWS=aladdin,wicked to filter shows
	@if [ -n "$(SHOWS)" ]; then \
		echo "🎭 Running Broadway Direct lottery in debug mode (filtered to: $(SHOWS))..."; \
	else \
		echo "🎭 Running Broadway Direct lottery in debug mode..."; \
	fi
	@echo ""
	@if [ -f .envrc ]; then \
		set -a && . .envrc && set +a && SHOWS=$(SHOWS) npx playwright test e2e/broadway-direct.spec.ts --debug; \
	else \
		SHOWS=$(SHOWS) npx playwright test e2e/broadway-direct.spec.ts --debug; \
	fi

broadway-direct-report: ## Open the last Broadway Direct lottery test report
	@echo "📊 Opening Broadway Direct lottery test report..."
	npx playwright show-report

telecharge: telecharge-headed ## Run Telecharge lottery with browser visible (default)

telecharge-headed: ## Run Telecharge lottery with browser visible. Use SHOWS=show1,show2 to filter shows. Use KEEP_BROWSER_OPEN=true to keep browser open
	@if [ -n "$(SHOWS)" ]; then \
		echo "🎭 Running Telecharge lottery in headed mode (filtered to: $(SHOWS))..."; \
	else \
		echo "🎭 Running Telecharge lottery in headed mode (browser will be visible)..."; \
	fi
	@if [ "$(KEEP_BROWSER_OPEN)" = "true" ]; then \
		echo "🔍 Browser will stay open after completion. Press Ctrl+C to close."; \
	fi
	@echo ""
	@if [ -f .envrc ]; then \
		set -a && . .envrc && set +a && SHOWS=$(SHOWS) KEEP_BROWSER_OPEN=$(KEEP_BROWSER_OPEN) npx playwright test e2e/telecharge.spec.ts; \
	else \
		SHOWS=$(SHOWS) KEEP_BROWSER_OPEN=$(KEEP_BROWSER_OPEN) npx playwright test e2e/telecharge.spec.ts; \
	fi

telecharge-headless: ## Run Telecharge lottery in headless mode. Use SHOWS=show1,show2 to filter shows
	@if [ -n "$(SHOWS)" ]; then \
		echo "🎭 Running Telecharge lottery in headless mode (filtered to: $(SHOWS))..."; \
	else \
		echo "🎭 Running Telecharge lottery in headless mode..."; \
	fi
	@echo ""
	@if [ -f .envrc ]; then \
		set -a && . .envrc && set +a && CI=true SHOWS=$(SHOWS) npx playwright test e2e/telecharge.spec.ts; \
	else \
		CI=true SHOWS=$(SHOWS) npx playwright test e2e/telecharge.spec.ts; \
	fi

discover-telecharge: ## Discover Telecharge lottery shows from bwayrush.com and update showsToEnter.json
	@echo "🔍 Discovering Telecharge lottery shows from bwayrush.com..."
	@echo ""
	@npx tsx src/discover-telecharge-shows.ts || (echo "⚠️  tsx not found. Installing..." && npm install --save-dev tsx && npx tsx src/discover-telecharge-shows.ts)

