import { NextResponse } from "next/server";

// Returns whether the platform OpenRouter key is configured (boolean only, never exposes keys)
export async function GET() {
  return NextResponse.json({
    openrouter: !!process.env.OPENROUTER_API_KEY,
  });
}
