"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/route-guards";
import { createServerSupabaseClient } from "@/lib/auth/supabase-server";
import { AppError, safeErrorMessage } from "@/lib/errors";
import { idSchema } from "@/lib/validation/shared";
import {
  analysisInputSchema,
  applicationSchema,
  createApplicationInputSchema,
  interviewSchema,
  notesSchema,
} from "@/lib/validation/applications";
import { createApplicationService } from "@/features/applications/application-service";
import { getAIProvider } from "@/features/ai/provider";
import { jobExtractionResultSchema } from "@/features/ai/extraction-schema";

type ActionResult = { ok: true } | { ok: false; error: string };

const applicationIdSchema = idSchema;

function toActionResult(error: unknown): { ok: false; error: string } {
  if (error instanceof AppError) {
    return { ok: false, error: error.safeMessage };
  }
  return { ok: false, error: safeErrorMessage(error) };
}

async function getService() {
  const user = await requireUser();
  const supabase = await createServerSupabaseClient();
  return { user, service: createApplicationService(supabase) };
}

function refreshApplicationPaths(id?: string) {
  revalidatePath("/applications");
  if (id) {
    revalidatePath(`/applications/${id}`);
    revalidatePath(`/applications/${id}/edit`);
  }
}

export async function analyzeJob(
  input: unknown,
): Promise<
  { ok: true; result: z.output<typeof jobExtractionResultSchema> } | { ok: false; error: string }
> {
  const parsed = analysisInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please paste a non-empty job description." };
  }
  try {
    await requireUser();
    const provider = await getAIProvider();
    const result = await provider.extractJob({
      description: parsed.data.description,
      url: parsed.data.url,
    });
    const validated = jobExtractionResultSchema.safeParse(result);
    if (!validated.success) {
      return { ok: false, error: "The analysis returned an invalid result. Please try again." };
    }
    return { ok: true, result: validated.data };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function createApplication(
  input: unknown,
): Promise<{ ok: true; applicationId: string } | { ok: false; error: string }> {
  const parsed = createApplicationInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields." };
  }
  try {
    const { user, service } = await getService();
    const applicationId = await service.createApplication(user.id, parsed.data);
    refreshApplicationPaths(applicationId);
    return { ok: true, applicationId };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function updateApplication(id: unknown, input: unknown): Promise<ActionResult> {
  const idParsed = applicationIdSchema.safeParse(id);
  const inputParsed = applicationSchema.safeParse(input);
  if (!idParsed.success || !inputParsed.success) {
    return { ok: false, error: "Please fix the highlighted fields." };
  }
  try {
    const { user, service } = await getService();
    await service.updateApplication(user.id, idParsed.data, inputParsed.data);
    refreshApplicationPaths(idParsed.data);
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function deleteApplication(id: unknown): Promise<ActionResult> {
  const idParsed = applicationIdSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: "Invalid identifier." };
  try {
    const { user, service } = await getService();
    await service.deleteApplication(user.id, idParsed.data);
    revalidatePath("/applications");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function duplicateApplication(
  id: unknown,
): Promise<{ ok: true; applicationId: string } | { ok: false; error: string }> {
  const idParsed = applicationIdSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: "Invalid identifier." };
  try {
    const { user, service } = await getService();
    const newId = await service.duplicateApplication(user.id, idParsed.data);
    refreshApplicationPaths(newId);
    return { ok: true, applicationId: newId };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function saveApplicationNotes(id: unknown, notes: unknown): Promise<ActionResult> {
  const idParsed = applicationIdSchema.safeParse(id);
  const notesParsed = notesSchema.safeParse(notes);
  if (!idParsed.success || !notesParsed.success) {
    return { ok: false, error: "Could not save your notes." };
  }
  try {
    const { user, service } = await getService();
    await service.saveNotes(user.id, idParsed.data, notesParsed.data.notes);
    revalidatePath(`/applications/${idParsed.data}`);
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function createInterview(
  applicationId: unknown,
  input: unknown,
): Promise<ActionResult> {
  const idParsed = applicationIdSchema.safeParse(applicationId);
  const inputParsed = interviewSchema.safeParse(input);
  if (!idParsed.success || !inputParsed.success) {
    return { ok: false, error: "Please fix the highlighted fields." };
  }
  try {
    const { user, service } = await getService();
    await service.createInterview(user.id, idParsed.data, inputParsed.data);
    revalidatePath(`/applications/${idParsed.data}`);
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function deleteInterview(id: unknown): Promise<ActionResult> {
  const idParsed = idSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: "Invalid identifier." };
  try {
    const { user, service } = await getService();
    const deleted = await service.deleteInterview(user.id, idParsed.data);
    revalidatePath(`/applications/${deleted.application_id}`);
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}
