.PHONY: dev setup setup-backend setup-frontend backend frontend test test-backend test-frontend lint build docker stop clean

# ─── Development ────────────────────────────────────────────

dev: ## Start backend + frontend in parallel (one command)
	@echo "Starting RechnungsWerk (Backend + Frontend)..."
	@trap 'kill 0' INT TERM; \
		$(MAKE) backend & \
		$(MAKE) frontend & \
		wait

backend: ## Start backend only
	cd backend && \
		. venv/bin/activate 2>/dev/null || true && \
		uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

frontend: ## Start frontend only
	cd frontend && npm run dev

# ─── Setup ──────────────────────────────────────────────────

setup: setup-backend setup-frontend ## Install all dependencies
	@echo "\n✓ Setup complete. Run 'make dev' to start."

setup-backend: ## Install backend dependencies
	cd backend && \
		python3 -m venv venv && \
		. venv/bin/activate && \
		pip install -r requirements.txt && \
		cp -n .env.example .env 2>/dev/null || true
	@echo "✓ Backend ready"

setup-frontend: ## Install frontend dependencies
	cd frontend && npm install
	@echo "✓ Frontend ready"

# ─── Testing ────────────────────────────────────────────────

test: test-backend test-frontend ## Run all tests

test-backend: ## Run backend tests
	cd backend && . venv/bin/activate 2>/dev/null || true && python -m pytest tests/ -v

test-frontend: ## Run frontend tests
	cd frontend && npx vitest run

lint: ## Run all linters
	cd backend && . venv/bin/activate 2>/dev/null || true && ruff check app/
	cd frontend && npm run lint

# ─── Production ─────────────────────────────────────────────

build: ## Build frontend for production
	cd frontend && npm run build

docker: ## Start production stack via Docker Compose
	docker compose up -d

stop: ## Stop Docker Compose stack
	docker compose down

# ─── Helpers ────────────────────────────────────────────────

clean: ## Remove build artifacts and caches
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .next -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -delete 2>/dev/null || true

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
