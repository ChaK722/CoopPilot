"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/route-guards";
import { createServerSupabaseClient } from "@/lib/auth/supabase-server";
import { AppError, safeErrorMessage } from "@/lib/errors";
import { idSchema } from "@/lib/validation/shared";
import { createAIService } from "@/features/ai/ai-service";

type ActionResult = { ok: true } | { ok: false; error: string; reference: string };

const idempotencyKeySchema = z.string().uuid("Invalid request key.");
const contentSchema = z.object({
  content: z.string().min(1, "Content is required.").max(50_000),
});
const versionSchema = z.number().int().min(1);

function toActionResult(error: unknown): { ok: false; error: string; reference: string } {
  if (error instanceof AppError) {
    return { ok: false, error: error.safeMessage, reference: error.correlationId };
  }
  return { ok: false, error: safeErrorMessage(error), reference: crypto.randomUUID() };
}

function invalidRequest(message: string): { ok: false; error: string; reference: string } {
  return { ok: false, error: message, reference: crypto.randomUUID() };
}

async function getService() {
  const user = await requireUser();
  const supabase = await createServerSupabaseClient();
  return { user, service: createAIService(supabase) };
}

function refreshDetail(applicationId: string) {
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/applications/board");
}

export async function generateMatchAnalysis(
  applicationId: unknown,
  idempotencyKey: unknown,
): Promise<ActionResult> {
  const appParsed = idSchema.safeParse(applicationId);
  const keyParsed = idempotencyKeySchema.safeParse(idempotencyKey);
  if (!appParsed.success || !keyParsed.success) {
    return invalidRequest("Invalid request.");
  }
  try {
    const { user, service } = await getService();
    await service.generateMatchAnalysis(user.id, appParsed.data, keyParsed.data);
    refreshDetail(appParsed.data);
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function generateCoverLetter(
  applicationId: unknown,
  idempotencyKey: unknown,
): Promise<ActionResult> {
  const appParsed = idSchema.safeParse(applicationId);
  const keyParsed = idempotencyKeySchema.safeParse(idempotencyKey);
  if (!appParsed.success || !keyParsed.success) {
    return invalidRequest("Invalid request.");
  }
  try {
    const { user, service } = await getService();
    await service.generateCoverLetter(user.id, appParsed.data, keyParsed.data);
    refreshDetail(appParsed.data);
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function generateInterviewPrep(
  applicationId: unknown,
  idempotencyKey: unknown,
): Promise<ActionResult> {
  const appParsed = idSchema.safeParse(applicationId);
  const keyParsed = idempotencyKeySchema.safeParse(idempotencyKey);
  if (!appParsed.success || !keyParsed.success) {
    return invalidRequest("Invalid request.");
  }
  try {
    const { user, service } = await getService();
    await service.generateInterviewPrep(user.id, appParsed.data, keyParsed.data);
    refreshDetail(appParsed.data);
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function saveCoverLetterEdit(
  applicationId: unknown,
  content: unknown,
): Promise<ActionResult> {
  const appParsed = idSchema.safeParse(applicationId);
  const contentParsed = contentSchema.safeParse(content);
  if (!appParsed.success || !contentParsed.success) {
    return invalidRequest("Invalid request.");
  }
  try {
    const { user, service } = await getService();
    await service.saveCoverLetterEdit(user.id, appParsed.data, contentParsed.data.content);
    refreshDetail(appParsed.data);
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function restoreCoverLetterVersion(
  applicationId: unknown,
  version: unknown,
): Promise<ActionResult> {
  const appParsed = idSchema.safeParse(applicationId);
  const versionParsed = versionSchema.safeParse(version);
  if (!appParsed.success || !versionParsed.success) {
    return invalidRequest("Invalid request.");
  }
  try {
    const { user, service } = await getService();
    await service.restoreCoverLetterVersion(user.id, appParsed.data, versionParsed.data);
    refreshDetail(appParsed.data);
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}
