import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/pricing(.*)",
  "/features(.*)",
  "/showcase(.*)",
  "/legal(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/(.*)",
  "/api/chat",
  "/api/lead-gen/(.*)",
  "/api/scheduled-tasks/(.*)",
  "/api/oauth/(.*)",
  "/api/enrichment-test",
  "/api/provider-keys(.*)",
  "/api/leads/(.*)",
  "/api/domain-health",
  "/api/reports/(.*)",
  "/api/inbox/(.*)",
  "/api/warmup(.*)",
  "/api/health",
  "/api/track/(.*)",
  "/api/unsubscribe",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
