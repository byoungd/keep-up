/**
 * Mock Login API - Issues JWTs for development
 * POST /api/auth/login
 */

import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";

const JWT_SECRET = process.env.LFCC_JWT_SECRET ?? "dev-secret-do-not-use-in-production";
const TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

interface LoginRequest {
  displayName: string;
}

interface LoginResponse {
  token: string;
  user: {
    id: string;
    displayName: string;
  };
}

export async function POST(
  request: Request
): Promise<NextResponse<LoginResponse | { error: string }>> {
  try {
    const body = (await request.json()) as LoginRequest;
    const { displayName } = body;

    if (!displayName || typeof displayName !== "string" || displayName.trim().length === 0) {
      return NextResponse.json({ error: "displayName is required" }, { status: 400 });
    }

    // Generate a simple user ID
    const userId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Sign JWT
    const token = jwt.sign(
      {
        sub: userId,
        role: "editor",
        displayName: displayName.trim(),
      },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY_SECONDS }
    );

    return NextResponse.json({
      token,
      user: {
        id: userId,
        displayName: displayName.trim(),
      },
    });
  } catch (error) {
    console.error("[Auth] Login error:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
