'use server';

import { z } from 'zod';
import { requireSession } from '../auth';
import { withTenantContext } from '../db';
import { getMembership } from '../dal/members';
import * as projectsDal from '../dal/projects';
import { summarizeProject } from '../llm/summarize';
import { MockSummaryProvider } from '../llm/mock-provider';

const UUIDSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid UUID');
const NameSchema = z.string().min(1).max(200);

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; status: number };

function notFound(): ActionResult<never> {
  return { success: false, error: 'Not found', status: 404 };
}

function forbidden(): ActionResult<never> {
  return { success: false, error: 'Forbidden', status: 403 };
}

export async function listProjectsAction(
  workspaceId: string
): Promise<ActionResult<projectsDal.Project[]>> {
  const user = await requireSession();
  const wsId = UUIDSchema.safeParse(workspaceId);
  if (!wsId.success) return notFound();

  return withTenantContext(user.id, async (client) => {
    const membership = await getMembership(client, wsId.data);
    if (!membership) return notFound();

    const projects = await projectsDal.listProjects(client, wsId.data);
    return { success: true, data: projects };
  });
}

export async function getProjectAction(
  workspaceId: string,
  projectId: string
): Promise<ActionResult<projectsDal.Project>> {
  const user = await requireSession();
  const wsId = UUIDSchema.safeParse(workspaceId);
  const pId = UUIDSchema.safeParse(projectId);
  if (!wsId.success || !pId.success) return notFound();

  return withTenantContext(user.id, async (client) => {
    const membership = await getMembership(client, wsId.data);
    if (!membership) return notFound();

    const project = await projectsDal.getProject(client, wsId.data, pId.data);
    if (!project) return notFound();
    return { success: true, data: project };
  });
}

export async function createProjectAction(
  workspaceId: string,
  formData: FormData
): Promise<ActionResult<projectsDal.Project>> {
  const user = await requireSession();
  const wsId = UUIDSchema.safeParse(workspaceId);
  const name = NameSchema.safeParse(formData.get('name'));
  if (!wsId.success) return notFound();
  if (!name.success) return { success: false, error: 'Name is required', status: 400 };

  return withTenantContext(user.id, async (client) => {
    const membership = await getMembership(client, wsId.data);
    if (!membership) return notFound();
    if (membership.role === 'viewer') return forbidden();

    const project = await projectsDal.createProject(client, wsId.data, name.data);
    return { success: true, data: project };
  });
}

export async function updateProjectAction(
  workspaceId: string,
  projectId: string,
  formData: FormData
): Promise<ActionResult<projectsDal.Project>> {
  const user = await requireSession();
  const wsId = UUIDSchema.safeParse(workspaceId);
  const pId = UUIDSchema.safeParse(projectId);
  const name = NameSchema.safeParse(formData.get('name'));
  if (!wsId.success || !pId.success) return notFound();
  if (!name.success) return { success: false, error: 'Name is required', status: 400 };

  return withTenantContext(user.id, async (client) => {
    const membership = await getMembership(client, wsId.data);
    if (!membership) return notFound();
    if (membership.role === 'viewer') return forbidden();

    const project = await projectsDal.updateProject(
      client, wsId.data, pId.data, name.data
    );
    if (!project) return notFound();
    return { success: true, data: project };
  });
}

export async function summarizeProjectAction(
  workspaceId: string,
  projectId: string
): Promise<ActionResult<{ summary: { summary: string; keyTopics: string[]; noteCount: number }; flaggedNotes: string[] }>> {
  const user = await requireSession();
  const wsId = UUIDSchema.safeParse(workspaceId);
  const pId = UUIDSchema.safeParse(projectId);
  if (!wsId.success || !pId.success) return notFound();

  return withTenantContext(user.id, async (client) => {
    const membership = await getMembership(client, wsId.data);
    if (!membership) return notFound();
    if (membership.role === 'viewer') return forbidden();

    const project = await projectsDal.getProject(client, wsId.data, pId.data);
    if (!project) return notFound();

    const provider = new MockSummaryProvider();
    const result = await summarizeProject(client, provider, wsId.data, pId.data);
    return { success: true, data: result };
  });
}

export async function deleteProjectAction(
  workspaceId: string,
  projectId: string
): Promise<ActionResult<void>> {
  const user = await requireSession();
  const wsId = UUIDSchema.safeParse(workspaceId);
  const pId = UUIDSchema.safeParse(projectId);
  if (!wsId.success || !pId.success) return notFound();

  return withTenantContext(user.id, async (client) => {
    const membership = await getMembership(client, wsId.data);
    if (!membership) return notFound();
    if (membership.role === 'viewer') return forbidden();

    const deleted = await projectsDal.deleteProject(client, wsId.data, pId.data);
    if (!deleted) return notFound();
    return { success: true, data: undefined };
  });
}
