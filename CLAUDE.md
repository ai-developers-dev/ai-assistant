# Agent Platform - AI Agent SaaS

## Architecture
- **Monorepo**: Turborepo with `apps/web` (Next.js 15) and `packages/` (shared)
- **Auth**: Clerk with org/team management, synced to Convex via webhooks
- **Backend**: Convex (real-time DB, file storage, vector search, crons)
- **AI**: Vercel AI SDK v6 with multi-model support (Claude, GPT, Gemini)
- **Billing**: Stripe subscriptions + credit-based usage metering
- **UI**: Tailwind CSS + shadcn/ui, dark-first theme, Framer Motion animations

## Key Patterns
- Multi-tenancy scoped by `organizationId` on every data table
- Clerk webhooks sync orgs/users to Convex via `http.ts`
- `ConvexClerkProvider` wraps app for auth token management
- AI SDK `streamText` with tool calling for agent execution
- Credit system: deduct per-request based on model + token count
- Route groups: `(marketing)` public, `(auth)` sign-in/up, `(dashboard)` protected

## Commands
- `npm run dev` - Start all services (Next.js + Convex)
- `npx convex dev` - Convex dev server
- `npx convex deploy` - Deploy Convex to production
- `npm run build` - Production build
- `npm run lint` - ESLint
- `npm run type-check` - TypeScript check

## Environment Variables
See `.env.example` for all required variables.

## File Naming
- Components: PascalCase (e.g., `ChatMessage.tsx`)
- Hooks: camelCase with `use` prefix (e.g., `useChat.ts`)
- Lib utilities: camelCase (e.g., `agentRegistry.ts`)
- Convex functions: camelCase (e.g., `projects.ts`)
