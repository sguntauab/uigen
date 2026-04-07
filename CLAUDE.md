# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server with Turbopack
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Vitest (all tests)
npm run setup        # Install deps + generate Prisma client + run migrations
npm run db:reset     # Reset SQLite database
```

To run a single test file:
```bash
npx vitest run src/components/chat/__tests__/ChatInterface.test.tsx
```

## Environment

Requires `.env` with `ANTHROPIC_API_KEY`. Without it, the app falls back to a `MockLanguageModel` for demo purposes (see `src/lib/provider.ts`).

## Architecture

**UIGen** is an AI-powered React component generator. Users describe components in a chat interface; Claude generates/edits files in a virtual file system that's rendered live in a sandboxed preview.

### Core Data Flow

1. **Chat → API Route → Claude**: `ChatProvider` (`src/lib/contexts/chat-context.tsx`) uses Vercel AI SDK's `useChat` to stream requests to `/api/chat/route.ts`, which calls Claude with tool definitions.
2. **Claude → Virtual FS**: Claude responds with `str_replace_editor` and `file_manager` tool calls. The client-side `FileSystemContext` (`src/lib/contexts/file-system-context.tsx`) processes these to mutate the in-memory `VirtualFileSystem` (`src/lib/file-system.ts`).
3. **Virtual FS → Preview**: `PreviewFrame.tsx` reads files from context, transpiles JSX via `@babel/standalone`, and evaluates the result in a sandboxed iframe.
4. **Persistence**: On chat completion, authenticated users' file system state and messages are saved to the `Project` record (SQLite via Prisma) in `Project.data` and `Project.messages`.

### Key Abstractions

- **`VirtualFileSystem`** (`src/lib/file-system.ts`): In-memory file system, serializable to JSON for DB storage. All file operations flow through here.
- **`FileSystemContext`** (`src/lib/contexts/file-system-context.tsx`): React context wrapping the VFS; handles incoming tool call results from the AI stream.
- **`ChatContext`** (`src/lib/contexts/chat-context.tsx`): Manages chat state and the AI stream lifecycle via Vercel AI SDK.
- **AI Tools** (`src/lib/tools/`): `str_replace_editor` (create/edit files) and `file_manager` (rename/delete). System prompt lives in `src/lib/prompts/generation.tsx`.

### Project Structure

- `src/app/` — Next.js App Router pages and `/api/chat` route
- `src/components/` — UI components: `chat/`, `editor/` (Monaco + FileTree), `preview/`, `auth/`, `ui/` (shadcn)
- `src/lib/` — Core logic: file system, contexts, AI tools, prompts, auth, transform
- `src/actions/` — Next.js Server Actions for auth and project CRUD
- `prisma/` — SQLite schema with `User` and `Project` models

### Auth

JWT sessions in HTTP-only cookies (7-day expiry). Server actions in `src/actions/index.ts` handle sign-up/sign-in with bcrypt. Anonymous users get full functionality without persistence; `anon-work-tracker.ts` tracks their work in localStorage.

### Path Aliases

`@/*` maps to `src/*` (configured in `tsconfig.json` and `vitest.config.mts`).
