.PHONY: install migrate seed run test lint clean reset

PY := .venv/bin/python
PIP := .venv/bin/pip

install:
	python3 -m venv .venv
	$(PIP) install -q --upgrade pip
	$(PIP) install -q -e .

migrate:
	.venv/bin/alembic upgrade head

seed:
	$(PY) -m scripts.seed

run:
	.venv/bin/uvicorn app.main:app --reload --port 8000

test:
	$(PY) -m pytest -q

lint:
	.venv/bin/ruff check app tests

clean:
	rm -f portal.db

reset: clean
	$(MAKE) migrate seed
