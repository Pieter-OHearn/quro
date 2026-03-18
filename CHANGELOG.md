# Changelog

All notable changes to this project will be documented in this file. The format roughly follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and uses [Semantic Versioning](https://semver.org/) for release numbers.

## [Unreleased]

## [v0.0.2] - 2026-03-18

- Fix the backend Docker/release database configuration so Postgres resolves via `db:5432` instead of falling back to `127.0.0.1`, including support for Docker secret-based credentials and release-time migrations.

## [v0.0.1] - 2026-03-15

- First MVP test release: stood up the initial backend/frontend services, Docker orchestration, and CI skeleton to prove the deployment flow end to end.
