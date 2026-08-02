"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/route-guards";
import { createServerSupabaseClient } from "@/lib/auth/supabase-server";
import { AppError, safeErrorMessage } from "@/lib/errors";
import {
  educationSchema,
  experienceSchema,
  profileBasicSchema,
  projectSchema,
  skillInputSchema,
  type SkillInput,
} from "@/lib/validation/profile";
import { createProfileService } from "@/features/profile/profile-service";

type ActionResult = { ok: true } | { ok: false; error: string };

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

export async function updateEducation(id: string, input: unknown): Promise<ActionResult> {
  const parsed = educationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields." };
  try {
    const { user, service } = await getService();
    await service.updateEducation(user.id, id, parsed.data);
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function deleteEducation(id: string): Promise<ActionResult> {
  try {
    const { user, service } = await getService();
    await service.deleteEducation(user.id, id);
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function moveEducation(id: string, direction: "up" | "down"): Promise<ActionResult> {
  try {
    const { user, service } = await getService();
    await service.moveEducation(user.id, id, direction);
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function replaceSkills(skills: SkillInput[]): Promise<ActionResult> {
  const parsed = zArrayOfSkills(skills);
  if (!parsed) return { ok: false, error: "Please fix the highlighted fields." };
  try {
    const { user, service } = await getService();
    await service.replaceSkills(user.id, parsed);
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

function zArrayOfSkills(skills: SkillInput[]): SkillInput[] | null {
  for (const skill of skills) {
    const parsed = skillInputSchema.safeParse(skill);
    if (!parsed.success) return null;
  }
  return skills;
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

export async function updateExperience(id: string, input: unknown): Promise<ActionResult> {
  const parsed = experienceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields." };
  try {
    const { user, service } = await getService();
    await service.updateExperience(user.id, id, parsed.data);
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function deleteExperience(id: string): Promise<ActionResult> {
  try {
    const { user, service } = await getService();
    await service.deleteExperience(user.id, id);
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function moveExperience(id: string, direction: "up" | "down"): Promise<ActionResult> {
  try {
    const { user, service } = await getService();
    await service.moveExperience(user.id, id, direction);
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

export async function updateProject(id: string, input: unknown): Promise<ActionResult> {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields." };
  try {
    const { user, service } = await getService();
    await service.updateProject(user.id, id, parsed.data);
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function deleteProject(id: string): Promise<ActionResult> {
  try {
    const { user, service } = await getService();
    await service.deleteProject(user.id, id);
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}

export async function moveProject(id: string, direction: "up" | "down"): Promise<ActionResult> {
  try {
    const { user, service } = await getService();
    await service.moveProject(user.id, id, direction);
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    return toActionResult(error);
  }
}
