"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/route-guards";
import { createServerSupabaseClient } from "@/lib/auth/supabase-server";
import { AppError, safeErrorMessage } from "@/lib/errors";
import {
  educationSchema,
  experienceSchema,
  profileBasicSchema,
  projectSchema,
  skillInputSchema,
} from "@/lib/validation/profile";
import { createProfileService } from "@/features/profile/profile-service";

type ActionResult = { ok: true } | { ok: false; error: string };

const idSchema = z.string().uuid("Invalid identifier.");
const directionSchema = z.enum(["up", "down"], {
  error: "Invalid direction.",
});
const skillsSchema = z.array(skillInputSchema).max(500);

function toActionResult(error: unknown): ActionResult {
  if (error instanceof AppError) {
    return { ok: false, error: error.safeMessage };
  }
  return { ok: false, error: safeErrorMessage(error) };
}

async function getService() {
  const user = await requireUser();
  const supabase = await createServerSupabaseClient();
  return { user, service: createProfileService(supabase) };
}

function refreshProfilePaths() {
  revalidatePath("/profile");
  revalidatePath("/onboarding");
  revalidatePath("/dashboard");
}

export async function saveBasicInfo(input: unknown): Promise<ActionResult> {
  const parsed = profileBasicSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields." };
  }
  try {
    const { user, service } = await getService();
    await service.updateBasicInfo(user.id, parsed.data);
    refreshProfilePaths();
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function completeOnboarding(input: unknown): Promise<ActionResult> {
  const parsed = profileBasicSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Preferred name is required to finish onboarding." };
  }
  try {
    const { user, service } = await getService();
    await service.completeOnboarding(user.id, parsed.data);
    refreshProfilePaths();
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function createEducation(input: unknown): Promise<ActionResult> {
  const parsed = educationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields." };
  try {
    const { user, service } = await getService();
    await service.createEducation(user.id, parsed.data);
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function updateEducation(id: unknown, input: unknown): Promise<ActionResult> {
  const idParsed = idSchema.safeParse(id);
  const inputParsed = educationSchema.safeParse(input);
  if (!idParsed.success || !inputParsed.success) {
    return { ok: false, error: "Please fix the highlighted fields." };
  }
  try {
    const { user, service } = await getService();
    await service.updateEducation(user.id, idParsed.data, inputParsed.data);
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function deleteEducation(id: unknown): Promise<ActionResult> {
  const idParsed = idSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: "Invalid identifier." };
  try {
    const { user, service } = await getService();
    await service.deleteEducation(user.id, idParsed.data);
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function moveEducation(id: unknown, direction: unknown): Promise<ActionResult> {
  const idParsed = idSchema.safeParse(id);
  const directionParsed = directionSchema.safeParse(direction);
  if (!idParsed.success || !directionParsed.success) {
    return { ok: false, error: "Invalid move request." };
  }
  try {
    const { user, service } = await getService();
    await service.moveEducation(user.id, idParsed.data, directionParsed.data);
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function replaceSkills(skills: unknown): Promise<ActionResult> {
  const parsed = skillsSchema.safeParse(skills);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields." };
  try {
    const { user, service } = await getService();
    await service.replaceSkills(user.id, parsed.data);
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function createExperience(input: unknown): Promise<ActionResult> {
  const parsed = experienceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields." };
  try {
    const { user, service } = await getService();
    await service.createExperience(user.id, parsed.data);
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function updateExperience(id: unknown, input: unknown): Promise<ActionResult> {
  const idParsed = idSchema.safeParse(id);
  const inputParsed = experienceSchema.safeParse(input);
  if (!idParsed.success || !inputParsed.success) {
    return { ok: false, error: "Please fix the highlighted fields." };
  }
  try {
    const { user, service } = await getService();
    await service.updateExperience(user.id, idParsed.data, inputParsed.data);
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function deleteExperience(id: unknown): Promise<ActionResult> {
  const idParsed = idSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: "Invalid identifier." };
  try {
    const { user, service } = await getService();
    await service.deleteExperience(user.id, idParsed.data);
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function moveExperience(id: unknown, direction: unknown): Promise<ActionResult> {
  const idParsed = idSchema.safeParse(id);
  const directionParsed = directionSchema.safeParse(direction);
  if (!idParsed.success || !directionParsed.success) {
    return { ok: false, error: "Invalid move request." };
  }
  try {
    const { user, service } = await getService();
    await service.moveExperience(user.id, idParsed.data, directionParsed.data);
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function createProject(input: unknown): Promise<ActionResult> {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields." };
  try {
    const { user, service } = await getService();
    await service.createProject(user.id, parsed.data);
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function updateProject(id: unknown, input: unknown): Promise<ActionResult> {
  const idParsed = idSchema.safeParse(id);
  const inputParsed = projectSchema.safeParse(input);
  if (!idParsed.success || !inputParsed.success) {
    return { ok: false, error: "Please fix the highlighted fields." };
  }
  try {
    const { user, service } = await getService();
    await service.updateProject(user.id, idParsed.data, inputParsed.data);
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function deleteProject(id: unknown): Promise<ActionResult> {
  const idParsed = idSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: "Invalid identifier." };
  try {
    const { user, service } = await getService();
    await service.deleteProject(user.id, idParsed.data);
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function moveProject(id: unknown, direction: unknown): Promise<ActionResult> {
  const idParsed = idSchema.safeParse(id);
  const directionParsed = directionSchema.safeParse(direction);
  if (!idParsed.success || !directionParsed.success) {
    return { ok: false, error: "Invalid move request." };
  }
  try {
    const { user, service } = await getService();
    await service.moveProject(user.id, idParsed.data, directionParsed.data);
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}
