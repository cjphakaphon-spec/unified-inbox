# Project Assumptions & Design Decisions

This document records architectural decisions, assumptions, and choices made outside or refining the original specification (`unified-inbox-spec md.md`).

## 1. Project Structure
- Monorepo structure with `backend` (Express + Socket.IO + TypeScript) and `frontend` (React + Vite + TypeScript).
- Backend runs on Node.js 20+ (currently tested with Node.js v26 LTS).

## 2. Database Migrations
- Migration runner uses native `pg` (node-postgres) with sequential SQL scripts in `src/db/migrations/`.
- Tracks executed migrations in a `schema_migrations` table for idempotent execution.
- In schema definition, `agents` table is created prior to `conversations` to satisfy foreign key constraint `conversations(assigned_to) -> agents(id)`.
- SSL mode is automatically configured when connecting to cloud-hosted databases (e.g. Neon, Supabase) via `DATABASE_URL`.

## 3. Testing Framework
- Using `vitest` for unit and integration testing: fast, native TypeScript support, and zero config.
